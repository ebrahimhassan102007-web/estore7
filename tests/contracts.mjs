/**
 * ============================================================
 * tests/contracts.mjs — Cross-module API contract checker
 * ============================================================
 * main.js لا يعمل في أي اختبار بلا متصفح (يحتاج WebGL)، لذلك نفحص
 * عقوده ساكنًا: كل نداء `this.<field>.<method>()` أو
 * `<Singleton>.<method>()` في main.js يجب أن يكون موجودًا فعلًا على
 * الصنف/الكائن المستورد — وإلا انفجر عند أول تشغيل على الجهاز.
 *
 * هذا يلتقط أخطاء مثل `houseInterior.toggleExit()` (غير موجود) أو
 * `hud.applyClock()` قبل إضافتها، دون الحاجة لمتصفح.
 *
 * التشغيل:  node tests/contracts.mjs   (يحتاج three محليًا؛ وإلا SKIP)
 * ============================================================ */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* ---------- three اختياري (بعض الوحدات تستورده) ---------- */
try {
    await import('three');
} catch (e) {
    console.log('⏭️  SKIP tests/contracts.mjs — module `three` غير مثبّت محليًا.');
    console.log('   للتشغيل: npm i  (node_modules متجاهَل في git)');
    process.exit(0);
}

/* ---------- منصات وهمية كافية لتحميل الوحدات ---------- */
function canvasStub() {
    const ctx = new Proxy({}, {
        get: (t, p) => (p === 'measureText' ? () => ({ width: 10 }) : () => {}),
        set: () => true
    });
    return { width: 300, height: 150, style: {}, getContext: () => ctx };
}
globalThis.window = globalThis.window || {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
};
globalThis.document = globalThis.document || {
    hidden: false,
    addEventListener() {}, removeEventListener() {},
    createElement: (tag) => (tag === 'canvas' ? canvasStub() : {
        style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, remove() {}, setAttribute() {}, addEventListener() {},
        querySelector: () => null, querySelectorAll: () => [], innerHTML: '', textContent: ''
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } }
};
const lsStore = new Map();
globalThis.localStorage = globalThis.localStorage || {
    getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
    setItem: (k, v) => lsStore.set(k, String(v)),
    removeItem: (k) => lsStore.delete(k),
    clear: () => lsStore.clear()
};

/* ---------- الوحدات الحقيقية ---------- */
const { Environment } = await import('../js/world/Environment.js');
const { HouseInterior } = await import('../js/world/HouseInterior.js');
const { ProductionYard } = await import('../js/world/ProductionYard.js');
const { CollisionEngine } = await import('../js/core/CollisionEngine.js');
const { GameState } = await import('../js/core/GameState.js');
const { Time } = await import('../js/core/TimeManager.js');
const { Events } = await import('../js/core/EventBus.js');
const { SaveManager } = await import('../js/core/SaveManager.js');
const { LandSystem } = await import('../js/systems/LandSystem.js');
const { FarmingSystem } = await import('../js/systems/FarmingSystem.js');
const { ProductionSystem } = await import('../js/systems/ProductionSystem.js');
const { InventorySystem } = await import('../js/systems/InventorySystem.js');
const { StorageSystem } = await import('../js/systems/StorageSystem.js');
const { AnimalSystem } = await import('../js/systems/AnimalSystem.js');
const { OrderSystem } = await import('../js/systems/OrderSystem.js');
const { MarketSystem } = await import('../js/systems/MarketSystem.js');
const { BuildingSystem } = await import('../js/systems/BuildingSystem.js');
const { XPSystem } = await import('../js/systems/XPSystem.js');
const { GameUI } = await import('../js/ui/UI.js');
const { default: UIManager } = await import('../js/ui/UIManager.js');
const { ProductionPanel } = await import('../js/ui/ProductionPanel.js');
const { Toast } = await import('../js/ui/Toast.js');
const { SoundFX } = await import('../js/ui/SoundFX.js');

/* ---------- مصدر main.js ---------- */
const mainSrc = readFileSync(join(root, 'js/main.js'), 'utf8');

/** أسماء الدوال المعرّفة داخل أصناف main.js نفسها (PlayerController/CropBatchRenderer/MyFarmApp). */
function localMethods(className) {
    const start = mainSrc.indexOf(`class ${className}`);
    if (start < 0) return new Set();
    // نأخذ جسم الصنف حتى بداية الصنف التالي أو نهاية الملف
    const nextClass = mainSrc.indexOf('\nclass ', start + 1);
    const body = mainSrc.slice(start, nextClass > 0 ? nextClass : undefined);
    const names = new Set();
    const re = /^\s{4}(?:async\s+)?(?:static\s+)?([A-Za-z_$][\w$]*)\s*\(/gm;
    let m;
    while ((m = re.exec(body))) names.add(m[1]);
    return names;
}

/** كل الدوال على prototype لصنف مستورد (+ ما يُعرَّف في constructor). */
function classMethods(cls) {
    const names = new Set();
    let proto = cls?.prototype;
    while (proto && proto !== Object.prototype) {
        for (const key of Object.getOwnPropertyNames(proto)) names.add(key);
        proto = Object.getPrototypeOf(proto);
    }
    return names;
}

function instanceMethods(obj) {
    const names = new Set();
    let cur = obj;
    while (cur && cur !== Object.prototype) {
        for (const key of Object.getOwnPropertyNames(cur)) names.add(key);
        cur = Object.getPrototypeOf(cur);
    }
    return names;
}

/**
 * خريطة الحقول في main.js ⇒ مصدر أسماء الدوال المسموحة.
 * `local` = صنف معرّف داخل main.js نفسه.
 */
const FIELD_TARGETS = {
    environment: { class: Environment },
    houseInterior: { class: HouseInterior },
    productionYard: { class: ProductionYard },
    collision: { class: CollisionEngine },
    hud: { class: UIManager },
    gameUI: { class: GameUI },
    productionPanel: { class: ProductionPanel },
    toast: { class: Toast },
    soundFX: { class: SoundFX },
    player: { local: 'PlayerController' },
    cropBatches: { local: 'CropBatchRenderer' },
    renderer: null,          // THREE.WebGLRenderer — خارج نطاق الفحص
    scene: null,             // THREE.Scene
    camera: null,            // THREE.PerspectiveCamera
    lights: null,
    clock: null,             // THREE.Clock
    sky: null
};

/** الكائنات المفردة (singletons) المستوردة في main.js. */
const SINGLETONS = {
    Time, GameState, Events, SaveManager, LandSystem, FarmingSystem,
    ProductionSystem, InventorySystem, StorageSystem, AnimalSystem,
    OrderSystem, MarketSystem, BuildingSystem, XPSystem
};

/* ============================================================
   الفحص
   ============================================================ */

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
    if (ok) { passed++; }
    else { failures.push(`${label}${detail ? ` — ${detail}` : ''}`); console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\n── main.js → world/UI/systems call contracts ─────────────');

/* ---- 1) this.<field>.<method>( ---- */
const fieldCallRe = /this\.([A-Za-z_$][\w$]*)\s*(?:\?\.)?\.?\s*([A-Za-z_$][\w$]*)\s*\(/g;
const seenFieldCalls = new Set();
let match;
const unknownFieldCalls = [];

while ((match = fieldCallRe.exec(mainSrc))) {
    const field = match[1];
    const method = match[2];
    if (!(field in FIELD_TARGETS)) continue;      // حقل غير معروف ⇒ نتجاهله
    const target = FIELD_TARGETS[field];
    if (!target) continue;                        // THREE objects ⇒ خارج النطاق

    const key = `${field}.${method}`;
    if (seenFieldCalls.has(key)) continue;
    seenFieldCalls.add(key);

    const allowed = target.class
        ? classMethods(target.class)
        : localMethods(target.local);

    if (!allowed.has(method)) {
        unknownFieldCalls.push(key);
    }
}

check(
    `every this.<field>.<method>() exists (${seenFieldCalls.size} distinct calls checked)`,
    unknownFieldCalls.length === 0,
    unknownFieldCalls.join(', ')
);
if (unknownFieldCalls.length === 0) {
    console.log(`  ✅ ${seenFieldCalls.size} distinct this.<field>.<method>() calls all resolve`);
}

/* ---- 2) <Singleton>.<method>( ---- */
const singletonCallRe = /\b([A-Z][A-Za-z_$][\w$]*)\s*\.\s*([a-z_$][\w$]*)\s*\(/g;
const seenSingletonCalls = new Set();
const unknownSingletonCalls = [];

while ((match = singletonCallRe.exec(mainSrc))) {
    const objName = match[1];
    const method = match[2];
    if (!SINGLETONS[objName]) continue;

    const key = `${objName}.${method}`;
    if (seenSingletonCalls.has(key)) continue;
    seenSingletonCalls.add(key);

    const target = SINGLETONS[objName];
    const ok = typeof target[method] === 'function' || instanceMethods(target).has(method);
    if (!ok) unknownSingletonCalls.push(key);
}

check(
    `every <Singleton>.<method>() exists (${seenSingletonCalls.size} distinct calls checked)`,
    unknownSingletonCalls.length === 0,
    unknownSingletonCalls.join(', ')
);
if (unknownSingletonCalls.length === 0) {
    console.log(`  ✅ ${seenSingletonCalls.size} distinct singleton calls all resolve`);
}

/* ---- 3) أسماء الأحداث المستهلكة في main.js مقابل الأحداث المُصدَرة ---- */
console.log('\n── EventBus contract (emitted vs consumed) ───────────────');

const emitted = new Set();

/** كل ملفات js/ — لأن أي وحدة قد تُصدر حدثًا (عبر Events أو this.events). */
function walkJs(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walkJs(full, out);
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

for (const file of walkJs(join(root, 'js'))) {
    const src = readFileSync(file, 'utf8');
    /*
     * نُطابق كل صيغ الإصدار المستخدمة في المشروع:
     *   Events.emit('x') · emit('x') · this.events?.emit?.('x') · bus.emit('x')
     */
    const re = /emit\??\.?\??\(\s*\n?\s*'([^']+)'/g;
    let m2;
    while ((m2 = re.exec(src))) emitted.add(m2[1]);
}

const consumed = new Set();
const onRe = /Events\.on\(\s*\n?\s*'([^']+)'/g;
let m3;
while ((m3 = onRe.exec(mainSrc))) consumed.add(m3[1]);

/*
 * جسور اختيارية: main.js يستمع لها كنقطة توسعة عامة (أي وحدة يمكنها
 * إصدارها عبر this.events) ولا يُشترط أن يكون لها مُصدِر مباشر اليوم.
 */
const BRIDGE_ONLY = new Set(['toast:info', 'hud:panel']);
const orphans = [...consumed].filter((name) => !emitted.has(name) && !BRIDGE_ONLY.has(name));
check(
    `every event main.js listens to is emitted somewhere (${consumed.size} listeners)`,
    orphans.length === 0,
    `never emitted: ${orphans.join(', ')}`
);
if (orphans.length === 0) {
    console.log(`  ✅ all ${consumed.size} listeners have a matching emitter`);
}

/* ---- 4) أحداث الأنظمة المهمة مُستهلكة (لا واجهة ميتة) ---- */
const mustBeConsumed = ['market:sold', 'storage:upgraded', 'storage:supply-drop', 'animal:purchased', 'time:season'];
const missingListeners = mustBeConsumed.filter((name) => !consumed.has(name));
check(
    'key economy/season events are surfaced to the player (no silent systems)',
    missingListeners.length === 0,
    `no listener in main.js for: ${missingListeners.join(', ')}`
);

/* ---- 5) عقد HUD/UI: الدوال التي يناديها main.js موجودة فعلًا ---- */
console.log('\n── HUD / UI surface used by main.js ──────────────────────');
const hudCalls = [...seenFieldCalls].filter((k) => k.startsWith('hud.')).map((k) => k.split('.')[1]);
const uiCalls = [...seenFieldCalls].filter((k) => k.startsWith('gameUI.')).map((k) => k.split('.')[1]);
check('HUD methods used by main.js exist on UIManager', hudCalls.every((m) => classMethods(UIManager).has(m)),
    hudCalls.filter((m) => !classMethods(UIManager).has(m)).join(', '));
check('GameUI methods used by main.js exist', uiCalls.every((m) => classMethods(GameUI).has(m)),
    uiCalls.filter((m) => !classMethods(GameUI).has(m)).join(', '));
check('HUD exposes applyClock (real-clock HUD)', classMethods(UIManager).has('applyClock'));
check('HUD exposes syncStorage (silo/barn bars)', classMethods(UIManager).has('syncStorage'));
check('GameUI supports the storage panel', (() => {
    const uiSrc = readFileSync(join(root, 'js/ui/UI.js'), 'utf8');
    return uiSrc.includes("storage: { title:") && uiSrc.includes("_renderStorage(") && uiSrc.includes("_renderFertilizer(") && uiSrc.includes("_renderAnimals(");
})());

/* ---- 6) عقد العالم: الدوال التي يناديها main.js على Environment/Interior/Yard ---- */
console.log('\n── World surface used by main.js ─────────────────────────');
check('Environment.update accepts (delta, t, clock, playerPos)', Environment.prototype.update.length >= 2);
check('Environment exposes setSeason / updateSky / getNearestDoor',
    ['setSeason', 'updateSky', 'getNearestDoor'].every((m) => classMethods(Environment).has(m)));
check('HouseInterior exposes the enter/exit API',
    ['setVisible', 'getSpawnPoint', 'getNearestInteractable', 'toggleChest', 'update', 'dispose']
        .every((m) => classMethods(HouseInterior).has(m)));
check('HouseInterior.getOutsideExit is static', typeof HouseInterior.getOutsideExit === 'function');
check('ProductionYard exposes syncFromState / getWorldPos / pick / update',
    ['syncFromState', 'getWorldPos', 'pick', 'update'].every((m) => classMethods(ProductionYard).has(m)));

/* ---- 7) FarmLayout: كل ما يستورده main.js مُصدَّر فعلًا ---- */
console.log('\n── FarmLayout imports used by main.js ────────────────────');
const Layout = await import('../js/world/FarmLayout.js');

/*
 * نستخرج قائمة الاستيراد نفسها (لا نصًا مجاورًا عشوائيًا) وندعم
 * الأسماء المستعارة: `HOUSE as HOUSE_LAYOUT` ⇒ نفحص `HOUSE`.
 */
const layoutImportRe = /import\s*\{([^}]*)\}\s*from\s*'\.\/world\/FarmLayout\.js'/;
const layoutImport = mainSrc.match(layoutImportRe);
const importedNames = (layoutImport ? layoutImport[1] : '')
    .split(',')
    .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);

check('main.js really imports from FarmLayout', importedNames.length > 0, 'import block not found');
const missingExports = importedNames.filter((n) => !(n in Layout));
check(`every FarmLayout symbol imported by main.js is exported (${importedNames.length} symbols)`,
    missingExports.length === 0, missingExports.join(', '));

/* ---------- ملخص ---------- */
console.log('\n' + '═'.repeat(60));
if (failures.length === 0) {
    console.log(`✅ CONTRACTS PASS — ${passed} checks, 0 failures.`);
    console.log('═'.repeat(60));
    process.exit(0);
} else {
    console.log(`❌ CONTRACTS FAIL — ${passed} passed, ${failures.length} failed.`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log('═'.repeat(60));
    process.exit(1);
}
