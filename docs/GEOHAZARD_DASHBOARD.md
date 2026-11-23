# Geohazard dashboard (the original build)

This is the README of the hackathon build. It is now the geohazard module of the platform. The Money and solar pages it describes are no longer in the navigation.

BC comparison corridor: [evidence, results and activation](BC_CORRIDOR.md). The new build includes Coquihalla and preserves Edmonton in the corridor selector. BC preparation and testing are complete locally; live imports/deployment are separate.

A climate-resilience and cost-prioritization tool for oil and gas pipeline operators. Built for the UBC eProjects x n8n LOOP buildathon.

**Who it is for:** the integrity or geohazard manager at a pipeline operator, and the field inspection coordinator who schedules the visits. **The decision it changes:** which kilometres get field attention first when the inspection budget is fixed.

n8n pulls 30 years of weather history, CMIP6 climate projections through 2035 and Sentinel-2 vegetation data for each kilometre of a pipeline right-of-way, scores four natural hazards, and ranks the segments with the evidence behind each score. The manager approves an inspection, n8n records the work order and the decision, and the coordinator exports it as CSV. Stable land beside the line is screened for solar as a separate, conditional opportunity.

Three things it does, in order of importance:
1. **Climate resilience.** Which segments are more exposed to ground failure, stream and river crossings, wildfire weather and drought, today and under 5 and 10 year climate projections.
2. **Cost prioritization.** A ranked shortlist for a limited inspection budget, with scenario maths for expected loss. Scenarios, not measured savings.
3. **Conditional solar screening.** Never counted in the pipeline-protection case.

**AI explains. Rules (or a small, visible learned model) decide. People approve.**

## Problem

Weather-driven ground failures are rare but expensive, and operators often see them too late. In the 2020 Hillsboro, Kentucky rupture, the operator had already found the landslide and planned to fix it that summer; the slope failed first. Meanwhile most corridor land earns nothing beyond the lease.

## What it does

1. **Predict (5 and 10 years).** For each 1 km segment: observed baseline from the Open-Meteo archive (1995 to 2025), three CMIP6 models (MRI, EC-Earth, MPI) averaged over two separate five-year windows (2026 to 2030 and 2031 to 2035), compared with each model's own history (delta method). Four natural hazards, each scored 0 to 100 on its own; a segment's level is its worst one (never a blend):
   - **Ground failure:** extreme-rain, freeze-thaw and wet-soil days vs baseline, Sentinel-2 NDVI trend, slope.
   - **River crossing:** only where the pipe crosses a mapped river, stream or canal (OpenStreetMap): waterway size, historical peak flow (Open-Meteo Flood API, GloFAS) and projected heavy-rain change.
   - **Wildfire weather:** change in fire-weather days (no rain, 25 °C or hotter, minimum humidity 35% or lower; two of the three models report humidity), how many there will be, and vegetation fuel.
   - **Drought:** change in dry-soil days (below the baseline's 10th percentile) and in each year's longest dry spell.

   Tier and model agreement per segment. Missing data means "unverified", never green; no crossing means "not applicable", never low.
2. **Measure and price it.** The Money page first shows what the run measured (kilometres assessed, segments flagged, the size of the first review list). Then a scenario: expected loss per segment from an assumed base failure rate scaled by the score, the share a targeted inspection avoids, and the program cost, at a low, mid and high failure cost. It says plainly when the protection case is not positive. Every assumption is on a slider. The 0-100 score is a priority index, not a failure probability.
3. **Build layer (conditional).** Screens a narrow panel strip (default 60 m total) outside the 30 m CER prescribed area for solar plus storage: MW, indicative MWh, a hypothetical lease and the landowner partner's share. It depends on land rights, interconnection, permits and a commercial agreement, and is kept out of the protection result.
4. **Humans in charge.** The integrity manager approves a kilometre. n8n (WF4) records the work order in the `corridor_work_orders` Data table with status `approved`, plus the decision in `corridor_audit`: work order id, segment, score, tier, worst hazard, checklist, due date and map link. The Work orders page lists it and exports CSV for the inspection coordinator to load into the maintenance system. There is no email, Slack, SAP or Maximo delivery and no crew dispatch in this MVP, and the page says so. Overrides need a reason. Long-range tiers never create work orders on their own; WF3 only proposes one when heavy weather is forecast on flagged ground, and ships in dry-run with a cap of 3.

5. **Works without n8n.** If the webhook cannot be reached, the deployed page loads a saved copy of a real n8n run, shows an "Offline snapshot" badge, and keeps approvals in the browser, labelled as a local demo. `dist/dashboard-demo.html` is a separate, synthetic corridor that needs no network at all.

## Honest numbers (live corridor, n8n run of Nov 15 2026)

Measured by the run: 22.0 km in 23 segments, all verified. Six segments cross a mapped stream. At the 2036 view one segment is Medium (km 0 to 1, a stream crossing with heavy-rain days +21%, score 40.6) and 22 are Low; ground-failure scores run 23 to 38. No segment is High. The first review list is 3 segments instead of 23. Wildfire and drought are scored on the one climate cell cached with humidity; the other three cells say they need a refetch (`HAZARD_DATA.md`).

Scenario, not a measurement: at $430k per failure and a $50k a year program, pipeline protection on this 22 km is about $433k short over 10 years, and still about $424k short at $11.7M. One avoided failure would pay for 8.6 years. We show the negative number. The value on a low-hazard corridor is the ranked, explained shortlist.

An earlier live configuration made every segment High at 10 years. That was a scale set too tight, not a finding. See `THRESHOLDS.md`.

The solar layer has no live numbers yet (W5 has not run on this corridor); it appears with figures only in the synthetic demo file.

## Repo layout

```
src/engine.js            The whole engine: segmenting, baselines, projections, NDVI trend, risk, build, money. Pure JS.
test/                    Engine tests, dashboard feed tests, and tests that run the real Code-node JS from workflows/: npm test
scripts/make-demo.js     Synthetic demo corridor run through the real engine -> data/demo/corridor.json
scripts/build.js         Inlines the engine into dist/dashboard*.html and dist/n8n/*.js (Code node bodies)
scripts/make-workflow.js Generates the old single workflow, now in workflows/legacy/ (reference only)
scripts/make-api-workflow.js  Generates the dashboard feed workflow from src/dashboard-api.js
scripts/wire-workflows.js     Points every workflow at your n8n Data tables by name (workflows/wiring.json)
scripts/validate-workflows.js Checks every workflow export before import
scripts/fetch-climate-cells.js Laptop script that fills the weather cache when n8n Cloud is blocked by Open-Meteo
scripts/fetch-crossings.js    Laptop script: OSM waterways crossed by each segment -> data/cache/crossings/
scripts/make-snapshot.js      Saves the live feed as the offline snapshot built into dist/dashboard.html and deploy/index.html
deploy/index.html        The page GitHub Pages serves: dist/dashboard.html with this team's n8n webhook as default (built by npm run build)
web/vendor/              Leaflet 1.9.4, inlined at build time so the page works offline
src/dashboard-api.js     Builds the dashboard JSON from the Data tables (the API workflow's Code node)
workflows/               The n8n exports W1 to W5 plus the API workflow. See workflows/README.md
web/dashboard.html       Dashboard source (Leaflet + Esri imagery)
dist/                    Built files. dashboard-demo.html opens in any browser with demo data
ml/features.js           Builds training data from PHMSA accidents + Open-Meteo history
ml/train.py              Logistic regression -> ml/model.json (paste into 05-score.js MODEL)
data/cache/              Real API responses saved for demo fallback
docs/                    Disclosures, tier mapping (THRESHOLDS.md), hackathon-era notes and judge pack (docs/hackathon/)
```

## Quick start

```
npm test                 # engine tests
npm run demo             # rebuild synthetic demo data
npm run build            # rebuild dashboard and n8n node code
```

Open `dist/dashboard-demo.html` in a browser to see the dashboard with demo data.

In n8n: import the exports in `workflows/` following `workflows/README.md`. Passing tests prove the Code-node logic and the data contracts. They do not prove that the n8n instance, its credentials, webhooks or Data tables are set up; `docs/hackathon/JUDGE_PACK.md` lists what was checked live during the buildathon. The current n8n setup is in `docs/N8N_V2.md`.

## Data is labelled

- `dist/dashboard-demo.html`: SYNTHETIC corridor (illustrative route, simulated climate), with a "Synthetic demo data" badge.
- Live page: a real 22 km OpenStreetMap pipeline way near Edmonton (cached), real Open-Meteo history and CMIP6 projections (cached per 10 km cell), live Sentinel-2 NDVI and elevation. Badge: "Live from n8n".
- Offline: the same real data from a saved run. Badge: "Offline snapshot".

No operator is involved or endorses this. See `DISCLOSURES.md`.
