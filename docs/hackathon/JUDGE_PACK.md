# TerraCorridor judge pack

Audit and verification of Sun Nov 15 2026, about 1:00 AM PT. Everything here was checked against the repo at `main` and the live n8n instance `chlooood.app.n8n.cloud`. Where something was not checked, it says so.

## Decision: GO WITH DISCLOSURES

The core journey runs end to end on real cached data, the scoring is consistent across the engine, the API and n8n, and the page tells the truth about what an approval does. Three things to disclose or fix before recording:

1. **Use the right link.** The site is now on GitHub Pages: https://katiescase.github.io/terracorridor/ (Ground dashboard at `index.html`, Class changes at `platform.html`), published from `deploy/` by `.github/workflows/pages.yml`. Both Netlify sites used for this Nov 15 audit (`hilarious-truffle-59e8b1`, `snazzy-profiterole-8a4e56`) have been deleted; do not submit either.
2. **Wildfire and drought have scores on 1 of 23 segments.** Three of the four climate cells were cached before humidity was added, and Open-Meteo's free daily limit ran out. Those rows say why. `docs/HAZARD_DATA.md` is the 5-minute fix from another network.
3. **The Build (solar) tab is empty on the live corridor.** W5 has not written `corridor_build`, so there is no irradiance. Show solar on the synthetic demo file only, and say it is a screening layer.

## 1. Audit table

| # | Issue | Severity | Where | Status | Fix |
|---|---|---|---|---|---|
| A | Wildfire, drought and crossing rows empty: W2 scored ground failure only and stored no per-hazard data | Demo blocker | W2 `Score Segments`, `Condense Archive`, `Condense Climate`, `Plan Grid Cells`; `src/dashboard-api.js`; `web/dashboard.html` `hazardsHTML` | FIXED, verified live | W2 scores four hazards into `corridor_predictions.hazards_json`; feed maps them; rows show a score or a reason. 23 of 23 segments have crossing evidence; 1 has humidity |
| B | All 23 segments green at 5 years, red at 10 | Demo blocker | Live W2 Config: `ratio_full_score_increase` 0.15, `red_above` 50; engine red 65; API red 50; W2 `tierOf` used `>` | FIXED, verified live | One mapping everywhere: full at +50%, amber 40, red 65 inclusive. Live result: 1 Medium, 22 Low at 2036. `docs/THRESHOLDS.md` |
| B2 | WF3 sent every red segment to WF4: about 23 drafts on this corridor | Demo blocker | WF3 `Apply escalation rules` | FIXED, imported, not exercised live | Long-range tier never drafts. Near-term heavy weather on flagged ground proposes one. `DRY_RUN = true`, `MAX_DRAFTS_PER_RUN = 3`, logged as `escalation_preview` |
| C | Approve returned 404 unless WF3 had drafted an order; UI said "Work order sent" and "send a crew" either way | Demo blocker | WF4 `Pending order found?`; `web/dashboard.html` `decide`, `act`, `DELIVERY`, `renderLog` | FIXED, verified live (API call) | WF4 records a manager-requested order as approved, deduped. UI says "Approve inspection", confirms only after n8n answers, and names the table and the next step |
| D | Money page headline added speculative solar lease to the protection case; $430k labelled "PHMSA" | Credibility | `web/dashboard.html` `renderMoney` | FIXED in source and build | "What this run measured" block, protection scenario on its own at low, mid and high failure cost, solar in a separate conditional section, $430k labelled as a water-main figure |
| E | `workflows/wiring.json` had null IDs for 6 tables and WF4 | Credibility | `workflows/wiring.json` | FIXED | All 11 tables exist live; IDs filled in |
| F | Horizon labels said 2026-2031 and 2026-2036; W2 averages 2026-2030 and 2026-2035 | Credibility | `src/dashboard-api.js` config, dashboard timeline | FIXED | Feed reports the real windows; the card explains the overlap |
| G | JS error on the live page: `updateAnnotations` read a missing midpoint | Credibility | `web/dashboard.html` | FIXED in source and build | Falls back to the centreline midpoint |
| H | README said "169 km" and described email or Slack delivery | Credibility | `README.md`, `docs/` | FIXED | Rewritten to match what is built |
| I | No fallback when n8n is down; map library loaded from a CDN | Demo blocker for offline | `scripts/build.js`, `web/dashboard.html` boot | FIXED, tested with the network off | Built-in snapshot of a real run, "Offline snapshot" badge, Leaflet inlined |
| J | Solar strip: engine 60 m, W5 200 m | Credibility | `docs/BACKEND_NOTES.md` | STILL OPEN, harmless today | `corridor_build` is empty live, so only the engine's 60 m figures can appear. Do not quote W5 numbers |
| K | Solar MWh units | Checked | `src/engine.js` `buildScore` | PASS | MW x kWh/m2/day x 365 x performance ratio is the peak-sun-hours method. Labelled indicative |
| L | 3 stale work orders for a segment of the old route; one still waiting | Nice to have | Live `corridor_work_orders`, WF4 execution 55 | DIFFERENT IN DEPLOYMENT | Ignored by the feed. Not deleted (owner's call) |
| M | Live W5 differs from the repo export | Nice to have | Live W5 Code nodes | DIFFERENT IN DEPLOYMENT | Teammate's newer edits. Not touched |

Critical journeys:

| Journey | Result | Evidence |
|---|---|---|
| Data to ranked segments with reasons | PASS, live | W2 execution 81; feed `segmentsVerified: 23`, `hazardsScored: ground, crossing, wildfire, drought` |
| Flagged segment to recorded work order | PASS, live | `POST /webhook/terracorridor/action` returned 200 and `WO-seg_6d571cf3a55233b2-MWHJKNED` |
| Duplicate approval suppressed | PASS, live | Second identical POST returned the same ID, `duplicate: true` |
| Refused action logged | PASS, live | Unknown action returned 400 with the allowed list |
| Work order visible on the Work orders page | PASS, live | Deployed page lists `WO-seg_6d571cf3a55233b2-MWHJKNED` as "Approved · recorded in n8n · awaiting CSV export". The CSV button was exercised offline only |
| Approve button clicked on the deployed page | UNVERIFIED | The test order was sent with the same payload by API call, not by clicking, to keep a fresh segment for the recording |
| WF3 dry run against a real forecast | UNVERIFIED | Not executed. Open-Meteo refuses n8n Cloud, so it would log "unverified" |
| WF4 Wait and resume path (WF3 draft, then approve) | UNVERIFIED after import | Worked before the import (audit rows of 06:05 to 06:44 UTC). Code unchanged |
| AI explanation for a flagged segment | PASS, live | Gemini text on km 0 to 1 restates the stored numbers |

## 2. What changed

Code: `src/engine.js` (ratioFull), `src/dashboard-api.js` (hazards, tiers, windows, work-order fields), `web/dashboard.html` (hazard rows, horizon note, approval wording, Money page, offline boot), `scripts/build.js` (inline Leaflet, snapshot, deploy page), new `scripts/fetch-crossings.js`, `scripts/make-seed-workflow.js`, `scripts/make-snapshot.js`, reworked `scripts/fetch-climate-cells.js`.

Workflows: W2 (6 nodes), WF3 (1 Code node, 1 switch rule, 1 log node), WF4 (1 Code node changed, 7 nodes added), API feed (regenerated), new seed workflow.

Live n8n: 4 columns added through the API by Claude. Workflows imported and published by the owner from the GitHub URLs. Seed workflow and W2 executed by the owner. One work order created by Claude's test call. Nothing deleted.

## 3. Tests

```
npm test            43 pass, 0 fail
npm run build       ok
npm run validate    7 workflows ok, no errors
```

The tests run the real Code-node JavaScript from the exports with n8n's globals mocked. They prove the logic and the data contracts. They do not prove triggers, credentials, table types or webhooks in n8n; the live checks above cover what was exercised.

Still needs a manual n8n test: a WF3 run with a reachable forecast, and one WF3-drafted order taken through the Wait node.

## 4. The 90-second demo path

Data labels: route is a real OpenStreetMap pipeline way (cached); weather history and CMIP6 are real Open-Meteo data cached per 10 km cell; NDVI and elevation are live calls; crossings are real OSM waterways. Nothing in this path is synthetic.

1. **0:00** Open the deployed page at `#/`. Badge reads "Live from n8n". "This is 22 km of a real mapped pipeline near Edmonton. n8n scored every kilometre on four natural hazards."
2. **0:10** Press Play on the timeline. Today, 2031, 2036. "These are climate-frequency projections for planning, not forecasts. Nothing turns red here, and that is the honest answer for flat ground."
3. **0:25** Open Triage. Top row: km 0 to 1, Medium, 40.6. Click it. "It crosses a mapped stream, and heavy-rain days rise 21% in this cell. Four hazard rows: each has a score or says why it has none."
4. **0:45** Press **Approve inspection**. Wait for the toast: "Recorded in n8n: WO-... approved. Not dispatched." "The integrity manager decides. n8n stores the order and the decision."
5. **1:00** Open Work orders. Show the row, then **Download work orders (CSV)**. "The inspection coordinator imports this into their maintenance system. We do not claim SAP or a crew dispatch."
6. **1:15** Open Money. "What this run measured: 22.0 km assessed, 1 segment at or above Medium, first review list cut from 23 to 3. The dollar scenario is negative on a corridor this short and we show that."
7. **1:25** Switch off Wi-Fi and reload. Badge reads "Offline snapshot". "Same real data from a saved run. Approvals stay in the browser and the page says so."

Because the test order for km 0 to 1 already exists, step 4 will answer "already on file, no duplicate created" for that segment. For a fresh order in the recording, approve km 8 to 9 (score 38, vegetation loss) instead.

Quantifiable result to state: **22.0 km assessed, 23 of 23 segments verified, 6 stream crossings found, 1 segment flagged Medium, first review list 23 to 3, 1 inspection approved and recorded.**

## 5. Judge Q&A

1. **Who uses and pays for this?** The integrity or geohazard team at a pipeline operator; the inspection coordinator is the second user. Any per-kilometre price is hypothetical and is not a customer saving.
2. **What decision improves?** Which kilometres get field attention first. On the live corridor the ranking puts a stream crossing and a stretch losing vegetation at the top, each with its evidence.
3. **Why is that a real problem?** Geohazard failures are rare and expensive, and inspection time is finite. In the 2020 Hillsboro, Kentucky rupture the operator had found the landslide and planned the fix; the slope failed first. We do not claim operators only inspect on fixed cycles.
4. **What happens on approval?** WF4 writes a row to the `corridor_work_orders` Data table with status `approved` and a row to `corridor_audit`. The Work orders page shows it and exports CSV for the coordinator. External delivery is off: no email, no Slack, no crew.
5. **How do you know it helps?** We show what the run measured: 22.0 km, 23 segments verified, 6 crossings, 1 flagged, a first review list of 3. We do not claim avoided failures or measured labour savings.
6. **Where do probability and money come from?** Annual failure chance per km = assumed base rate (5 in 100,000) times a multiplier from 0.5 to 10 that grows with the square of the score. Expected loss = chance over the horizon times an assumed failure cost. A targeted inspection is assumed to avoid 75% of it. The score is a priority index, not a validated probability.
7. **Why does the money case come out negative?** On 22 km the assumed $50k a year program costs more than the expected loss it avoids: about $433k short over 10 years at $430k per failure. One avoided failure pays for 8.6 years. We left it negative.
8. **What is autonomous and what is human?** Automated: data pulls, scoring, the AI explanation, and WF3's proposals (dry run). Human: every approval, rejection and override, with a reason required for overrides.
9. **What is real?** Real and cached: OSM route, Open-Meteo history and CMIP6 per 10 km cell, OSM waterways. Live calls: Sentinel-2 NDVI, elevation, Gemini. Synthetic: only `dist/dashboard-demo.html`, which is labelled. Assumptions: every Money slider, the weights and the thresholds.
10. **Is the map accurate per kilometre?** The climate inputs are on a 10 km grid, so the 23 segments share 4 cells. Slope, vegetation and crossings are what differ per kilometre, and the page says so.
11. **Does the operator own the solar land?** Not necessarily. Solar is a screening layer that depends on land rights, interconnection, permits and a contract, and it is never counted in the protection result.
12. **What breaks in the demo?** Open-Meteo and Overpass refuse n8n Cloud, so climate cells and crossings come from a laptop cache, and WF3's forecast would log "unverified". If n8n is unreachable the page switches to its built-in snapshot and says so.

## 6. What we did not build and will not claim

- No email, Slack, SAP or Maximo delivery. No crew dispatch. An approved order is a table row and a CSV.
- No validated failure probability, no failures prevented, no measured savings, no regulatory compliance, no deployment with an operator.
- No relationship with Trans-Northern or any operator. The name is an OpenStreetMap tag we did not verify.
- No Canadian Fire Weather Index and no drought index. Wildfire weather is a hot, dry, rainless day count; drought is dry-soil days and dry spells.
- No river-flow projection. Crossings use historical flow where there is a river (none on this corridor) and projected heavy rain.
- No trained model in production. Scores are weighted rules with provisional thresholds.
- No solar revenue. Screening only.
- WF3 is published in dry run. It drafts nothing.

## 7. Evidence

- **Deployed UI, before:** `hilarious-truffle-59e8b1.netlify.app/#/triage/seg_845aa328f339f748` in the browser pane (Netlify site, since deleted; the site is now on GitHub Pages). 23 of 23 segments High at 2036, all "heavy rain +15%", hazard rows "no data", a console error in `updateAnnotations`.
- **Deployed UI, after (same site, new build):** badge "Live from n8n", run 07:55 UTC. Today, 2031 and 2036 each show 1 Medium and 22 Low. km 0 to 1 shows four scored hazard rows (ground 31, crossing 41, wildfire 27, drought 0), the Gemini explanation and the horizon note. A segment in an older cache cell shows ground and crossing scores and "unavailable" with the reason for the other two. Overview, Triage, Money, Build and Work orders opened with no new page errors. Build shows 0 MW (no irradiance). The Work orders audit list is empty in live mode because the feed does not serve `corridor_audit`.
- **Offline:** the built page was run in headless Chrome with the network off: "Offline snapshot" badge, 23 segments, local-only approval wording, no errors.
- **snazzy-profiterole-8a4e56.netlify.app:** HTTP 401, password wall. Not viewed. (Since deleted.)
- **n8n, read through the owner's signed-in session:** 9 workflows, 11 Data tables. Published: API feed, WF4, WF3, W2. Unpublished: W1, W5, both seed workflows. One archived older WF4.
- **Executions:** 80 (Seed, success), 81 (W2, success, 31 s), 79 (WF4 webhook, the refused test action).
- **Table records:** `corridor_predictions` 46 rows rescored at 07:55 UTC; `corridor_baselines` 23 rows with `crossings_json`; `corridor_climate_cells` 6 rows (1 with humidity); `corridor_work_orders` +1 (`WO-seg_6d571cf3a55233b2-MWHJKNED`); `corridor_audit` +3.
- **Limits hit:** Open-Meteo hourly and daily request limits (one of four cells refetched). A safety check stopped Claude from overwriting live workflows, so the owner imported them.
