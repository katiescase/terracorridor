# Coquihalla corridor: evidence, results and activation

This adds a separate BC screening corridor. Edmonton remains available and its cached climate, saved assessment, work orders and segment IDs are unchanged. The new build opens BC first; the **Corridor** selector switches between BC and Edmonton. `?corridor=ab-strathcona-demo` opens Edmonton directly.

## What is built and what has actually run

- **Prepared locally:** BC data collection, exported W2 scoring, the dashboard, offline assessment, manual seed, source integrity checks and automated/browser tests.
- **Not claimed:** a live n8n execution of the new BC seed, operator verification, field inspection, current pipe condition, failure probability, or a new deployment.
- BC can be explored immediately from the built file or hosted page as **Prepared assessment · local actions**. An API error, empty result or wrong corridor cannot turn the saved assessment into a claimed live connection. Local approvals never become email requests on reconnection.
- After the BC seed and updated API are imported, the page reads the stored BC rows from n8n. The metadata still explains that the assessment was computed using the exported W2 code and cached observations.

## Study extent and source selection

The study is 12 km along OpenStreetMap way **103560579**, version **23**, last edited **2025-02-27**. OSM tags it as an underground oil transmission pipeline named “Trans Mountain Pipeline System”; that is a mapping tag, not independent verification of operator ownership, surveyed alignment or current asset condition.

The selected geometry is along-way kilometres **12 through 24** of that way. This extent was fixed before downloading the BC climate cell or computing scores. Segment IDs start `bc_coq_` and are derived from geometry; none reuse Edmonton IDs. The raw mapped way, source API URL and response hash are retained under `data/corridors/bc-coquihalla/`.

Regional historical context:

- [Canada Energy Regulator, December 6, 2021](https://cer-rec.gc.ca/en/about/news-room/whats-new/2021/cer-response-to-bc-flooding-december-6-2021-update.html): phased restart after the BC floods, with no injuries or releases reported from CER-regulated infrastructure. This does not identify these exact mapped kilometres as damaged.
- [BC Highway 5 flood recovery](https://www2.gov.bc.ca/gov/content/transportation-projects/bc-highway-flood-recovery/2021-flood-road-recovery-projects-highway-5): regional flood/washout damage to highway infrastructure. Road damage is context, not evidence of pipeline failure.

The CER's interactive route map has redistribution restrictions; it was not copied into the dataset. Geometry comes from OSM.

## Measured inputs and limits

| Input | Actual source and treatment |
| --- | --- |
| Route and crossings | OpenStreetMap geometry and waterways, checked against all 12 segments. Four segments intersect the mapped Coquihalla River; 11 intersect some mapped waterway. Intersections are screening candidates, not surveyed crossing locations. |
| Climate | Open-Meteo archive 1995–2025 and three CMIP6 models, using W2's windows (now 2026–2030 and 2031–2035) and the delta method. All segment centres fall in **49.40_-121.30**, so the climate signal is shared. This does not provide kilometre-resolution wildfire forecasts. Source URLs and raw-response SHA-256 hashes are retained. |
| Vegetation | Reprocessed Sentinel-2 **Collection 1** from Element84 Earth Search: 10 m red/NIR plus 20 m scene classification. The lowest tile cloud-cover scene for each June/July/August was selected before evaluating NDVI. C1 queries returned no 2022 scenes for this tile. All 12 segments have observations in 2021, 2023, 2024 and 2025, meeting W2's minimum four seasons with at least two months each. |
| NDVI processing | C1 asset scale and offset applied once; SCL vegetation/bare classes 4/5 retained, clouds/shadows/water/snow excluded. Pixels 30–230 m from mapped line edges are sampled. At least 100 valid pixels and 60% valid coverage are required. Monthly means, coverage, acquisition IDs, asset checksums and raster-window hashes are retained. The older Sentinel-2 collection was avoided because of [documented offset inconsistencies](https://github.com/Element84/earth-search/issues/71). |
| NDVI interpretation | Irregular acquisition dates and the missing 2022 season limit the trend. Clearing, construction, maintenance and climate can change vegetation. A decline is not proof of ground movement. No Edmonton observations were copied into BC. |
| Terrain | [Copernicus GLO-30](https://registry.opendata.aws/copernicus-dem/) surface elevations at 11 points per kilometre. The original W2 endpoint-grade calculation is retained for scoring. Maximum sampled grade and relief are shown as supplementary evidence; they are not silently substituted into the scoring weights. This DEM includes surface vegetation/infrastructure and is not a survey of pipe depth or local slope failure. |
| River flow | GloFAS returned a point about **2.7 km** from the first river crossing. River identity was not verified, so its discharge was **excluded**, not treated as zero. W2's existing missing-flow weighting and disclosure are retained. |
| Solar | Actual NASA POWER climatology: **3.4891 kWh/m²/day** at the queried coarse cell. A 60 m total panel strip is used. Grid proximity and land rights are not established. This is an indicative screening layer, not build approval or promised revenue. |

No satellite scenes or terrain tiles need downloading for normal builds; reviewed records and measurements are cached. Contains modified Copernicus Sentinel data (2021, 2023–2025). Copernicus DEM accessed 2026-11-15 through the AWS Open Data Registry under its linked licence. © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). NASA POWER and Open-Meteo source URLs are stored with their inputs.

## Results with existing thresholds

> **Rescored 2026-11-15 on W2's current windows (2026-2030 and 2031-2035).** Climate cell 49.40_-121.30 was re-downloaded (v3 signature) and BC was rescored with W2's unchanged code and thresholds. Printed result: `BC tiers on the new windows: {"y5":{"amber":12},"y10":{"red":4,"amber":8}}`. The tier counts are the same as on the old windows; the scores behind them changed (below).

Thresholds and weights were not tuned to produce more red: Medium >=40, High >=65, full ground-climate factor at +50%.

| Assessment | BC (rescored) | Edmonton reference (old windows, refreshes when W2 runs) |
| --- | --- | --- |
| 2026–2030 (five-year) | 12 Medium | 3 Medium, 20 Low |
| 2031–2035 (ten-year) | **4 High, 8 Medium** | 1 Medium, 22 Low |

The four High BC segments are **river-crossing** priorities (Coquihalla River), now scoring **79** (67.6 on the old windows), with about **+27%** heavy-rain days (previously +15%). This is not four predicted failures. In the existing crossing formula, mapped river size supplies a substantial baseline contribution; missing discharge is excluded and the available terms are reweighted. The High result is a provisional screening priority, not evidence of increasing discharge or validation against the 2021 event.

The remaining BC priorities are the **wildfire-weather proxy**, roughly 56–57 at ten years: observed fire-weather days about 19.8/year and projected about 24.9/year (+26%) across the two models that report humidity. It is not the Canadian Fire Weather Index or an ignition probability. Ground failure is Low on 11 segments (roughly 26–39) and Medium-range on one (47), never the worst hazard, even where sampled terrain relief is substantial. A valley can have steep local terrain and a low net endpoint grade; that model limitation is visible in the reports.

The fresh 16-day forecast was checked with the actual exported WF3 selection/rule nodes: all 12 flagged BC segments were `clear`, maximum daily rain **15.6 mm**, and **zero work orders** were proposed. See `forecast-verification.json`. This was a read-only local execution, not proof of a live n8n trigger or Wait/resume path. Forecasts expire after 24 hours.

## One-time n8n activation

Do these after obtaining and reviewing this branch. Existing table IDs remain unchanged.

1. Ensure `corridor_climate_cells` has String columns `forecast_json`, `forecast_fetched_at`, `forecast_source_url` from the previous update.
2. Export a backup of the existing **TerraCorridor API - Dashboard feed**. Replace its canvas nodes with the updated `workflows/TerraCorridor API - Dashboard feed.json`, save and publish. It now has **12 nodes**, adding the source-manifest read.
3. Create a **new manual workflow** and import `workflows/TerraCorridor Seed - Coquihalla assessment.json`. It has **15 nodes**. Save and execute once; leave it unpublished.
4. Wait for all branches to finish green. It upserts only BC segments, baselines, predictions, build rows, configuration, source manifest and the BC climate cell. It never deletes or archives rows, changes Edmonton, sends mail, drafts work orders or calls another workflow. Repeating it updates the same BC keys.
5. Check the API with `GET /webhook/terracorridor/corridor?corridor=bc-coquihalla`: corridor ID `bc-coquihalla`, 12 verified segments, four High at ten years, real solar and C1 NDVI source. Check `?corridor=ab-strathcona-demo`: the 23-segment Edmonton corridor and its orders remain present.
6. Reload the dashboard and select each corridor. Before the BC seed/API update, BC deliberately uses the prepared/local-only mode; afterwards it reads stored n8n data.
7. WF3 can now select both corridors. Keep its existing **DRY_RUN=true** and cap of 3. Execute it once to verify real table/forecast wiring. No heavy weather is required or manufactured for the test.
8. W2's repository update preserves the cached NDVI source label. Import it into the existing W2 only if you need native BC rescoring. Its default weekly corridor remains Edmonton; this seed does not change that schedule. A native rescore can replace GLO-30 endpoint inputs with the live elevation provider; inspect provenance and numbers afterwards. For the pinned demonstration, rebuild from the reviewed cache and reseed instead.
9. Existing WF4/email workflows can receive a manager-requested inspection for a BC segment only when BC data loads from n8n. The prepared fallback never submits real actions. Test one approval and its email state separately if needed; do not treat the mocked browser approval as a live SMTP test.

## Deployment (GitHub Pages)

The build includes both saved assessments and inlined Leaflet. GitHub Pages publishes the **entire `deploy/` folder**, including `index.html` and `sw.js`, at https://katiescase.github.io/terracorridor/ whenever `deploy/` changes on `main` (`.github/workflows/pages.yml`). It opens BC by default; Edmonton is available in the selector and at `?corridor=ab-strathcona-demo`. Existing Edmonton deep links with only a hash still resolve to their Edmonton segment automatically.

Open online once, switch corridors, then disable the network and reload each URL. Basemap tiles need a network, but both routes, reports, CSV exports and clearly labelled local-only actions work from the cached app shell. A stale API returning Edmonton for a BC request is rejected.

## Rebuild and verify

```sh
npm ci
npm run verify-bc-inputs
npm run prepare-bc
npm run build
npm test
npm run validate -- --strict
npm run test:browser
npm run test:corridors
```

Current evidence: 53 tests pass; both browser suites pass; 11 top-level workflow exports validate. Browser coverage includes wrong-corridor rejection, prepared/live labels, legacy Edmonton links, isolated local state, confirmed BC action payloads through a mock endpoint, offline reload, mobile switching, and map layout with the hint dismissed. `CHROMIUM_PATH` can select a local browser; otherwise install Playwright Chromium with `npx playwright install chromium` on Windows.

## Refresh deliberately

- `npm run refresh-bc-weather`: fetch one real 16-day BC forecast, then rebuild the BC assessment/seed. Import and execute that updated seed. WF3 refuses expired or incomplete cached rain; expired weather does not invalidate the long-range climate assessment.
- Climate: `node scripts/fetch-climate-cells.js --corridor bc-coquihalla` uses the separate BC cache and skips existing v2 data. An intentional scientific refresh needs review of date/model configuration and the old cache; never copy cells between locations. Do not edit metrics to change map colours.
- Imagery, optional Python tools: install `scripts/bc-imagery-requirements.txt`, then run `python scripts/fetch-bc-imagery.py`. Existing cached months are reused; `--refresh` explicitly redownloads. The script preserves TLS verification, applies C1 scale/offset, masks quality classes, and leaves unavailable months missing. At least four growing seasons are required by preparation.
- Terrain: `python scripts/fetch-bc-terrain.py` resamples the public GLO-30 tile.
- Route: `npm run verify-bc-route` checks the reviewed OSM version without replacing geometry. The pinned selection must be reviewed again if the mapped way changes; there is no automatic rerouting of a live asset.
- After a deliberate source refresh, inspect the changed raw records and measurements. `npm run record-bc-inputs` records new integrity hashes; then `npm run prepare-bc`, build, test and reseed. Recording hashes is an explicit review step, not scientific validation.
- Commit changed inputs, generated assessments/seeds and the deploy output together. Do not run the generic `snapshot` command over the BC prepared assessment: it refreshes the separate Edmonton saved feed by default. BC is rebuilt with `prepare-bc`.

## Suggested demonstration

1. BC, 2026–30: 12 Medium; each hazard has real inputs or its limitation.
2. Switch to 2031–35: four river-crossing segments reach High. Open km 6–7 and show crossing score 79, ground score 38.6 and 12.7% net grade (check the maximum sampled grade on the page).
3. Explain the one shared climate cell and the missing discharge/2022 imagery. Historical floods motivate the geography; this model did not predict or reproduce that incident.
4. Switch to Edmonton: 23 preserved segments, mostly Low under identical thresholds.
5. Show the actual approval/CSV/email journey only in live n8n mode; use the prepared badge and offline state to demonstrate resilience separately.
