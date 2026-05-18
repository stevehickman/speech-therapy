/**
 * db.js
 * -----
 * SQLite database layer for the Familiar relay.
 *
 * Schema philosophy:
 *   - All packet payloads are stored as opaque BLOBs. The relay never
 *     inspects, transforms, or logs their contents.
 *   - Tokens are random nanoid strings (21 chars ≈ 126 bits entropy).
 *     They are stored in plaintext — the relay IS the secret store.
 *   - Sequences are per-topic monotonic counters so clinician/patient
 *     can poll with ?since_sequence=N for reliable at-least-once delivery.
 *   - Packets are NOT deleted on ack. They're flagged acked=1 and excluded
 *     from default polls. They remain available via ?include_acked=true
 *     within their TTL window as a recovery mechanism.
 *   - Cleanup (expiry) runs on startup and via the /admin/cleanup endpoint.
 */

import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS topics (
  id                    TEXT PRIMARY KEY,
  label                 TEXT,
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,
  clinician_pubkey      TEXT,
  patient_pubkey        TEXT,
  registration_token    TEXT NOT NULL UNIQUE,
  poll_token            TEXT NOT NULL UNIQUE,
  inbound_publish_token TEXT NOT NULL UNIQUE,
  patient_publish_token TEXT UNIQUE,
  patient_poll_token    TEXT UNIQUE,
  patient_registered_at INTEGER,
  last_packet_at        INTEGER,
  out_sequence          INTEGER NOT NULL DEFAULT 0,
  in_sequence           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS packets (
  id         TEXT PRIMARY KEY,
  topic_id   TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  payload    BLOB NOT NULL,
  sequence   INTEGER NOT NULL,
  acked      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(topic_id, sequence)
);

CREATE TABLE IF NOT EXISTS inbound_packets (
  id         TEXT PRIMARY KEY,
  topic_id   TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  payload    BLOB NOT NULL,
  sequence   INTEGER NOT NULL,
  acked      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(topic_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_packets_topic_seq   ON packets(topic_id, sequence);
CREATE INDEX IF NOT EXISTS idx_packets_expires      ON packets(expires_at);
CREATE INDEX IF NOT EXISTS idx_inbound_topic_seq    ON inbound_packets(topic_id, sequence);
CREATE INDEX IF NOT EXISTS idx_inbound_expires      ON inbound_packets(expires_at);
CREATE INDEX IF NOT EXISTS idx_topics_reg_token     ON topics(registration_token);
CREATE INDEX IF NOT EXISTS idx_topics_poll_token    ON topics(poll_token);
CREATE INDEX IF NOT EXISTS idx_topics_pub_token     ON topics(patient_publish_token);
CREATE INDEX IF NOT EXISTS idx_topics_pat_poll_tok  ON topics(patient_poll_token);
CREATE INDEX IF NOT EXISTS idx_topics_inb_pub_tok   ON topics(inbound_publish_token);
CREATE INDEX IF NOT EXISTS idx_topics_expires       ON topics(expires_at);
`;

export class Database {
  #db;

  constructor(path = ':memory:') {
    this.#db = new DatabaseSync(path);
    this.#db.exec(SCHEMA);
    this.#prepareStatements();
  }

  // ── Prepared statements ──────────────────────────────────────────────────

  #prepareStatements() {
    const db = this.#db;

    this._insertTopic = db.prepare(`
      INSERT INTO topics (
        id, label, created_at, expires_at,
        clinician_pubkey,
        registration_token, poll_token, inbound_publish_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._getTopicById = db.prepare(`
      SELECT * FROM topics WHERE id = ?
    `);

    this._getTopicByRegToken = db.prepare(`
      SELECT * FROM topics WHERE registration_token = ?
    `);

    this._getTopicByPollToken = db.prepare(`
      SELECT * FROM topics WHERE poll_token = ?
    `);

    this._getTopicByPublishToken = db.prepare(`
      SELECT * FROM topics WHERE patient_publish_token = ?
    `);

    this._getTopicByPatientPollToken = db.prepare(`
      SELECT * FROM topics WHERE patient_poll_token = ?
    `);

    this._getTopicByInboundPublishToken = db.prepare(`
      SELECT * FROM topics WHERE inbound_publish_token = ?
    `);

    this._registerPatient = db.prepare(`
      UPDATE topics SET
        patient_pubkey        = ?,
        patient_publish_token = ?,
        patient_poll_token    = ?,
        patient_registered_at = ?
      WHERE id = ?
    `);

    this._updatePatientPubkey = db.prepare(`
      UPDATE topics SET patient_pubkey = ? WHERE id = ?
    `);

    this._deleteTopic = db.prepare(`DELETE FROM topics WHERE id = ?`);

    this._nextOutSequence = db.prepare(`
      UPDATE topics SET out_sequence = out_sequence + 1 WHERE id = ?
      RETURNING out_sequence
    `);

    this._nextInSequence = db.prepare(`
      UPDATE topics SET in_sequence = in_sequence + 1 WHERE id = ?
      RETURNING in_sequence
    `);

    this._touchLastPacket = db.prepare(`
      UPDATE topics SET last_packet_at = ? WHERE id = ?
    `);

    this._insertPacket = db.prepare(`
      INSERT INTO packets (id, topic_id, created_at, expires_at, payload, sequence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this._getPackets = db.prepare(`
      SELECT id, sequence, created_at, expires_at, payload, acked
      FROM packets
      WHERE topic_id = ?
        AND sequence > ?
        AND (? = 1 OR acked = 0)
      ORDER BY sequence ASC
      LIMIT ?
    `);

    this._ackPacket = db.prepare(`
      UPDATE packets SET acked = 1 WHERE id = ? AND topic_id = ?
    `);

    this._insertInbound = db.prepare(`
      INSERT INTO inbound_packets (id, topic_id, created_at, expires_at, payload, sequence)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this._getInbound = db.prepare(`
      SELECT id, sequence, created_at, expires_at, payload, acked
      FROM inbound_packets
      WHERE topic_id = ?
        AND sequence > ?
        AND (? = 1 OR acked = 0)
      ORDER BY sequence ASC
      LIMIT ?
    `);

    this._ackInbound = db.prepare(`
      UPDATE inbound_packets SET acked = 1 WHERE id = ? AND topic_id = ?
    `);

    this._cleanExpiredPackets = db.prepare(`
      DELETE FROM packets WHERE expires_at < ?
    `);

    this._cleanExpiredInbound = db.prepare(`
      DELETE FROM inbound_packets WHERE expires_at < ?
    `);

    this._cleanExpiredTopics = db.prepare(`
      DELETE FROM topics WHERE expires_at < ?
    `);

    this._countPackets = db.prepare(`
      SELECT COUNT(*) as n FROM packets WHERE topic_id = ? AND acked = 0
    `);

    this._allTopicIds = db.prepare(`SELECT id FROM topics`);
  }

  // ── Topic operations ─────────────────────────────────────────────────────

  createTopic({ id, label, clinician_pubkey, registration_token,
                poll_token, inbound_publish_token, ttl_days = 365 }) {
    const now      = Date.now();
    const expires  = now + ttl_days * 86_400_000;
    this._insertTopic.run(
      id, label ?? null, now, expires,
      clinician_pubkey ?? null,
      registration_token, poll_token, inbound_publish_token
    );
    return this.getTopic(id);
  }

  getTopic(id) {
    return this._getTopicById.get(id) ?? null;
  }

  getTopicByToken(type, token) {
    const stmts = {
      registration:     this._getTopicByRegToken,
      poll:             this._getTopicByPollToken,
      publish:          this._getTopicByPublishToken,
      patient_poll:     this._getTopicByPatientPollToken,
      inbound_publish:  this._getTopicByInboundPublishToken,
    };
    const stmt = stmts[type];
    if (!stmt) throw new Error(`Unknown token type: ${type}`);
    return stmt.get(token) ?? null;
  }

  registerPatient(topic_id, { patient_pubkey, patient_publish_token, patient_poll_token }) {
    this._registerPatient.run(
      patient_pubkey ?? null,
      patient_publish_token,
      patient_poll_token,
      Date.now(),
      topic_id
    );
    return this.getTopic(topic_id);
  }

  deleteTopic(id) {
    const info = this._deleteTopic.run(id);
    return info.changes > 0;
  }

  // ── Outbound packets (patient → clinician) ────────────────────────────────

  addPacket({ id, topic_id, payload, ttl_days = 30 }) {
    const now      = Date.now();
    const expires  = now + ttl_days * 86_400_000;
    // Atomically increment sequence and get new value
    const row      = this._nextOutSequence.get(topic_id);
    if (!row) throw new Error('Topic not found');
    const sequence = row.out_sequence;
    this._insertPacket.run(id, topic_id, now, expires, payload, sequence);
    this._touchLastPacket.run(now, topic_id);
    return { id, sequence, created_at: now };
  }

  getPackets(topic_id, { since_sequence = 0, limit = 100, include_acked = false }) {
    return this._getPackets.all(
      topic_id,
      since_sequence,
      include_acked ? 1 : 0,
      Math.min(limit, 500)
    );
  }

  ackPacket(id, topic_id) {
    const info = this._ackPacket.run(id, topic_id);
    return info.changes > 0;
  }

  // ── Inbound packets (clinician → patient) ────────────────────────────────

  addInboundPacket({ id, topic_id, payload, ttl_days = 30 }) {
    const now      = Date.now();
    const expires  = now + ttl_days * 86_400_000;
    const row      = this._nextInSequence.get(topic_id);
    if (!row) throw new Error('Topic not found');
    const sequence = row.in_sequence;
    this._insertInbound.run(id, topic_id, now, expires, payload, sequence);
    return { id, sequence, created_at: now };
  }

  getInboundPackets(topic_id, { since_sequence = 0, limit = 100, include_acked = false }) {
    return this._getInbound.all(
      topic_id,
      since_sequence,
      include_acked ? 1 : 0,
      Math.min(limit, 500)
    );
  }

  ackInboundPacket(id, topic_id) {
    const info = this._ackInbound.run(id, topic_id);
    return info.changes > 0;
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  cleanup() {
    const now = Date.now();
    const packets  = this._cleanExpiredPackets.run(now);
    const inbound  = this._cleanExpiredInbound.run(now);
    const topics   = this._cleanExpiredTopics.run(now);
    return {
      packets_deleted:  packets.changes,
      inbound_deleted:  inbound.changes,
      topics_deleted:   topics.changes,
    };
  }

  pendingPacketCount(topic_id) {
    return this._countPackets.get(topic_id)?.n ?? 0;
  }

  close() {
    this.#db.close();
  }
}
