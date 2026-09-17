/**
 * static-checks.mjs — parse every ES module in the project, resolve every
 * import specifier, and verify index.html's wiring (stylesheets, entry
 * script, import map).
 *
 * Usage: node tests/static-checks.mjs
 */

import { readdirSync, readFileSync, writeFileSync, statSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

import { test, section, assert, eq } from './harness.mjs';
import { report } from './harness.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'tests') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (full.endsWith('.js')) out.push(full);
    }
    return out;
}

const jsFiles = walk(join(ROOT, 'js')).sort();
const tmpRoot = mkdtempSync(join(tmpdir(), 'farm-syntax-'));

// ------------------------------------------------------------------
section('ESM syntax — node --check');

test(`project contains JS modules to check`, () =>
    assert(jsFiles.length >= 30, `only ${jsFiles.length} .js files found`));

const parseFailures = [];
for (const file of jsFiles) {
    const rel = relative(ROOT, file);
    // `node --check` only parses as an ES module when the file ends in .mjs.
    const tmp = join(tmpRoot, rel.replace(/[\\/]/g, '__') + '.mjs');
    writeFileSync(tmp, readFileSync(file));
    try {
        execFileSync(process.execPath, ['--check', tmp], { cwd: ROOT, stdio: 'pipe' });
    } catch (err) {
        parseFailures.push(`${rel}: ${String(err.stderr || err.message).split('\n')[0]}`);
    }
}

test(`all ${jsFiles.length} JS files parse as ES modules`, () =>
    assert(parseFailures.length === 0, parseFailures.join(' | ')));

rmSync(tmpRoot, { recursive: true, force: true });

// ------------------------------------------------------------------
section('Module graph — imports resolve');

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const NAMED_IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const EXPORT_DECL_RE = /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_LIST_RE = /export\s*\{([^}]*)\}/g;

function exportedNames(src) {
    const names = new Set();
    for (const m of src.matchAll(EXPORT_DECL_RE)) names.add(m[1]);
    for (const m of src.matchAll(EXPORT_LIST_RE)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            if (name) names.add(name);
        }
    }
    return names;
}

const sources = new Map(
    jsFiles.map(f => [f, readFileSync(f, 'utf8')])
);

const missingTargets = [];
const missingNamed = [];
let relativeCount = 0;
let bareCount = 0;

const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const importMap = JSON.parse(
    /<script type="importmap">([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? '{}'
).imports ?? {};

for (const [file, src] of sources) {
    const rel = relative(ROOT, file);

    for (const m of src.matchAll(IMPORT_RE)) {
        const spec = m[1];
        if (spec.startsWith('.')) {
            relativeCount++;
            const target = resolve(dirname(file), spec);
            if (!existsSync(target)) {
                missingTargets.push(`${rel} -> ${spec}`);
                continue;
            }
            // verify named bindings exist in the target module
            const targetSrc = sources.get(target) ?? readFileSync(target, 'utf8');
            const available = exportedNames(targetSrc);
            for (const nm of src.matchAll(NAMED_IMPORT_RE)) {
                if (nm[2] !== spec) continue;
                for (const raw of nm[1].split(',')) {
                    const name = raw.trim().split(/\s+as\s+/)[0]?.trim();
                    if (!name) continue;
                    if (!available.has(name)) {
                        missingNamed.push(`${rel} imports { ${name} } from ${spec} (not exported)`);
                    }
                }
            }
        } else {
            bareCount++;
            const mapped = Object.keys(importMap).some(k =>
                k.endsWith('/') ? spec.startsWith(k) : spec === k
            );
            if (!mapped) missingTargets.push(`${rel} -> bare '${spec}' not in importmap`);
        }
    }
}

test('every relative import resolves to a real file', () =>
    assert(
        missingTargets.filter(t => !t.includes('bare')).length === 0,
        missingTargets.filter(t => !t.includes('bare')).join(' | ')
    ));

test('every bare specifier is covered by the import map', () =>
    assert(
        missingTargets.filter(t => t.includes('bare')).length === 0,
        missingTargets.filter(t => t.includes('bare')).join(' | ')
    ));

test('every named import is actually exported by its module', () =>
    assert(missingNamed.length === 0, missingNamed.join(' | ')));

test('import graph is non-trivial (relative + bare specifiers)', () => {
    assert(relativeCount >= 20, `only ${relativeCount} relative imports`);
    assert(bareCount >= 2, `only ${bareCount} bare imports`);
});

// ------------------------------------------------------------------
section('index.html — wiring');

test('entry module script points at js/main.js and exists', () => {
    const m = /<script type="module" src="([^"]+)"/.exec(indexHtml);
    assert(m, 'no module entry script');
    assert(m[1].includes('js/main.js'), `entry is ${m[1]}`);
    assert(existsSync(resolve(ROOT, m[1].replace(/^\.\//, ''))), 'entry file missing');
});

test('all linked stylesheets exist on disk', () => {
    const hrefs = [...indexHtml.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)]
        .map(m => m[1])
        .filter(h => !h.startsWith('http'));
    assert(hrefs.length >= 5, `only ${hrefs.length} local stylesheets`);
    for (const h of hrefs) {
        assert(existsSync(resolve(ROOT, h.replace(/^\.\//, ''))), `missing stylesheet ${h}`);
    }
});

test('css/production.css is linked from index.html', () => {
    assert(indexHtml.includes('./css/production.css'), 'production.css not linked');
});

test('production modules exist on disk', () => {
    for (const f of [
        'js/ui/ProductionPanel.js',
        'js/world/ProductionYard.js',
        'js/systems/ProductionSystem.js',
        'js/ui/SoundFX.js',
        'js/ui/Toast.js',
        'css/production.css'
    ]) {
        const full = join(ROOT, f);
        assert(existsSync(full), `missing ${f}`);
        assert(statSync(full).size > 0, `empty ${f}`);
    }
});

test('main.js imports the production UI + world modules', () => {
    const main = sources.get(join(ROOT, 'js/main.js'));
    assert(main, 'main.js not read');
    for (const spec of [
        './ui/ProductionPanel.js',
        './world/ProductionYard.js',
        './systems/ProductionSystem.js'
    ]) {
        assert(main.includes(spec), `main.js does not import ${spec}`);
    }
});

test('empty stub modules are not imported by main.js', () => {
    const main = sources.get(join(ROOT, 'js/main.js'));
    const stubs = jsFiles
        .filter(f => statSync(f).size === 0)
        .map(f => './' + relative(join(ROOT, 'js'), f).replace(/\\/g, '/'));
    for (const s of stubs) {
        assert(!main.includes(`'${s}'`), `main.js imports empty stub ${s}`);
    }
    eq(stubs.length, 5, `expected 5 known empty stubs, found ${stubs.length}`);
});

process.exit(report('static checks'));
