'use strict';

const API = 'https://api.tcgdex.net/v2';
const state = { lang: 'pt', page: 1, lastCount: 0, sets: [], series: [] };

const $ = (sel) => document.querySelector(sel);
const selected = (sel) => [...$(sel).selectedOptions].map((o) => o.value).filter(Boolean);
const form = $('#filters');

/* ---------------------------------------------------------------------------
 * A API não consegue fazer match exato (`eq:`) em valores com acento — o
 * servidor não decodifica os bytes UTF-8 do query string. Para esses valores
 * usamos o match parcial (comportamento padrão, "like") sobre o maior trecho
 * sem acentos do valor. Ex.: "Água" -> "gua", "Estágio 1" -> "gio 1".
 * ------------------------------------------------------------------------ */
const hasAccent = (s) => /[^\x20-\x7E]/.test(s);

function enumFilterValue(value) {
  if (!hasAccent(value)) return 'eq:' + value;
  const longest = value
    .split(/[^\x20-\x7E]/)
    .reduce((a, b) => (b.length > a.length ? b : a), '');
  return longest.trim() || value;
}

async function api(path, params) {
  const url = new URL(`${API}/${state.lang}${path}`);
  for (const [k, v] of Object.entries(params || {})) {
    // arrays viram parâmetros repetidos (ex.: hp=gte:100&hp=lte:150)
    for (const one of Array.isArray(v) ? v : [v]) {
      if (one !== undefined && one !== null && one !== '') url.searchParams.append(k, one);
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ------------------------------ filtros ---------------------------------- */

function buildParams() {
  const f = new FormData(form);
  const get = (k) => (f.get(k) || '').toString().trim();
  const p = {};

  for (const k of ['name', 'id', 'localId', 'illustrator']) {
    if (get(k)) p[k] = get(k); // match parcial, case-insensitive
  }
  for (const k of ['category', 'types', 'rarity', 'stage', 'suffix',
                   'trainerType', 'energyType', 'regulationMark']) {
    if (get(k)) p[k] = enumFilterValue(get(k));
  }

  if (get('dexId')) p.dexId = 'eq:' + get('dexId');
  const hp = [];
  if (get('hpMin')) hp.push('gte:' + get('hpMin'));
  if (get('hpMax')) hp.push('lte:' + get('hpMax'));
  if (hp.length) p.hp = hp;
  if (get('retreatMax')) p.retreat = 'lte:' + get('retreatMax');

  // sets escolhidos vencem; senão, todos os sets das séries escolhidas
  const sets = selected('#set');
  const series = selected('#serie');
  const ids = sets.length
    ? sets
    : state.sets.filter((s) => series.includes(s.serieId)).map((s) => s.id);
  if (ids.length) p.set = 'eq:' + ids.join('|');

  if (get('sortField')) {
    p['sort:field'] = get('sortField');
    p['sort:order'] = get('sortOrder') || 'ASC';
  }
  p['pagination:page'] = state.page;
  p['pagination:itemsPerPage'] = get('perPage') || 48;
  return p;
}

/* ------------------------------ listagem --------------------------------- */

async function search() {
  const grid = $('#grid');
  $('#status').textContent = 'Buscando…';
  grid.setAttribute('aria-busy', 'true');
  try {
    const params = buildParams();
    let cards = await api('/cards', params);
    state.lastCount = cards.length;
    if (form.onlyImages.checked) cards = cards.filter((c) => c.image);

    grid.innerHTML = cards.map(cardTile).join('');
    $('#status').textContent = cards.length
      ? `${cards.length} carta(s) nesta página`
      : 'Nenhuma carta encontrada com esses filtros.';
  } catch (err) {
    grid.innerHTML = '';
    $('#status').textContent = 'Erro ao consultar a API: ' + err.message;
  } finally {
    grid.removeAttribute('aria-busy');
    updatePager();
  }
}

function cardTile(c) {
  const img = c.image
    ? `<img loading="lazy" src="${c.image}/low.webp" alt="${escapeHtml(c.name)}">`
    : `<div class="noimg">sem imagem</div>`;
  return `<button class="card" data-id="${c.id}">
    ${img}
    <span class="card-name">${escapeHtml(c.name)}</span>
    <span class="card-id">${escapeHtml(c.id)}</span>
  </button>`;
}

function updatePager() {
  const perPage = Number(new FormData(form).get('perPage') || 48);
  $('#pageLabel').textContent = 'Página ' + state.page;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.lastCount < perPage;
}

/* ------------------------------ detalhe ---------------------------------- */

async function openCard(id) {
  $('#modal').hidden = false;
  $('#modalBody').innerHTML = '<p class="loading">Carregando carta…</p>';
  try {
    const c = await api('/cards/' + encodeURIComponent(id));
    $('#modalBody').innerHTML = cardDetail(c);
  } catch (err) {
    $('#modalBody').innerHTML = `<p class="loading">Erro: ${escapeHtml(err.message)}</p>`;
  }
}

function cardDetail(c) {
  const row = (label, value) =>
    value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)
      ? ''
      : `<tr><th>${label}</th><td>${escapeHtml(String(Array.isArray(value) ? value.join(', ') : value))}</td></tr>`;

  const attacks = (c.attacks || []).map((a) => `
    <li>
      <strong>${escapeHtml(a.name)}</strong>
      ${a.damage ? `<span class="dmg">${escapeHtml(String(a.damage))}</span>` : ''}
      ${a.cost ? `<div class="cost">Custo: ${escapeHtml(a.cost.join(', '))}</div>` : ''}
      ${a.effect ? `<div class="effect">${escapeHtml(a.effect)}</div>` : ''}
    </li>`).join('');

  const abilities = (c.abilities || []).map((a) => `
    <li><strong>${escapeHtml(a.name)}</strong> <em>${escapeHtml(a.type || '')}</em>
      <div class="effect">${escapeHtml(a.effect || '')}</div></li>`).join('');

  const price = c.pricing?.cardmarket?.trend ?? c.pricing?.cardmarket?.avg;

  return `
    <div class="detail">
      <div class="detail-img">
        ${c.image ? `<img src="${c.image}/high.webp" alt="${escapeHtml(c.name)}">` : '<div class="noimg">sem imagem</div>'}
      </div>
      <div class="detail-info">
        <h2>${escapeHtml(c.name)} ${c.hp ? `<span class="hp">${c.hp} HP</span>` : ''}</h2>
        <table>
          ${row('ID', c.id)}
          ${row('Categoria', c.category)}
          ${row('Tipos', c.types)}
          ${row('Estágio', c.stage)}
          ${row('Evolui de', c.evolveFrom)}
          ${row('Sufixo', c.suffix)}
          ${row('Tipo de treinador', c.trainerType)}
          ${row('Tipo de energia', c.energyType)}
          ${row('Raridade', c.rarity)}
          ${row('Set', c.set ? `${c.set.name} (${c.set.id})` : '')}
          ${row('Nº no set', c.localId)}
          ${row('Ilustrador', c.illustrator)}
          ${row('Pokédex', c.dexId)}
          ${row('Recuo', c.retreat)}
          ${row('Fraquezas', (c.weaknesses || []).map((w) => `${w.type} ${w.value}`))}
          ${row('Resistências', (c.resistances || []).map((r) => `${r.type} ${r.value}`))}
          ${row('Marca de regulação', c.regulationMark)}
          ${row('Legal (Standard/Expanded)', c.legal ? `${c.legal.standard ? 'sim' : 'não'} / ${c.legal.expanded ? 'sim' : 'não'}` : '')}
          ${row('Preço (Cardmarket)', price !== undefined ? `€ ${price}` : '')}
        </table>
        ${abilities ? `<h3>Habilidades</h3><ul class="moves">${abilities}</ul>` : ''}
        ${attacks ? `<h3>Ataques</h3><ul class="moves">${attacks}</ul>` : ''}
        ${c.effect ? `<h3>Efeito</h3><p>${escapeHtml(c.effect)}</p>` : ''}
        ${c.description ? `<h3>Descrição</h3><p>${escapeHtml(c.description)}</p>` : ''}
      </div>
    </div>`;
}

/* ------------------------------ opções ----------------------------------- */

async function loadOptions() {
  const selects = [...document.querySelectorAll('select[data-enum]')];
  await Promise.all(selects.map(async (sel) => {
    const keep = sel.value;
    try {
      const values = await api('/' + sel.dataset.enum);
      sel.innerHTML = sel.options[0].outerHTML +
        values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
      sel.value = keep;
    } catch { /* mantém só a opção "todos" */ }
  }));

  try {
    const series = await api('/series');
    const keep = selected('#serie');
    state.series = series;
    $('#serie').innerHTML = series
      .map((s) => `<option value="${escapeHtml(s.id)}"${keep.includes(s.id) ? ' selected' : ''}>${escapeHtml(s.name)}</option>`)
      .join('');
  } catch { /* ignora */ }

  try {
    const sets = await api('/sets');
    // descobre a série de cada set para permitir o filtro em cascata
    const bySerie = await Promise.all(state.series.map(async (s) => {
      try {
        const full = await api('/series/' + s.id);
        return (full.sets || []).map((x) => [x.id, s.id]);
      } catch { return []; }
    }));
    const map = new Map(bySerie.flat());
    state.sets = sets.map((s) => ({ id: s.id, name: s.name, serieId: map.get(s.id) || '' }));
    renderSets();
  } catch { /* ignora */ }
}

function renderSets() {
  const series = selected('#serie');
  const keep = selected('#set');
  const list = series.length ? state.sets.filter((s) => series.includes(s.serieId)) : state.sets;
  $('#set').innerHTML = list
    .map((s) => `<option value="${escapeHtml(s.id)}"${keep.includes(s.id) ? ' selected' : ''}>${escapeHtml(s.name)} (${escapeHtml(s.id)})</option>`)
    .join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/* ------------------------------ eventos ---------------------------------- */

form.addEventListener('submit', (e) => { e.preventDefault(); state.page = 1; search(); });
function clearSets() {
  for (const o of $('#serie').options) o.selected = false;
  for (const o of $('#set').options) { o.selected = false; o.removeAttribute('selected'); }
  renderSets();
}

$('#reset').addEventListener('click', () => {
  form.reset(); clearSets(); state.page = 1; search();
});
$('#clearSets').addEventListener('click', () => { clearSets(); state.page = 1; search(); });
$('#serie').addEventListener('change', renderSets);
$('#prev').addEventListener('click', () => { if (state.page > 1) { state.page--; search(); } });
$('#next').addEventListener('click', () => { state.page++; search(); });
$('#lang').addEventListener('change', async (e) => {
  state.lang = e.target.value;
  state.page = 1;
  await loadOptions();
  search();
});
$('#grid').addEventListener('click', (e) => {
  const tile = e.target.closest('.card');
  if (tile) openCard(tile.dataset.id);
});
$('#modalClose').addEventListener('click', () => { $('#modal').hidden = true; });
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal').hidden = true; });

(async function init() {
  await loadOptions();
  search();
})();
