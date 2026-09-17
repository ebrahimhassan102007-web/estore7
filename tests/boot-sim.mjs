/**
 * boot-sim.mjs — one scenario of a COLD BOOT.
 *
 * Run as a child process by tests/persistence.test.mjs:
 *     node tests/boot-sim.mjs <scenario> <save.json> [out.json]
 *
 * A fresh process == a fresh ES module registry == a genuine page reload,
 * which is what "cold-reboot persistence" actually has to survive.
 */

import './env.mjs';
import { seedStorage, dumpStorage } from './env.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

import { test, section, assert, eq } from './harness.mjs';
import { report } from './harness.mjs';

import { GameState } from '../js/core/GameState.js';
import { SaveManager } from '../js/core/SaveManager.js';
import { ProductionSystem } from '../js/systems/ProductionSystem.js';
import { Events } from '../js/core/EventBus.js';
import { STARTER_KIT } from '../js/data/GameData.js';

const [, , SCENARIO, savePath, outPath] = process.argv;

function loadSaveFile() {
    return JSON.parse(readFileSync(savePath, 'utf8'));
}

/** Events we expect to observe, collected up front. */
function watch(name) {
    const seen = [];
    Events.on(name, (...args) => seen.push(args));
    return seen;
}

function buildings() {
    return GameState.get('farm.buildings');
}

function building(id) {
    return buildings().find(b => b.id === id);
}

function countOf(itemId) {
    return GameState.get('inventory.items')[itemId]?.count ?? 0;
}

/** Rewind readyAt the way elapsed wall-clock time would. */
function ageJobs(id, ms) {
    const all = GameState.get('farm.buildings');
    const b = all.find(x => x.id === id);
    for (const job of b.productionQueue) job.readyAt -= ms;
    GameState.set('farm.buildings', all);
}

const SAVE_KEY = 'myfarm_save_v2';

// ==================================================================
const scenarios = {

    /** No save at all: must start a clean game, not crash. */
    'no-save': async () => {
        section('cold boot — empty storage');
        seedStorage({});

        const notFound = watch('save:notfound');
        const loaded = await SaveManager.load();

        test('load() reports no save found', () => eq(loaded, false));
        test('save:notfound is emitted', () => assert(notFound.length === 1, 'not emitted once'));
        test('state stays at defaults (no buildings)', () =>
            eq(buildings().length, 0, 'buildings should be empty'));
        test('default player level is 1 and wallet intact', () => {
            eq(GameState.get('player.level'), 1);
            eq(GameState.get('player.coins'), 350);
        });
    },

    /** The main case: everything the player had must come back. */
    'resume-queue': async () => {
        section('cold boot — resume with a live queue');
        seedStorage(loadSaveFile());

        const loaded = watch('save:loaded');
        const ok = await SaveManager.load();

        test('load() succeeds', () => eq(ok, true));
        test('save:loaded is emitted with meta', () => {
            assert(loaded.length === 1, 'not emitted once');
            assert(typeof loaded[0][0]?.timestamp === 'number', 'meta.timestamp missing');
        });

        test('both production buildings are restored', () => {
            eq(buildings().length, 2, `expected 2 buildings, got ${buildings().length}`);
            assert(building('mill-save')?.typeId === 'grain_mill', 'mill missing');
            assert(building('bakery-save')?.typeId === 'bakery', 'bakery missing');
        });

        test('grid positions survive the reboot', () => {
            const mill = building('mill-save').position;
            const bakery = building('bakery-save').position;
            eq(mill.x, STARTER_KIT.positions.grain_mill.x, 'mill x');
            eq(mill.z, STARTER_KIT.positions.grain_mill.z, 'mill z');
            eq(bakery.x, STARTER_KIT.positions.bakery.x, 'bakery x');
            eq(bakery.z, STARTER_KIT.positions.bakery.z, 'bakery z');
        });

        test('queued jobs survive with full metadata', () => {
            const queue = building('mill-save').productionQueue;
            eq(queue.length, 2, `expected 2 queued jobs, got ${queue.length}`);
            for (const job of queue) {
                eq(job.recipeId, 'flour');
                eq(job.outputItem, 'flour');
                eq(job.outputAmount, 1);
                eq(job.state, 'producing');
                eq(job.duration, 30 * 1000);
                assert(typeof job.id === 'string' && job.id.length > 0, 'job id lost');
                assert(Number.isFinite(job.startedAt) && Number.isFinite(job.readyAt),
                    'job timestamps lost');
            }
            eq(new Set(queue.map(j => j.id)).size, 2, 'job ids collided after reload');
        });

        test('inventory survives (wheat consumed, none left)', () => {
            eq(countOf('wheat'), 0, 'wheat should still be consumed');
            eq(countOf('flour'), 0, 'nothing collected yet');
        });

        test('player progression survives', () => {
            eq(GameState.get('player.level'), 3);
            eq(GameState.get('settings.sfx'), false, 'sfx preference lost');
            eq(GameState.get('production.completed'), 7, 'production counter lost');
        });

        test('a saved job can still be collected after reboot', async () => {
            ageJobs('mill-save', 120 * 1000);
            Events.emit('time:offline', 3600);
            const job = building('mill-save').productionQueue[0];
            eq(job.state, 'ready', 'offline progress did not apply');
            const res = ProductionSystem.collectProduction('mill-save', job.id);
            eq(res.success, true, res.error);
            eq(countOf('flour'), 1);
        });
    },

    /** Elapsed-away time must finish jobs, and the result must re-save. */
    'resume-offline-collect': async () => {
        section('cold boot — offline progress then re-save');
        seedStorage(loadSaveFile());

        const readySeen = watch('production:ready');
        await SaveManager.load();

        test('offline processing marks both queued jobs ready', () => {
            ageJobs('mill-save', 120 * 1000);
            Events.emit('time:offline', 7200);
            const queue = building('mill-save').productionQueue;
            eq(queue.filter(j => j.state === 'ready').length, 2);
            assert(readySeen.length >= 2, `expected >=2 ready events, got ${readySeen.length}`);
        });

        test('both jobs collect into inventory', () => {
            for (const job of [...building('mill-save').productionQueue]) {
                eq(ProductionSystem.collectProduction('mill-save', job.id).success, true);
            }
            eq(countOf('flour'), 2);
            eq(building('mill-save').productionQueue.length, 0);
        });

        test('flour can immediately feed the bakery after reboot', () => {
            const res = ProductionSystem.startProduction('bakery-save', 'bread', 1);
            eq(res.success, true, res.error);
            eq(countOf('flour'), 0, 'flour consumed by bakery');
        });

        test('post-boot save writes a valid payload', async () => {
            const saved = watch('save:success');
            eq(await SaveManager.save(), true);
            assert(saved.length === 1, 'save:success not emitted');
            const raw = JSON.parse(dumpStorage()[SAVE_KEY]);
            eq(raw.meta.version, 2, 'save version');
            assert(typeof raw.meta.checksum === 'string', 'checksum missing');
            eq(raw.data.inventory.items.flour.count ?? 0, 0, 'flour should be consumed');
            eq(raw.data.farm.buildings.find(b => b.id === 'bakery-save')
                .productionQueue.length, 1, 'bakery job not persisted');
        });
    },

    /** Cancelling after a reboot must still refund the ingredients. */
    'cancel-after-reboot': async () => {
        section('cold boot — cancel refunds');
        seedStorage(loadSaveFile());
        await SaveManager.load();

        test('cancel after reboot refunds the wheat', () => {
            const job = building('mill-save').productionQueue[0];
            const before = countOf('wheat');
            eq(ProductionSystem.cancelProduction('mill-save', job.id).success, true);
            eq(countOf('wheat'), before + 3, 'wheat not refunded after reboot');
            eq(building('mill-save').productionQueue.length, 1);
        });

        test('cancel is persisted', async () => {
            eq(await SaveManager.save(), true);
            const raw = JSON.parse(dumpStorage()[SAVE_KEY]);
            eq(raw.data.farm.buildings.find(b => b.id === 'mill-save')
                .productionQueue.length, 1);
        });
    },

    /** Load -> mutate -> save -> reload must round-trip cleanly. */
    'round-trip': async () => {
        section('cold boot — save/load round trip');
        seedStorage(loadSaveFile());
        await SaveManager.load();

        GameState.set('player.coins', 4242);
        const items = GameState.get('inventory.items');
        items.bread = { count: 5, quality: 2 };
        GameState.set('inventory.items', items);
        eq(await SaveManager.save(), true);

        test('payload on disk reflects the mutation', () => {
            const raw = JSON.parse(dumpStorage()[SAVE_KEY]);
            eq(raw.data.player.coins, 4242);
            eq(raw.data.inventory.items.bread.count, 5);
        });

        if (outPath) writeFileSync(outPath, JSON.stringify(dumpStorage(), null, 2));
    },

    /** Second boot: consume the output of `round-trip`. */
    'verify-round-trip': async () => {
        section('cold boot — re-read a re-saved game');
        seedStorage(loadSaveFile());

        const ok = await SaveManager.load();

        test('re-saved game loads', () => eq(ok, true));
        test('mutated values survived the extra cycle', () => {
            eq(GameState.get('player.coins'), 4242);
            eq(countOf('bread'), 5);
            eq(GameState.get('inventory.items').bread.quality, 2, 'quality lost');
        });
        test('buildings and positions still intact', () => {
            eq(buildings().length, 2);
            eq(building('bakery-save').position.x, STARTER_KIT.positions.bakery.x);
        });
    },

    /** Tampered payload: checksum mismatch must be surfaced. */
    'checksum-tamper': async () => {
        section('cold boot — tampered payload');
        const storage = loadSaveFile();
        const payload = JSON.parse(storage[SAVE_KEY]);
        payload.data.player.coins = 99999;          // mutate data, keep old checksum
        storage[SAVE_KEY] = JSON.stringify(payload);
        seedStorage(storage);

        const corrupted = watch('save:corrupted');
        const ok = await SaveManager.load();

        test('checksum mismatch emits save:corrupted', () =>
            assert(corrupted.length === 1, 'save:corrupted not emitted'));
        test('load still succeeds (current design warns, does not discard)', () =>
            eq(ok, true));
        test('tampered value is what lands in state', () =>
            eq(GameState.get('player.coins'), 99999));
    },

    /** Structurally invalid payload must be refused. */
    'invalid-payload': async () => {
        section('cold boot — invalid payload');
        seedStorage({ [SAVE_KEY]: '{"hello":"world"}' });

        const invalid = watch('save:invalid');
        const ok = await SaveManager.load();

        test('load() refuses the payload', () => eq(ok, false));
        test('save:invalid is emitted', () => assert(invalid.length === 1, 'not emitted'));
        test('state remains at defaults', () => {
            eq(buildings().length, 0);
            eq(GameState.get('player.coins'), 350);
        });
    },

    /** A save from a newer build must not be loaded. */
    'future-version': async () => {
        section('cold boot — future save version');
        const storage = loadSaveFile();
        const payload = JSON.parse(storage[SAVE_KEY]);
        payload.meta.version = 99;
        storage[SAVE_KEY] = JSON.stringify(payload);
        seedStorage(storage);

        const future = watch('save:futureVersion');
        const ok = await SaveManager.load();

        test('load() refuses a newer save version', () => eq(ok, false));
        test('save:futureVersion is emitted', () =>
            assert(future.length === 1, 'not emitted'));
        test('state is untouched by the rejected save', () => {
            eq(buildings().length, 0);
            eq(GameState.get('player.level'), 1);
        });
    }
};

// ==================================================================
const run = scenarios[SCENARIO];
if (!run) {
    console.error(`unknown scenario: ${SCENARIO}`);
    console.error(`available: ${Object.keys(scenarios).join(', ')}`);
    process.exit(2);
}

await run();
process.exit(report(`cold boot [${SCENARIO}]`));
