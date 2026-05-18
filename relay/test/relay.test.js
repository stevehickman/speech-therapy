/**
 * relay.test.js
 * -------------
 * Integration tests for the Familiar zero-knowledge relay.
 *
 * Uses Fastify's inject() method — no real HTTP server is started.
 * Each top-level describe() block gets its own in-memory SQLite database
 * so tests are fully isolated.
 *
 * Coverage:
 *   ✓ Health endpoint
 *   ✓ Topic creation (full response shape)
 *   ✓ Topic status before and after patient registration
 *   ✓ Patient registration (token issuance, pubkey storage)
 *   ✓ Re-registration (generates fresh tokens)
 *   ✓ Outbound packet publish + poll + ack (happy path)
 *   ✓ Polling with since_sequence (incremental sync)
 *   ✓ Polling with include_acked (recovery mode)
 *   ✓ Inbound packet send + poll + ack (happy path)
 *   ✓ Topic deletion cascades to packets
 *   ✓ Admin cleanup endpoint
 *   ✓ Auth failures (wrong token, missing token, wrong topic)
 *   ✓ Inbound send before patient registered → 409
 *   ✓ Ack non-existent packet → 404
 *   ✓ Payload size validation
 *   ✓ Packet ordering (sequence ascending)
 *   ✓ Pending packet count in topic status
 *   ✓ has_more pagination flag
 *   ✓ Tokens are topic-scoped (clinician token rejected for different topic)
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';

// ── Test app factory ──────────────────────────────────────────────────────────

async function makeApp() {
  return buildApp({
    dbPath:     ':memory:',
    adminToken: 'test-admin-secret',
    logger:     false,
    rateLimit:  { max: 10_000, window: '1 minute' },
  });
}

// ── Request helpers ───────────────────────────────────────────────────────────

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

async function post(app, url, body, headers = {}) {
  const res = await app.inject({
    method: 'POST', url,
    payload: body,
    headers: { 'content-type': 'application/json', ...headers },
  });
  return { status: res.statusCode, body: res.json() };
}

async function get(app, url, headers = {}) {
  const res = await app.inject({ method: 'GET', url, headers });
  return { status: res.statusCode, body: res.json() };
}

async function del(app, url, headers = {}) {
  const res = await app.inject({ method: 'DELETE', url, headers });
  return { status: res.statusCode, body: res.statusCode === 204 ? null : res.json() };
}

/** Create a topic and return the full response body */
async function createTopic(app, overrides = {}) {
  const { body } = await post(app, '/topics', {
    label: 'Patient slot 1',
    clinician_pubkey: 'base64-clinician-pubkey-aaa',
    ...overrides,
  });
  return body;
}

/** Register a patient on a topic and return the response body */
async function registerPatient(app, topicId, regToken, overrides = {}) {
  const { body } = await post(
    app,
    `/topics/${topicId}/register`,
    { patient_pubkey: 'base64-patient-pubkey-bbb', ...overrides },
    bearer(regToken),
  );
  return body;
}

/** Simulate a patient publishing a result packet */
async function publishPacket(app, topicId, publishToken, payload = 'SGVsbG8gd29ybGQ=') {
  return post(app, `/topics/${topicId}/packets`, { payload }, bearer(publishToken));
}

// ── Section 1: Health ─────────────────────────────────────────────────────────

describe('GET /health', () => {
  let app;
  before(async () => { app = await makeApp(); });
  after(async ()  => { await app.close(); });

  test('returns 200 with status ok', async () => {
    const { status, body } = await get(app, '/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.ok(body.time);
  });
});

// ── Section 2: Topic lifecycle ────────────────────────────────────────────────

describe('Topic creation and status', () => {
  let app;
  before(async () => { app = await makeApp(); });
  after(async ()  => { await app.close(); });

  test('POST /topics — returns 201 with required fields', async () => {
    const { status, body } = await post(app, '/topics', {
      label: 'Test slot',
      clinician_pubkey: 'pubkey-aaa',
    });
    assert.equal(status, 201);
    assert.ok(body.topic_id, 'topic_id present');
    assert.ok(body.registration_url, 'registration_url present');
    assert.ok(body.poll_token, 'poll_token present');
    assert.ok(body.inbound_publish_token, 'inbound_publish_token present');
    assert.equal(body.clinician_pubkey, 'pubkey-aaa');
  });

  test('POST /topics — registration_url contains topic_id and token', async () => {
    const { body } = await post(app, '/topics', { label: 'slot' });
    assert.ok(body.registration_url.includes(body.topic_id));
    assert.ok(body.registration_url.includes('token='));
  });

  test('POST /topics — no pubkey is OK (null in response)', async () => {
    const { status, body } = await post(app, '/topics', {});
    assert.equal(status, 201);
    assert.equal(body.clinician_pubkey, null);
  });

  test('GET /topics/:id — 401 without token', async () => {
    const topic = await createTopic(app);
    const { status } = await get(app, `/topics/${topic.topic_id}`);
    assert.equal(status, 401);
  });

  test('GET /topics/:id — 401 with wrong token', async () => {
    const topic = await createTopic(app);
    const { status } = await get(app, `/topics/${topic.topic_id}`, bearer('wrong-token'));
    assert.equal(status, 401);
  });

  test('GET /topics/:id — shows unregistered state before patient joins', async () => {
    const topic = await createTopic(app);
    const { status, body } = await get(
      app, `/topics/${topic.topic_id}`, bearer(topic.poll_token)
    );
    assert.equal(status, 200);
    assert.equal(body.patient_registered, false);
    assert.equal(body.patient_pubkey, null);
    assert.equal(body.pending_packets, 0);
  });

  test('GET /topics/:id — shows registered state after patient joins', async () => {
    const topic = await createTopic(app);
    const regUrl = new URL(topic.registration_url);
    const regToken = regUrl.searchParams.get('token');
    await registerPatient(app, topic.topic_id, regToken);

    const { body } = await get(app, `/topics/${topic.topic_id}`, bearer(topic.poll_token));
    assert.equal(body.patient_registered, true);
    assert.equal(body.patient_pubkey, 'base64-patient-pubkey-bbb');
    assert.ok(body.patient_registered_at);
  });

  test('DELETE /topics/:id — returns 204 and topic is gone', async () => {
    const topic = await createTopic(app);
    const { status } = await del(app, `/topics/${topic.topic_id}`, bearer(topic.poll_token));
    assert.equal(status, 204);

    // Subsequent status check with same token should 401 (topic gone, token invalid)
    const { status: s2 } = await get(app, `/topics/${topic.topic_id}`, bearer(topic.poll_token));
    assert.equal(s2, 401);
  });

  test('DELETE /topics/:id — cascades to packets', async () => {
    const topic    = await createTopic(app);
    const regUrl   = new URL(topic.registration_url);
    const regToken = regUrl.searchParams.get('token');
    const reg      = await registerPatient(app, topic.topic_id, regToken);
    await publishPacket(app, topic.topic_id, reg.publish_token);

    // Delete the topic
    await del(app, `/topics/${topic.topic_id}`, bearer(topic.poll_token));

    // Poll token should now be invalid
    const { status } = await get(app, `/topics/${topic.topic_id}/packets`, bearer(topic.poll_token));
    assert.equal(status, 401);
  });
});

// ── Section 3: Patient registration ──────────────────────────────────────────

describe('Patient registration', () => {
  let app;
  before(async () => { app = await makeApp(); });
  after(async ()  => { await app.close(); });

  test('POST /topics/:id/register — happy path returns tokens and clinician pubkey', async () => {
    const topic  = await createTopic(app, { clinician_pubkey: 'clinic-key-xyz' });
    const regUrl = new URL(topic.registration_url);
    const token  = regUrl.searchParams.get('token');

    const { status, body } = await post(
      app,
      `/topics/${topic.topic_id}/register`,
      { patient_pubkey: 'patient-key-abc' },
      bearer(token),
    );

    assert.equal(status, 201);
    assert.ok(body.publish_token, 'publish_token returned');
    assert.ok(body.inbound_poll_token, 'inbound_poll_token returned');
    assert.equal(body.clinician_pubkey, 'clinic-key-xyz');
  });

  test('POST /topics/:id/register — token in query param is accepted', async () => {
    const topic  = await createTopic(app);
    const regUrl = new URL(topic.registration_url);
    const token  = regUrl.searchParams.get('token');

    // No Authorization header — token in query string instead (link/QR flow)
    const res = await app.inject({
      method: 'POST',
      url: `/topics/${topic.topic_id}/register?token=${token}`,
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(res.statusCode, 201);
  });

  test('POST /topics/:id/register — wrong token returns 401', async () => {
    const topic = await createTopic(app);
    const { status } = await post(
      app,
      `/topics/${topic.topic_id}/register`,
      {},
      bearer('bad-token'),
    );
    assert.equal(status, 401);
  });

  test('POST /topics/:id/register — wrong topic ID returns 401', async () => {
    const topic  = await createTopic(app);
    const topic2 = await createTopic(app);
    const regUrl = new URL(topic.registration_url);
    const token  = regUrl.searchParams.get('token');

    // Use topic's registration token for topic2's endpoint
    const { status } = await post(
      app,
      `/topics/${topic2.topic_id}/register`,
      {},
      bearer(token),
    );
    assert.equal(status, 401);
  });

  test('Re-registration generates fresh tokens', async () => {
    const topic  = await createTopic(app);
    const regUrl = new URL(topic.registration_url);
    const token  = regUrl.searchParams.get('token');

    const reg1 = await registerPatient(app, topic.topic_id, token);
    const reg2 = await registerPatient(app, topic.topic_id, token);

    // Both registrations succeed but tokens differ
    assert.notEqual(reg1.publish_token, reg2.publish_token);
    assert.notEqual(reg1.inbound_poll_token, reg2.inbound_poll_token);

    // Old publish token is now invalid
    const { status } = await publishPacket(app, topic.topic_id, reg1.publish_token);
    assert.equal(status, 401);
  });
});

// ── Section 4: Outbound packets (patient → clinician) ────────────────────────

describe('Outbound packets', () => {
  let app, topic, reg;
  before(async () => {
    app   = await makeApp();
    topic = await createTopic(app);
    const regUrl = new URL(topic.registration_url);
    reg   = await registerPatient(app, topic.topic_id, regUrl.searchParams.get('token'));
  });
  after(async () => { await app.close(); });

  test('POST /topics/:id/packets — returns 201 with packet_id and sequence', async () => {
    const { status, body } = await publishPacket(app, topic.topic_id, reg.publish_token);
    assert.equal(status, 201);
    assert.ok(body.packet_id);
    assert.equal(body.sequence, 1);
    assert.ok(body.created_at);
  });

  test('Sequence increments with each packet', async () => {
    const r1 = await publishPacket(app, topic.topic_id, reg.publish_token);
    const r2 = await publishPacket(app, topic.topic_id, reg.publish_token);
    assert.equal(r2.body.sequence, r1.body.sequence + 1);
  });

  test('GET /topics/:id/packets — clinician receives all unacked packets', async () => {
    const { status, body } = await get(
      app, `/topics/${topic.topic_id}/packets`, bearer(topic.poll_token)
    );
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.packets));
    assert.ok(body.packets.length >= 2);
    assert.equal(typeof body.has_more, 'boolean');
  });

  test('Packets are returned in ascending sequence order', async () => {
    const { body } = await get(
      app, `/topics/${topic.topic_id}/packets`, bearer(topic.poll_token)
    );
    const seqs = body.packets.map(p => p.sequence);
    for (let i = 1; i < seqs.length; i++) {
      assert.ok(seqs[i] > seqs[i - 1], 'sequences not ascending');
    }
  });

  test('Polling with since_sequence returns only newer packets', async () => {
    // Publish a known packet and get its sequence
    const pub = await publishPacket(app, topic.topic_id, reg.publish_token);
    const knownSeq = pub.body.sequence;

    // Publish another after it
    await publishPacket(app, topic.topic_id, reg.publish_token);

    const { body } = await get(
      app,
      `/topics/${topic.topic_id}/packets?since_sequence=${knownSeq}`,
      bearer(topic.poll_token)
    );
    assert.ok(body.packets.every(p => p.sequence > knownSeq), 'all sequences > since_sequence');
  });

  test('DELETE /topics/:id/packets/:id — acks a packet (204)', async () => {
    const pub = await publishPacket(app, topic.topic_id, reg.publish_token);
    const { status } = await del(
      app,
      `/topics/${topic.topic_id}/packets/${pub.body.packet_id}`,
      bearer(topic.poll_token)
    );
    assert.equal(status, 204);
  });

  test('Acked packets excluded from default poll', async () => {
    // Publish and ack a packet
    const pub = await publishPacket(app, topic.topic_id, reg.publish_token);
    await del(
      app,
      `/topics/${topic.topic_id}/packets/${pub.body.packet_id}`,
      bearer(topic.poll_token)
    );

    // Default poll should not include it
    const { body } = await get(
      app,
      `/topics/${topic.topic_id}/packets?since_sequence=${pub.body.sequence - 1}`,
      bearer(topic.poll_token)
    );
    assert.ok(!body.packets.some(p => p.id === pub.body.packet_id), 'acked packet in default poll');
  });

  test('Acked packets visible with include_acked=true (recovery mode)', async () => {
    const pub = await publishPacket(app, topic.topic_id, reg.publish_token);
    await del(
      app,
      `/topics/${topic.topic_id}/packets/${pub.body.packet_id}`,
      bearer(topic.poll_token)
    );

    const { body } = await get(
      app,
      `/topics/${topic.topic_id}/packets?since_sequence=${pub.body.sequence - 1}&include_acked=true`,
      bearer(topic.poll_token)
    );
    assert.ok(body.packets.some(p => p.id === pub.body.packet_id), 'acked packet not in recovery poll');
  });

  test('DELETE non-existent packet returns 404', async () => {
    const { status } = await del(
      app,
      `/topics/${topic.topic_id}/packets/no-such-id`,
      bearer(topic.poll_token)
    );
    assert.equal(status, 404);
  });

  test('Payload is returned as-stored (relay does not transform it)', async () => {
    const payload = 'U2VjcmV0RW5jcnlwdGVkRGF0YQ=='; // base64 for "SecretEncryptedData"
    await publishPacket(app, topic.topic_id, reg.publish_token, payload);

    const { body } = await get(
      app,
      `/topics/${topic.topic_id}/packets?include_acked=false`,
      bearer(topic.poll_token)
    );
    const found = body.packets.find(p => p.payload === payload);
    assert.ok(found, 'payload not returned verbatim');
  });

  test('Pending packet count in topic status updates after ack', async () => {
    // Publish one, get count, ack it, get count again
    const pub    = await publishPacket(app, topic.topic_id, reg.publish_token);
    const before = (await get(app, `/topics/${topic.topic_id}`, bearer(topic.poll_token))).body.pending_packets;

    await del(
      app,
      `/topics/${topic.topic_id}/packets/${pub.body.packet_id}`,
      bearer(topic.poll_token)
    );

    const after = (await get(app, `/topics/${topic.topic_id}`, bearer(topic.poll_token))).body.pending_packets;
    assert.equal(after, before - 1);
  });
});

// ── Section 5: Auth boundary — wrong tokens ───────────────────────────────────

describe('Auth boundaries', () => {
  let app, topic, reg;
  before(async () => {
    app   = await makeApp();
    topic = await createTopic(app);
    const regUrl = new URL(topic.registration_url);
    reg   = await registerPatient(app, topic.topic_id, regUrl.searchParams.get('token'));
  });
  after(async () => { await app.close(); });

  test('Patient publish token rejected for poll endpoint', async () => {
    const { status } = await get(
      app, `/topics/${topic.topic_id}/packets`, bearer(reg.publish_token)
    );
    assert.equal(status, 401);
  });

  test('Poll token rejected for patient publish endpoint', async () => {
    const { status } = await publishPacket(app, topic.topic_id, topic.poll_token);
    assert.equal(status, 401);
  });

  test('Poll token rejected for inbound_publish endpoint', async () => {
    const { status } = await post(
      app,
      `/topics/${topic.topic_id}/inbound`,
      { payload: 'abc' },
      bearer(topic.poll_token)
    );
    assert.equal(status, 401);
  });

  test('Patient poll token rejected for outbound poll endpoint', async () => {
    const { status } = await get(
      app, `/topics/${topic.topic_id}/packets`, bearer(reg.inbound_poll_token)
    );
    assert.equal(status, 401);
  });

  test('Token from one topic rejected for a different topic', async () => {
    const topic2 = await createTopic(app);
    const { status } = await get(
      app, `/topics/${topic2.topic_id}/packets`, bearer(topic.poll_token)
    );
    assert.equal(status, 401);
  });

  test('Missing Authorization header returns 401', async () => {
    const { status } = await get(app, `/topics/${topic.topic_id}/packets`);
    assert.equal(status, 401);
  });

  test('Malformed Authorization header returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/topics/${topic.topic_id}/packets`,
      headers: { authorization: 'Token abc' }, // not Bearer
    });
    assert.equal(res.statusCode, 401);
  });
});

// ── Section 6: Inbound packets (clinician → patient) ─────────────────────────

describe('Inbound packets', () => {
  let app, topic, reg;
  before(async () => {
    app   = await makeApp();
    topic = await createTopic(app, { clinician_pubkey: 'clinic-key' });
    const regUrl = new URL(topic.registration_url);
    reg   = await registerPatient(app, topic.topic_id, regUrl.searchParams.get('token'), {
      patient_pubkey: 'patient-key',
    });
  });
  after(async () => { await app.close(); });

  test('Cannot send inbound before patient registers → 409', async () => {
    // Make a brand-new topic where patient has NOT registered
    const freshTopic = await createTopic(app);
    const { status, body } = await post(
      app,
      `/topics/${freshTopic.topic_id}/inbound`,
      { payload: 'YXNzaWdubWVudA==' },
      bearer(freshTopic.inbound_publish_token),
    );
    assert.equal(status, 409);
    assert.ok(body.message.toLowerCase().includes('not registered'));
  });

  test('POST /topics/:id/inbound — clinician sends encrypted assignment', async () => {
    const payload = 'YXNzaWdubWVudA=='; // "assignment" base64
    const { status, body } = await post(
      app,
      `/topics/${topic.topic_id}/inbound`,
      { payload },
      bearer(topic.inbound_publish_token),
    );
    assert.equal(status, 201);
    assert.ok(body.packet_id);
    assert.equal(body.sequence, 1);
  });

  test('GET /topics/:id/inbound — patient receives inbound packets', async () => {
    const { status, body } = await get(
      app, `/topics/${topic.topic_id}/inbound`, bearer(reg.inbound_poll_token)
    );
    assert.equal(status, 200);
    assert.ok(body.packets.length >= 1);
    assert.equal(body.packets[0].sequence, 1);
  });

  test('Inbound packet payload returned verbatim', async () => {
    const payload = 'c3BlY2lhbE1lc3NhZ2U=';
    await post(
      app, `/topics/${topic.topic_id}/inbound`, { payload },
      bearer(topic.inbound_publish_token)
    );
    const { body } = await get(
      app,
      `/topics/${topic.topic_id}/inbound?include_acked=false`,
      bearer(reg.inbound_poll_token)
    );
    const found = body.packets.find(p => p.payload === payload);
    assert.ok(found, 'inbound payload not returned verbatim');
  });

  test('DELETE /topics/:id/inbound/:id — patient acks inbound packet (204)', async () => {
    const { body: pub } = await post(
      app, `/topics/${topic.topic_id}/inbound`, { payload: 'YWNr' },
      bearer(topic.inbound_publish_token)
    );
    const { status } = await del(
      app,
      `/topics/${topic.topic_id}/inbound/${pub.packet_id}`,
      bearer(reg.inbound_poll_token)
    );
    assert.equal(status, 204);
  });

  test('Acked inbound packet excluded from default poll', async () => {
    const { body: pub } = await post(
      app, `/topics/${topic.topic_id}/inbound`, { payload: 'YWNrMg==' },
      bearer(topic.inbound_publish_token)
    );
    await del(
      app,
      `/topics/${topic.topic_id}/inbound/${pub.packet_id}`,
      bearer(reg.inbound_poll_token)
    );
    const { body } = await get(
      app,
      `/topics/${topic.topic_id}/inbound?since_sequence=${pub.sequence - 1}`,
      bearer(reg.inbound_poll_token)
    );
    assert.ok(!body.packets.some(p => p.id === pub.packet_id));
  });

  test('Inbound since_sequence filtering works', async () => {
    const { body: p1 } = await post(
      app, `/topics/${topic.topic_id}/inbound`, { payload: 'cDE=' },
      bearer(topic.inbound_publish_token)
    );
    const { body: p2 } = await post(
      app, `/topics/${topic.topic_id}/inbound`, { payload: 'cDI=' },
      bearer(topic.inbound_publish_token)
    );
    const { body } = await get(
      app,
      `/topics/${topic.topic_id}/inbound?since_sequence=${p1.sequence}`,
      bearer(reg.inbound_poll_token)
    );
    assert.ok(!body.packets.some(p => p.sequence <= p1.sequence));
    assert.ok(body.packets.some(p => p.sequence === p2.sequence));
  });

  test('Wrong token (outbound poll token) rejected for inbound poll', async () => {
    const { status } = await get(
      app, `/topics/${topic.topic_id}/inbound`, bearer(topic.poll_token)
    );
    assert.equal(status, 401);
  });
});

// ── Section 7: Payload validation ────────────────────────────────────────────

describe('Payload validation', () => {
  let app, topic, reg;
  before(async () => {
    app   = await makeApp();
    topic = await createTopic(app);
    const regUrl = new URL(topic.registration_url);
    reg   = await registerPatient(app, topic.topic_id, regUrl.searchParams.get('token'));
  });
  after(async () => { await app.close(); });

  test('Missing payload field returns 400', async () => {
    const { status } = await post(
      app, `/topics/${topic.topic_id}/packets`, {}, bearer(reg.publish_token)
    );
    assert.equal(status, 400);
  });

  test('Empty payload string returns 400', async () => {
    const { status } = await post(
      app, `/topics/${topic.topic_id}/packets`, { payload: '' }, bearer(reg.publish_token)
    );
    assert.equal(status, 400);
  });

  test('Payload exceeding 64 KB decoded returns 413', async () => {
    // 64 KB = 65,536 bytes. In base64: 65,536 × 4/3 ≈ 87,382 chars.
    // Use 88,000 chars → decodes to ~66,000 bytes → over the limit.
    const bigPayload = 'A'.repeat(88_000);
    const { status } = await post(
      app, `/topics/${topic.topic_id}/packets`, { payload: bigPayload }, bearer(reg.publish_token)
    );
    assert.equal(status, 413);
  });

  test('Maximum valid payload is accepted', async () => {
    // Just under the limit: 64 KB decoded ≈ 85,333 base64 chars
    const okPayload = 'A'.repeat(85_000);
    const { status } = await post(
      app, `/topics/${topic.topic_id}/packets`, { payload: okPayload }, bearer(reg.publish_token)
    );
    assert.equal(status, 201);
  });
});

// ── Section 8: Pagination ─────────────────────────────────────────────────────

describe('Pagination (has_more)', () => {
  let app, topic, reg;
  before(async () => {
    app   = await makeApp();
    topic = await createTopic(app);
    const regUrl = new URL(topic.registration_url);
    reg   = await registerPatient(app, topic.topic_id, regUrl.searchParams.get('token'));

    // Publish 5 packets
    for (let i = 0; i < 5; i++) {
      await publishPacket(app, topic.topic_id, reg.publish_token);
    }
  });
  after(async () => { await app.close(); });

  test('has_more=false when all packets fit in one page', async () => {
    const { body } = await get(
      app, `/topics/${topic.topic_id}/packets?limit=100`, bearer(topic.poll_token)
    );
    assert.equal(body.has_more, false);
  });

  test('has_more=true when limit < total', async () => {
    const { body } = await get(
      app, `/topics/${topic.topic_id}/packets?limit=3`, bearer(topic.poll_token)
    );
    assert.equal(body.has_more, true);
    assert.equal(body.packets.length, 3);
  });

  test('Paginating with since_sequence retrieves remaining packets', async () => {
    const page1 = (await get(
      app, `/topics/${topic.topic_id}/packets?limit=3`, bearer(topic.poll_token)
    )).body;

    const lastSeq = page1.packets.at(-1).sequence;

    const page2 = (await get(
      app, `/topics/${topic.topic_id}/packets?since_sequence=${lastSeq}&limit=100`,
      bearer(topic.poll_token)
    )).body;

    // Together, pages cover all 5 packets
    const total = page1.packets.length + page2.packets.length;
    assert.ok(total >= 5);
    // No overlap
    const page1Seqs = new Set(page1.packets.map(p => p.sequence));
    assert.ok(page2.packets.every(p => !page1Seqs.has(p.sequence)));
  });
});

// ── Section 9: Admin cleanup ──────────────────────────────────────────────────

describe('Admin cleanup', () => {
  let app;
  before(async () => { app = await makeApp(); });
  after(async ()  => { await app.close(); });

  test('POST /admin/cleanup — returns cleaned counts', async () => {
    const { status, body } = await post(
      app, '/admin/cleanup', {}, bearer('test-admin-secret')
    );
    assert.equal(status, 200);
    assert.ok('cleaned' in body);
    assert.ok('packets_deleted'  in body.cleaned);
    assert.ok('inbound_deleted'  in body.cleaned);
    assert.ok('topics_deleted'   in body.cleaned);
    assert.ok(body.time);
  });

  test('POST /admin/cleanup — 401 with wrong token', async () => {
    const { status } = await post(
      app, '/admin/cleanup', {}, bearer('wrong-secret')
    );
    assert.equal(status, 401);
  });

  test('POST /admin/cleanup — 401 with no token', async () => {
    const { status } = await post(app, '/admin/cleanup', {});
    assert.equal(status, 401);
  });
});

// ── Section 10: Full end-to-end flow ─────────────────────────────────────────

describe('End-to-end: complete patient-clinician flow', () => {
  let app;
  before(async () => { app = await makeApp(); });
  after(async ()  => { await app.close(); });

  test('Full round-trip: create → register → publish → poll → ack → inbound → poll → ack', async () => {
    // 1. Clinician creates a topic
    const topic = await createTopic(app, {
      label: 'End-to-end test slot',
      clinician_pubkey: 'YWFh', // "aaa" in base64
    });
    assert.equal(typeof topic.poll_token, 'string');

    // 2. Patient extracts registration token from URL and registers
    const regUrl   = new URL(topic.registration_url);
    const regToken = regUrl.searchParams.get('token');
    const reg      = await registerPatient(app, topic.topic_id, regToken, {
      patient_pubkey: 'YmJi', // "bbb" in base64
    });
    assert.ok(reg.publish_token);
    assert.ok(reg.inbound_poll_token);
    assert.equal(reg.clinician_pubkey, 'YWFh');

    // 3. Clinician checks topic status — sees patient registered
    const statusRes = await get(app, `/topics/${topic.topic_id}`, bearer(topic.poll_token));
    assert.equal(statusRes.body.patient_registered, true);
    assert.equal(statusRes.body.patient_pubkey, 'YmJi');

    // 4. Patient publishes 3 encrypted result packets
    const p1 = (await publishPacket(app, topic.topic_id, reg.publish_token, 'RESULT_1_ENCRYPTED')).body;
    const p2 = (await publishPacket(app, topic.topic_id, reg.publish_token, 'RESULT_2_ENCRYPTED')).body;
    const p3 = (await publishPacket(app, topic.topic_id, reg.publish_token, 'RESULT_3_ENCRYPTED')).body;
    assert.equal(p1.sequence, 1);
    assert.equal(p2.sequence, 2);
    assert.equal(p3.sequence, 3);

    // 5. Clinician polls and receives all 3
    const poll1 = (await get(app, `/topics/${topic.topic_id}/packets`, bearer(topic.poll_token))).body;
    assert.equal(poll1.packets.length, 3);
    assert.equal(poll1.has_more, false);

    // 6. Clinician acks packets 1 and 2
    await del(app, `/topics/${topic.topic_id}/packets/${p1.packet_id}`, bearer(topic.poll_token));
    await del(app, `/topics/${topic.topic_id}/packets/${p2.packet_id}`, bearer(topic.poll_token));

    // 7. Poll again — only packet 3 remains
    const poll2 = (await get(app, `/topics/${topic.topic_id}/packets`, bearer(topic.poll_token))).body;
    assert.equal(poll2.packets.length, 1);
    assert.equal(poll2.packets[0].sequence, 3);

    // 8. Clinician sends an inbound assignment
    const assign = (await post(
      app,
      `/topics/${topic.topic_id}/inbound`,
      { payload: 'ASSIGNMENT_ENCRYPTED' },
      bearer(topic.inbound_publish_token),
    )).body;
    assert.equal(assign.sequence, 1);

    // 9. Patient polls inbound
    const inPoll = (await get(
      app, `/topics/${topic.topic_id}/inbound`, bearer(reg.inbound_poll_token)
    )).body;
    assert.equal(inPoll.packets.length, 1);
    assert.equal(inPoll.packets[0].payload, 'ASSIGNMENT_ENCRYPTED');

    // 10. Patient acks inbound
    await del(
      app,
      `/topics/${topic.topic_id}/inbound/${assign.packet_id}`,
      bearer(reg.inbound_poll_token)
    );

    // 11. Inbound poll now empty
    const inPoll2 = (await get(
      app, `/topics/${topic.topic_id}/inbound`, bearer(reg.inbound_poll_token)
    )).body;
    assert.equal(inPoll2.packets.length, 0);
  });
});
