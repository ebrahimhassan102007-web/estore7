/**
 * persistence.test.mjs — cold-reboot persistence suite.
 *
 * Phase 1 (this process): build a realistic mid-game state, start two
 * production jobs, and save it through the real SaveManager.
 * Phase 2: replay that save through a series of COLD BOOTS, each in its own
 * child process (fresh module registry == fresh page load).
 *
 * Usage: node tests/persistence.test.mjs
 */

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import './env.mjs';
import { dumpStorage } from './env.mjs';

import { GameState } from '../js/core/GameState.js';
import { SaveManager } from '../js/core/SaveManager.js';
import { ProductionSystem } from '../js/systems/ProductionSystem.js';
import { STARTER_KIT } from '../js/data/GameData.js';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const BOOT = join(ROOT, 'tests', 'boot-sim.mjs');
const work = mkdtempSync(join(tmpdir(), 'farm-coldboot-'));
const saveFile = join(work, 'save.json');
const roundTripFile = join(work, 'round-trip.json');

// ------------------------------------------------------------------
// Phase 1 — create the save under test
// ------------------------------------------------------------------

console.log('== phase 1: building the save under test ==\n');

GameState.reset();
GameState.set('farm.buildings', [
    {
        id: 'mill-save',
        typeId: 'grain_mill',
        productionQueue: [],
        position: { ...STARTER_KIT.positions.grain_mill, y: 0 }
    },
    {
        id: 'bakery-save',
        typeId: 'bakery',
        productionQueue: [],
        position: { ...STARTER_KIT.positions.bakery, y: 0 }
    }
]);
GameState.set('inventory.items', { wheat: { count: 6, quality: 1 } });
GameState.set('player.level', 3);
GameState.set('settings.sfx', false);
GameState.set('production.completed', 7);

const jobA = ProductionSystem.startProduction('mill-save', 'flour', 1);
const jobB = ProductionSystem.startProduction('mill-save', 'flour', 1);

if (!jobA.success || !jobB.success) {
    console.error('phase 1 failed to queue jobs:', jobA.error || jobB.error);
    process.exit(2);
}

const saved = await SaveManager.save();
if (!saved) {
    console.error('phase 1: SaveManager.save() returned false');
    process.exit(2);
}

const storage = dumpStorage();
writeFileSync(saveFile, JSON.stringify(storage, null, 2));

const queueLen = GameState.get('farm.buildings')
    .find(b => b.id === 'mill-save').productionQueue.length;

console.log(`  saved ${Object.keys(storage).length} storage keys -> ${saveFile}`);
const wheatLeft = GameState.get('inventory.items').wheat?.count ?? 0;
console.log(`  queued jobs: ${queueLen}, wheat left: ${wheatLeft}\n`);

// ------------------------------------------------------------------
// Phase 2 — cold boots, one child process each
// ------------------------------------------------------------------

console.log('== phase 2: cold boots (each a fresh process) ==');

const bootPlan = [
    { scenario: 'no-save', save: null },
    { scenario: 'resume-queue', save: saveFile },
    { scenario: 'resume-offline-collect', save: saveFile },
    { scenario: 'cancel-after-reboot', save: saveFile },
    { scenario: 'round-trip', save: saveFile, out: roundTripFile },
    { scenario: 'verify-round-trip', save: roundTripFile },
    { scenario: 'checksum-tamper', save: saveFile },
    { scenario: 'invalid-payload', save: null },
    { scenario: 'future-version', save: saveFile }
];

let totalPass = 0;
let totalFail = 0;
const broken = [];

for (const step of bootPlan) {
    // Scenarios that assert "no save found" boot from an empty storage file.
    const saveArg = step.save ?? (() => {
        const empty = join(work, 'empty.json');
        writeFileSync(empty, '{}');
        return empty;
    })();

    const args = [BOOT, step.scenario, saveArg];
    if (step.out) args.push(step.out);

    console.log(`\n>> node tests/boot-sim.mjs ${step.scenario}`);
    const res = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

    const out = `${res.stdout || ''}${res.stderr || ''}`;
    process.stdout.write(out.endsWith('\n') ? out : out + '\n');

    const m = /SUMMARY pass=(\d+) fail=(\d+)/.exec(out);
    if (m) {
        totalPass += Number(m[1]);
        totalFail += Number(m[2]);
    } else {
        broken.push(step.scenario);
        totalFail += 1;
    }

    if (step.out && !existsSync(step.out)) {
        console.error(`  !! ${step.scenario} produced no output save at ${step.out}`);
    }
}

rmSync(work, { recursive: true, force: true });

console.log('');
if (broken.length) {
    console.log(`  BOOT CRASHES (no summary line): ${broken.join(', ')}`);
}
console.log(`cold-reboot persistence: ${totalPass} passed, ${totalFail} failed`);
console.log(`SUMMARY pass=${totalPass} fail=${totalFail} total=${totalPass + totalFail}`);

process.exit(totalFail === 0 && broken.length === 0 ? 0 : 1);
