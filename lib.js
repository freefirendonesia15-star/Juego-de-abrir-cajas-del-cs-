const crypto = require('crypto');
const { LEVEL_TITLES, ACHIEVEMENTS } = require('./data/skins');

exports.newSeeds = () => {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  return { serverSeed, serverSeedHash };
};

exports.hashToFloat = (hash, salt = 0) => {
  const h = crypto.createHash('sha256').update(hash + ':' + salt).digest('hex');
  return parseInt(h.slice(0, 8), 16) / 0xFFFFFFFF;
};

exports.resolveFair = (serverSeed, clientSeed, nonce, casePools, skinsByRarity) => {
  const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex');
  const total = Object.values(casePools).reduce((a, b) => a + b, 0);
  const roll = exports.hashToFloat(hmac, 1) * total;
  let acc = 0, rarity = null;
  for (const [r, w] of Object.entries(casePools)) {
    acc += w;
    if (roll < acc) { rarity = r; break; }
  }
  if (!rarity) rarity = Object.keys(casePools).filter(k => casePools[k] > 0).pop();
  const pool = skinsByRarity[rarity]?.length ? skinsByRarity[rarity] : skinsByRarity.common;
  const pick = Math.floor(exports.hashToFloat(hmac, 2) * pool.length);
  return { skin: pool[pick], hash: hmac };
};

exports.xpForNextLevel = (level) => Math.floor(100 * Math.pow(1.35, level - 1));

exports.addXp = (db, userId, xp) => {
  const u = db.prepare('SELECT xp, level, coins FROM users WHERE id = ?').get(userId);
  let newXp = u.xp + xp, newLevel = u.level, levelUps = 0;
  while (newXp >= exports.xpForNextLevel(newLevel)) {
    newXp -= exports.xpForNextLevel(newLevel);
    newLevel++; levelUps++;
  }
  const bonusCoins = levelUps * 500;
  db.prepare('UPDATE users SET xp = ?, level = ?, coins = coins + ? WHERE id = ?')
    .run(newXp, newLevel, bonusCoins, userId);
  return { level: newLevel, levelUps, bonusCoins, xp: newXp };
};

exports.levelTitle = (level) => LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];

exports.unlockAchievement = (db, io, userId, key) => {
  const def = ACHIEVEMENTS.find(a => a.key === key);
  if (!def) return null;
  const exists = db.prepare('SELECT 1 FROM achievements WHERE user_id = ? AND key = ?').get(userId, key);
  if (exists) return null;
  db.prepare('INSERT INTO achievements (user_id, key) VALUES (?, ?)').run(userId, key);
  db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(def.reward, userId);
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  io.emit('achievement:unlocked', { username: u.username, achievement: def });
  return def;
};

exports.skinsByRarity = (skins) => {
  const m = {};
  for (const s of skins) (m[s.rarity] ||= []).push(s);
  return m;
};

exports.refCode = (username) => (
  username.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6) +
  Math.random().toString(36).slice(2, 5).toUpperCase()
);
