#!/usr/bin/env node
// TerraCorridor: find where the pipeline centreline crosses a mapped waterway, from YOUR computer.
// Overpass and Open-Meteo both refuse n8n Cloud's shared IP, so this runs on a laptop like fetch-climate-cells.js.
//   1. reads the segments from the dashboard feed (GET {API}/corridor) or a saved copy of it
//   2. downloads OpenStreetMap waterways (river, stream, canal, drain) inside the route's bounding box
//   3. intersects them with each segment centreline using the engine's own findCrossings()
//   4. for rivers, asks the Open-Meteo Flood API (GloFAS) for 1995-2025 daily discharge and keeps the mean annual peak
// Output: data/cache/crossings/<corridor>-crossings.json. EVERY segment gets an entry: [] means "checked, none mapped".
// W2 reads this from corridor_baselines.crossings_json. A segment with no entry stays "not checked", never "no crossing".
// Usage: node scripts/fetch-crossings.js https://YOUR-INSTANCE.app.n8n.cloud/webhook/terracorridor
//        node scripts/fetch-crossings.js path/to/corridor.json
//        node scripts/fetch-crossings.js <API or file> data/ngtl/crossings.json   (second argument: where to write)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ENGINE = require('../src/engine.js');

const src = process.argv[2];
if (!src) { console.error('Give the API base URL or a saved corridor JSON file.'); process.exit(1); }
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const corridor = /^https?:/.test(src) ? await (await fetch(src.replace(/\/$/, '') + '/corridor')).json() : JSON.parse(fs.readFileSync(src, 'utf8'));
  const segs = corridor.segments.filter((s) => Array.isArray(s.centreline) && s.centreline.length >= 2);
  const pts = segs.flatMap((s) => s.centreline);
  const pad = 0.005;
  const bbox = [Math.min(...pts.map((p) => p[1])) - pad, Math.min(...pts.map((p) => p[0])) - pad, Math.max(...pts.map((p) => p[1])) + pad, Math.max(...pts.map((p) => p[0])) + pad].map((v) => v.toFixed(4));
  const query = `[out:json][timeout:60];way["waterway"~"^(river|stream|canal|drain)$"](${bbox.join(',')});out geom;`;
  let buf = null, osm = null, lastErr = '';
  for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    for (let attempt = 0; attempt < 2 && !osm; attempt++) {
      try {
        const res = await fetch(host, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'TerraCorridor-laptop-seed/1.0' }, body: 'data=' + encodeURIComponent(query) });
        buf = Buffer.from(await res.arrayBuffer());
        const j = JSON.parse(buf.toString('utf8'));
        if (!Array.isArray(j.elements)) throw new Error('no elements array (HTTP ' + res.status + ')');
        osm = j;
      } catch (e) { lastErr = host + ': ' + String(e.message || e).slice(0, 100); await sleep(4000); }
    }
    if (osm) break;
  }
  if (!osm) throw new Error('Overpass unavailable, nothing written (' + lastErr + ')');
  const waterways = osm.elements.filter((e) => e.geometry && e.tags && e.tags.waterway)
    .map((e) => ({ name: e.tags.name || null, kind: e.tags.waterway, osmWayId: e.id, coords: e.geometry.map((g) => [g.lon, g.lat]) }));
  const hits = ENGINE.findCrossings(segs.map((s) => ({ id: s.id, centreline: s.centreline })), waterways);

  // One crossing per named waterway per segment (OSM splits rivers into many ways).
  const out = {};
  let flowStatus = 'not requested: no river crossing';
  for (const s of segs) {
    const seen = new Set(), list = [];
    for (const x of hits[s.id] || []) { const k = (x.name || '') + '|' + x.kind; if (seen.has(k)) continue; seen.add(k); list.push({ name: x.name, kind: x.kind, at: x.at, peakFlowM3s: null }); }
    out[s.id] = list;
  }
  // River flow. GloFAS cells are about 5 km (0.05 degree) and the cell nearest a crossing is often a bank or side
  // channel: on NGTL the nearest cell gave the Athabasca 0.2 m3/s and the North Saskatchewan 6.2 m3/s. So each river
  // crossing looks at the 3x3 block of cells around it (about 5 km either way) and takes the largest mean annual peak.
  // When two crossings land on the same largest cell (a tributary meeting the main river), the main river gets it:
  // the crossing whose named waterway is longest in the bounding box. The other keeps its nearest-cell value.
  const STEP = 0.05;
  const lenKm = {};
  for (const w of waterways) if (w.name) { let d = 0; for (let i = 1; i < w.coords.length; i++) d += ENGINE.haversine(w.coords[i - 1], w.coords[i]); lenKm[w.name] = (lenKm[w.name] || 0) + d / 1000; }
  const rivers = [];
  for (const id of Object.keys(out)) for (const x of out[id]) if (x.kind === 'river') rivers.push(x);
  for (const x of rivers) {
    try {
      const pts = [];
      for (const dy of [0, -STEP, STEP]) for (const dx of [0, -STEP, STEP]) pts.push([+(x.at[1] + dy).toFixed(4), +(x.at[0] + dx).toFixed(4)]);
      const u = 'https://flood-api.open-meteo.com/v1/flood?latitude=' + pts.map((p) => p[0]).join(',') + '&longitude=' + pts.map((p) => p[1]).join(',') + '&daily=river_discharge&start_date=1995-01-01&end_date=2025-12-31';
      let j = null;
      for (let attempt = 1; attempt <= 4 && !j; attempt++) {
        const r = await (await fetch(u, { headers: { 'User-Agent': 'TerraCorridor-laptop-seed/1.0' } })).json();
        if (r && r.error) { if (/limit/i.test(r.reason || '') && attempt < 4) { console.log('  flood API: ' + r.reason + ' waiting 65s'); await sleep(65000); continue; } throw new Error(r.reason); }
        j = r;
      }
      const cells = (Array.isArray(j) ? j : [j]).map((c) => ({ lat: c.latitude, lon: c.longitude, peak: ENGINE.peakFlow(c.daily) }));
      const best = cells.filter((c) => c.peak != null).sort((a, b) => b.peak - a.peak)[0] || null;
      x._nearest = cells[0] ? cells[0].peak : null;
      x._best = best;
      flowStatus = 'ok';
      await sleep(1500);
    } catch (e) { flowStatus = 'unavailable: ' + String(e.message || e).slice(0, 120); }
  }
  const byCell = {};
  for (const x of rivers) if (x._best) (byCell[x._best.lat + '_' + x._best.lon] ||= []).push(x);
  for (const group of Object.values(byCell)) {
    group.sort((a, b) => (lenKm[b.name] || 0) - (lenKm[a.name] || 0));
    group.forEach((x, i) => {
      if (i === 0) { x.peakFlowM3s = x._best.peak; x.flowSource = 'Open-Meteo Flood API (GloFAS), mean annual peak 1995-2025, largest of the 3x3 5 km cells around the crossing (nearest cell: ' + x._nearest + ' m3/s)'; }
      else { x.peakFlowM3s = x._nearest; x.flowSource = 'Open-Meteo Flood API (GloFAS), mean annual peak 1995-2025, nearest 5 km cell (the larger cell nearby belongs to ' + group[0].name + ')'; }
    });
  }
  for (const x of rivers) { delete x._nearest; delete x._best; }
  const name = (corridor.meta && corridor.meta.corridorId) || 'corridor';
  const file = process.argv[3] ? path.resolve(process.argv[3]) : path.join(__dirname, '..', 'data', 'cache', 'crossings', name + '-crossings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const withX = Object.values(out).filter((l) => l.length).length;
  fs.writeFileSync(file, JSON.stringify({
    corridor_id: name, fetched_at: new Date().toISOString(), source: 'OpenStreetMap waterways via Overpass API',
    osm_timestamp: (osm.osm3s && osm.osm3s.timestamp_osm_base) || null, overpass_query: query, overpass_sha256: sha256(buf),
    waterways_in_bbox: waterways.length, segments_checked: segs.length, segments_with_crossing: withX, river_flow: flowStatus,
    segments: out,
  }, null, 1) + '\n');
  console.log(`${segs.length} segments checked against ${waterways.length} mapped waterways: ${withX} segment(s) with a crossing. River flow: ${flowStatus}`);
  for (const [id, l] of Object.entries(out)) if (l.length) console.log('  ' + id + ': ' + l.map((x) => (x.name || 'unnamed') + ' (' + x.kind + (x.peakFlowM3s != null ? ', peak ' + x.peakFlowM3s + ' m3/s' : '') + ')').join('; '));
  console.log('Wrote ' + path.relative(process.cwd(), file));
}
main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
