/**
 * harness.mjs — tiny dependency-free test runner.
 * Used both in-process (chain tests) and inside cold-boot child processes.
 */

const results = [];
let currentSection = 'general';

export function section(name) {
    currentSection = name;
}

function record(passed, name, detail) {
    results.push({ section: currentSection, name, passed, detail });
    const tag = passed ? 'PASS' : 'FAIL';
    const line = `  ${tag}  ${name}${passed ? '' : `  -> ${detail}`}`;
    console.log(line);
}

export function test(name, fn) {
    try {
        fn();
        record(true, name);
    } catch (err) {
        record(false, name, err?.message || String(err));
    }
}

export function assert(cond, msg = 'expected truthy') {
    if (!cond) throw new Error(msg);
}

export function eq(actual, expected, msg = '') {
    if (actual !== expected) {
        throw new Error(
            `${msg ? msg + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        );
    }
}

export function near(actual, expected, tolerance, msg = '') {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(
            `${msg ? msg + ': ' : ''}expected ~${expected} (±${tolerance}), got ${actual}`
        );
    }
}

export function throws(fn, msg = 'expected function to throw') {
    let threw = false;
    try { fn(); } catch { threw = true; }
    if (!threw) throw new Error(msg);
}

export function counts() {
    const pass = results.filter(r => r.passed).length;
    return { pass, fail: results.length - pass, total: results.length };
}

/** Print a grouped summary and return a process exit code. */
export function report(label) {
    const { pass, fail, total } = counts();
    console.log('');
    if (fail > 0) {
        console.log(`  FAILURES in ${label}:`);
        for (const r of results.filter(x => !x.passed)) {
            console.log(`    [${r.section}] ${r.name} -> ${r.detail}`);
        }
        console.log('');
    }
    console.log(`${label}: ${pass}/${total} passed, ${fail} failed`);
    console.log(`SUMMARY pass=${pass} fail=${fail} total=${total}`);
    return fail === 0 ? 0 : 1;
}
