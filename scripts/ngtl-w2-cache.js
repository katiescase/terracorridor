// NGTL W2: reuse cached NDVI and elevation instead of asking Copernicus and Open-Meteo for every kilometre every run.
//
// Before: Select Batch Segments -> Fetch Sentinel-2 NDVI -> Hash NDVI -> Fetch Elevation -> Hash Elevation -> Get Cached Cells
//         sent all 508 segments to both APIs on every run. Copernicus turned most away, so few km were scored.
// After:  Select Batch Segments -> Needs live NDVI -> Fetch Sentinel-2 NDVI -> Hash NDVI -> Align NDVI
//         -> Needs live elevation -> Fetch Elevation -> Hash Elevation -> Align elevation -> Get Cached Cells
//   - A segment whose baseline row already holds a usable NDVI series (4+ growing seasons) skips the live request.
//     The window is fixed (ndvi_from..ndvi_to in W2 Config), so a good series never goes stale.
//   - A segment whose baseline row already holds both end elevations and their hash skips the elevation request.
//   - When nothing is missing, one segment is still sent so the chain runs (n8n stops a branch with no items).
//   - Align NDVI / Align elevation put the responses back in segment order, matched by segment_id, so
//     Score Segments still pairs response i with segment i.
//   - Score Segments reads the aligned nodes, uses the cached elevation for skipped segments, and does not log a
//     skipped request as a failed source.
// Usage: node scripts/ngtl-w2-cache.js "workflows/ngtl/NGTL · W2 - Long-Range Engine.json"   (patches the file in place)
// The same patch() runs in the browser against the live workflow.

function patch(w) {
  const N = (name) => w.nodes.find((n) => n.name === name);
  if (N('Needs live NDVI')) return { changed: false, reason: 'already patched' };
  const must = ['Select Batch Segments', 'Fetch Sentinel-2 NDVI', 'Hash NDVI', 'Fetch Elevation', 'Hash Elevation', 'Get Cached Cells', 'Score Segments'];
  for (const m of must) if (!N(m)) throw new Error('W2 has no node ' + m);

  // 1. Select Batch Segments: say which segments already have a usable cached series / elevation
  const sel = N('Select Batch Segments').parameters;
  const selAnchor = "function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }";
  if (!sel.jsCode.includes(selAnchor)) throw new Error('Select Batch Segments changed: helper anchor missing');
  sel.jsCode = sel.jsCode.replace(selAnchor, selAnchor + `
// Cached NDVI is reused when it holds 4+ growing seasons (May-Sep, 2+ months each), the same test Score Segments uses.
function usableSeries(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  try {
    const byYear = {};
    for (const p of JSON.parse(text)) {
      const mo = Number(String(p.month).slice(5, 7));
      if (mo >= 5 && mo <= 9 && Number.isFinite(p.mean)) byYear[String(p.month).slice(0, 4)] = (byYear[String(p.month).slice(0, 4)] || 0) + 1;
    }
    return Object.values(byYear).filter((c) => c >= 2).length >= 4;
  } catch (e) { return false; }
}`);
  const priorAnchor = "    prior_ndvi_source: prior.ndvi_source || '',";
  if (!sel.jsCode.includes(priorAnchor)) throw new Error('Select Batch Segments changed: prior_ndvi_source anchor missing');
  sel.jsCode = sel.jsCode.replace(priorAnchor, priorAnchor + `
    ndvi_cached: usableSeries(prior.ndvi_series_json),
    prior_elevation_start_m: num(prior.elevation_start_m),
    prior_elevation_end_m: num(prior.elevation_end_m),
    prior_elevation_hash: prior.elevation_hash || '',
    elev_cached: num(prior.elevation_start_m) !== null && num(prior.elevation_end_m) !== null && !!prior.elevation_hash,`);

  // 2. New Code nodes
  const at = (name, dx) => { const p = N(name).position; return [p[0] + dx, p[1] + 220]; };
  const code = (name, js, pos) => ({ parameters: { jsCode: js }, id: cryptoId(), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos });
  const needsNdvi = code('Needs live NDVI', `// Only segments without a usable cached NDVI series go to Copernicus. If none are missing, the first segment
// is still sent so the rest of W2 runs (a branch with no items stops in n8n).
const all = $input.all();
let need = all.map((it, i) => ({ json: it.json, pairedItem: { item: i } })).filter((x) => !x.json.ndvi_cached);
if (!need.length && all.length) need = [{ json: all[0].json, pairedItem: { item: 0 } }];
return need;`, at('Select Batch Segments', 128));
  const alignNdvi = code('Align NDVI', `// Puts the NDVI responses back in segment order, matched by segment_id. Segments that were not asked get
// ndvi_live: false, and Score Segments uses their cached series.
const segs = $('Select Batch Segments').all().map((i) => i.json);
const asked = $('Needs live NDVI').all().map((i) => i.json.segment_id);
const got = $input.all().map((i) => i.json);
if (got.length !== asked.length) throw new Error('Align NDVI: ' + asked.length + ' asked but ' + got.length + ' responses');
const bySeg = {};
asked.forEach((id, k) => { bySeg[id] = got[k]; });
return segs.map((s) => ({ json: bySeg[s.segment_id]
  ? Object.assign({}, bySeg[s.segment_id], { segment_id: s.segment_id, elevation_url: s.elevation_url, ndvi_live: true })
  : { segment_id: s.segment_id, elevation_url: s.elevation_url, ndvi_live: false } }));`, at('Hash NDVI', 128));
  const needsElev = code('Needs live elevation', `// Only segments without both cached end elevations go to Open-Meteo. If none are missing, the first segment
// is still sent so the rest of W2 runs.
const segs = $('Select Batch Segments').all().map((i) => i.json);
let need = segs.filter((s) => !s.elev_cached).map((s) => ({ json: { segment_id: s.segment_id, elevation_url: s.elevation_url } }));
if (!need.length && segs.length) need = [{ json: { segment_id: segs[0].segment_id, elevation_url: segs[0].elevation_url } }];
return need;`, at('Hash NDVI', 256));
  const alignElev = code('Align elevation', `// Puts the elevation responses back in segment order, matched by segment_id. Segments that were not asked
// carry their cached elevations (elev_live: false), which Score Segments uses.
const segs = $('Select Batch Segments').all().map((i) => i.json);
const asked = $('Needs live elevation').all().map((i) => i.json.segment_id);
const got = $input.all().map((i) => i.json);
if (got.length !== asked.length) throw new Error('Align elevation: ' + asked.length + ' asked but ' + got.length + ' responses');
const bySeg = {};
asked.forEach((id, k) => { bySeg[id] = got[k]; });
return segs.map((s) => ({ json: bySeg[s.segment_id]
  ? Object.assign({}, bySeg[s.segment_id], { segment_id: s.segment_id, elev_live: true })
  : { segment_id: s.segment_id, elev_live: false, prior_elevation: [s.prior_elevation_start_m, s.prior_elevation_end_m], prior_hash: s.prior_elevation_hash } }));`, at('Hash Elevation', 128));
  w.nodes.push(needsNdvi, alignNdvi, needsElev, alignElev);

  // 3. Fetch Elevation reads its URL from its own input now (its input is no longer paired with Select Batch Segments)
  N('Fetch Elevation').parameters.url = '={{ $json.elevation_url }}';

  // 4. Score Segments: aligned inputs, cached elevation, no "failed" source row for a skipped request
  const sc = N('Score Segments').parameters;
  const rep = (a, b) => { if (!sc.jsCode.includes(a)) throw new Error('Score Segments changed: missing ' + a.slice(0, 60)); sc.jsCode = sc.jsCode.replace(a, b); };
  rep("const ndviResp = $('Hash NDVI').all().map(i => i.json);", "const ndviResp = $('Align NDVI').all().map(i => i.json);");
  rep("const elevResp = $('Hash Elevation').all().map(i => i.json);", "const elevResp = $('Align elevation').all().map(i => i.json);");
  rep("  const e = parseRaw(elevResp[i]);\n  sourceRows.push(",
    "  const er = elevResp[i] || {};\n" +
    "  const elevCached = er.elev_live === false;\n" +
    "  // Skipped request: the cached elevations from the last verified run, with that run's hash.\n" +
    "  const e = elevCached ? { ok: true, cached: true, hash: er.prior_hash, json: { elevation: er.prior_elevation } } : parseRaw(er);\n" +
    "  if (!elevCached) sourceRows.push(");
  rep("  const n = parseRaw(ndviResp[i]);\n  sourceRows.push(",
    "  const ndviSkipped = (ndviResp[i] || {}).ndvi_live === false;\n" +
    "  // Skipped request: n is not ok, so the cached series below is used. No source row, since nothing was fetched.\n" +
    "  const n = ndviSkipped ? { ok: false, error: 'not requested: cached series reused' } : parseRaw(ndviResp[i]);\n" +
    "  if (!ndviSkipped) sourceRows.push(");

  // 5. Rewire: Select -> Needs live NDVI -> Fetch NDVI -> Hash NDVI -> Align NDVI -> Needs live elevation
  //            -> Fetch Elevation -> Hash Elevation -> Align elevation -> Get Cached Cells
  const link = (a, b) => { w.connections[a] = { main: [[{ node: b, type: 'main', index: 0 }]] }; };
  link('Select Batch Segments', 'Needs live NDVI');
  link('Needs live NDVI', 'Fetch Sentinel-2 NDVI');
  link('Hash NDVI', 'Align NDVI');
  link('Align NDVI', 'Needs live elevation');
  link('Needs live elevation', 'Fetch Elevation');
  link('Hash Elevation', 'Align elevation');
  link('Align elevation', 'Get Cached Cells');
  return { changed: true };
}
function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return require('crypto').randomUUID();
}

if (typeof module !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const file = process.argv[2];
  const w = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = patch(w);
  fs.writeFileSync(file, JSON.stringify(w, null, 2) + '\n');
  console.log(file + ': ' + JSON.stringify(r));
}
if (typeof module !== 'undefined') module.exports = { patch };
