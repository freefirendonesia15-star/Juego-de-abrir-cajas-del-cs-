const socket = io();
let token = localStorage.getItem('token') || null;
const state = {
  user: null, inventory: [], cases: [], market: [], battles: [], coinflips: [],
  chat: [], leaderboard: null, achievements: null, recentOpenings: [], wishlist: [],
  tab: 'cases'
};

const app = document.getElementById('app');
const overlay = document.getElementById('openOverlay');
const reelEl = document.getElementById('reel');
const resultEl = document.getElementById('openResult');

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api' + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { Sound.error(); throw new Error(data.error || 'Error'); }
  return data;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 300); }, 3200);
}

function confetti(rarity) {
  if (!['epic', 'legendary', 'mythic'].includes(rarity)) return;
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = { epic: ['#8847ff', '#b28cff'], legendary: ['#d32ce6', '#ff8df0'], mythic: ['#eb4b4b', '#ff8080', '#ffd700'] };
  const palette = colors[rarity];
  const parts = Array.from({ length: 120 }, () => ({
    x: canvas.width / 2, y: canvas.height / 2,
    vx: (Math.random() - 0.5) * 20, vy: Math.random() * -15 - 5,
    life: 100, color: palette[Math.floor(Math.random() * palette.length)],
    size: 4 + Math.random() * 6
  }));
  let frames = 0;
  const loop = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.life--;
      if (p.life > 0) { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
    }
    if (frames++ < 120) requestAnimationFrame(loop);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  loop();
}

function renderAuth() {
  app.innerHTML = `
    <div class="auth-wrap"><div class="auth-card">
      <h1>🎮 Case Sim</h1>
      <p>Simulador gratuito · sin dinero real · skins ficticias</p>
      <input id="u" placeholder="Usuario" autocomplete="username" />
      <input id="p" type="password" placeholder="Contraseña" autocomplete="current-password" />
      <input id="ref" placeholder="Código de referido (opcional)" />
      <button class="btn" style="width:100%" id="doLogin">Iniciar sesión</button>
      <button class="btn ghost" style="width:100%;margin-top:8px" id="doRegister">Crear cuenta (+1000 🪙)</button>
      <p id="authMsg" style="color:var(--danger);margin-top:12px;font-size:13px"></p>
    </div></div>`;
  const handle = async (kind) => {
    const username = document.getElementById('u').value.trim();
    const password = document.getElementById('p').value;
    const ref = document.getElementById('ref').value.trim();
    try {
      const body = { username, password };
      if (ref) body.ref = ref;
      const data = await api('/' + kind, { method: 'POST', body: JSON.stringify(body) });
      token = data.token; localStorage.setItem('token', token);
      state.user = data.user; await boot();
    } catch (e) { document.getElementById('authMsg').textContent = e.message; }
  };
  document.getElementById('doLogin').onclick = () => handle('login');
  document.getElementById('doRegister').onclick = () => handle('register');
}

async function boot() {
  try {
    const me = await api('/me');
    state.user = me.user; state.inventory = me.inventory;
    state.wishlist = me.wishlist || [];
  } catch { token = null; localStorage.removeItem('token'); return renderAuth(); }
  await Promise.all([loadCases(), loadMarket(), loadBattles(), loadCoinflips(), loadChat()]);
  render();
}

async function loadCases() { const d = await api('/cases'); state.cases = d.cases; state.recentOpenings = d.recentOpenings; }
async function loadMarket() { const d = await api('/market'); state.market = d.listings; }
async function loadBattles() { const d = await api('/battles'); state.battles = d.battles; }
async function loadCoinflips() { const d = await api('/coinflips'); state.coinflips = d.coinflips; }
async function loadChat() { const d = await api('/chat'); state.chat = d.messages; }
async function loadLeaderboard() { state.leaderboard = await api('/leaderboard'); }
async function loadAchievements() { state.achievements = await api('/achievements'); }

function render() {
  if (!state.user) return renderAuth();
  const xpPct = Math.min(100, Math.floor((state.user.xp / state.user.xpForNext) * 100));
  app.innerHTML = `
    <header>
      <div class="brand">🎮 Case <span>Sim</span></div>
      <div class="stats">
        <div class="level-badge">Lv ${state.user.level} · ${state.user.levelTitle}</div>
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${xpPct}%"></div></div>
        <div class="coins">🪙 <span id="coinsEl">${state.user.coins}</span></div>
        <button class="btn ghost small" id="logout">Salir</button>
      </div>
    </header>
    <div class="tabs">
      ${[
        ['cases','📦 Cajas'],['battles','⚔️ Batallas'],['coinflip','🪙 Coinflip'],
        ['inventory','🎒 Inventario'],['market','🛒 Mercado'],['contract','⚗️ Contratos'],
        ['leaderboard','🏆 Ranking'],['achievements','🎖️ Logros'],
        ['tournament','🏆 Torneo'],['profile','👤 Perfil']
      ].map(([k, l]) => `<div class="tab ${state.tab===k?'active':''}" data-tab="${k}">${l}</div>`).join('')}
      <button class="btn small ghost" id="dailyBtn" style="margin-left:auto">🎁 Diario${state.user.dailyStreak?` (🔥${state.user.dailyStreak})`:''}</button>
    </div>
    <div class="main-layout">
      <div id="tabContent"></div>
      <aside class="sidebar">
        <div class="feed-panel"><h4>📡 En vivo</h4><div class="feed-scroll" id="feedScroll"></div></div>
        <div class="chat-panel"><h4>💬 Chat global</h4><div class="chat-scroll" id="chatScroll"></div>
          <form class="chat-input" id="chatForm"><input id="chatInput" maxlength="200" placeholder="Escribí algo..." /><button class="btn small">→</button></form>
        </div>
      </aside>
    </div>`;

  document.querySelectorAll('.tab').forEach(el => el.onclick = () => { state.tab = el.dataset.tab; render(); });
  document.getElementById('logout').onclick = () => { token=null; localStorage.removeItem('token'); state.user=null; renderAuth(); };
  document.getElementById('dailyBtn').onclick = async () => {
    try {
      const r = await api('/daily', { method: 'POST' });
      state.user.coins = r.balance; state.user.dailyStreak = r.streak;
      document.getElementById('coinsEl').textContent = r.balance;
      Sound.coin();
      toast(`🎁 +${r.reward} monedas · Racha 🔥${r.streak}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
  document.getElementById('chatForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const inp = document.getElementById('chatInput');
    if (!inp.value.trim()) return;
    try { await api('/chat', { method: 'POST', body: JSON.stringify({ message: inp.value.trim() }) }); inp.value = ''; }
    catch (e) { toast(e.message, 'error'); }
  };

  renderFeed();
  renderChat();

  const t = state.tab;
  if (t === 'cases') renderCases();
  else if (t === 'battles') renderBattles();
  else if (t === 'coinflip') renderCoinflip();
  else if (t === 'inventory') renderInventory();
  else if (t === 'market') renderMarket();
  else if (t === 'contract') renderContract();
  else if (t === 'leaderboard') renderLeaderboard();
  else if (t === 'achievements') renderAchievements();
  else if (t === 'tournament') renderTournament();
  else if (t === 'profile') renderProfile();
}

function updateCoins() { const el = document.getElementById('coinsEl'); if (el && state.user) el.textContent = state.user.coins; }

function renderFeed() {
  const el = document.getElementById('feedScroll');
  if (!el) return;
  const items = state.recentOpenings.slice(0, 15);
  el.innerHTML = items.map(o => `
    <div class="feed-item rarity-${o.rarity}">
      <span>${o.icon}</span>
      <span><span class="u">${o.username}</span> sacó ${o.weapon}</span>
      <span class="v">🪙${o.value}</span>
    </div>
  `).join('') || '<div class="empty" style="padding:20px">Sin actividad aún</div>';
}

function renderChat() {
  const el = document.getElementById('chatScroll');
  if (!el) return;
  el.innerHTML = state.chat.slice(-40).map(m => `
    <div class="chat-msg"><span class="u">${escapeHtml(m.username)}:</span> ${escapeHtml(m.message)}</div>
  `).join('');
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function renderCases() {
  const el = document.getElementById('tabContent');
  el.innerHTML = `<div class="cases-grid">
    ${state.cases.map(c => `
      <div class="case-card">
        <div class="case-icon">${c.icon}</div>
        <h3>${c.name}</h3>
        <p>${c.desc}</p>
        <div class="price">🪙 ${c.price}</div>
        <button class="btn" style="width:100%;margin-bottom:6px" data-open="${c.id}">Abrir</button>
        <button class="btn ghost small" style="width:100%" data-probs="${c.id}">Ver probabilidades</button>
      </div>
    `).join('')}
  </div>`;

  el.querySelectorAll('[data-open]').forEach(btn => btn.onclick = () => openCase(btn.dataset.open, btn));
  el.querySelectorAll('[data-probs]').forEach(btn => btn.onclick = async () => {
    const d = await api(`/cases/${btn.dataset.probs}/probabilities`);
    const rarityOrder = ['common','uncommon','rare','epic','legendary','mythic'];
    const html = rarityOrder.filter(r => d.pools[r]).map(r => `
      <div style="margin-bottom:12px">
        <div class="rarity-${r}" style="color:var(--rarity-color);font-weight:700;margin-bottom:6px;text-transform:uppercase">${r} · ${d.pools[r].weight}%</div>
        <div style="font-size:11px;color:var(--muted);display:grid;grid-template-columns:1fr 1fr;gap:4px">
          ${d.pools[r].skins.map(s => `<div>${s.icon} ${s.weapon} ${s.name}</div>`).join('')}
        </div>
      </div>
    `).join('');
    showModal(`Probabilidades · ${btn.dataset.probs}`, html);
  });
}

async function openCase(caseId, btn) {
  btn.disabled = true;
  try {
    const clientSeed = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2,'0')).join('');
    const res = await api(`/cases/${caseId}/open`, { method: 'POST', body: JSON.stringify({ clientSeed }) });
    state.user.coins = res.balance; updateCoins();
    if (res.levelInfo?.levelUps) { Sound.levelup(); toast(`🎉 ¡Subiste al nivel ${res.levelInfo.level}!`, 'success'); }
    await playOpen(res.reel, res.winIndex, res.won, res.provably);
    const me = await api('/me'); state.inventory = me.inventory; state.user = me.user;
    await loadCases();
    renderFeed();
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; }
}

function playOpen(reel, winIndex, won, provably) {
  return new Promise(resolve => {
    overlay.style.display = 'flex';
    resultEl.style.display = 'none'; resultEl.innerHTML = '';
    reelEl.style.transition = 'none'; reelEl.style.transform = 'translateX(0)';
    reelEl.innerHTML = reel.map(s => `
      <div class="reel-item rarity-${s.rarity}"><div class="reel-icon">${s.icon}</div><div class="reel-name">${s.weapon}</div></div>
    `).join('');
    Sound.open();
    let ticks = 0;
    const tickInt = setInterval(() => { Sound.tick(); if (++ticks > 30) clearInterval(tickInt); }, 80);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const STEP = 138, ITEM_W = 130;
      const itemCenter = winIndex * STEP + 4 + ITEM_W / 2;
      const viewport = reelEl.parentElement.clientWidth;
      const targetX = viewport / 2 - itemCenter;
      const jitter = (Math.random() - 0.5) * 60;
      reelEl.style.transition = 'transform 6s cubic-bezier(0.12, 0.8, 0.2, 1)';
      reelEl.style.transform = `translateX(${targetX + jitter}px)`;
    }));
    setTimeout(() => {
      clearInterval(tickInt);
      Sound.reveal(won.rarity);
      confetti(won.rarity);
      resultEl.innerHTML = `
        <div class="result-card rarity-${won.rarity}">
          <div class="result-icon">${won.icon}</div>
          <div class="result-name">${won.weapon} | ${won.name}</div>
          <div class="result-rarity">${won.rarity}</div>
          <div class="provably">🔐 Verificable<br>Hash: ${provably.serverSeedHash.slice(0,24)}...<br>Nonce: ${provably.nonce}</div>
          <button class="btn" style="width:100%" id="closeOpen">Continuar</button>
        </div>`;
      resultEl.style.display = 'flex';
      document.getElementById('closeOpen').onclick = () => { overlay.style.display = 'none'; resolve(); };
    }, 6200);
  });
}

function renderBattles() {
  const el = document.getElementById('tabContent');
  el.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn" id="createBattleBtn">⚔️ Crear batalla</button>
      <button class="btn ghost" id="refreshBattle">🔄 Refrescar</button>
    </div>
    <div id="battleListEl">
      ${state.battles.length ? state.battles.map(renderBattleCard).join('') : '<div class="empty">No hay batallas activas. ¡Creá una!</div>'}
    </div>`;
  document.getElementById('createBattleBtn').onclick = showCreateBattleModal;
  document.getElementById('refreshBattle').onclick = async () => { await loadBattles(); renderBattles(); };
  el.querySelectorAll('[data-join-battle]').forEach(btn => btn.onclick = async () => {
    try {
      await api(`/battles/${btn.dataset.joinBattle}/join`, { method: 'POST' });
      toast('Te uniste a la batalla', 'success');
      await loadBattles(); renderBattles();
    } catch (e) { toast(e.message, 'error'); }
  });
  el.querySelectorAll('[data-ready]').forEach(btn => btn.onclick = async () => {
    try {
      await api(`/battles/${btn.dataset.ready}/ready`, { method: 'POST' });
      socket.emit('join:battle', Number(btn.dataset.ready));
      await loadBattles(); renderBattles();
    } catch (e) { toast(e.message, 'error'); }
  });
}

function renderBattleCard(b) {
  const isMine = b.players.some(p => p.user_id === state.user.id);
  const canJoin = b.players.length < b.max_players && !isMine && b.status === 'waiting';
  const mePlayer = b.players.find(p => p.user_id === state.user.id);
  const slots = Array.from({ length: b.max_players }, (_, i) => {
    const p = b.players[i];
    if (!p) return `<div class="battle-slot">+</div>`;
    return `<div class="battle-slot filled ${p.ready ? 'ready':''}" title="${p.username}">${p.username[0].toUpperCase()}</div>`;
  }).join('');
  return `<div class="battle-card">
    <div style="font-size:32px">${b.caseDef?.icon || '📦'}</div>
    <div class="battle-info">
      <div>${b.caseDef?.name} · ${b.max_players} jugadores</div>
      <div class="v">🪙 ${b.entry_fee} entrada</div>
    </div>
    <div class="battle-slots">${slots}</div>
    ${canJoin ? `<button class="btn small" data-join-battle="${b.id}">Unirse</button>` : ''}
    ${isMine && !mePlayer.ready && b.status==='waiting' ? `<button class="btn small success" data-ready="${b.id}">Listo</button>` : ''}
    ${isMine && mePlayer.ready ? `<span style="color:var(--success);font-size:11px">✓ Listo</span>` : ''}
  </div>`;
}

function showCreateBattleModal() {
  const html = `
    <select id="bCase">${state.cases.map(c => `<option value="${c.id}">${c.icon} ${c.name} (🪙${c.price})</option>`).join('')}</select>
    <select id="bPlayers"><option value="2">1 vs 1</option><option value="3">1 vs 1 vs 1</option><option value="4">4 jugadores</option></select>
    <input id="bFee" type="number" min="0" placeholder="Entrada (vacío = precio de caja)" />
    <button class="btn" style="width:100%" id="confirmBattle">Crear</button>`;
  showModal('Crear batalla', html);
  document.getElementById('confirmBattle').onclick = async () => {
    try {
      const r = await api('/battles', { method: 'POST', body: JSON.stringify({
        caseId: document.getElementById('bCase').value,
        maxPlayers: Number(document.getElementById('bPlayers').value),
        entryFee: Number(document.getElementById('bFee').value) || undefined
      })});
      closeModal();
      socket.emit('join:battle', r.battleId);
      await loadBattles(); renderBattles();
      const me = await api('/me'); state.user = me.user; updateCoins();
    } catch (e) { toast(e.message, 'error'); }
  };
}

function renderCoinflip() {
  const el = document.getElementById('tabContent');
  el.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn" id="createCF">🪙 Crear coinflip</button>
      <button class="btn ghost" id="refreshCF">🔄 Refrescar</button>
    </div>
    <div class="coinflip-grid">
      ${state.coinflips.filter(c => c.status === 'waiting').map(c => `
        <div class="coinflip-card">
          <div class="vs"><span>${escapeHtml(c.creatorName)}</span><span class="side ${c.creator_side}">${c.creator_side}</span></div>
          <div class="amt">🪙 ${c.amount}</div>
          <button class="btn" ${c.creator_id === state.user.id ? 'disabled' : ''} data-join-cf="${c.id}">Unirse</button>
        </div>
      `).join('') || '<div class="empty">No hay coinflips activos</div>'}
    </div>`;
  document.getElementById('createCF').onclick = showCreateCFModal;
  document.getElementById('refreshCF').onclick = async () => { await loadCoinflips(); renderCoinflip(); };
  el.querySelectorAll('[data-join-cf]').forEach(btn => btn.onclick = async () => {
    try {
      const r = await api(`/coinflips/${btn.dataset.joinCf}/join`, { method: 'POST' });
      showCoinAnimation(r.resultSide, r.winnerId === state.user.id);
      const me = await api('/me'); state.user = me.user; updateCoins();
      setTimeout(async () => { await loadCoinflips(); renderCoinflip(); }, 1600);
    } catch (e) { toast(e.message, 'error'); }
  });
}

function showCoinAnimation(side, won) {
  const div = document.createElement('div');
  div.className = 'modal-bg';
  div.innerHTML = `<div class="modal" style="text-align:center">
    <h2>${side === 'ct' ? '🔵 CT' : '🔴 T'}</h2>
    <div class="coin-anim">🪙</div>
    <div style="margin-top:16px;font-size:16px;font-weight:700;color:${won?'var(--success)':'var(--danger)'}">${won?'¡Ganaste!':'Perdiste'}</div>
  </div>`;
  document.body.appendChild(div);
  Sound.coin();
  setTimeout(() => { div.remove(); }, 1800);
}

function showCreateCFModal() {
  const html = `
    <input id="cfAmount" type="number" min="10" placeholder="Apuesta (min 10)" />
    <select id="cfSide"><option value="ct">🔵 CT</option><option value="t">🔴 T</option></select>
    <button class="btn" style="width:100%" id="confirmCF">Crear</button>`;
  showModal('Crear coinflip', html);
  document.getElementById('confirmCF').onclick = async () => {
    try {
      await api('/coinflips', { method: 'POST', body: JSON.stringify({
        amount: Number(document.getElementById('cfAmount').value),
        side: document.getElementById('cfSide').value
      })});
      closeModal();
      const me = await api('/me'); state.user = me.user; updateCoins();
      await loadCoinflips(); renderCoinflip();
    } catch (e) { toast(e.message, 'error'); }
  };
}

function renderInventory() {
  const el = document.getElementById('tabContent');
  if (!state.inventory.length) return el.innerHTML = '<div class="empty">Tu inventario está vacío. ¡Abrí alguna caja!</div>';
  el.innerHTML = `<div class="item-grid">
    ${state.inventory.map(it => `
      <div class="item-card rarity-${it.rarity}">
        <div class="icon">${it.icon}</div>
        <div class="name">${it.weapon} | ${it.name}</div>
        <div class="rarity">${it.rarity}</div>
        <div class="price">🪙 ${it.price}</div>
        ${it.listed_price
          ? `<div class="price" style="color:var(--accent2)">Venta: 🪙 ${it.listed_price}</div>
             <div class="actions"><button class="btn small ghost" data-unlist="${it.id}">Retirar</button></div>`
          : `<div class="actions">
              <input type="number" min="1" placeholder="Precio" id="p-${it.id}" />
              <button class="btn small" data-list="${it.id}">Vender</button>
              <button class="btn small ghost" data-sell="${it.id}">Sistema</button>
             </div>`}
      </div>
    `).join('')}
  </div>`;
  el.querySelectorAll('[data-list]').forEach(b => b.onclick = async () => {
    const p = document.getElementById('p-'+b.dataset.list).value;
    try { await api('/market/list', { method:'POST', body: JSON.stringify({ inventoryId: Number(b.dataset.list), price: Number(p) }) });
      const me = await api('/me'); state.inventory = me.inventory; renderInventory(); }
    catch (e) { toast(e.message, 'error'); }
  });
  el.querySelectorAll('[data-unlist]').forEach(b => b.onclick = async () => {
    try { await api('/market/unlist', { method:'POST', body: JSON.stringify({ inventoryId: Number(b.dataset.unlist) }) });
      const me = await api('/me'); state.inventory = me.inventory; renderInventory(); }
    catch (e) { toast(e.message, 'error'); }
  });
  el.querySelectorAll('[data-sell]').forEach(b => b.onclick = async () => {
    try { const r = await api('/inventory/sell', { method:'POST', body: JSON.stringify({ inventoryId: Number(b.dataset.sell) }) });
      state.user.coins = r.balance; updateCoins(); Sound.coin();
      const me = await api('/me'); state.inventory = me.inventory; renderInventory(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

function renderMarket() {
  const el = document.getElementById('tabContent');
  if (!state.market.length) return el.innerHTML = '<div class="empty">No hay skins en venta. Sé el primero en publicar.</div>';
  el.innerHTML = `<div class="item-grid">
    ${state.market.map(l => `
      <div class="item-card rarity-${l.rarity}">
        <div class="icon">${l.icon}</div>
        <div class="name">${l.weapon} | ${l.name}</div>
        <div class="rarity">${l.rarity}</div>
        <div style="color:var(--muted);font-size:10px;margin-top:4px">por ${escapeHtml(l.seller)}</div>
        <div class="price">🪙 ${l.price}</div>
        <div class="actions"><button class="btn small" data-buy="${l.listingId}" ${l.sellerId===state.user.id?'disabled':''}>Comprar</button></div>
      </div>
    `).join('')}
  </div>`;
  el.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
    try {
      await api('/market/buy', { method:'POST', body: JSON.stringify({ listingId: Number(b.dataset.buy) }) });
      Sound.coin();
      const [me, m] = await Promise.all([api('/me'), api('/market')]);
      state.user = me.user; state.inventory = me.inventory; state.market = m.listings;
      updateCoins(); renderMarket();
    } catch (e) { toast(e.message, 'error'); }
  });
}

function renderContract() {
  const el = document.getElementById('tabContent');
  const available = state.inventory.filter(i => !i.listed_price);
  el.innerHTML = `
    <div class="lb-card" style="margin-bottom:16px">
      <h3>⚗️ Contrato de mejora</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 16px">
        Combina <b>3 a 5 skins</b> para subir de rareza (3→25%, 4→35%, 5→45%).
      </p>
      <div class="item-grid" id="contractGrid">
        ${available.slice(0, 20).map(it => `
          <div class="item-card rarity-${it.rarity}" data-contract-item="${it.id}">
            <div class="icon">${it.icon}</div>
            <div class="name">${it.weapon} | ${it.name}</div>
            <div class="rarity">${it.rarity}</div>
            <div class="price">🪙 ${it.price}</div>
          </div>
        `).join('') || '<div class="empty">Sin items disponibles</div>'}
      </div>
      <div id="contractInfo" style="margin-top:16px;text-align:center;color:var(--muted);font-size:13px">Seleccioná 3+ skins</div>
      <button class="btn" style="width:100%;margin-top:12px" id="doContract" disabled>Ejecutar contrato</button>
    </div>`;
  const selected = new Set();
  el.querySelectorAll('[data-contract-item]').forEach(card => {
    card.onclick = () => {
      const id = Number(card.dataset.contractItem);
      if (selected.has(id)) { selected.delete(id); card.style.outline = ''; }
      else if (selected.size < 5) { selected.add(id); card.style.outline = '2px solid var(--accent)'; }
      const total = [...selected].reduce((s, id) => s + (available.find(x=>x.id===id)?.price||0), 0);
      document.getElementById('contractInfo').textContent = `${selected.size} seleccionadas · Total: 🪙${total}`;
      document.getElementById('doContract').disabled = selected.size < 3;
    };
  });
  document.getElementById('doContract').onclick = async () => {
    try {
      const r = await api('/contract', { method:'POST', body: JSON.stringify({ inventoryIds: [...selected] }) });
      Sound.reveal(r.resultSkin.rarity);
      if (r.won) confetti(r.resultSkin.rarity);
      showModal('Resultado', `
        <div class="result-card rarity-${r.resultSkin.rarity}">
          <div class="result-icon">${r.resultSkin.icon}</div>
          <div class="result-name">${r.resultSkin.weapon} | ${r.resultSkin.name}</div>
          <div class="result-rarity">${r.resultSkin.rarity}</div>
          <div style="color:${r.won?'var(--success)':'var(--muted)'};margin-top:8px;font-weight:700">
            ${r.won ? '¡ÉXITO!' : 'Fallaste'} · 🪙 ${r.outputValue}
          </div>
        </div>`);
      const me = await api('/me'); state.inventory = me.inventory;
    } catch (e) { toast(e.message, 'error'); }
  };
}

async function renderLeaderboard() {
  if (!state.leaderboard) await loadLeaderboard();
  const el = document.getElementById('tabContent');
  const lb = state.leaderboard;
  const renderList = (arr, fmt) => arr.map((x, i) => `
    <div class="lb-row">
      <span class="rank ${i<3?'r'+(i+1):''}">#${i+1}</span>
      <span style="flex:1">${escapeHtml(x.username)}</span>
      <span style="color:var(--accent)">${fmt(x)}</span>
    </div>
  `).join('');
  el.innerHTML = `<div class="lb-grid">
    <div class="lb-card"><h3>💰 Más ricos</h3>${renderList(lb.richest, x => `🪙${x.coins.toLocaleString()}`)}</div>
    <div class="lb-card"><h3>⭐ Mayor nivel</h3>${renderList(lb.topLevel, x => `Lv${x.level}`)}</div>
    <div class="lb-card"><h3>📦 Más aperturas</h3>${renderList(lb.topOpeners, x => `${x.total_opened}`)}</div>
    <div class="lb-card"><h3>💎 Mejores drops</h3>
      ${lb.biggestDrops.map((x, i) => `
        <div class="lb-row rarity-${x.rarity}">
          <span class="rank ${i<3?'r'+(i+1):''}">#${i+1}</span>
          <span style="flex:1;color:var(--rarity-color)">${x.icon} ${escapeHtml(x.username)}</span>
          <span style="color:var(--accent)">🪙${x.value}</span>
        </div>
      `).join('')}
    </div>
  </div>`;
}

async function renderAchievements() {
  if (!state.achievements) await loadAchievements();
  const el = document.getElementById('tabContent');
  const { all, unlocked } = state.achievements;
  el.innerHTML = `<div class="lb-grid">
    ${all.map(a => {
      const has = unlocked.includes(a.key);
      return `<div class="lb-card" style="opacity:${has?1:0.5}">
        <div style="font-size:32px;text-align:center">${has ? a.icon : '🔒'}</div>
        <h3 style="text-align:center">${a.name}</h3>
        <div style="color:var(--muted);font-size:12px;text-align:center;margin-bottom:8px">${a.desc}</div>
        <div style="text-align:center;color:${has?'var(--success)':'var(--muted)'};font-weight:700;font-size:12px">
          ${has ? '✓ Desbloqueado' : `Recompensa: 🪙${a.reward}`}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

async function renderTournament() {
  const el = document.getElementById('tabContent');
  el.innerHTML = '<div class="empty">Cargando...</div>';
  const t = await api('/tournament/current');
  const fmtTime = (ms) => {
    if (ms <= 0) return 'Cerrando...';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${d}d ${h}h ${m}m`;
  };
  const lbRow = (i, name, value) => `
    <div class="lb-row">
      <span class="rank ${i < 3 ? 'r' + (i + 1) : ''}">#${i + 1}</span>
      <span style="flex:1">${escapeHtml(name)}</span>
      <span style="color:var(--accent)">${value}</span>
    </div>`;
  el.innerHTML = `
    <div class="tournament-hero">
      <div><h2>🏆 Torneo Semanal</h2>
        <div style="color:var(--muted);font-size:13px">Semana ${t.weekKey}</div></div>
      <div class="tournament-timer">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase">Termina en</div>
        <div style="font-size:24px;font-weight:800;color:var(--accent)" id="tournamentTimer">${fmtTime(t.timeLeft)}</div>
      </div>
    </div>
    <div class="prizes-row">
      <div class="prize-card"><div style="font-size:34px">💎</div>
        <div><b>Mejor skin</b><div style="color:var(--accent);font-weight:700">🥇 ${t.prizes.best_drop.toLocaleString()} 🪙</div>
          <div style="color:var(--muted);font-size:11px">+10🪙/día al líder</div></div></div>
      <div class="prize-card"><div style="font-size:34px">⚔️</div>
        <div><b>Batallas</b><div style="color:var(--accent);font-weight:700">🥇 ${t.prizes.battles.toLocaleString()} 🪙</div>
          <div style="color:var(--muted);font-size:11px">+10🪙/día al líder</div></div></div>
      <div class="prize-card"><div style="font-size:34px">📦</div>
        <div><b>Cajas</b><div style="color:var(--accent);font-weight:700">🥇 ${t.prizes.opens.toLocaleString()} 🪙</div></div></div>
    </div>
    <div class="lb-grid" style="margin-top:16px">
      <div class="lb-card"><h3>💎 Mejor skin</h3>
        ${t.leaders.bestDrop.length ? t.leaders.bestDrop.map((x, i) => lbRow(i, x.username, `${x.icon || ''} ${x.weapon || ''} · 🪙${x.best_drop_value}`)).join('') : '<div class="empty">Aún nadie</div>'}</div>
      <div class="lb-card"><h3>⚔️ Más batallas</h3>
        ${t.leaders.topBattles.length ? t.leaders.topBattles.map((x, i) => lbRow(i, x.username, `${x.battles_won}`)).join('') : '<div class="empty">Aún nadie</div>'}</div>
      <div class="lb-card"><h3>📦 Más cajas</h3>
        ${t.leaders.topOpens.length ? t.leaders.topOpens.map((x, i) => lbRow(i, x.username, `${x.cases_opened}`)).join('') : '<div class="empty">Aún nadie</div>'}</div>
    </div>
    <div class="lb-card" style="margin-top:16px">
      <h3>👑 Campeones diarios recientes</h3>
      ${t.dailyChamps.length ? t.dailyChamps.map(c => `
        <div class="lb-row">
          <span style="color:var(--muted);font-size:11px;width:90px">${c.day_key}</span>
          <span style="flex:1">${c.category === 'best_skin' ? '💎' : '⚔️'} <b>${escapeHtml(c.username)}</b></span>
          <span style="color:var(--success);font-weight:700">+10 🪙</span>
        </div>`).join('') : '<div class="empty">Aún no hay campeones</div>'}
    </div>
    <div class="lb-card" style="margin-top:16px">
      <h3>🏅 Torneos pasados</h3>
      ${t.past.length ? t.past.map(p => `
        <div style="padding:10px 0;border-bottom:1px solid #1c2436;font-size:13px">
          <b style="color:var(--accent)">${p.week_key}</b> · 💎 ${escapeHtml(p.bestDropName || '—')} · ⚔️ ${escapeHtml(p.battlesName || '—')} · 📦 ${escapeHtml(p.opensName || '—')}
        </div>`).join('') : '<div class="empty">Aún no cerró ningún torneo</div>'}
    </div>`;
  if (window._tournamentInterval) clearInterval(window._tournamentInterval);
  let remaining = t.timeLeft;
  window._tournamentInterval = setInterval(() => {
    remaining -= 1000;
    const el2 = document.getElementById('tournamentTimer');
    if (!el2) { clearInterval(window._tournamentInterval); return; }
    el2.textContent = fmtTime(remaining);
  }, 1000);
}

function renderProfile() {
  const el = document.getElementById('tabContent');
  const refLink = `${location.origin}?ref=${state.user.referralCode}`;
  el.innerHTML = `<div class="lb-card" style="max-width:600px;margin:0 auto">
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:64px">👤</div>
      <h2 style="margin:8px 0">${escapeHtml(state.user.username)}</h2>
      <div class="level-badge" style="display:inline-block">Lv ${state.user.level} · ${state.user.levelTitle}</div>
    </div>
    <div class="lb-row"><span>🪙 Monedas</span><span style="color:var(--accent)">${state.user.coins.toLocaleString()}</span></div>
    <div class="lb-row"><span>📦 Cajas abiertas</span><span>${state.user.totalOpened}</span></div>
    <div class="lb-row"><span>⚔️ Batallas ganadas</span><span>${state.user.battlesWon || 0}</span></div>
    <div class="lb-row"><span>🔥 Racha</span><span>${state.user.dailyStreak} días</span></div>
    <div class="lb-row"><span>🎒 Items</span><span>${state.inventory.length}</span></div>
    <div style="margin-top:20px;padding:14px;background:#0f1420;border-radius:10px;border:1px solid var(--border)">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">🎁 Código de referido</div>
      <div style="font-family:monospace;font-size:16px;color:var(--accent2);font-weight:700">${state.user.referralCode}</div>
      <button class="btn small ghost" style="width:100%;margin-top:8px" id="copyRef">📋 Copiar enlace</button>
    </div>
    <button class="btn ghost" style="width:100%;margin-top:16px" onclick="localStorage.removeItem('token');location.reload()">Cerrar sesión</button>
  </div>`;
  document.getElementById('copyRef').onclick = async function() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Case Sim', text: '¡Jugá conmigo!', url: refLink }); } catch {}
    } else {
      navigator.clipboard.writeText(refLink);
      this.textContent = '¡Copiado!';
    }
  };
}

function showModal(title, html) {
  const div = document.createElement('div');
  div.className = 'modal-bg';
  div.innerHTML = `<div class="modal"><h2>${title}</h2><div>${html}</div>
    <button class="btn ghost" style="width:100%;margin-top:12px" onclick="this.closest('.modal-bg').remove()">Cerrar</button></div>`;
  div.onclick = (e) => { if (e.target === div) div.remove(); };
  document.body.appendChild(div);
}
function closeModal() { document.querySelectorAll('.modal-bg').forEach(m => m.remove()); }

socket.on('feed:drop', (d) => {
  const feed = document.getElementById('feedScroll');
  if (!feed) return;
  const div = document.createElement('div');
  div.className = `feed-item rarity-${d.skin.rarity}`;
  div.innerHTML = `<span>${d.skin.icon}</span><span><span class="u">${escapeHtml(d.username)}</span> sacó ${d.skin.weapon}</span><span class="v">🪙${d.value}</span>`;
  feed.prepend(div);
  while (feed.children.length > 15) feed.removeChild(feed.lastChild);
  if (['mythic','legendary'].includes(d.skin.rarity)) {
    const live = document.getElementById('liveFeed');
    const pop = document.createElement('div');
    pop.className = `live-feed-item rarity-${d.skin.rarity}`;
    pop.innerHTML = `${d.skin.icon} <b>${escapeHtml(d.username)}</b> sacó ${d.skin.weapon}`;
    live.appendChild(pop);
    setTimeout(() => pop.remove(), 6000);
  }
});

socket.on('feed:battle', (d) => {
  const live = document.getElementById('liveFeed');
  const pop = document.createElement('div');
  pop.className = 'live-feed-item';
  pop.innerHTML = `⚔️ <b>${escapeHtml(d.winner)}</b> ganó batalla (🪙${d.totalValue})`;
  live.appendChild(pop);
  setTimeout(() => pop.remove(), 5000);
});

socket.on('coinflip:resolved', (d) => {
  if (d.winnerId === state.user?.id) { toast(`🪙 ¡Ganaste ${d.amount} monedas!`, 'success'); Sound.coin(); }
});

socket.on('chat:message', (m) => {
  state.chat.push(m);
  if (state.chat.length > 100) state.chat.shift();
  renderChat();
  Sound.message();
});

socket.on('achievement:unlocked', (d) => {
  toast(`🎖️ ${d.username} desbloqueó "${d.achievement.name}"`, 'info');
});

socket.on('market:update', () => {
  if (state.tab === 'market' && state.user) loadMarket().then(() => renderMarket()).catch(()=>{});
});

socket.on('battles:update', () => {
  if (state.tab === 'battles' && state.user) loadBattles().then(() => renderBattles()).catch(()=>{});
});

socket.on('battle:result', (d) => {
  const isMe = d.winner.userId === state.user?.id;
  const html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px;margin-bottom:16px">
      ${d.results.map(r => `
        <div class="item-card rarity-${r.skin.rarity}" style="${r.userId === d.winner.userId ? 'outline:2px solid var(--success)' : ''}">
          <div class="icon">${r.skin.icon}</div>
          <div class="name">${escapeHtml(r.username)}</div>
          <div class="price">🪙 ${r.skin.price}</div>
        </div>
      `).join('')}
    </div>
    <div style="text-align:center;padding:16px;background:${isMe?'rgba(74,222,128,.1)':'rgba(255,209,102,.1)'};border-radius:10px">
      <div style="font-size:32px">${isMe?'🏆':'😢'}</div>
      <div style="font-weight:800;font-size:16px;margin-top:6px">Ganó: ${escapeHtml(d.winner.username)}</div>
      <div style="color:var(--accent);margin-top:4px">🪙 ${d.totalValue}</div>
    </div>`;
  showModal('⚔️ Resultado', html);
  if (isMe) { Sound.levelup(); confetti('epic'); }
  setTimeout(async () => { const me = await api('/me'); state.user = me.user; updateCoins(); }, 500);
});

socket.on('tournament:closed', (d) => {
  const w = d.winners || {};
  let html = '<div style="display:flex;flex-direction:column;gap:10px">';
  if (w.best_drop) html += `<div class="lb-row"><span style="flex:1">💎 ${escapeHtml(w.best_drop.username)}</span><span style="color:var(--accent);font-weight:700">+${w.best_drop.prize}🪙</span></div>`;
  if (w.battles) html += `<div class="lb-row"><span style="flex:1">⚔️ ${escapeHtml(w.battles.username)}</span><span style="color:var(--accent);font-weight:700">+${w.battles.prize}🪙</span></div>`;
  if (w.opens) html += `<div class="lb-row"><span style="flex:1">📦 ${escapeHtml(w.opens.username)}</span><span style="color:var(--accent);font-weight:700">+${w.opens.prize}🪙</span></div>`;
  html += '</div>';
  showModal(`🏆 Torneo ${d.weekKey} cerrado`, html);
  Sound.levelup();
});

socket.on('champion:awarded', (d) => {
  if (d.username === state.user?.username) {
    const label = d.category === 'best_skin' ? 'mejor skin' : 'batallas';
    toast(`👑 ¡Sos el campeón diario de ${label}! +${d.coins}🪙`, 'success');
    Sound.coin();
    if (state.user) state.user.coins += d.coins;
    updateCoins();
  }
});

socket.on('tournament:new', (d) => {
  toast(`🏆 ¡Nuevo torneo semanal iniciado! (${d.weekKey})`, 'info');
});

if (token) boot(); else renderAuth();

const urlRef = new URLSearchParams(location.search).get('ref');
if (urlRef && !token) setTimeout(() => {
  const r = document.getElementById('ref'); if (r) r.value = urlRef;
}, 100);

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById('installBanner');
  if (banner) banner.style.display = 'block';
});
window.addEventListener('appinstalled', () => {
  const banner = document.getElementById('installBanner');
  if (banner) banner.style.display = 'none';
  deferredPrompt = null;
  toast('🎉 ¡App instalada!', 'success');
});
document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('installBtn');
  const dismissBtn = document.getElementById('dismissInstall');
  if (installBtn) installBtn.onclick = async () => {
    if (!deferredPrompt) { toast('Abrí menú Chrome → "Instalar aplicación"', 'info'); return; }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') document.getElementById('installBanner').style.display = 'none';
    deferredPrompt = null;
  };
  if (dismissBtn) dismissBtn.onclick = () => { document.getElementById('installBanner').style.display = 'none'; };
});
history.pushState({ tab: 'root' }, '');
window.addEventListener('popstate', () => {
  const modal = document.querySelector('.modal-bg');
  if (modal) { modal.remove(); history.pushState({}, ''); return; }
  if (overlay && overlay.style.display === 'flex') { overlay.style.display = 'none'; history.pushState({}, ''); return; }
  if (state.tab && state.tab !== 'cases') { state.tab = 'cases'; render(); history.pushState({}, ''); return; }
});
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
