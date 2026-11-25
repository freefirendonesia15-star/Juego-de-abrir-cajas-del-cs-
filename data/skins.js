const SKINS = [
  { id:'p250_arena', weapon:'P250', name:'Arena', rarity:'common', price:10, icon:'🔫' },
  { id:'glock_sand', weapon:'Glock-18', name:'Sand', rarity:'common', price:12, icon:'🔫' },
  { id:'usp_storm', weapon:'USP-S', name:'Storm', rarity:'common', price:14, icon:'🔫' },
  { id:'mp9_urban', weapon:'MP9', name:'Urban', rarity:'common', price:11, icon:'🔫' },
  { id:'nova_dust', weapon:'Nova', name:'Dust', rarity:'common', price:9, icon:'🎯' },
  { id:'xm_river', weapon:'XM1014', name:'River', rarity:'common', price:13, icon:'🎯' },
  { id:'ump_dust', weapon:'UMP-45', name:'Dust', rarity:'common', price:12, icon:'🔫' },
  { id:'famas_neon', weapon:'FAMAS', name:'Neón', rarity:'uncommon', price:28, icon:'🔫' },
  { id:'galil_camo', weapon:'Galil AR', name:'Camo', rarity:'uncommon', price:32, icon:'🔫' },
  { id:'ump_shadow', weapon:'UMP-45', name:'Shadow', rarity:'uncommon', price:30, icon:'🔫' },
  { id:'p90_tide', weapon:'P90', name:'Tide', rarity:'uncommon', price:35, icon:'🔫' },
  { id:'sawed_ember', weapon:'Sawed-Off', name:'Ember', rarity:'uncommon', price:26, icon:'🎯' },
  { id:'mag7_venom', weapon:'MAG-7', name:'Venom', rarity:'uncommon', price:33, icon:'🎯' },
  { id:'mp7_ash', weapon:'MP7', name:'Ash', rarity:'uncommon', price:29, icon:'🔫' },
  { id:'ak_neon', weapon:'AK-47', name:'Neón', rarity:'rare', price:95, icon:'🔫' },
  { id:'m4_frost', weapon:'M4A4', name:'Frost', rarity:'rare', price:105, icon:'🔫' },
  { id:'awp_dragon', weapon:'AWP', name:'Dragón', rarity:'rare', price:120, icon:'🎯' },
  { id:'ssg_void', weapon:'SSG 08', name:'Void', rarity:'rare', price:85, icon:'🎯' },
  { id:'deagle_blaze', weapon:'Desert Eagle', name:'Blaze', rarity:'rare', price:110, icon:'🔫' },
  { id:'famas_apex', weapon:'FAMAS', name:'Apex', rarity:'rare', price:90, icon:'🔫' },
  { id:'ak_hyper', weapon:'AK-47', name:'Hyper', rarity:'epic', price:320, icon:'🔫' },
  { id:'m4_asiimov', weapon:'M4A4', name:'Asiimov', rarity:'epic', price:280, icon:'🔫' },
  { id:'awp_noir', weapon:'AWP', name:'Neo-Noir', rarity:'epic', price:350, icon:'🎯' },
  { id:'glock_fade', weapon:'Glock-18', name:'Fade', rarity:'epic', price:300, icon:'🔫' },
  { id:'karambit_fade', weapon:'Karambit', name:'Fade', rarity:'legendary', price:900, icon:'🗡️' },
  { id:'butterfly_dop', weapon:'Butterfly', name:'Doppler', rarity:'legendary', price:850, icon:'🦋' },
  { id:'bayonet_tiger', weapon:'Bayonet', name:'Tiger', rarity:'legendary', price:920, icon:'🗡️' },
  { id:'karambit_ruby', weapon:'Karambit', name:'Ruby', rarity:'mythic', price:2500, icon:'💎' },
  { id:'talon_lore', weapon:'Talon', name:'Lore', rarity:'mythic', price:2800, icon:'🗡️' },
  { id:'m9_sapphire', weapon:'M9', name:'Sapphire', rarity:'mythic', price:3200, icon:'💎' },
];

const CASES = [
  { id:'starter', name:'Caja Inicial', desc:'Perfecta para empezar', price:100, icon:'📦',
    pools:{ common:60, uncommon:28, rare:9, epic:2.5, legendary:0.45, mythic:0.05 } },
  { id:'premium', name:'Caja Premium', desc:'Mejores probabilidades', price:600, icon:'🎁',
    pools:{ common:30, uncommon:35, rare:22, epic:10, legendary:2.7, mythic:0.3 } },
  { id:'legendary', name:'Caja Legendaria', desc:'Solo para valientes', price:3000, icon:'👑',
    pools:{ common:0, uncommon:15, rare:35, epic:32, legendary:15, mythic:3 } },
];

const ACHIEVEMENTS = [
  { key:'first_open',    name:'Primera caja',    desc:'Abre tu primera caja',        reward:100,  icon:'🎁' },
  { key:'ten_opens',     name:'Adicto',          desc:'Abre 10 cajas',               reward:300,  icon:'📦' },
  { key:'fifty_opens',   name:'Coleccionista',   desc:'Abre 50 cajas',               reward:1500, icon:'🏆' },
  { key:'mythic_drop',   name:'Afortunado',      desc:'Consigue una skin mítica',    reward:5000, icon:'💎' },
  { key:'legendary_drop',name:'Cazador',         desc:'Consigue una skin legendaria',reward:2000, icon:'🗡️' },
  { key:'first_battle',  name:'Gladiador',       desc:'Gana una batalla',            reward:500,  icon:'⚔️' },
  { key:'first_coinflip',name:'Cara o cruz',     desc:'Gana un coinflip',            reward:300,  icon:'🪙' },
  { key:'level_5',       name:'Novato',          desc:'Llega al nivel 5',            reward:1000, icon:'⭐' },
  { key:'level_10',      name:'Veterano',        desc:'Llega al nivel 10',           reward:5000, icon:'🌟' },
  { key:'first_sale',    name:'Comerciante',     desc:'Vende algo en el mercado',    reward:200,  icon:'🛒' },
  { key:'streak_7',      name:'Constante',       desc:'Racha de 7 días',             reward:1000, icon:'🔥' },
];

const LEVEL_TITLES = [
  'Novato','Aprendiz','Curioso','Explorador','Coleccionista','Veterano',
  'Experto','Maestro','Leyenda','Élite','Campeón','Mítico','Inmortal','Dios del Case'
];

module.exports = { SKINS, CASES, ACHIEVEMENTS, LEVEL_TITLES };
