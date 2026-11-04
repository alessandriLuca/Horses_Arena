// Piccolo strato sopra SQLite: lo stesso codice gira nel Durable Object e nei test (node:sqlite).

export interface Db {
  all<T = any>(sql: string, ...args: unknown[]): T[];
  one<T = any>(sql: string, ...args: unknown[]): T | null;
  run(sql: string, ...args: unknown[]): void;
}

/** Adattatore per lo storage SQL dei Durable Objects. */
export function doDb(sql: SqlStorage): Db {
  return {
    all(q, ...a) {
      return sql.exec(q, ...(a as any[])).toArray() as any[];
    },
    one(q, ...a) {
      const r = sql.exec(q, ...(a as any[])).toArray();
      return (r[0] as any) ?? null;
    },
    run(q, ...a) {
      sql.exec(q, ...(a as any[]));
    },
  };
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, token TEXT UNIQUE, recovery TEXT UNIQUE, name TEXT, stable TEXT,
    silks TEXT, money INTEGER, created INTEGER, last_seen INTEGER, data TEXT)`,
  `CREATE TABLE IF NOT EXISTS horses (
    id TEXT PRIMARY KEY, owner TEXT, data TEXT, price INTEGER, stud_fee INTEGER,
    bot INTEGER DEFAULT 0, market INTEGER DEFAULT 0, rating REAL DEFAULT 1000, updated INTEGER)`,
  `CREATE INDEX IF NOT EXISTS horses_owner ON horses(owner)`,
  `CREATE INDEX IF NOT EXISTS horses_market ON horses(market)`,
  `CREATE TABLE IF NOT EXISTS races (
    id TEXT PRIMARY KEY, kind TEXT, name TEXT, start_at INTEGER, status TEXT, venue TEXT,
    distance INTEGER, going TEXT, weather TEXT, hurdles INTEGER, class INTEGER, purse INTEGER,
    fee INTEGER, max INTEGER, ref TEXT, round INTEGER, big INTEGER, data TEXT, result TEXT,
    replay TEXT, duration REAL)`,
  `CREATE INDEX IF NOT EXISTS races_start ON races(start_at)`,
  `CREATE INDEX IF NOT EXISTS races_status ON races(status)`,
  `CREATE TABLE IF NOT EXISTS entries (race_id TEXT, horse_id TEXT, owner TEXT, created INTEGER, PRIMARY KEY (race_id, horse_id))`,
  `CREATE INDEX IF NOT EXISTS entries_horse ON entries(horse_id)`,
  `CREATE TABLE IF NOT EXISTS bets (id TEXT PRIMARY KEY, race_id TEXT, player TEXT, horse_id TEXT, amount INTEGER, payout INTEGER, created INTEGER)`,
  `CREATE INDEX IF NOT EXISTS bets_race ON bets(race_id)`,
  `CREATE TABLE IF NOT EXISTS league (season INTEGER, horse_id TEXT, owner TEXT, division INTEGER, points INTEGER DEFAULT 0,
    races INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, joined INTEGER, PRIMARY KEY (season, horse_id))`,
  `CREATE TABLE IF NOT EXISTS tournaments (id TEXT PRIMARY KEY, name TEXT, owner TEXT, code TEXT UNIQUE, private INTEGER,
    config TEXT, status TEXT, created INTEGER, next_at INTEGER, round INTEGER)`,
  `CREATE TABLE IF NOT EXISTS tmembers (tid TEXT, horse_id TEXT, owner TEXT, points INTEGER DEFAULT 0, races INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0, PRIMARY KEY (tid, horse_id))`,
  `CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, player TEXT, tpl TEXT, data TEXT, expires INTEGER, status TEXT, horse_id TEXT)`,
  `CREATE INDEX IF NOT EXISTS offers_player ON offers(player)`,
  `CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_at INTEGER, kind TEXT, ref TEXT)`,
  `CREATE INDEX IF NOT EXISTS jobs_run ON jobs(run_at)`,
  `CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT, ts INTEGER, kind TEXT, text TEXT, link TEXT, seen INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS notes_player ON notes(player, id)`,
  `CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, player TEXT, name TEXT, text TEXT)`,
  `CREATE TABLE IF NOT EXISTS crimes (id TEXT PRIMARY KEY, by_player TEXT, target_horse TEXT, target_owner TEXT, service TEXT,
    race_id TEXT, status TEXT, ts INTEGER, data TEXT)`,
  `CREATE INDEX IF NOT EXISTS crimes_race ON crimes(race_id)`,
  `CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, from_player TEXT, from_horse TEXT, to_player TEXT, to_horse TEXT,
    stake INTEGER, status TEXT, created INTEGER, race_id TEXT, data TEXT)`,
  `CREATE TABLE IF NOT EXISTS mail (id TEXT PRIMARY KEY, sender TEXT, recipient TEXT, ts INTEGER, subject TEXT, body TEXT,
    money INTEGER DEFAULT 0, horse_id TEXT, horse_name TEXT, request INTEGER DEFAULT 0, status TEXT, read INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS mail_rcpt ON mail(recipient, ts)`,
  `CREATE INDEX IF NOT EXISTS mail_sender ON mail(sender, ts)`,
  `CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT, ts INTEGER, amount INTEGER, reason TEXT)`,
  `CREATE INDEX IF NOT EXISTS ledger_player ON ledger(player, id)`,
];

export function migrate(db: Db) {
  for (const q of SCHEMA) db.run(q);
  // colonne aggiunte dopo
  for (const q of ["ALTER TABLE entries ADD COLUMN orders TEXT"]) {
    try { db.run(q); } catch { /* esiste già */ }
  }
}
