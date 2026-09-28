#!/usr/bin/env node
// Chạy unit test với 3 múi giờ của tiến trình (REQ-BK-12, BK-T38).
// Mỗi lần ghi reports/unit-<tz>.xml; sync-ticks chỉ tick khi test pass ở cả 3.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ZONES = ['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York'];

fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
let failed = false;
for (const tz of ZONES) {
  console.log(`\n=== TZ=${tz} ===`);
  const r = spawnSync(process.execPath, [
    '--test',
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=junit', `--test-reporter-destination=reports/unit-${tz.replace(/\//g, '-')}.xml`,
    'backend/tests/unit/**/*.test.js',
  ], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, TZ: tz } });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
