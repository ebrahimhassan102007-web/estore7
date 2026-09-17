/**
 * run.mjs — run the whole verification suite.
 *
 *   1. static checks        — every ES module parses, imports resolve, index.html wired
 *   2. production chain     — GameData integrity + full wheat -> flour -> bread lifecycle
 *   3. cold-reboot persist  — saves replayed through fresh-process page reloads
 *
 * Usage: node tests/run.mjs   (or: npm test)
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

const suites = [
    { name: 'static checks', file: 'tests/static-checks.mjs' },
    { name: 'production chain', file: 'tests/chain.test.mjs' },
    { name: 'cold-reboot persistence', file: 'tests/persistence.test.mjs' }
];

let grandPass = 0;
let grandFail = 0;
const failedSuites = [];

for (const suite of suites) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(`SUITE: ${suite.name}  (node ${suite.file})`);
    console.log('='.repeat(72));

    const res = spawnSync(process.execPath, [join(ROOT, suite.file)], {
        cwd: ROOT,
        encoding: 'utf8'
    });

    const out = `${res.stdout || ''}${res.stderr || ''}`;
    process.stdout.write(out.endsWith('\n') ? out : out + '\n');

    // A suite prints one SUMMARY per sub-run (the persistence suite prints one
    // per cold boot) followed by its own aggregate -> take the LAST match.
    const matches = [...out.matchAll(/SUMMARY pass=(\d+) fail=(\d+)/g)];
    const m = matches.length ? matches[matches.length - 1] : null;
    if (m) {
        grandPass += Number(m[1]);
        grandFail += Number(m[2]);
    } else {
        failedSuites.push(`${suite.name} (crashed, no summary)`);
        grandFail += 1;
    }

    if (res.status !== 0 && !m) {
        failedSuites.push(`${suite.name} (exit ${res.status})`);
    } else if (res.status !== 0) {
        failedSuites.push(suite.name);
    }
}

console.log(`\n${'='.repeat(72)}`);
console.log(`TOTAL: ${grandPass} passed, ${grandFail} failed across ${suites.length} suites`);
if (failedSuites.length) {
    console.log(`FAILING SUITES: ${failedSuites.join(', ')}`);
}
console.log('='.repeat(72));

process.exit(grandFail === 0 ? 0 : 1);
