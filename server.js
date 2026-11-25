const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');

const db = require('./db');
const lib = require('./lib');
const { SKINS, CASES, ACHIEVEMENTS } = require('./data/skins');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const POOLS = lib.skinsByRarity(SKINS);

function getWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const wn = Math.ceil((((date - ys) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(wn).padStart(2, '0')}`;
}
function getWeekStart(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}
function getDayKey(d = new Date()) { return d.toISOString().slice(0, 10); }

function ensureWeeklyRow(userId, wk) {
  const exists = db.prepare('SELECT 1 FROM weekly_stats WHERE user_id = ? AND week_key = ?').get(userId, wk);
  if (!exists) db.prepare('INSERT INTO weekly_stats (user_id, week_key) VALUES (?, ?)').run(userId, wk);
}
function trackDrop(userId, skin) {
  const wk = getWeekKey();
  ensureWeeklyRow(userId, wk);
  const cur = db.prepare('SELECT best_drop_value FROM weekly_stats WHERE user_id = ? AND week_key = ?').get(userId, wk);
  if (skin.price > (cur?.best_drop_value || 0)) {
    db.prepare('UPDATE weekly_stats SET best_drop_value = ?, best_drop_skin = ? WHERE user_id = ? AND week_key = ?')
      .run(skin.price, skin.id, userId, wk);
  }
  db.prepare('UPDATE weekly_stats SET cases_opened = cases_opened + 1 WHERE user_id = ? AND week_key = ?')
    .run(userId, wk);
}
function trackBattleWin(userId) {
  const wk = getWeekKey();
  ensureWeeklyRow(userId, wk);
  db.prepare('UPDATE weekly_stats SET battles_won = battles_won + 1 WHERE user_id = ? AND week_key = ?').run(userId, wk);
  db.prepare('UPDATE users SET battles_won = battles_won + 1 WHERE id = ?').run(userId);
}

const pub = u => ({
  id: u.id, username: u.username, coins: u.coins, xp: u.xp, level: u.level,
  dailyStreak: u.daily_streak, referralCode: u.referral_code,
  totalOpened: u.total_opened, totalEarned: u.total_earned,
  battlesWon: u.battles_won || 0,
  levelTitle: lib.levelTitle(u.level), xpForNext: lib.xpForNextLevel(u.level)
});
const sign = u => jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: '30d' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'No autorizado' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

app.post('/api/register', (req, res) => {
  const { username, password, ref } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Usuario 3-20 caracteres' });
  if (password.length < 4) return res.status(400).json({ error: 'Contraseña 4+ caracteres' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username))
    return res.status(409).json({ error: 'Ese usuario ya existe' });

  let referredBy = null;
  if (ref) {
    const r = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(ref);
    if (r) referredBy = r.id;
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, referral_code, referred_by, coins)
    VALUES (?, ?, ?, ?, 1000)
  `).run(username, hash, lib.refCode(username), referredBy);

  if (referredBy) db.prepare('UPDATE users SET coins = coins + 500 WHERE id = ?').run(referredBy);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token: sign(user), user: pub(user) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || !bcrypt.compareSync(password || '', u.password_hash))
    return res.status(401).json({ error: 'Credenciales inválidas' });
  res.json({ token: sign(u), user: pub(u) });
});

app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const inventory = db.prepare(`
    SELECT i.id, i.listed_price, s.id AS skin_id, s.weapon, s.name, s.rarity, s.price, s.icon
    FROM inventory i JOIN skins s ON s.id = i.skin_id WHERE i.user_id = ?
    ORDER BY i.id DESC
  `).all(req.user.id);
  const achievements = db.prepare('SELECT key, unlocked_at FROM achievements WHERE user_id = ?').all(req.user.id);
  const wishlist = db.prepare('SELECT skin_id FROM wishlist WHERE user_id = ?').all(req.user.id).map(r => r.skin_id);
  res.json({ user: pub(user), inventory, achievements, wishlist });
});

app.get('/api/cases', (_req, res) => {
  const openings = db.prepare(`
    SELECT o.*, u.username, s.weapon, s.name AS skinName, s.rarity, s.icon
    FROM openings o
    JOIN users u ON u.id = o.user_id
    JOIN skins s ON s.id = o.skin_id
    ORDER BY o.id DESC LIMIT 20
  `).all();
  res.json({ cases: CASES, recentOpenings: openings });
});

app.get('/api/cases/:id/probabilities', (req, res) => {
  const c = CASES.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Caja no existe' });
  const byRarity = {};
  for (const [rarity, weight] of Object.entries(c.pools)) {
    const skins = POOLS[rarity] || [];
    byRarity[rarity] = {
      weight,
      skins: skins.map(s => ({ ...s, dropChance: (weight / skins.length).toFixed(4) + '%' }))
    };
  }
  res.json({ pools: byRarity });
});

app.post('/api/cases/:id/open', auth, (req, res) => {
  const c = CASES.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Caja no existe' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (u.coins < c.price) return res.status(400).json({ error: 'Monedas insuficientes' });

  const clientSeed = (req.body?.clientSeed || crypto.randomBytes(16).toString('hex')).slice(0, 64);
  const nonce = (u.total_opened || 0) + 1;
  const { serverSeed, serverSeedHash } = lib.newSeeds();
  const { skin, hash } = lib.resolveFair(serverSeed, clientSeed, nonce, c.pools, POOLS);

  const REEL = 60, WIN_INDEX = 54, reel = [];
  for (let i = 0; i < REEL; i++) reel.push(i === WIN_INDEX ? skin : randomSkin(c));

  db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ?, total_opened = total_opened + 1 WHERE id = ?')
      .run(c.price, req.user.id);
    db.prepare('INSERT INTO inventory (user_id, skin_id) VALUES (?, ?)').run(req.user.id, skin.id);
    db.prepare(`INSERT INTO openings
      (user_id, case_id, skin_id, server_seed_hash, client_seed, nonce, value)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(req.user.id, c.id, skin.id, serverSeedHash, clientSeed, nonce, skin.price);
  })();

  const levelInfo = lib.addXp(db, req.user.id, Math.max(5, Math.floor(c.price / 10)));
  if (u.total_opened === 0) lib.unlockAchievement(db, io, req.user.id, 'first_open');
  if (u.total_opened + 1 === 10) lib.unlockAchievement(db, io, req.user.id, 'ten_opens');
  if (u.total_opened + 1 === 50) lib.unlockAchievement(db, io, req.user.id, 'fifty_opens');
  if (skin.rarity === 'mythic') lib.unlockAchievement(db, io, req.user.id, 'mythic_drop');
  if (skin.rarity === 'legendary') lib.unlockAchievement(db, io, req.user.id, 'legendary_drop');
  if (levelInfo.level >= 5) lib.unlockAchievement(db, io, req.user.id, 'level_5');
  if (levelInfo.level >= 10) lib.unlockAchievement(db, io, req.user.id, 'level_10');

  trackDrop(req.user.id, skin);

  const balance = db.prepare('SELECT coins FROM users WHERE id = ?').get(req.user.id).coins;
  io.emit('feed:drop', { username: u.username, skin, caseName: c.name, value: skin.price, ts: Date.now() });

  res.json({
    won: skin, reel, winIndex: WIN_INDEX, balance,
    provably: { serverSeedHash, clientSeed, nonce, hash },
    levelInfo
  });
});

app.post('/api/cases/verify', (req, res) => {
  const { serverSeed, clientSeed, nonce, caseId } = req.body || {};
  const c = CASES.find(x => x.id === caseId);
  if (!c) return res.status(404).json({ error: 'Caja no existe' });
  const { skin, hash } = lib.resolveFair(serverSeed, clientSeed, Number(nonce), c.pools, POOLS);
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  res.json({ skin, hash, serverSeedHash });
});

function randomSkin(c) {
  const total = Object.values(c.pools).reduce((a,b)=>a+b,0);
  const roll = Math.random() * total;
  let acc = 0, rarity = null;
  for (const [r, w] of Object.entries(c.pools)) { acc += w; if (roll < acc) { rarity = r; break; } }
  if (!rarity) rarity = Object.keys(c.pools).filter(k=>c.pools[k]>0).pop();
  const pool = POOLS[rarity] || POOLS.common;
  return pool[Math.floor(Math.random() * pool.length)];
}

app.post('/api/daily', auth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const elapsed = now - u.last_daily;
  if (elapsed < day) return res.status(400).json({ error: 'Ya reclamaste hoy', nextIn: day - elapsed });

  const streak = elapsed > day * 2 ? 1 : (u.daily_streak || 0) + 1;
  const reward = 200 + streak * 50;
  db.prepare('UPDATE users SET coins = coins + ?, last_daily = ?, daily_streak = ? WHERE id = ?')
    .run(reward, now, streak, u.id);
  if (streak >= 7) lib.unlockAchievement(db, io, u.id, 'streak_7');
  res.json({ reward, streak, balance: u.coins + reward });
});

app.post('/api/inventory/sell', auth, (req, res) => {
  const { inventoryId } = req.body || {};
  const inv = db.prepare(`SELECT i.*, s.price FROM inventory i JOIN skins s ON s.id = i.skin_id
    WHERE i.id = ? AND i.user_id = ?`).get(inventoryId, req.user.id);
  if (!inv) return res.status(404).json({ error: 'Item no encontrado' });
  if (inv.listed_price) return res.status(400).json({ error: 'Retíralo del mercado primero' });

  const value = Math.floor(inv.price * 0.6);
  db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(value, req.user.id);
    db.prepare('DELETE FROM inventory WHERE id = ?').run(inv.id);
  })();
  res.json({ ok: true, value, balance: db.prepare('SELECT coins FROM users WHERE id=?').get(req.user.id).coins });
});

app.get('/api/market', (_req, res) => {
  const listings = db.prepare(`
    SELECT i.id AS listingId, i.listed_price AS price, i.user_id AS sellerId,
           u.username AS seller, s.id AS skin_id, s.weapon, s.name, s.rarity, s.price AS basePrice, s.icon
    FROM inventory i JOIN skins s ON s.id = i.skin_id JOIN users u ON u.id = i.user_id
    WHERE i.listed_price IS NOT NULL ORDER BY i.listed_price ASC
  `).all();
  res.json({ listings });
});

app.post('/api/market/list', auth, (req, res) => {
  const { inventoryId, price } = req.body || {};
  const inv = db.prepare('SELECT * FROM inventory WHERE id = ? AND user_id = ?').get(inventoryId, req.user.id);
  if (!inv) return res.status(404).json({ error: 'Item no encontrado' });
  if (inv.listed_price) return res.status(400).json({ error: 'Ya está en venta' });
  const p = Math.floor(Number(price));
  if (!Number.isFinite(p) || p <= 0) return res.status(400).json({ error: 'Precio inválido' });
  db.prepare('UPDATE inventory SET listed_price = ? WHERE id = ?').run(p, inventoryId);
  io.emit('market:update');
  res.json({ ok: true });
});

app.post('/api/market/unlist', auth, (req, res) => {
  const { inventoryId } = req.body || {};
  const inv = db.prepare('SELECT * FROM inventory WHERE id = ? AND user_id = ?').get(inventoryId, req.user.id);
  if (!inv || !inv.listed_price) return res.status(400).json({ error: 'No está en venta' });
  db.prepare('UPDATE inventory SET listed_price = NULL WHERE id = ?').run(inventoryId);
  io.emit('market:update');
  res.json({ ok: true });
});

app.post('/api/market/buy', auth, (req, res) => {
  const { listingId } = req.body || {};
  const lst = db.prepare('SELECT * FROM inventory WHERE id = ? AND listed_price IS NOT NULL').get(listingId);
  if (!lst) return res.status(404).json({ error: 'Listing no encontrado' });
  if (lst.user_id === req.user.id) return res.status(400).json({ error: 'No puedes comprar tu propio item' });
  const buyer = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (buyer.coins < lst.listed_price) return res.status(400).json({ error: 'Monedas insuficientes' });
  db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(lst.listed_price, req.user.id);
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(lst.listed_price, lst.user_id);
    db.prepare('UPDATE inventory SET user_id = ?, listed_price = NULL WHERE id = ?').run(req.user.id, lst.id);
  })();
  lib.unlockAchievement(db, io, lst.user_id, 'first_sale');
  io.emit('market:update');
  res.json({ ok: true });
});

app.get('/api/battles', (_req, res) => {
  const rows = db.prepare(`SELECT * FROM battles WHERE status IN ('waiting','ready') ORDER BY id DESC LIMIT 20`).all();
  const result = rows.map(b => {
    const players = db.prepare(`
      SELECT bp.*, u.username FROM battle_players bp JOIN users u ON u.id = bp.user_id
      WHERE bp.battle_id = ?`).all(b.id);
    const caseDef = CASES.find(c => c.id === b.case_id);
    return { ...b, caseDef, players };
  });
  res.json({ battles: result });
});

app.post('/api/battles', auth, (req, res) => {
  const { caseId, maxPlayers, entryFee } = req.body || {};
  const c = CASES.find(x => x.id === caseId);
  if (!c) return res.status(400).json({ error: 'Caja inválida' });
  const mp = Number(maxPlayers);
  if (![2, 3, 4].includes(mp)) return res.status(400).json({ error: 'Jugadores: 2, 3 o 4' });
  const fee = Math.max(0, Math.floor(Number(entryFee) || c.price));

  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (u.coins < fee) return res.status(400).json({ error: 'Monedas insuficientes' });

  let battleId;
  db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(fee, req.user.id);
    const info = db.prepare('INSERT INTO battles (case_id, max_players, entry_fee) VALUES (?, ?, ?)').run(c.id, mp, fee);
    battleId = info.lastInsertRowid;
    db.prepare('INSERT INTO battle_players (battle_id, user_id, slot) VALUES (?, ?, 0)').run(battleId, req.user.id);
  })();

  io.emit('battles:update');
  res.json({ ok: true, battleId });
});

app.post('/api/battles/:id/join', auth, (req, res) => {
  const battleId = Number(req.params.id);
  const b = db.prepare('SELECT * FROM battles WHERE id = ?').get(battleId);
  if (!b || b.status !== 'waiting') return res.status(400).json({ error: 'Batalla no disponible' });
  const players = db.prepare('SELECT * FROM battle_players WHERE battle_id = ?').all(battleId);
  if (players.length >= b.max_players) return res.status(400).json({ error: 'Batalla llena' });
  if (players.some(p => p.user_id === req.user.id)) return res.status(400).json({ error: 'Ya estás dentro' });

  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (u.coins < b.entry_fee) return res.status(400).json({ error: 'Monedas insuficientes' });

  db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(b.entry_fee, req.user.id);
    db.prepare('INSERT INTO battle_players (battle_id, user_id, slot) VALUES (?, ?, ?)')
      .run(battleId, req.user.id, players.length);
  })();

  io.emit('battles:update');
  io.to(`battle:${battleId}`).emit('battle:joined');
  res.json({ ok: true });
});

app.post('/api/battles/:id/ready', auth, (req, res) => {
  const battleId = Number(req.params.id);
  const b = db.prepare('SELECT * FROM battles WHERE id = ?').get(battleId);
  if (!b || b.status !== 'waiting') return res.status(400).json({ error: 'No disponible' });
  const p = db.prepare('SELECT * FROM battle_players WHERE battle_id = ? AND user_id = ?').get(battleId, req.user.id);
  if (!p) return res.status(400).json({ error: 'No estás en la batalla' });
  db.prepare('UPDATE battle_players SET ready = 1 WHERE battle_id = ? AND user_id = ?').run(battleId, req.user.id);
  io.emit('battles:update');
  io.to(`battle:${battleId}`).emit('battle:ready');
  tryStartBattle(battleId);
  res.json({ ok: true });
});

function tryStartBattle(battleId) {
  const b = db.prepare('SELECT * FROM battles WHERE id = ?').get(battleId);
  if (!b || b.status !== 'waiting') return;
  const players = db.prepare('SELECT * FROM battle_players WHERE battle_id = ?').all(battleId);
  if (players.length !== b.max_players || !players.every(p => p.ready)) return;

  db.prepare('UPDATE battles SET status = "spinning" WHERE id = ?').run(battleId);
  const c = CASES.find(x => x.id === b.case_id);

  const results = players.map(p => {
    const clientSeed = crypto.randomBytes(16).toString('hex');
    const nonce = 1;
    const { serverSeed, serverSeedHash } = lib.newSeeds();
    const { skin, hash } = lib.resolveFair(serverSeed, clientSeed, nonce, c.pools, POOLS);
    db.prepare('UPDATE battle_players SET skin_id = ?, value = ? WHERE battle_id = ? AND user_id = ?')
      .run(skin.id, skin.price, battleId, p.user_id);
    db.prepare(`INSERT INTO openings (user_id, case_id, skin_id, server_seed_hash, client_seed, nonce, value)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(p.user_id, c.id, skin.id, serverSeedHash, clientSeed, nonce, skin.price);
    return { userId: p.user_id, username: db.prepare('SELECT username FROM users WHERE id = ?').get(p.user_id).username, skin };
  });

  const winner = results.reduce((a, b) => a.skin.price > b.skin.price ? a : b);
  const totalValue = results.reduce((a, b) => a + b.skin.price, 0);

  db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(totalValue, winner.userId);
    db.prepare('UPDATE battles SET status = "done", winner_id = ? WHERE id = ?').run(winner.userId, battleId);
  })();
  lib.unlockAchievement(db, io, winner.userId, 'first_battle');
  trackBattleWin(winner.userId);

  io.to(`battle:${battleId}`).emit('battle:result', { results, winner, totalValue });
  io.emit('feed:battle', { winner: winner.username, totalValue, players: results.length });
  io.emit('battles:update');
}

app.get('/api/coinflips', (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u1.username AS creatorName, u2.username AS joinerName
    FROM coinflips c
    JOIN users u1 ON u1.id = c.creator_id
    LEFT JOIN users u2 ON u2.id = c.joiner_id
    ORDER BY c.id DESC LIMIT 20
  `).all();
  res.json({ coinflips: rows });
});

app.post('/api/coinflips', auth, (req, res) => {
  const { amount, side } = req.body || {};
  const amt = Math.floor(Number(amount));
  if (!amt || amt < 10) return res.status(400).json({ error: 'Apuesta mínima 10' });
  if (!['ct', 't'].includes(side)) return res.status(400).json({ error: 'Lado inválido' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (u.coins < amt) return res.status(400).json({ error: 'Monedas insuficientes' });

  db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(amt, req.user.id);
    db.prepare('INSERT INTO coinflips (amount, creator_id, creator_side) VALUES (?, ?, ?)')
      .run(amt, req.user.id, side);
  })();
  io.emit('coinflip:update');
  res.json({ ok: true });
});

app.post('/api/coinflips/:id/join', auth, (req, res) => {
  const id = Number(req.params.id);
  const cf = db.prepare('SELECT * FROM coinflips WHERE id = ? AND status = "waiting"').get(id);
  if (!cf) return res.status(400).json({ error: 'No disponible' });
  if (cf.creator_id === req.user.id) return res.status(400).json({ error: 'No puedes unirte a tu propio flip' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (u.coins < cf.amount) return res.status(400).json({ error: 'Monedas insuficientes' });

  const resultSide = Math.random() < 0.5 ? 'ct' : 't';
  const winnerId = cf.creator_side === resultSide ? cf.creator_id : req.user.id;
  const winnerName = db.prepare('SELECT username FROM users WHERE id = ?').get(winnerId).username;

  db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(cf.amount, req.user.id);
    db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(cf.amount * 2, winnerId);
    db.prepare(`UPDATE coinflips SET joiner_id = ?, result_side = ?, winner_id = ?, status = "done" WHERE id = ?`)
      .run(req.user.id, resultSide, winnerId, id);
  })();

  lib.unlockAchievement(db, io, winnerId, 'first_coinflip');
  io.emit('coinflip:resolved', { id, resultSide, winnerId, winnerName, amount: cf.amount });
  io.emit('coinflip:update');
  io.emit('feed:coinflip', { winner: winnerName, amount: cf.amount * 2 });
  res.json({ ok: true, resultSide, winnerId });
});

app.post('/api/contract', auth, (req, res) => {
  const { inventoryIds } = req.body || {};
  if (!Array.isArray(inventoryIds) || inventoryIds.length < 3 || inventoryIds.length > 5)
    return res.status(400).json({ error: 'Necesitas 3 a 5 skins' });

  const items = [];
  for (const id of inventoryIds) {
    const it = db.prepare(`SELECT i.*, s.*, i.id as invId FROM inventory i JOIN skins s ON s.id = i.skin_id
      WHERE i.id = ? AND i.user_id = ? AND i.listed_price IS NULL`).get(id, req.user.id);
    if (!it) return res.status(400).json({ error: 'Item inválido' });
    items.push(it);
  }
  const totalValue = items.reduce((a, b) => a + b.price, 0);
  const chance = 0.25 + (items.length - 3) * 0.1;
  const won = Math.random() < chance;

  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const bestRarity = items.reduce((a, b) => rarities.indexOf(b.rarity) > rarities.indexOf(a.rarity) ? b : a).rarity;
  const nextRarity = rarities[Math.min(rarities.indexOf(bestRarity) + 1, rarities.length - 1)];

  let resultSkin;
  if (won) {
    const pool = POOLS[nextRarity] || POOLS.epic;
    resultSkin = pool[Math.floor(Math.random() * pool.length)];
  } else {
    const pool = POOLS[bestRarity] || POOLS.rare;
    resultSkin = pool[Math.floor(Math.random() * pool.length)];
  }

  db.transaction(() => {
    for (const it of items) db.prepare('DELETE FROM inventory WHERE id = ?').run(it.invId);
    db.prepare('INSERT INTO inventory (user_id, skin_id) VALUES (?, ?)').run(req.user.id, resultSkin.id);
  })();

  const profited = rarities.indexOf(resultSkin.rarity) > rarities.indexOf(bestRarity);
  io.emit('feed:contract', { username: req.user.username, inputValue: totalValue, skin: resultSkin, profited });

  res.json({ won: profited, resultSkin, inputValue: totalValue, outputValue: resultSkin.price, chance });
});

app.get('/api/chat', (_req, res) => {
  const msgs = db.prepare('SELECT * FROM chat_messages ORDER BY id DESC LIMIT 50').all().reverse();
  res.json({ messages: msgs });
});

app.post('/api/chat', auth, (req, res) => {
  const { message } = req.body || {};
  if (!message || message.length > 200) return res.status(400).json({ error: 'Mensaje inválido' });
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  const info = db.prepare('INSERT INTO chat_messages (user_id, username, message) VALUES (?, ?, ?)')
    .run(req.user.id, u.username, message);
  const msg = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(info.lastInsertRowid);
  io.emit('chat:message', msg);
  res.json({ ok: true });
});

app.get('/api/leaderboard', (_req, res) => {
  const richest = db.prepare('SELECT username, coins, level FROM users ORDER BY coins DESC LIMIT 10').all();
  const topLevel = db.prepare('SELECT username, level, xp FROM users ORDER BY level DESC, xp DESC LIMIT 10').all();
  const topOpeners = db.prepare('SELECT username, total_opened FROM users ORDER BY total_opened DESC LIMIT 10').all();
  const biggestDrops = db.prepare(`
    SELECT u.username, s.weapon, s.name, s.rarity, s.icon, o.value
    FROM openings o JOIN users u ON u.id = o.user_id JOIN skins s ON s.id = o.skin_id
    ORDER BY o.value DESC LIMIT 10
  `).all();
  res.json({ richest, topLevel, topOpeners, biggestDrops });
});

app.get('/api/users/:username', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!u) return res.status(404).json({ error: 'Usuario no existe' });
  const achievements = db.prepare('SELECT key, unlocked_at FROM achievements WHERE user_id = ?').all(u.id);
  const stats = db.prepare('SELECT COUNT(*) as total, SUM(price) as value FROM inventory WHERE user_id = ?').get(u.id);
  res.json({
    user: { username: u.username, level: u.level, levelTitle: lib.levelTitle(u.level),
      totalOpened: u.total_opened, referralCode: u.referral_code, createdAt: u.created_at,
      battlesWon: u.battles_won || 0 },
    achievements,
    stats: { totalItems: stats.total || 0, totalValue: stats.value || 0 }
  });
});

app.post('/api/wishlist/toggle', auth, (req, res) => {
  const { skinId } = req.body || {};
  if (!SKINS.find(s => s.id === skinId)) return res.status(400).json({ error: 'Skin inválida' });
  const exists = db.prepare('SELECT 1 FROM wishlist WHERE user_id = ? AND skin_id = ?').get(req.user.id, skinId);
  if (exists) db.prepare('DELETE FROM wishlist WHERE user_id = ? AND skin_id = ?').run(req.user.id, skinId);
  else db.prepare('INSERT INTO wishlist (user_id, skin_id) VALUES (?, ?)').run(req.user.id, skinId);
  res.json({ ok: true, added: !exists });
});

app.get('/api/achievements', auth, (req, res) => {
  const unlocked = db.prepare('SELECT key FROM achievements WHERE user_id = ?').all(req.user.id).map(a => a.key);
  res.json({ all: ACHIEVEMENTS, unlocked });
});

app.get('/api/tournament/current', (_req, res) => {
  const wk = getWeekKey();
  const active = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();

  const bestDrop = db.prepare(`
    SELECT ws.*, u.username, s.weapon, s.name AS skinName, s.rarity, s.icon
    FROM weekly_stats ws
    JOIN users u ON u.id = ws.user_id
    LEFT JOIN skins s ON s.id = ws.best_drop_skin
    WHERE ws.week_key = ? AND ws.best_drop_value > 0
    ORDER BY ws.best_drop_value DESC LIMIT 10
  `).all(wk);

  const topBattles = db.prepare(`
    SELECT ws.*, u.username FROM weekly_stats ws
    JOIN users u ON u.id = ws.user_id
    WHERE ws.week_key = ? AND ws.battles_won > 0
    ORDER BY ws.battles_won DESC LIMIT 10
  `).all(wk);

  const topOpens = db.prepare(`
    SELECT ws.*, u.username FROM weekly_stats ws
    JOIN users u ON u.id = ws.user_id
    WHERE ws.week_key = ? AND ws.cases_opened > 0
    ORDER BY ws.cases_opened DESC LIMIT 10
  `).all(wk);

  const dailyChamps = db.prepare(`
    SELECT dc.*, u.username FROM daily_champions dc
    JOIN users u ON u.id = dc.user_id
    ORDER BY dc.id DESC LIMIT 20
  `).all();

  const past = db.prepare(`
    SELECT t.*,
      u1.username AS bestDropName, u2.username AS battlesName, u3.username AS opensName
    FROM tournaments t
    LEFT JOIN users u1 ON u1.id = t.best_drop_winner
    LEFT JOIN users u2 ON u2.id = t.battles_winner
    LEFT JOIN users u3 ON u3.id = t.opens_winner
    WHERE t.status = 'closed'
    ORDER BY t.ended_at DESC LIMIT 5
  `).all();

  const weekStart = active?.started_at || getWeekStart();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

  res.json({
    weekKey: wk, weekStart, weekEnd,
    timeLeft: Math.max(0, weekEnd - Date.now()),
    leaders: { bestDrop, topBattles, topOpens },
    dailyChamps, past,
    prizes: { best_drop: 5000, battles: 3000, opens: 2000, daily: 10 }
  });
});

io.on('connection', (socket) => {
  socket.on('join:battle', (id) => socket.join(`battle:${id}`));
});

function closeTournament(weekKey) {
  const bestDrop = db.prepare(`
    SELECT * FROM weekly_stats WHERE week_key = ? AND best_drop_value > 0
    ORDER BY best_drop_value DESC LIMIT 1
  `).get(weekKey);
  const battles = db.prepare(`
    SELECT * FROM weekly_stats WHERE week_key = ? AND battles_won > 0
    ORDER BY battles_won DESC LIMIT 1
  `).get(weekKey);
  const opens = db.prepare(`
    SELECT * FROM weekly_stats WHERE week_key = ? AND cases_opened > 0
    ORDER BY cases_opened DESC LIMIT 1
  `).get(weekKey);

  const PRIZES = { best_drop: 5000, battles: 3000, opens: 2000 };

  if (bestDrop) db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(PRIZES.best_drop, bestDrop.user_id);
  if (battles) db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(PRIZES.battles, battles.user_id);
  if (opens) db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(PRIZES.opens, opens.user_id);

  db.prepare(`
    UPDATE tournaments SET status = 'closed', ended_at = ?,
      best_drop_winner = ?, best_drop_value = ?,
      battles_winner = ?, battles_count = ?,
      opens_winner = ?, opens_count = ?
    WHERE week_key = ?
  `).run(
    Date.now(),
    bestDrop?.user_id || null, bestDrop?.best_drop_value || null,
    battles?.user_id || null, battles?.battles_won || null,
    opens?.user_id || null, opens?.cases_opened || null,
    weekKey
  );

  const winners = {};
  const uname = id => db.prepare('SELECT username FROM users WHERE id = ?').get(id).username;
  if (bestDrop) winners.best_drop = { userId: bestDrop.user_id, username: uname(bestDrop.user_id), value: bestDrop.best_drop_value, prize: PRIZES.best_drop };
  if (battles) winners.battles = { userId: battles.user_id, username: uname(battles.user_id), value: battles.battles_won, prize: PRIZES.battles };
  if (opens) winners.opens = { userId: opens.user_id, username: uname(opens.user_id), value: opens.cases_opened, prize: PRIZES.opens };

  io.emit('tournament:closed', { weekKey, winners });
}

async function checkWeeklyTournament() {
  const wk = getWeekKey();
  const active = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
  if (!active) {
    db.prepare("INSERT INTO tournaments (week_key, started_at, status) VALUES (?, ?, 'active')").run(wk, getWeekStart());
    return;
  }
  if (active.week_key !== wk) {
    closeTournament(active.week_key);
    db.prepare("INSERT INTO tournaments (week_key, started_at, status) VALUES (?, ?, 'active')").run(wk, getWeekStart());
    io.emit('tournament:new', { weekKey: wk });
  }
}

async function checkDailyChampions() {
  const today = getDayKey();
  const wk = getWeekKey();
  const categories = [
    { cat: 'best_skin', sql: "SELECT * FROM weekly_stats WHERE week_key = ? AND best_drop_value > 0 ORDER BY best_drop_value DESC LIMIT 1", field: 'best_drop_value' },
    { cat: 'battles',   sql: "SELECT * FROM weekly_stats WHERE week_key = ? AND battles_won > 0 ORDER BY battles_won DESC LIMIT 1",     field: 'battles_won' }
  ];
  for (const { cat, sql, field } of categories) {
    const last = db.prepare("SELECT day_key FROM daily_champions WHERE category = ? ORDER BY id DESC LIMIT 1").get(cat);
    if (last?.day_key === today) continue;
    const leader = db.prepare(sql).get(wk);
    if (!leader) continue;
    db.prepare('UPDATE users SET coins = coins + 10 WHERE id = ?').run(leader.user_id);
    db.prepare('INSERT INTO daily_champions (category, user_id, value, day_key, awarded_at) VALUES (?, ?, ?, ?, ?)')
      .run(cat, leader.user_id, leader[field], today, Date.now());
    const u = db.prepare('SELECT username FROM users WHERE id = ?').get(leader.user_id);
    io.emit('champion:awarded', { category: cat, username: u.username, value: leader[field], coins: 10 });
  }
}

async function runScheduler() {
  try {
    await checkWeeklyTournament();
    await checkDailyChampions();
  } catch (e) { console.error('[scheduler]', e); }
}

setInterval(runScheduler, 5 * 60 * 1000);
setTimeout(runScheduler, 1500);

server.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`));
