/**
 * Keeps a running total of git clones. GitHub only shows the last 14 days, so
 * each run folds the latest 14 into a per-day record that never forgets, and
 * writes a shields.io badge with the all-time total.
 *
 * A day still inside the window is overwritten, since GitHub may still be
 * counting it; once it leaves the window, its last count stays.
 *
 * Usage: node traffic-clones.mjs <api-response.json> <data-dir>
 *   <api-response.json>  the body of GET /repos/{owner}/{repo}/traffic/clones
 *   <data-dir>           holds clones.json (the record) and clones-badge.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [responsePath, dataDir] = process.argv.slice(2);
if (!responsePath || !dataDir) {
  console.error('Usage: node traffic-clones.mjs <api-response.json> <data-dir>');
  process.exit(1);
}

const recordPath = join(dataDir, 'clones.json');
const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : { days: {} };

const latest = JSON.parse(readFileSync(responsePath, 'utf8'));
if (!Array.isArray(latest.clones)) {
  console.error('Not a traffic/clones response:', JSON.stringify(latest).slice(0, 200));
  process.exit(1);
}
for (const { timestamp, count, uniques } of latest.clones) {
  record.days[timestamp.slice(0, 10)] = { count, uniques };
}

// Sorted by date, so the file reads as a diary and diffs stay small.
record.days = Object.fromEntries(Object.entries(record.days).sort(([a], [b]) => a.localeCompare(b)));
record.total = Object.values(record.days).reduce((sum, day) => sum + day.count, 0);
record.since = Object.keys(record.days)[0] ?? null;

writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
writeFileSync(
  join(dataDir, 'clones-badge.json'),
  `${JSON.stringify({ schemaVersion: 1, label: 'clones', message: record.total.toLocaleString('en-US'), color: 'blue' })}\n`
);
console.log(`${record.total} clones since ${record.since}`);
