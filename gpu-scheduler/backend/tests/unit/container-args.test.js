// M4 — lệnh docker run sinh ra (docs/10-design/container.md)
const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults: cfg } = require('../../src/config');
const { buildRunArgs } = require('../../src/container/run-args');

const base = (over = {}) => ({
  booking: { id: 42, use_gpu: true },
  user: { username: 'vietnh', uid: 2001 },
  cpuThreads: 32,
  ...over,
});
const valueAfter = (args, flag) => args[args.indexOf(flag) + 1];
const mounts = (args) => args.filter((_, i) => args[i - 1] === '-v');
const envs = (args) => args.filter((_, i) => args[i - 1] === '-e');

test('CT-T05 host N = 32 → --cpus 15; N = 16 → --cpus 7', () => {
  assert.equal(valueAfter(buildRunArgs(base(), cfg), '--cpus'), '15');
  assert.equal(valueAfter(buildRunArgs(base({ cpuThreads: 16 }), cfg), '--cpus'), '7');
});

test('CT-T09 không có --privileged, --cap-add, docker.sock, --network=host, --restart, -p; có no-new-privileges, --user uid:uid', () => {
  for (const useGpu of [true, false]) {
    const args = buildRunArgs(base({ booking: { id: 42, use_gpu: useGpu } }), cfg);
    const joined = args.join(' ');
    for (const bad of ['--privileged', '--cap-add', 'docker.sock', '--network=host', '--net=', '--pid', '--restart', '--publish']) {
      assert.ok(!joined.includes(bad), `có ${bad}`);
    }
    assert.ok(!args.includes('-p'));
    assert.equal(valueAfter(args, '--security-opt'), 'no-new-privileges');
    assert.equal(valueAfter(args, '--user'), '2001:2001');
    assert.equal(args.includes('--gpus'), useGpu);
    assert.equal(valueAfter(args, '--memory'), '28g');
    assert.equal(valueAfter(args, '--memory-swap'), '28g');
    assert.equal(valueAfter(args, '--shm-size'), '8g');
    assert.equal(valueAfter(args, '--storage-opt'), 'size=20G');
  }
});

test('CT-T10 không mở cổng ra máy chủ (-p/--publish), luôn gắn mạng vmu-net', () => {
  const args = buildRunArgs(base(), cfg);
  assert.ok(!args.includes('-p') && !args.some((a) => a.startsWith('--publish')));
  assert.equal(valueAfter(args, '--network'), 'vmu-net');
  assert.equal(cfg.containerNetwork, 'vmu-net');
});

test('CT-T11 luôn dùng BASE_IMAGE, HOME=/workspace, TZ; đúng 3 mount /workspace, /shared, authorized_keys', () => {
  const args = buildRunArgs(base({ booking: { id: 42, use_gpu: false, image: 'ubuntu:latest' } }), cfg);
  assert.ok(args.includes(cfg.baseImage), 'không dùng BASE_IMAGE');
  assert.ok(!args.includes('ubuntu:latest'), 'dùng image do người dùng gửi');
  assert.deepEqual(args.slice(-3), [cfg.baseImage, 'sleep', 'infinity']);
  assert.deepEqual(mounts(args), [
    '/data/users/vietnh:/workspace:rw',
    '/data/shared:/shared:ro',
    '/home/vietnh/.ssh/authorized_keys:/etc/vmu/authorized_keys:ro',
  ]);
  assert.deepEqual(envs(args), ['HOME=/workspace', 'TZ=Asia/Ho_Chi_Minh']);
  assert.equal(valueAfter(args, '-w'), '/workspace');
});
