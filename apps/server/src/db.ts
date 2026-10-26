// SQLite（node:sqlite）の準備と小さな問い合わせヘルパー。SQL は必ずプレースホルダで値を渡す
import './quiet'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  icon_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'online',
  status_text TEXT NOT NULL DEFAULT '',
  decoration TEXT NOT NULL DEFAULT '{"color":"#ffffff","frame":"none"}',
  settings TEXT NOT NULL DEFAULT '{}',
  home_world_id TEXT,
  current_avatar_id TEXT,
  is_guest INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_name ON users(display_name);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS miauth_sessions (
  session TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  since INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, target_id)
);
CREATE INDEX IF NOT EXISTS favorites_target ON favorites(kind, target_id);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  from_id TEXT,
  message TEXT NOT NULL DEFAULT '',
  instance_id TEXT,
  world_name TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS recent_players (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  world_name TEXT NOT NULL,
  PRIMARY KEY (user_id, other_id)
);

CREATE TABLE IF NOT EXISTS avatars (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  thumbnail TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  allow_cloning INTEGER NOT NULL DEFAULT 0,
  license TEXT,
  extensions TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS avatars_owner ON avatars(owner_id);

CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'public',
  version INTEGER NOT NULL,
  manifest TEXT NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS worlds_author ON worlds(author_id);

CREATE TABLE IF NOT EXISTS world_versions (
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  manifest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, version)
);

CREATE TABLE IF NOT EXISTS world_tags (
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (world_id, tag)
);
CREATE INDEX IF NOT EXISTS world_tags_tag ON world_tags(tag);

CREATE TABLE IF NOT EXISTS world_visits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, world_id)
);

CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  access TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  persistent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS instance_invites (
  instance_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (instance_id, user_id, invited_by)
);

CREATE TABLE IF NOT EXISTS instance_files (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  description TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  locked INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS instance_files_iid ON instance_files(instance_id);

CREATE TABLE IF NOT EXISTS kv (
  world_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  size INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, owner, key)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  action TEXT,
  resolved_by TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
`

export type Row = Record<string, unknown>

export class Db {
  readonly raw: DatabaseSync
  private cache = new Map<string, ReturnType<DatabaseSync['prepare']>>()

  constructor(file: string) {
    this.raw = new DatabaseSync(file)
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.raw.exec(SCHEMA)
  }

  private stmt(sql: string) {
    let s = this.cache.get(sql)
    if (!s) {
      s = this.raw.prepare(sql)
      this.cache.set(sql, s)
    }
    return s
  }

  get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined
  }
  all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.stmt(sql).all(...params) as T[]
  }
  run(sql: string, ...params: SQLInputValue[]) {
    return this.stmt(sql).run(...params)
  }

  /** まとめて実行し、途中で失敗したら戻す */
  tx<T>(fn: () => T): T {
    this.raw.exec('BEGIN')
    try {
      const r = fn()
      this.raw.exec('COMMIT')
      return r
    } catch (e) {
      this.raw.exec('ROLLBACK')
      throw e
    }
  }

  close() {
    this.cache.clear()
    this.raw.close()
  }
}
