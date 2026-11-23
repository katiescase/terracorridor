// Checks scripts/ngtl-w2-cache.js on a copy of the NGTL W2 export: the new nodes run with n8n's globals mocked,
// skipped segments keep their cached values, and responses stay paired with the right segment.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { patch } = require('../scripts/ngtl-w2-cache.js');
const file = path.join(__dirname, '..', 'workflows', 'ngtl', 'NGTL · W2 - Long-Range Engine.json');

function load() { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function run(w, nodeName, nodes, input) {
  const js = w.nodes.find((n) => n.name === nodeName).parameters.jsCode;
  const wrap = (arr) => arr.map((j) => ({ json: j }));
  const $ = (name) => {
    if (!(name in nodes)) throw new Error('mock has no node ' + name);
    const items = wrap(nodes[name]);
    return { all: () => items, first: () => items[0] };
  };
  const $input = { all: () => wrap(input || []), first: () => wrap(input || [])[0] };
  return new Function('$', '$input', js)($, $input);
}

const series = JSON.stringify([2021, 2022, 2023, 2024].flatMap((y) => [6, 7].map((m) => ({ month: y + '-0' + m, mean: 0.6, valid_frac: 0.9 }))));
const seg = (k) => ({
  segment_id: 'seg_' + k, corridor_id: 'ngtl-ab-osm', segment_index: k, status: 'active', generated_at: '2026-11-22',
  lat_start: 54 + k / 100, lon_start: -113, lat_end: 54 + (k + 1) / 100, lon_end: -113, length_m: 1000, source_hash: 'h',
  polygon_geometry_json: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { zone: 'study_strip' }, geometry: { type: 'MultiPolygon', coordinates: [] } }] }),
});
const cfg = { corridor_id: 'ngtl-ab-osm', segment_ids: [], grid_cell_deg: 0.5, elevation_url: 'https://api.open-meteo.com/v1/elevation', ndvi_max_cloud: 60, ndvi_from: '2021-01-01', ndvi_to: '2026-01-01' };

test('patch adds the four nodes and rewires the chain', () => {
  const w = load();
  assert.deepStrictEqual(patch(w), { changed: true });
  assert.deepStrictEqual(patch(w), { changed: false, reason: 'already patched' });
  const next = (a) => w.connections[a].main[0][0].node;
  assert.strictEqual(next('Select Batch Segments'), 'Needs live NDVI');
  assert.strictEqual(next('Needs live NDVI'), 'Fetch Sentinel-2 NDVI');
  assert.strictEqual(next('Hash NDVI'), 'Align NDVI');
  assert.strictEqual(next('Align NDVI'), 'Needs live elevation');
  assert.strictEqual(next('Needs live elevation'), 'Fetch Elevation');
  assert.strictEqual(next('Hash Elevation'), 'Align elevation');
  assert.strictEqual(next('Align elevation'), 'Get Cached Cells');
  assert.strictEqual(w.nodes.find((n) => n.name === 'Fetch Elevation').parameters.url, '={{ $json.elevation_url }}');
  // Score Segments still compiles
  new Function('$', '$input', w.nodes.find((n) => n.name === 'Score Segments').parameters.jsCode);
});

test('only uncached segments are requested, and responses come back on the right segment', () => {
  const w = load(); patch(w);
  const segments = [seg(0), seg(1), seg(2)];
  // seg_0: cached NDVI and elevation; seg_1: cached elevation only; seg_2: nothing cached
  const prior = [
    { segment_id: 'seg_0', ndvi_series_json: series, ndvi_hash: 'n0', ndvi_source: 'cdse_live', elevation_start_m: 600, elevation_end_m: 610, elevation_hash: 'e0' },
    { segment_id: 'seg_1', ndvi_series_json: '', elevation_start_m: 620, elevation_end_m: 625, elevation_hash: 'e1' },
  ];
  const sel = run(w, 'Select Batch Segments', { 'W2 Config': [cfg], 'Get Segments': segments, 'Get Prior Baselines': prior }).map((i) => i.json);
  assert.deepStrictEqual(sel.map((s) => [s.ndvi_cached, s.elev_cached]), [[true, true], [false, true], [false, false]]);

  const needN = run(w, 'Needs live NDVI', {}, sel).map((i) => i.json.segment_id);
  assert.deepStrictEqual(needN, ['seg_1', 'seg_2']);
  const ndviResponses = [{ data: '{"for":"seg_1"}', raw_hash: 'r1' }, { data: '{"for":"seg_2"}', raw_hash: 'r2' }];
  const alignN = run(w, 'Align NDVI', { 'Select Batch Segments': sel, 'Needs live NDVI': needN.map((id) => ({ segment_id: id })) }, ndviResponses).map((i) => i.json);
  assert.deepStrictEqual(alignN.map((x) => [x.segment_id, x.ndvi_live, x.data || null]), [['seg_0', false, null], ['seg_1', true, '{"for":"seg_1"}'], ['seg_2', true, '{"for":"seg_2"}']]);

  const needE = run(w, 'Needs live elevation', { 'Select Batch Segments': sel }, alignN).map((i) => i.json);
  assert.deepStrictEqual(needE.map((x) => x.segment_id), ['seg_2']);
  assert.ok(needE[0].elevation_url.startsWith('https://api.open-meteo.com/v1/elevation?latitude='));
  const alignE = run(w, 'Align elevation', { 'Select Batch Segments': sel, 'Needs live elevation': needE }, [{ data: '{"elevation":[630,640]}', raw_hash: 'r3' }]).map((i) => i.json);
  assert.deepStrictEqual(alignE.map((x) => [x.segment_id, x.elev_live]), [['seg_0', false], ['seg_1', false], ['seg_2', true]]);
  assert.deepStrictEqual(alignE[0].prior_elevation, [600, 610]);
  assert.strictEqual(alignE[0].prior_hash, 'e0');
});

test('with everything cached, one segment is still sent so the chain runs', () => {
  const w = load(); patch(w);
  const prior = [0, 1].map((k) => ({ segment_id: 'seg_' + k, ndvi_series_json: series, elevation_start_m: 1, elevation_end_m: 2, elevation_hash: 'e' }));
  const sel = run(w, 'Select Batch Segments', { 'W2 Config': [cfg], 'Get Segments': [seg(0), seg(1)], 'Get Prior Baselines': prior }).map((i) => i.json);
  assert.deepStrictEqual(run(w, 'Needs live NDVI', {}, sel).map((i) => i.json.segment_id), ['seg_0']);
  assert.deepStrictEqual(run(w, 'Needs live elevation', { 'Select Batch Segments': sel }, []).map((i) => i.json.segment_id), ['seg_0']);
});

test('a broken or short cached series is not reused', () => {
  const w = load(); patch(w);
  const short = JSON.stringify([{ month: '2024-06', mean: 0.5 }, { month: '2024-07', mean: 0.5 }]);
  const prior = [{ segment_id: 'seg_0', ndvi_series_json: short }, { segment_id: 'seg_1', ndvi_series_json: '{not json' }];
  const sel = run(w, 'Select Batch Segments', { 'W2 Config': [cfg], 'Get Segments': [seg(0), seg(1)], 'Get Prior Baselines': prior }).map((i) => i.json);
  assert.deepStrictEqual(sel.map((s) => s.ndvi_cached), [false, false]);
});
