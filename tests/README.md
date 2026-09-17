# MY FARM 3D — verification suite

No build step, no dependencies. Requires only Node >= 20 (uses `node:fs`,
child processes and ES modules; nothing is installed).

```bash
npm test                 # everything (91 checks across 3 suites)
npm run test:static      # syntax + module graph + index.html wiring
npm run test:chain       # GameData integrity + full production lifecycle
npm run test:persistence # saves replayed through cold boots
npm run serve            # static server on 0.0.0.0:8000
```

`npm test` exits non-zero if any check fails.

## What each suite covers

**`static-checks.mjs` (12 checks)**
Parses all 31 files under `js/` as ES modules via `node --check`, resolves every
relative import to a real file, checks that every named binding is actually
exported by its target, confirms bare specifiers (`three`, `three/addons/`) are
covered by the import map in `index.html`, and verifies the entry script plus
every linked stylesheet exist.

**`chain.test.mjs` (48 checks)**
Imports the real `GameData`, `GameState` and `ProductionSystem` modules and
exercises the Hay Day chain end to end: catalog integrity (every recipe points
at a real building, ingredient and output item), `STARTER_KIT` grid positions,
start guards (unknown building/recipe, `amount <= 0`, wrong building, missing
ingredients, level gating, queue limits), job metadata and timing, `game:tick`
and `time:offline` transitions, collect, cancel-with-refund, the inventory-full
guard, event emissions, and the full `wheat -> flour -> bread` chain including
the value-increase invariant.

**`persistence.test.mjs` + `boot-sim.mjs` (31 checks)**
Phase 1 builds a mid-game state (two buildings on their grid tiles, two live
production jobs, level, sound setting, production counter) and saves it through
the real `SaveManager`. Phase 2 replays that save through nine **cold boots —
each in its own child process**, because a fresh process is a fresh ES module
registry, which is the only honest stand-in for a page reload. Scenarios:
empty storage, resume-with-live-queue, offline-progress-then-collect,
cancel-after-reboot, save/load round trip (re-read by a second boot),
checksum tampering, structurally invalid payload, and a future save version.

## Deliberately out of scope

`tests/env.mjs` shims `localStorage`, `window` and `document` — but **not**
THREE.js or WebGL. The 3D layer (`js/core/world3d.js`, `js/world/ProductionYard.js`)
and the DOM panels (`js/ui/*`) are covered by the static checks plus manual
verification in a browser (`npm run serve`). Save/load is tested against the
localStorage fallback path, which is what the browser uses when IndexedDB is
unavailable; the IndexedDB path itself is not exercised by these tests.

## Reading a failure

Each check prints `PASS`/`FAIL` with the assertion detail, grouped by section,
and every suite ends with a `SUMMARY pass=N fail=M total=T` line that
`tests/run.mjs` aggregates. The persistence suite prints one summary per cold
boot followed by its own aggregate — `run.mjs` reads the last one.
