import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import topicJson from "../../content/overfitting.v1.json";
import packJson from "../../public/experiments/overfitting.v1.json";
import {
  RECOVERED_FEEDBACK_MODEL, RECOVERED_FEEDBACK_PROMPT_VERSION, SessionSchema, TopicSchema,
  type LearningSession, type SavedSession,
} from "../domain/contracts";
import { questionFor } from "../domain/session";
import { loadCase, parsePack } from "../experiment/catalog";
import { verifyHistoricalTutor } from "../tutor/verify";

export type { SavedSession };

export class SessionRepositoryError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 410) {
    super(String(status));
  }
}

type SessionRow = { owner_id: string; revision: number; payload: string | null; deleted_at: string | null };
type KeyRow = { request_hash: string; response_json: string };
const topic = TopicSchema.parse(topicJson);
let pack: ReturnType<typeof parsePack> | undefined;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requireIdentifier(value: string): void {
  if (typeof value !== "string" || !value.trim()) throw new SessionRepositoryError(400);
}

function unique(values: string[]): void {
  if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) throw new Error("ambiguous-identity");
}

function validate(id: string, payload: unknown): LearningSession {
  try {
    const session = SessionSchema.parse(payload);
    if (session.id !== id || session.topicVersion !== topic.version) throw new Error("session-mismatch");
    unique(session.answers.map((answer) => JSON.stringify([answer.id, answer.revision])));
    unique(session.snapshots.map((snapshot) => snapshot.id));
    unique(session.feedback.map((feedback) => feedback.id));
    for (const answer of session.answers) {
      requireIdentifier(answer.id);
      questionFor(session, answer.questionId);
      const earlier = session.answers.find((item) => item.id === answer.id);
      if (earlier && (earlier.step !== answer.step || earlier.questionId !== answer.questionId
        || earlier.clarificationRound !== answer.clarificationRound)) throw new Error("answer-identity-conflict");
      if (answer.questionId.startsWith("tutor:")) {
        const feedback = session.feedback.find((item) => item.id === answer.questionId.slice(6))!;
        if (answer.step !== "clarify" || feedback.output.nextAction !== "ask") throw new Error("question-step-mismatch");
      } else if (answer.questionId !== `${answer.step}-${answer.step === "clarify" ? answer.clarificationRound : 1}`) {
        throw new Error("question-step-mismatch");
      }
    }
    pack ??= parsePack(packJson);
    for (const snapshot of session.snapshots) {
      if (snapshot.packVersion !== pack.version) throw new Error("pack-mismatch");
      loadCase(pack, snapshot.config);
    }
    for (const feedback of session.feedback) {
      verifyHistoricalTutor(feedback.output, { session, topic, pack });
    }
    for (const disagreement of session.disagreements) {
      if (!session.feedback.some((feedback) => feedback.id === disagreement.feedbackId)) throw new Error("missing-feedback");
    }
    return session;
  } catch { throw new SessionRepositoryError(400); }
}

function saved(row: SessionRow): SavedSession {
  return { session: SessionSchema.parse(JSON.parse(row.payload!)), serverRevision: row.revision };
}

/** The caller supplies a verified owner identity. Construction and CRUD never migrate. */
export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

  migrate(): void {
    const sql = readFileSync(new URL("./migrations/001_sessions.sql", import.meta.url), "utf8");
    this.db.transaction(() => {
      this.db.exec(`CREATE TABLE IF NOT EXISTS learning_schema_migrations (
        version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
      )`);
      if (this.db.prepare("SELECT version FROM learning_schema_migrations WHERE version = 1").get()) return;
      this.db.exec(sql);
      this.db.prepare("INSERT INTO learning_schema_migrations (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
    }).immediate();
  }

  private row(ownerId: string, id: string, allowMissing = false): SessionRow | undefined {
    requireIdentifier(ownerId); requireIdentifier(id);
    const row = this.db.prepare("SELECT owner_id, revision, payload, deleted_at FROM learning_sessions WHERE id = ?").get(id) as SessionRow | undefined;
    if (!row) {
      if (allowMissing) return undefined;
      throw new SessionRepositoryError(404);
    }
    if (row.owner_id !== ownerId) throw new SessionRepositoryError(404);
    if (row.deleted_at !== null) throw new SessionRepositoryError(410);
    return row;
  }

  get(ownerId: string, id: string): SavedSession {
    return saved(this.row(ownerId, id)!);
  }

  list(ownerId: string): SavedSession[] {
    requireIdentifier(ownerId);
    const rows = this.db.prepare(`SELECT owner_id, revision, payload, deleted_at FROM learning_sessions
      WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id`).all(ownerId) as SessionRow[];
    return rows.map(saved);
  }

  export(ownerId: string, id: string): SavedSession {
    return this.get(ownerId, id);
  }

  save(ownerId: string, id: string, baseRevision: number, key: string, payload: unknown): SavedSession {
    requireIdentifier(key);
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) throw new SessionRepositoryError(400);
    // Reject foreign IDs/tombstones before inspecting supplied learning content. Repeat
    // the check under the write lock so deletion/creation cannot race validation.
    this.row(ownerId, id, baseRevision === 0);
    const session = validate(id, payload);
    const hash = createHash("sha256").update(canonicalJson({ sessionId: id, baseRevision, payload: session })).digest("hex");
    session.feedback = session.feedback.map((feedback) => ({ ...feedback,
      model: RECOVERED_FEEDBACK_MODEL, promptVersion: RECOVERED_FEEDBACK_PROMPT_VERSION,
    }));
    return this.db.transaction(() => {
      const row = this.row(ownerId, id, baseRevision === 0);
      const previous = this.db.prepare("SELECT request_hash, response_json FROM save_keys WHERE owner_id = ? AND idempotency_key = ?")
        .get(ownerId, key) as KeyRow | undefined;
      if (previous) {
        if (previous.request_hash !== hash) throw new SessionRepositoryError(409);
        return JSON.parse(previous.response_json) as SavedSession;
      }
      if (row && row.revision !== baseRevision) throw new SessionRepositoryError(409);
      const result: SavedSession = { session, serverRevision: baseRevision + 1 };
      const now = new Date().toISOString();
      if (row) {
        const update = this.db.prepare(`UPDATE learning_sessions SET payload = ?, revision = revision + 1, updated_at = ?
          WHERE id = ? AND owner_id = ? AND revision = ? AND deleted_at IS NULL`)
          .run(JSON.stringify(session), now, id, ownerId, baseRevision);
        if (update.changes !== 1) throw new SessionRepositoryError(409);
      } else {
        this.db.prepare(`INSERT INTO learning_sessions (id, owner_id, revision, payload, deleted_at, updated_at)
          VALUES (?, ?, 1, ?, NULL, ?)`).run(id, ownerId, JSON.stringify(session), now);
      }
      this.db.prepare(`INSERT INTO save_keys (owner_id, idempotency_key, session_id, request_hash, response_json)
        VALUES (?, ?, ?, ?, ?)`).run(ownerId, key, id, hash, JSON.stringify(result));
      return result;
    }).immediate();
  }

  remove(ownerId: string, id: string): void {
    this.db.transaction(() => {
      this.row(ownerId, id);
      const now = new Date().toISOString();
      // Feedback bodies live in payload and in cached save responses; clear both.
      this.db.prepare(`UPDATE learning_sessions SET payload = NULL, deleted_at = ?, updated_at = ?, revision = revision + 1
        WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`).run(now, now, id, ownerId);
      this.db.prepare("DELETE FROM save_keys WHERE owner_id = ? AND session_id = ?").run(ownerId, id);
    }).immediate();
  }
}
