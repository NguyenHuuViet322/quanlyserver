#!/usr/bin/env node
// Khởi động PostgreSQL cho test và chạy thử (Docker, cổng 55432). Chạy lại bao nhiêu lần cũng được:
//   - chưa có container → tạo mới; đã có nhưng đang dừng → start; đang chạy → giữ nguyên
//   - chờ PostgreSQL sẵn sàng, tạo CSDL vmu_dev (cho npm run dev) nếu chưa có
const { spawnSync } = require('node:child_process');

const NAME = 'vmu-pg-test';
const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' });
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const info = docker('info', '--format', '{{.ServerVersion}}');
if (info.status !== 0) fail('Không kết nối được Docker. Hãy mở Docker Desktop rồi chạy lại.');

const state = docker('inspect', '--format', '{{.State.Status}}', NAME);
if (state.status !== 0) {
  console.log(`Tạo container ${NAME}…`);
  const r = docker('run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_DB=vmu_test',
    '-p', '55432:5432', 'postgres:16', '-c', 'timezone=UTC');
  if (r.status !== 0) fail(r.stderr);
} else if (state.stdout.trim() !== 'running') {
  console.log(`Khởi động container ${NAME}…`);
  const r = docker('start', NAME);
  if (r.status !== 0) fail(r.stderr);
} else {
  console.log(`Container ${NAME} đang chạy.`);
}

let ready = false;
for (let i = 0; i < 30 && !ready; i++) {
  ready = docker('exec', NAME, 'pg_isready', '-U', 'postgres').status === 0;
  if (!ready) sleep(1000);
}
if (!ready) fail('PostgreSQL chưa sẵn sàng sau 30 giây.');

const has = docker('exec', NAME, 'psql', '-U', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'vmu_dev'");
if (has.stdout.trim() !== '1') {
  const r = docker('exec', NAME, 'psql', '-U', 'postgres', '-c', 'CREATE DATABASE vmu_dev');
  if (r.status !== 0) fail(r.stderr);
  console.log('Đã tạo CSDL vmu_dev.');
}
console.log('PostgreSQL sẵn sàng: localhost:55432 (vmu_test cho test, vmu_dev cho npm run dev).');
