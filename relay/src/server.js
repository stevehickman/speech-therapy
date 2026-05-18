/**
 * server.js
 * ---------
 * Familiar zero-knowledge pub/sub relay.
 *
 * The relay routes encrypted packets between patients and clinicians.
 * It stores opaque BLOBs. It never decrypts, inspects, or logs payload
 * contents. The relay has no concept of patient identity — only topics
 * identified by random IDs.
 *
 * Auth model:
 *   Every topic has multiple single-purpose bearer tokens:
 *     registration_token    — one-time-ish: patient subscribes to topic
 *     poll_token            — clinician: read outbound packets + topic status
 *     inbound_publish_token — clinician: send assignments/messages to patient
 *     patient_publish_token — patient: publish result packets  (issued on register)
 *     patient_poll_token    — patient: read inbound packets    (issued on register)
 *
 * Privacy guarantees:
 *   - Payloads are encrypted end-to-end (patient↔clinician keypairs).
 *   - The relay stores payloads as base64 strings; it never parses them.
 *   - Topic labels are clinician-supplied (e.g. "Patient slot 3"), not patient names.
 *   - No user accounts, no emails, no PII of any kind touches this server.
 */

import Fastify           from 'fastify';
import cors              from '@fastify/cors';
import helmet            from '@fastify/helmet';
import rateLimit         from '@fastify/rate-limit';
import { nanoid }        from 'nanoid';
import { Database }      from './db.js';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_PAYLOAD_BYTES = 64 * 1024;          // 64 KB per packet
const DEFAULT_TOPIC_TTL = 365;                // days
const DEFAULT_PACKET_TTL = 30;               // days
const DEFAULT_POLL_LIMIT = 100;
const TOKEN_LENGTH = 32;                      // nanoid chars (~192 bits)

// ── App factory ──────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string}  [opts.dbPath=':memory:']
 * @param {string}  [opts.adminToken]         — required for POST /admin/cleanup
 * @param {object}  [opts.rateLimit]          — overrides for @fastify/rate-limit
 * @param {boolean} [opts.logger=false]
 */
export async function buildApp(opts = {}) {
  const {
    dbPath     = ':memory:',
    adminToken = process.env.ADMIN_TOKEN ?? 'dev-admin',
    logger     = false,
  } = opts;

  const db = new Database(dbPath);

  // Run cleanup on start so stale data doesn't accumulate across restarts
  db.cleanup();

  const app = Fastify({ logger, trustProxy: true });

  // ── Plugins ────────────────────────────────────────────────────────────────

  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, {
    origin:  process.env.CORS_ORIGIN ?? true,
    methods: ['GET', 'POST', 'DELETE'],
  });

  await app.register(rateLimit, {
    global:     true,
    max:        opts.rateLimit?.max ?? 120,   // requests per window
    timeWindow: opts.rateLimit?.window ?? '1 minute',
    // Use Authorization header as key so limits are per-token, not per-IP
    // (patients behind NAT would otherwise share limits)
    keyGenerator(req) {
      return req.headers.authorization ?? req.ip;
    },
    errorResponseBuilder(req, context) {
      return {
        error:      'Too Many Requests',
        message:    `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
        statusCode: 429,
      };
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function tok() { return nanoid(TOKEN_LENGTH); }
  function now() { return Date.now(); }

  /** Send a 401 with a consistent shape */
  function unauthorized(reply, message = 'Invalid or missing token') {
    return reply.code(401).send({ error: 'Unauthorized', message });
  }

  /** Send a 404 with a consistent shape */
  function notFound(reply, message = 'Topic not found') {
    return reply.code(404).send({ error: 'Not Found', message });
  }

  /** Resolve a bearer token from the Authorization header */
  function bearerToken(req) {
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ')) return null;
    return auth.slice(7).trim() || null;
  }

  /**
   * Auth middleware — resolves the topic from a specific token type.
   * Returns the topic or sends a 401/404 and returns null.
   */
  function requireTopicToken(tokenType, req, reply) {
    const token = bearerToken(req);
    if (!token) { unauthorized(reply); return null; }
    const topic = db.getTopicByToken(tokenType, token);
    if (!topic) { unauthorized(reply); return null; }
    return topic;
  }

  /** Validate that a payload string is present and within size limits */
  function validatePayload(payload, reply) {
    if (!payload || typeof payload !== 'string') {
      reply.code(400).send({ error: 'Bad Request', message: 'payload must be a non-empty string' });
      return false;
    }
    // Base64 string — check decoded size estimate (4 chars ≈ 3 bytes)
    const estimatedBytes = Math.ceil(payload.length * 0.75);
    if (estimatedBytes > MAX_PAYLOAD_BYTES) {
      reply.code(413).send({
        error:   'Payload Too Large',
        message: `Maximum payload size is ${MAX_PAYLOAD_BYTES / 1024} KB`,
      });
      return false;
    }
    return true;
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  app.get('/health', {
    config: { rateLimit: { max: 1000 } },
    handler(req, reply) {
      reply.send({ status: 'ok', time: new Date().toISOString() });
    },
  });

  // ── Topics: clinician creates / manages ────────────────────────────────────

  /**
   * POST /topics
   * Clinician creates a new patient topic.
   *
   * Body:
   *   label?           string  — clinician's internal label (not patient name)
   *   clinician_pubkey? string — base64 public key the patient will encrypt result packets with
   *   ttl_days?        number  — topic lifetime in days (default 365)
   *
   * Response:
   *   topic_id              string
   *   registration_url      string  — share this with the patient (contains token)
   *   poll_token            string  — clinician stores this; used to receive packets
   *   inbound_publish_token string  — clinician uses this to send assignments to patient
   *   clinician_pubkey      string|null
   */
  app.post('/topics', {
    schema: {
      body: {
        type: 'object',
        properties: {
          label:           { type: 'string', maxLength: 200 },
          clinician_pubkey:{ type: 'string', maxLength: 4096 },
          ttl_days:        { type: 'number', minimum: 1, maximum: 3650 },
        },
      },
    },
    async handler(req, reply) {
      const { label, clinician_pubkey, ttl_days = DEFAULT_TOPIC_TTL } = req.body ?? {};

      const id                    = nanoid(12);
      const registration_token    = tok();
      const poll_token            = tok();
      const inbound_publish_token = tok();

      db.createTopic({
        id, label, clinician_pubkey,
        registration_token, poll_token, inbound_publish_token,
        ttl_days,
      });

      // The registration URL is what the clinician shares with the patient.
      // It encodes the topic ID and registration token in a single URL.
      const baseUrl = process.env.BASE_URL ?? `http://localhost:${app.server.address()?.port ?? 3000}`;
      const registration_url = `${baseUrl}/topics/${id}/register?token=${registration_token}`;

      reply.code(201).send({
        topic_id:              id,
        registration_url,
        poll_token,
        inbound_publish_token,
        clinician_pubkey:      clinician_pubkey ?? null,
      });
    },
  });

  /**
   * GET /topics/:id
   * Clinician checks topic status.
   * Auth: poll_token
   */
  app.get('/topics/:id', async(req, reply) => {
    const topic = requireTopicToken('poll', req, reply);
    if (!topic) return;
    if (topic.id !== req.params.id) return unauthorized(reply);

    reply.send({
      topic_id:              topic.id,
      label:                 topic.label,
      created_at:            topic.created_at,
      expires_at:            topic.expires_at,
      patient_registered:    !!topic.patient_registered_at,
      patient_registered_at: topic.patient_registered_at ?? null,
      patient_pubkey:        topic.patient_pubkey ?? null,
      last_packet_at:        topic.last_packet_at ?? null,
      pending_packets:       db.pendingPacketCount(topic.id),
    });
  });

  /**
   * DELETE /topics/:id
   * Clinician deletes topic and ALL associated packets (both directions).
   * Auth: poll_token
   */
  app.delete('/topics/:id', async(req, reply) => {
    const topic = requireTopicToken('poll', req, reply);
    if (!topic) return;
    if (topic.id !== req.params.id) return unauthorized(reply);

    db.deleteTopic(topic.id);
    reply.code(204).send();
  });

  // ── Registration: patient subscribes ──────────────────────────────────────

  /**
   * POST /topics/:id/register
   * Patient registers with a topic using the registration_token they received
   * from the clinician (via URL, QR code, email, etc.).
   *
   * Auth: registration_token (in Authorization header OR ?token= query param)
   *
   * Body:
   *   patient_pubkey?  string — base64 public key clinician will encrypt inbound packets with
   *
   * Response:
   *   publish_token      string — patient stores; used to publish result packets
   *   inbound_poll_token string — patient stores; used to receive assignments
   *   clinician_pubkey   string|null — relay passes through for patient to use
   */
  app.post('/topics/:id/register', {
    schema: {
      body: {
        type: 'object',
        properties: {
          patient_pubkey: { type: 'string', maxLength: 4096 },
        },
      },
    },
    async handler(req, reply) {
      // Accept token in header OR query param (for QR-code / link flow)
      const token = bearerToken(req) ?? req.query.token ?? null;
      if (!token) return unauthorized(reply);

      const topic = db.getTopicByToken('registration', token);
      if (!topic || topic.id !== req.params.id) return unauthorized(reply);

      const { patient_pubkey } = req.body ?? {};

      const patient_publish_token = tok();
      const patient_poll_token    = tok();

      db.registerPatient(topic.id, {
        patient_pubkey:      patient_pubkey ?? null,
        patient_publish_token,
        patient_poll_token,
      });

      reply.code(201).send({
        publish_token:      patient_publish_token,
        inbound_poll_token: patient_poll_token,
        clinician_pubkey:   topic.clinician_pubkey ?? null,
      });
    },
  });

  // ── Outbound packets: patient → clinician ─────────────────────────────────

  /**
   * POST /topics/:id/packets
   * Patient publishes an encrypted result packet.
   * Auth: patient_publish_token
   *
   * Body:
   *   payload  string  — base64-encoded encrypted bytes (max 64 KB decoded)
   *   ttl_days? number  — packet lifetime (default 30 days)
   */
  app.post('/topics/:id/packets', {
    schema: {
      body: {
        type: 'object',
        required: ['payload'],
        properties: {
          payload:  { type: 'string' },
          ttl_days: { type: 'number', minimum: 1, maximum: 90 },
        },
      },
    },
    async handler(req, reply) {
      const topic = requireTopicToken('publish', req, reply);
      if (!topic) return;
      if (topic.id !== req.params.id) return unauthorized(reply);

      const { payload, ttl_days = DEFAULT_PACKET_TTL } = req.body;
      if (!validatePayload(payload, reply)) return;

      const packet = db.addPacket({
        id: nanoid(),
        topic_id: topic.id,
        payload,
        ttl_days,
      });

      reply.code(201).send({
        packet_id:  packet.id,
        sequence:   packet.sequence,
        created_at: packet.created_at,
      });
    },
  });

  /**
   * GET /topics/:id/packets
   * Clinician polls for outbound packets.
   * Auth: poll_token
   *
   * Query:
   *   since_sequence? number  — return only packets with sequence > this (default 0)
   *   limit?          number  — max packets to return (default 100, max 500)
   *   include_acked?  boolean — include already-acked packets (recovery mode)
   */
  app.get('/topics/:id/packets', async(req, reply) => {
    const topic = requireTopicToken('poll', req, reply);
    if (!topic) return;
    if (topic.id !== req.params.id) return unauthorized(reply);

    const since_sequence = Number(req.query.since_sequence ?? 0);
    const limit          = Math.min(Number(req.query.limit ?? DEFAULT_POLL_LIMIT), 500);
    const include_acked  = req.query.include_acked === 'true';

    const packets = db.getPackets(topic.id, { since_sequence, limit, include_acked });
    const has_more = packets.length === limit;

    reply.send({ packets, has_more });
  });

  /**
   * DELETE /topics/:id/packets/:packetId
   * Clinician acknowledges a packet (marks it acked; does not delete it).
   * Auth: poll_token
   */
  app.delete('/topics/:id/packets/:packetId', async(req, reply) => {
    const topic = requireTopicToken('poll', req, reply);
    if (!topic) return;
    if (topic.id !== req.params.id) return unauthorized(reply);

    const ok = db.ackPacket(req.params.packetId, topic.id);
    if (!ok) return reply.code(404).send({ error: 'Not Found', message: 'Packet not found' });
    reply.code(204).send();
  });

  // ── Inbound packets: clinician → patient ──────────────────────────────────

  /**
   * POST /topics/:id/inbound
   * Clinician sends an encrypted assignment or message to the patient.
   * Auth: inbound_publish_token
   *
   * Body:
   *   payload  string — base64-encoded encrypted bytes
   *   ttl_days? number
   */
  app.post('/topics/:id/inbound', {
    schema: {
      body: {
        type: 'object',
        required: ['payload'],
        properties: {
          payload:  { type: 'string' },
          ttl_days: { type: 'number', minimum: 1, maximum: 90 },
        },
      },
    },
    async handler(req, reply) {
      const topic = requireTopicToken('inbound_publish', req, reply);
      if (!topic) return;
      if (topic.id !== req.params.id) return unauthorized(reply);

      if (!topic.patient_registered_at) {
        return reply.code(409).send({
          error: 'Conflict',
          message: 'Patient has not registered with this topic yet. Cannot send inbound packet.',
        });
      }

      const { payload, ttl_days = DEFAULT_PACKET_TTL } = req.body;
      if (!validatePayload(payload, reply)) return;

      const packet = db.addInboundPacket({
        id: nanoid(),
        topic_id: topic.id,
        payload,
        ttl_days,
      });

      reply.code(201).send({
        packet_id:  packet.id,
        sequence:   packet.sequence,
        created_at: packet.created_at,
      });
    },
  });

  /**
   * GET /topics/:id/inbound
   * Patient polls for inbound packets (assignments, messages from clinician).
   * Auth: patient_poll_token
   *
   * Query: since_sequence?, limit?, include_acked?
   */
  app.get('/topics/:id/inbound', async(req, reply) => {
    const topic = requireTopicToken('patient_poll', req, reply);
    if (!topic) return;
    if (topic.id !== req.params.id) return unauthorized(reply);

    const since_sequence = Number(req.query.since_sequence ?? 0);
    const limit          = Math.min(Number(req.query.limit ?? DEFAULT_POLL_LIMIT), 500);
    const include_acked  = req.query.include_acked === 'true';

    const packets = db.getInboundPackets(topic.id, { since_sequence, limit, include_acked });
    const has_more = packets.length === limit;

    reply.send({ packets, has_more });
  });

  /**
   * DELETE /topics/:id/inbound/:packetId
   * Patient acknowledges an inbound packet.
   * Auth: patient_poll_token
   */
  app.delete('/topics/:id/inbound/:packetId', async(req, reply) => {
    const topic = requireTopicToken('patient_poll', req, reply);
    if (!topic) return;
    if (topic.id !== req.params.id) return unauthorized(reply);

    const ok = db.ackInboundPacket(req.params.packetId, topic.id);
    if (!ok) return reply.code(404).send({ error: 'Not Found', message: 'Packet not found' });
    reply.code(204).send();
  });

  // ── Admin ──────────────────────────────────────────────────────────────────

  /**
   * POST /admin/cleanup
   * Delete expired packets and topics.
   * Auth: ADMIN_TOKEN (set via env or buildApp opts)
   */
  app.post('/admin/cleanup', async(req, reply) => {
    const token = bearerToken(req);
    if (token !== adminToken) return unauthorized(reply, 'Invalid admin token');
    const result = db.cleanup();
    reply.send({ cleaned: result, time: new Date().toISOString() });
  });

  // ── Teardown ───────────────────────────────────────────────────────────────

  app.addHook('onClose', async() => { db.close(); });

  return app;
}

// ── Entry point ───────────────────────────────────────────────────────────────

// Only start the server when run directly (not when imported for testing)
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';

  const app = await buildApp({
    dbPath:     process.env.DB_PATH ?? './familiar-relay.db',
    adminToken: process.env.ADMIN_TOKEN ?? (() => { throw new Error('ADMIN_TOKEN env var required'); })(),
    logger:     { level: process.env.LOG_LEVEL ?? 'info' },
  });

  await app.listen({ port, host });
  console.log(`Familiar relay listening on ${host}:${port}`);
}
