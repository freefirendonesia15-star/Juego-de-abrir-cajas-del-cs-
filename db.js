const Database = require('better-sqlite3');
const path = require('path');
const { SKINS } = require('./data/skins');

const db = new Database(path.join(__dirname, 'game.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 1000,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    last_daily INTEGER NOT NULL DEFAULT 0,
    daily_streak INTEGER NOT NULL DEFAULT 0,
    referral_code TEXT UNIQUE,
    referred_by INTEGER,
    total_opened INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS skins (
    id TEXT PRIMARY KEY,
    weapon TEXT NOT NULL, name TEXT NOT NULL, rarity TEXT NOT NULL,
    price INTEGER NOT NULL, icon TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, skin_id TEXT NOT NULL,
    listed_price INTEGER,
    obtained_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user INTEGER, to_user INTEGER, inventory_id INTEGER,
    price INTEGER, type TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS openings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, case_id TEXT NOT NULL, skin_id TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL, client_seed TEXT NOT NULL, nonce INTEGER NOT NULL,
    value INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT NOT NULL, max_players INTEGER NOT NULL, entry_fee INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    winner_id INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS battle_players (
    battle_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    slot INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0,
    skin_id TEXT, value INTEGER,
    PRIMARY KEY (battle_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS coinflips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount INTEGER NOT NULL,
    creator_id INTEGER NOT NULL, joiner_id INTEGER,
    creator_side TEXT NOT NULL, result_side TEXT,
    winner_id INTEGER, status TEXT NOT NULL DEFAULT 'waiting',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL, username TEXT NOT NULL,
    message TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS achievements (
    user_id INTEGER NOT NULL, key TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, key)
  );

  CREATE TABLE IF NOT EXISTS wishlist (
    user_id INTEGER NOT NULL, skin_id TEXT NOT NULL,
    PRIMARY KEY (user_id, skin_id)
  );

  CREATE TABLE IF NOT EXISTS weekly_stats (
    user_id INTEGER NOT NULL,
    week_key TEXT NOT NULL,
    best_drop_value INTEGER NOT NULL DEFAULT 0,
    best_drop_skin TEXT,
    battles_won INTEGER NOT NULL DEFAULT 0,
    cases_opened INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, week_key)
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    best_drop_winner INTEGER, best_drop_value INTEGER,
    battles_winner INTEGER, battles_count INTEGER,
    opens_winner INTEGER, opens_count INTEGER
  );

  CREATE TABLE IF NOT EXISTS daily_champions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    value INTEGER NOT NULL,
    day_key TEXT NOT NULL,
    awarded_at INTEGER NOT NULL
  );
`);

const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('battles_won')) {
  db.exec('ALTER TABLE users ADD COLUMN battles_won INTEGER NOT NULL DEFAULT 0');
}

const ins = db.prepare('INSERT OR REPLACE INTO skins (id,weapon,name,rarity,price,icon) VALUES (?,?,?,?,?,?)');
db.transaction(() => { for (const s of SKINS) ins.run(s.id, s.weapon, s.name, s.rarity, s.price, s.icon); })();

module.exports = db;
