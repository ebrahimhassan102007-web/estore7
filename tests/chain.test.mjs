/**
 * chain.test.mjs — data-integrity + Hay Day production chain tests.
 *
 * Runs in one process against the real modules:
 *   js/data/GameData.js, js/core/GameState.js, js/systems/ProductionSystem.js
 *
 * Usage: node tests/chain.test.mjs
 */

import './env.mjs';
import { test, section, assert, eq, near } from './harness.mjs';
import { report } from './harness.mjs';

import { GameState } from '../js/core/GameState.js';
import { ProductionSystem } from '../js/systems/ProductionSystem.js';
import { Events } from '../js/core/EventBus.js';
import {
    RECIPES,
    BUILDINGS,
    ITEMS,
    STARTER_KIT,
    getRecipe,
    getBuilding,
    getRecipesForBuilding
} from '../js/data/GameData.js';

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

function placeBuilding(id, typeId, extra = {}) {
    const buildings = GameState.get('farm.buildings');
    buildings.push({
        id,
        typeId,
        productionQueue: [],
        position: { x: 0, y: 0, z: 0 },
        ...extra
    });
    GameState.set('farm.buildings', buildings);
}

function grant(itemId, count) {
    const items = GameState.get('inventory.items');
    items[itemId] = { count, quality: 1 };
    GameState.set('inventory.items', { ...items });
}

function countOf(itemId) {
    return GameState.get('inventory.items')[itemId]?.count ?? 0;
}

function queueOf(id) {
    return ProductionSystem.getProductions(id);
}

/** Force every queued job ready, the way elapsed wall-clock time would. */
function ageJobs(buildingId, ms) {
    const buildings = GameState.get('farm.buildings');
    const b = buildings.find(x => x.id === buildingId);
    for (const job of b.productionQueue) job.readyAt -= ms;
    GameState.set('farm.buildings', buildings);
}

function resetWorld() {
    GameState.reset();
    GameState.set('farm.buildings', []);
    GameState.set('inventory.items', {});
    GameState.set('inventory.maxCapacity', 50);
    GameState.set('player.level', 1);
}

const recipes = Object.values(RECIPES);

// ==================================================================
section('GameData — catalog integrity');

test('RECIPES catalog is populated (>= 6 recipes)', () =>
    assert(recipes.length >= 6, `only ${recipes.length} recipes`));

test('every recipe key matches its own .id', () => {
    for (const [key, r] of Object.entries(RECIPES)) {
        eq(r.id, key, `key ${key}`);
    }
});

test('every recipe belongs to a real building', () => {
    for (const r of recipes) {
        assert(getBuilding(r.building), `${r.id} -> unknown building ${r.building}`);
    }
});

test('every recipe has at least one ingredient', () => {
    for (const r of recipes) {
        assert(r.ingredients?.length >= 1, `${r.id} has no ingredients`);
    }
});

test('every ingredient item exists in ITEMS', () => {
    for (const r of recipes) {
        for (const ing of r.ingredients) {
            assert(ITEMS[ing.item], `${r.id} needs unknown item ${ing.item}`);
            assert(ing.amount > 0, `${r.id}/${ing.item} amount must be > 0`);
        }
    }
});

test('every recipe output item exists in ITEMS', () => {
    for (const r of recipes) {
        assert(r.output?.item, `${r.id} has no output.item`);
        assert(ITEMS[r.output.item], `${r.id} outputs unknown item ${r.output.item}`);
        assert(r.output.amount > 0, `${r.id} output amount must be > 0`);
    }
});

test('every recipe has a positive production time', () => {
    for (const r of recipes) assert(r.productionTime > 0, `${r.id} productionTime`);
});

test('every recipe has a sane unlock level and xp', () => {
    for (const r of recipes) {
        assert(r.unlockLevel >= 1, `${r.id} unlockLevel`);
        assert(r.xp > 0, `${r.id} xp`);
    }
});

test('recipe ids are unique across the catalog', () => {
    const ids = recipes.map(r => r.id);
    eq(new Set(ids).size, ids.length, 'duplicate recipe ids');
});

test('getRecipe / getBuilding lookups resolve', () => {
    assert(getRecipe('flour')?.building === 'grain_mill', 'getRecipe(flour)');
    assert(getBuilding('bakery')?.id === 'bakery', 'getBuilding(bakery)');
    assert(getRecipe('does_not_exist') === undefined, 'unknown recipe should be undefined');
});

test('getRecipesForBuilding returns only that building, sorted by unlockLevel', () => {
    const mill = getRecipesForBuilding('grain_mill');
    assert(mill.length >= 3, `mill recipes: ${mill.length}`);
    for (const r of mill) eq(r.building, 'grain_mill', 'wrong building leaked in');
    const levels = mill.map(r => r.unlockLevel);
    eq(JSON.stringify(levels), JSON.stringify([...levels].sort((a, b) => a - b)), 'not sorted');
    for (const r of getRecipesForBuilding('bakery')) eq(r.building, 'bakery');
});

test('chain links up: wheat -> flour -> bread', () => {
    eq(getRecipe('flour').ingredients[0].item, 'wheat');
    eq(getRecipe('flour').output.item, 'flour');
    eq(getRecipe('bread').ingredients[0].item, 'flour');
    eq(getRecipe('bread').output.item, 'bread');
});

test('chain items are sellable (sellPrice > 0)', () => {
    for (const id of ['wheat', 'corn', 'flour', 'corn_flour', 'bread', 'corn_bread']) {
        assert(ITEMS[id]?.sellPrice > 0, `${id} sellPrice`);
    }
});

test('production buildings carry their epithets', () => {
    assert(BUILDINGS.grain_mill.epithet, 'grain_mill epithet missing');
    assert(BUILDINGS.bakery.epithet, 'bakery epithet missing');
});

// ==================================================================
section('GameData — STARTER_KIT');

test('STARTER_KIT ships grain_mill + bakery', () => {
    eq(JSON.stringify(STARTER_KIT.buildings), JSON.stringify(['grain_mill', 'bakery']));
});

test('STARTER_KIT buildings all exist in BUILDINGS', () => {
    for (const b of STARTER_KIT.buildings) assert(getBuilding(b), `unknown ${b}`);
});

test('STARTER_KIT has a grid position per building', () => {
    for (const b of STARTER_KIT.buildings) {
        const p = STARTER_KIT.positions[b];
        assert(p, `no position for ${b}`);
        assert(Number.isFinite(p.x) && Number.isFinite(p.z), `bad coords for ${b}`);
    }
});

test('STARTER_KIT positions are distinct', () => {
    const [a, b] = STARTER_KIT.buildings.map(x => STARTER_KIT.positions[x]);
    assert(a.x !== b.x || a.z !== b.z, 'both buildings on the same tile');
});

test('STARTER_KIT items and recipes are real', () => {
    for (const id of Object.keys(STARTER_KIT.items)) assert(ITEMS[id], `unknown item ${id}`);
    for (const id of STARTER_KIT.recipes) assert(getRecipe(id), `unknown recipe ${id}`);
});

test('STARTER_KIT supplies enough wheat for 2x flour', () => {
    const perFlour = getRecipe('flour').ingredients[0].amount;
    assert(STARTER_KIT.items.wheat >= perFlour * 2, 'starter wheat too low for 2 flour');
});

// ==================================================================
section('ProductionSystem — start guards');

resetWorld();
placeBuilding('mill-1', 'grain_mill');
placeBuilding('bakery-1', 'bakery');

test('unknown building is rejected', () => {
    const r = ProductionSystem.startProduction('nope', 'flour');
    eq(r.success, false);
    eq(r.error, 'Building not found');
});

test('unknown recipe is rejected', () => {
    const r = ProductionSystem.startProduction('mill-1', 'nope');
    eq(r.success, false);
    eq(r.error, 'Recipe not found');
});

test('amount <= 0 is rejected', () => {
    grant('wheat', 30);
    eq(ProductionSystem.startProduction('mill-1', 'flour', 0).error, 'Invalid amount');
    eq(ProductionSystem.startProduction('mill-1', 'flour', -3).error, 'Invalid amount');
});

test('recipe on the wrong building is rejected', () => {
    grant('wheat', 30);
    const r = ProductionSystem.startProduction('bakery-1', 'flour');
    eq(r.success, false);
    eq(r.error, 'Wrong building');
});

test('missing ingredients are rejected and nothing is consumed', () => {
    GameState.set('inventory.items', {});
    const r = ProductionSystem.startProduction('mill-1', 'flour');
    eq(r.success, false);
    eq(queueOf('mill-1').length, 0, 'queue should stay empty');
});

test('recipes above player level are gated', () => {
    GameState.set('player.level', 1);
    grant('corn', 30);
    const locked = ProductionSystem.startProduction('mill-1', 'corn_flour');
    eq(locked.success, false);
    assert(/level 2/.test(locked.error), `unexpected error: ${locked.error}`);

    GameState.set('player.level', 2);
    const unlocked = ProductionSystem.startProduction('mill-1', 'corn_flour');
    eq(unlocked.success, true, `should unlock at level 2: ${unlocked.error}`);
    ProductionSystem.cancelProduction('mill-1', unlocked.job.id);
    GameState.set('player.level', 1);
});

test('queue limit (default 3) is enforced', () => {
    resetWorld();
    placeBuilding('mill-q', 'grain_mill');
    grant('wheat', 99);
    const started = [];
    for (let i = 0; i < 4; i++) {
        started.push(ProductionSystem.startProduction('mill-q', 'flour'));
    }
    eq(started.slice(0, 3).every(s => s.success), true, 'first 3 should start');
    eq(started[3].success, false, '4th should be rejected');
    eq(queueOf('mill-q').length, 3);
});

test('per-building queueLimit override is honoured', () => {
    resetWorld();
    placeBuilding('mill-q2', 'grain_mill', { queueLimit: 2 });
    grant('wheat', 99);
    eq(ProductionSystem.startProduction('mill-q2', 'flour').success, true);
    eq(ProductionSystem.startProduction('mill-q2', 'flour').success, true);
    eq(ProductionSystem.startProduction('mill-q2', 'flour').success, false);
    eq(queueOf('mill-q2').length, 2);
});

// ==================================================================
section('ProductionSystem — job lifecycle');

resetWorld();
placeBuilding('mill-2', 'grain_mill');
grant('wheat', 6);

let flourJob = null;
let startedEvent = null;
Events.on('production:started', (b, r, j) => { startedEvent = { b, r, j }; });

test('starting flour consumes 3 wheat and queues one job', () => {
    const before = countOf('wheat');
    const res = ProductionSystem.startProduction('mill-2', 'flour');
    eq(res.success, true, res.error);
    flourJob = res.job;
    eq(countOf('wheat'), before - 3, 'wheat consumed');
    eq(queueOf('mill-2').length, 1);
});

test('job carries correct timing + output metadata', () => {
    eq(flourJob.recipeId, 'flour');
    eq(flourJob.outputItem, 'flour');
    eq(flourJob.outputAmount, 1);
    eq(flourJob.state, 'producing');
    eq(flourJob.duration, 30 * 1000, 'flour takes 30s');
    near(flourJob.readyAt - flourJob.startedAt, 30 * 1000, 50, 'readyAt-startedAt');
    assert(typeof flourJob.id === 'string' && flourJob.id.length > 0, 'job id');
});

test('production:started fires with building, recipe and job', () => {
    assert(startedEvent, 'no event captured');
    eq(startedEvent.b, 'mill-2');
    eq(startedEvent.r, 'flour');
    eq(startedEvent.j.id, flourJob.id);
});

test('helper queries reflect the queue', () => {
    eq(ProductionSystem.isProducing('mill-2'), true);
    eq(ProductionSystem.getProductions('mill-2').length, 1);
    eq(ProductionSystem.getProduction('mill-2', flourJob.id)?.recipeId, 'flour');
    eq(ProductionSystem.getProduction('mill-2', 'bogus'), undefined);
    eq(ProductionSystem.getBuilding('mill-2')?.typeId, 'grain_mill');
});

test('multi-amount start consumes amount x ingredients', () => {
    resetWorld();
    placeBuilding('mill-3', 'grain_mill');
    grant('wheat', 12);
    const res = ProductionSystem.startProduction('mill-3', 'flour', 3);
    eq(res.success, true, res.error);
    eq(countOf('wheat'), 12 - 9, 'wheat consumed for x3');
    eq(res.job.outputAmount, 3, 'output scaled by amount');
    eq(res.job.duration, 30 * 1000, 'duration is per batch');
});

test('collecting before readyAt fails', () => {
    resetWorld();
    placeBuilding('mill-4', 'grain_mill');
    grant('wheat', 3);
    const { job } = ProductionSystem.startProduction('mill-4', 'flour');
    const r = ProductionSystem.collectProduction('mill-4', job.id);
    eq(r.success, false);
    eq(r.error, 'Production not ready');
    eq(queueOf('mill-4').length, 1, 'job must stay queued');
});

let readyEvent = null;
Events.on('production:ready', (b, r, j) => { readyEvent = { b, r, j }; });

test('tick flips an elapsed job to ready and emits production:ready', () => {
    ageJobs('mill-4', 60 * 1000);
    Events.emit('game:tick', 1000);
    eq(queueOf('mill-4')[0].state, 'ready');
    assert(readyEvent, 'no production:ready event');
    eq(readyEvent.b, 'mill-4');
    eq(readyEvent.r, 'flour');
});

test('getReadyProductions lists the finished job', () => {
    eq(ProductionSystem.getReadyProductions('mill-4').length, 1);
});

let completedEvent = null;
Events.on('production:completed', (b, r, out) => { completedEvent = { b, r, out }; });

test('collecting deposits flour and clears the job', () => {
    const r = ProductionSystem.collectProduction('mill-4', 'no-such-job');
    eq(r.success, false, 'unknown job must fail');
    eq(r.error, 'Production not found');

    const jobId = queueOf('mill-4')[0].id;
    const done = ProductionSystem.collectProduction('mill-4', jobId);
    eq(done.success, true, done.error);
    eq(done.output.item, 'flour');
    eq(done.output.amount, 1);
    eq(countOf('flour'), 1, 'flour landed in inventory');
    eq(queueOf('mill-4').length, 0, 'queue drained');
    assert(completedEvent, 'no production:completed event');
    eq(completedEvent.b, 'mill-4');
});

test('collecting from an unknown building fails cleanly', () => {
    const r = ProductionSystem.collectProduction('ghost', 'x');
    eq(r.success, false);
    eq(r.error, 'Building not found');
});

test('inventory-full guard blocks collection and emits inventory:full', () => {
    resetWorld();
    placeBuilding('mill-5', 'grain_mill');
    grant('wheat', 3);
    const { job } = ProductionSystem.startProduction('mill-5', 'flour');
    ageJobs('mill-5', 60 * 1000);

    // Inventory already holds 1 item and can hold at most 1,
    // so collecting 1 more flour must overflow.
    const items = GameState.get('inventory.items');
    items.carrot = { count: 1, quality: 1 };
    GameState.set('inventory.items', items);
    GameState.set('inventory.maxCapacity', 1);

    let fullFired = false;
    Events.on('inventory:full', () => { fullFired = true; });

    const r = ProductionSystem.collectProduction('mill-5', job.id);
    eq(r.success, false);
    eq(r.error, 'Inventory full');
    eq(fullFired, true, 'inventory:full should fire');
    eq(queueOf('mill-5').length, 1, 'job retained when full');
    eq(countOf('flour'), 0, 'no flour should land while full');
});

let cancelledEvent = null;
Events.on('production:cancelled', (b, id) => { cancelledEvent = { b, id }; });

test('cancelling refunds ingredients and removes the job', () => {
    resetWorld();
    placeBuilding('mill-6', 'grain_mill');
    grant('wheat', 3);
    const { job } = ProductionSystem.startProduction('mill-6', 'flour');
    eq(countOf('wheat'), 0, 'wheat consumed on start');

    const r = ProductionSystem.cancelProduction('mill-6', job.id);
    eq(r.success, true);
    eq(countOf('wheat'), 3, 'wheat refunded');
    eq(queueOf('mill-6').length, 0);
    assert(cancelledEvent, 'no production:cancelled event');
    eq(cancelledEvent.id, job.id);
});

test('cancelling an unknown job / building fails without side effects', () => {
    eq(ProductionSystem.cancelProduction('mill-6', 'ghost').error, 'Production not found');
    eq(ProductionSystem.cancelProduction('ghost', 'ghost').error, 'Building not found');
});

// ==================================================================
section('ProductionSystem — full chain wheat -> flour -> bread');

resetWorld();
placeBuilding('mill-c', 'grain_mill');
placeBuilding('bakery-c', 'bakery');
GameState.set('inventory.maxCapacity', 50);
grant('wheat', 6);

test('mill: 6 wheat -> 2 flour', () => {
    const res = ProductionSystem.startProduction('mill-c', 'flour', 2);
    eq(res.success, true, res.error);
    eq(countOf('wheat'), 0);
    ageJobs('mill-c', 60 * 1000);
    Events.emit('game:tick', 1000);
    const done = ProductionSystem.collectProduction('mill-c', res.job.id);
    eq(done.success, true, done.error);
    eq(countOf('flour'), 2);
});

test('bakery: 2 flour -> 1 bread', () => {
    const res = ProductionSystem.startProduction('bakery-c', 'bread', 1);
    eq(res.success, true, res.error);
    eq(countOf('flour'), 0, 'flour consumed');
    ageJobs('bakery-c', 120 * 1000);
    Events.emit('game:tick', 1000);
    const done = ProductionSystem.collectProduction('bakery-c', res.job.id);
    eq(done.success, true, done.error);
    eq(countOf('bread'), 1);
});

test('chain value increases at each stage', () => {
    const wheat = ITEMS.wheat.sellPrice;
    const flour = ITEMS.flour.sellPrice;
    const bread = ITEMS.bread.sellPrice;
    assert(flour * 2 > wheat * 6, `flour not worth more than its wheat (${flour}x2 vs ${wheat}x6)`);
    assert(bread > flour * 2, `bread not worth more than its flour (${bread} vs ${flour}x2)`);
});

test('corn chain works in parallel (corn -> corn_flour)', () => {
    GameState.set('player.level', 2);
    grant('corn', 3);
    const res = ProductionSystem.startProduction('mill-c', 'corn_flour', 1);
    eq(res.success, true, res.error);
    ageJobs('mill-c', 120 * 1000);
    Events.emit('game:tick', 1000);
    eq(ProductionSystem.collectProduction('mill-c', res.job.id).success, true);
    eq(countOf('corn_flour'), 1);
});

test('offline progress marks elapsed jobs ready via time:offline', () => {
    resetWorld();
    placeBuilding('mill-o', 'grain_mill');
    grant('wheat', 3);
    const { job } = ProductionSystem.startProduction('mill-o', 'flour');
    ageJobs('mill-o', 60 * 1000);
    Events.emit('time:offline', 3600);
    eq(ProductionSystem.getProduction('mill-o', job.id).state, 'ready');
    eq(ProductionSystem.collectProduction('mill-o', job.id).success, true);
});

test('time:offline ignores non-positive durations', () => {
    resetWorld();
    placeBuilding('mill-o2', 'grain_mill');
    grant('wheat', 3);
    const { job } = ProductionSystem.startProduction('mill-o2', 'flour');
    Events.emit('time:offline', 0);
    Events.emit('time:offline', -50);
    eq(ProductionSystem.getProduction('mill-o2', job.id).state, 'producing');
});

test('getAvailableRecipes filters by building type and level', () => {
    GameState.set('player.level', 1);
    const mill = ProductionSystem.getAvailableRecipes('grain_mill');
    assert(mill.length >= 1, 'no mill recipes at level 1');
    for (const r of mill) {
        eq(r.building, 'grain_mill');
        assert(r.unlockLevel <= 1, `${r.id} should be locked at level 1`);
    }
    GameState.set('player.level', 5);
    assert(ProductionSystem.getAvailableRecipes('grain_mill').length > mill.length,
        'higher level should unlock more recipes');
});

process.exit(report('chain tests'));
