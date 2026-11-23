#!/usr/bin/env node
// TerraCorridor: fill the corridor_climate_cells cache from YOUR computer (not n8n Cloud).
// Open-Meteo blocks n8n Cloud's shared IP. This script downloads the same two files W2 would and runs
// W2's own condense maths: the shared helper block is read straight out of the W2 export
// (workflows/W2_ Long-Range Engine.json, node "Condense Archive"), so there is one copy of the rules.
// Needs Node 18 or newer.
// Usage:  node scripts/fetch-climate-cells.js                 (the corridor's four cells; see docs/HAZARD_DATA.md)
//         node scripts/fetch-climate-cells.js 53.40_-113.40    (only these cell keys)
// Resumable: a cell already saved with the current signature is skipped.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const W2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', 'W2_ Long-Range Engine.json'), 'utf8'));
const w2node = (n) => W2.nodes.find((x) => x.name === n);
const cfg = Object.fromEntries(w2node('W2 Config').parameters.assignments.assignments.filter((a) => typeof a.value !== 'string' || !a.value.startsWith('=')).map((a) => [a.name, a.value]));
const BASE_START = cfg.baseline_start, BASE_END = cfg.baseline_end, PROJ_END = cfg.projection_end;
const CLIMATE_MODELS = cfg.climate_models;
const SIG = [cfg.baseline_start, cfg.baseline_end, cfg.projection_start, cfg.projection_end, cfg.climate_models, 'v3'].join('|'); // must match W2 "Plan Grid Cells"

// The shared helper block of W2 (seriesMetrics, ratio, HORIZONS, MODELS ...), evaluated with W2's own config.
const code = w2node('Condense Archive').parameters.jsCode;
const helper = code.slice(0, code.indexOf('// ===== Condense the'));
if (!helper.includes('function seriesMetrics')) throw new Error('W2 helper block not found in the export');
const { seriesMetrics, ratio, HORIZONS, MODELS } = new Function('$', helper + '\nreturn { seriesMetrics, ratio, HORIZONS, MODELS };')(() => ({ first: () => ({ json: cfg }) }));

const args = process.argv.slice(2);
const corridorFlag = args.indexOf('--corridor');
const corridorId = corridorFlag >= 0 ? args[corridorFlag + 1] : 'ab-strathcona-demo';
if (!['ab-strathcona-demo','bc-coquihalla','ngtl-ab-osm'].includes(corridorId)) throw new Error('Unknown corridor ID');
if (corridorFlag >= 0) args.splice(corridorFlag, 2);
const CELL_FILE = corridorId === 'bc-coquihalla' ? path.join(ROOT, 'data/corridors/bc-coquihalla/climate-cells.json') : corridorId === 'ngtl-ab-osm' ? path.join(ROOT, 'data/ngtl/climate-cells.json') : path.join(ROOT, 'data', 'cache', 'cells', 'trans-northern-cells.json');
const saved = fs.existsSync(CELL_FILE) ? JSON.parse(fs.readFileSync(CELL_FILE, 'utf8')) : [];
const wanted = args;
// The four 10 km cells the live 22 km corridor crosses (W2 "Select Batch Segments" rounds each segment centroid to 0.1 degree).
// NGTL: the 0.5-degree cells its 508 segments fall in (NGTL W2 grid_cell_deg = 0.5), listed in data/ngtl/cells.json, busiest first so a
// rate-limited run (Open-Meteo allows about 5 cells a day per IP) covers the most kilometres.
const CORRIDOR_CELLS = corridorId === 'bc-coquihalla' ? ['49.40_-121.30'] : corridorId === 'ngtl-ab-osm' ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data/ngtl/cells.json'), 'utf8')).cells.slice().sort((a, b) => b.segments - a.segments).map((c) => c.cell_key) : ['53.30_-113.50', '53.40_-113.50', '53.40_-113.40', '53.50_-113.40'];
const CELLS = (wanted.length ? wanted : [...new Set(CORRIDOR_CELLS.concat(saved.map((r) => r.cell_key)))]).map((k) => ({ cell_key: k, lat: Number(k.split('_')[0]), lon: Number(k.split('_')[1]) }));
const SLEEP_MS = Number(process.env.SLEEP_MS || 65000);
const OUT_DIR = process.env.OUT_DIR || path.join(ROOT, 'work', 'climate-seed');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- download helpers ----
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Optional: OPEN_METEO_API_KEY (a paid Open-Meteo plan) lifts the free ~5 cells/day limit. The key is added only
// to the request: rows keep the public URL, so it never reaches the repo or the n8n tables.
const OM_KEY = process.env.OPEN_METEO_API_KEY || '';
const withKey = (url) => OM_KEY ? url.replace('https://archive-api.', 'https://customer-archive-api.').replace('https://climate-api.', 'https://customer-climate-api.') + '&apikey=' + encodeURIComponent(OM_KEY) : url;
async function download(url, label) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(withKey(url), { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'TerraCorridor-laptop-seed/1.0' } });
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.status === 200) return buf;
      console.log('  ' + label + ': HTTP ' + res.status + ' ' + buf.toString('utf8').slice(0, 120));
    } catch (e) { console.log('  ' + label + ': ' + e.message); }
    console.log('  waiting ' + Math.round(SLEEP_MS / 1000) + 's then retrying (' + attempt + '/6)');
    await sleep(SLEEP_MS);
  }
  throw new Error(label + ' failed after 6 tries. If the message was a request limit: Open-Meteo allows roughly 5 cells a day per IP address. Cells already fetched are saved; run this again later or from another network.');
}
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

// ---- same logic as W2 "Condense Archive" / "Condense Climate" for one cell ----
function condenseArchive(buf) {
  const res = { ok: false, error: '', hash: '' };
  const j = JSON.parse(buf.toString('utf8'));
  if (j && j.error === true) throw new Error(j.reason || 'API returned an error');
  const d = j.daily || {};
  const m = seriesMetrics(d.time || [], d.precipitation_sum || [], d.temperature_2m_max || [], d.temperature_2m_min || [], d.soil_moisture_0_to_7cm_mean || null, d.relative_humidity_2m_min || null);
  if (!m.ok) throw new Error(m.error);
  Object.assign(res, { ok: true, rainP95: m.rainP95, soilP90: m.soilP90, soilP10: m.soilP10, base: m.base, fetched_at: new Date().toISOString() });
  res.hash = sha256(buf);
  return res;
}
function condenseClimate(buf) {
  const res = { ok: false, error: '', hash: '', models: {} };
  const j = JSON.parse(buf.toString('utf8'));
  if (j && j.error === true) throw new Error(j.reason || 'API returned an error');
  const d = j.daily || {};
  for (const mdl of MODELS) {
    const m = seriesMetrics(d.time || [], d['precipitation_sum_' + mdl] || [], d['temperature_2m_max_' + mdl] || [], d['temperature_2m_min_' + mdl] || [], d['soil_moisture_0_to_10cm_mean_' + mdl] || null, d['relative_humidity_2m_min_' + mdl] || null);
    if (!m.ok) { res.models[mdl] = { ok: false, error: m.error }; continue; }
    const r = { ok: true, ratios: {} };
    for (const h of HORIZONS) {
      const w = m.windows[h.years];
      r.ratios[h.years] = w ? { rain: ratio(w.rain, m.base.rain), ft: ratio(w.ft, m.base.ft), sat: m.base.sat === null ? null : ratio(w.sat, m.base.sat),
        dry: m.base.dry === null || w.dry === null ? null : ratio(w.dry, m.base.dry),
        spell: m.base.spell === null || w.spell === null ? null : ratio(w.spell, m.base.spell),
        fire: m.base.fire === null || w.fire === null ? null : ratio(w.fire, m.base.fire) } : null;
    }
    res.models[mdl] = r;
  }
  Object.assign(res, { ok: true, fetched_at: new Date().toISOString() });
  res.hash = sha256(buf);
  return res;
}
function urlsFor(c) {
  return {
    archive_url: 'https://archive-api.open-meteo.com/v1/archive?latitude=' + c.lat + '&longitude=' + c.lon +
      '&start_date=' + BASE_START + '&end_date=' + BASE_END +
      '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,soil_moisture_0_to_7cm_mean,relative_humidity_2m_min&timezone=UTC',
    climate_url: 'https://climate-api.open-meteo.com/v1/climate?latitude=' + c.lat + '&longitude=' + c.lon +
      '&start_date=' + BASE_START + '&end_date=' + PROJ_END +
      '&models=' + CLIMATE_MODELS +
      '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,soil_moisture_0_to_10cm_mean,relative_humidity_2m_min',
  };
}
function toRow(c, urls, archive, climate) {
  return {
    cell_key: c.cell_key, cell_lat: c.lat, cell_lon: c.lon, config_signature: SIG,
    archive_hash: archive.hash, climate_hash: climate.hash,
    archive_url: urls.archive_url, climate_url: urls.climate_url,
    archive_metrics_json: JSON.stringify(archive), climate_metrics_json: JSON.stringify(climate),
    fetched_at: new Date().toISOString(),
  };
}
const COLS = ['cell_key', 'cell_lat', 'cell_lon', 'config_signature', 'archive_hash', 'climate_hash', 'archive_url', 'climate_url', 'archive_metrics_json', 'climate_metrics_json', 'fetched_at'];
const csvCell = v => '"' + String(v).replace(/"/g, '""') + '"';
function writeOutputs(rows) {
  const csv = [COLS.join(',')].concat(rows.map(r => COLS.map(k => csvCell(r[k])).join(','))).join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, 'cache_rows.csv'), csv);
  fs.writeFileSync(path.join(OUT_DIR, 'seed_code_node.js'), '// Paste into an n8n Code node (JavaScript, Run Once for All Items)\nconst ROWS = ' + JSON.stringify(rows, null, 1) + ';\nreturn ROWS.map(r => ({ json: r }));\n');
}

async function main() {
  if (!CELLS.length) throw new Error('no cells: pass cell keys like 53.40_-113.40');
  const rows = saved.filter((r) => r.config_signature === SIG);
  for (let i = 0; i < CELLS.length; i++) {
    const c = CELLS[i];
    if (rows.find((r) => r.cell_key === c.cell_key)) { console.log('Cell ' + c.cell_key + ': already cached with ' + SIG.slice(-2) + ', skipped'); continue; }
    const urls = urlsFor(c);
    console.log('Cell ' + (i + 1) + '/' + CELLS.length + ' ' + c.cell_key + ': downloading archive');
    const archive = condenseArchive(await download(urls.archive_url, 'archive'));
    await sleep(SLEEP_MS);
    console.log('Cell ' + (i + 1) + '/' + CELLS.length + ' ' + c.cell_key + ': downloading climate projections');
    const climate = condenseClimate(await download(urls.climate_url, 'climate'));
    rows.push(toRow(c, urls, archive, climate));
    rows.sort((a, b) => a.cell_key.localeCompare(b.cell_key));
    // Cells not refetched yet keep their older row (W2 uses it for ground failure and crossings only).
    const older = saved.filter((r) => r.config_signature !== SIG && !rows.find((x) => x.cell_key === r.cell_key));
    fs.writeFileSync(CELL_FILE, JSON.stringify(rows.concat(older).sort((a, b) => a.cell_key.localeCompare(b.cell_key)), null, 1) + '\n');   // save progress after every cell
    writeOutputs(rows);   // only current-signature rows go to the seed files
    if (CELLS.slice(i + 1).some((x) => !rows.find((r) => r.cell_key === x.cell_key))) await sleep(SLEEP_MS);
  }
  console.log('\nDONE. ' + rows.length + ' cell rows in ' + path.relative(ROOT, CELL_FILE) + ' (also cache_rows.csv and seed_code_node.js in ' + OUT_DIR + ')');
}
module.exports = { condenseArchive, condenseClimate, urlsFor, toRow, CELLS, SIG };
if (require.main === module) main().catch(e => { console.error('\nFAILED: ' + e.message); process.exit(1); });
