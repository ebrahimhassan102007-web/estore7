/**
 * env.mjs — minimal browser shims so the game's logic modules can be
 * imported and exercised under plain Node.
 *
 * Deliberately does NOT shim THREE.js / WebGL. The 3D layer
 * (js/core/world3d.js, js/world/ProductionYard.js) and the DOM panels
 * (js/ui/*) are verified by the static checks + the live preview, not here.
 */

const store = new Map();

export const localStorageShim = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; }
};

/** Seed the shim from a previously captured snapshot (cold-boot tests). */
export function seedStorage(snapshot) {
    store.clear();
    if (!snapshot) return;
    for (const [k, v] of Object.entries(snapshot)) store.set(k, String(v));
}

/** Dump the shim so a child process can boot from it. */
export function dumpStorage() {
    return Object.fromEntries(store);
}

export function installBrowserShims() {
    globalThis.localStorage = localStorageShim;

    if (typeof globalThis.window === 'undefined') {
        globalThis.window = {
            // No indexedDB on purpose -> SaveManager must take the
            // localStorage fallback path, which is what the tests assert.
            addEventListener() {},
            removeEventListener() {},
            localStorage: localStorageShim,
            devicePixelRatio: 1,
            innerWidth: 1280,
            innerHeight: 720
        };
    }

    if (typeof globalThis.document === 'undefined') {
        globalThis.document = {
            hidden: false,
            addEventListener() {},
            removeEventListener() {},
            createElement: () => ({
                style: {},
                classList: { add() {}, remove() {}, toggle() {} },
                appendChild() {},
                setAttribute() {},
                addEventListener() {}
            }),
            body: { appendChild() {} }
        };
    }
}

installBrowserShims();
