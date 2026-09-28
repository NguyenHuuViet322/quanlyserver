// M4 — lệnh docker run sinh ra (docs/10-design/container.md)
const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults: cfg } = require('../../src/config');
const { buildRunArgs } = require('../../src/container/run-args');

const IMAGE = 'vmu/pytorch:2.8-cuda12.8';
const base = (over = {}) => ({
  booking: { id: 42, use_gpu: true, image: IMAGE, ports: [10001, 10006] },
  user: { username: 'vietnh', uid: 2001 },
  ports: { from: 10000, to: 10099 },
  allowedImages: [IMAGE],
  cpuThreads: 32,
  ...over,
});
const valueAfter = (args, flag) => args[args.indexOf(flag) + 1];

test('CT-T05 host N = 32 → --cpus 15; N = 16 → --cpus 7', () => {
  assert.equal(valueAfter(buildRunArgs(base(), cfg), '--cpus'), '15');
  assert.equal(valueAfter(buildRunArgs(base({ cpuThreads: 16 }), cfg), '--cpus'), '7');
});

test('CT-T09 không có --privileged, --cap-add, docker.sock, --network=host, --restart; có no-new-privileges', () => {
  for (const useGpu of [true, false]) {
    const args = buildRunArgs(base({ booking: { id: 42, use_gpu: useGpu, image: IMAGE, ports: [] } }), cfg);
    const joined = args.join(' ');
    for (const bad of ['--privileged', '--cap-add', 'docker.sock', '--network', '--net=', '--pid', '--restart']) {
      assert.ok(!joined.includes(bad), `có ${bad}`);
    }
    assert.equal(valueAfter(args, '--security-opt'), 'no-new-privileges');
    assert.equal(valueAfter(args, '--user'), '2001:2001');
    // Đúng 2 mount
    assert.deepEqual(args.filter((_, i) => args[i - 1] === '-v'), ['/data/users/vietnh:/workspace:rw', '/data/shared:/shared:ro']);
    assert.equal(args.includes('--gpus'), useGpu);
    assert.equal(valueAfter(args, '--memory'), '28g');
    assert.equal(valueAfter(args, '--memory-swap'), '28g');
    assert.equal(valueAfter(args, '--shm-size'), '8g');
    assert.equal(valueAfter(args, '--storage-opt'), 'size=20G');
    assert.ok(args.includes('TZ=Asia/Ho_Chi_Minh'));
  }
});

test('CT-T10 cổng ngoài dải → ném lỗi; cổng trong dải → -p 127.0.0.1:p:p', () => {
  assert.throws(() => buildRunArgs(base({ booking: { id: 42, use_gpu: false, image: IMAGE, ports: [10100] } }), cfg), /cổng/i);
  assert.throws(() => buildRunArgs(base({ booking: { id: 42, use_gpu: false, image: IMAGE, ports: [22] } }), cfg), /cổng/i);
  const ok = buildRunArgs(base(), cfg);
  assert.deepEqual(ok.filter((_, i) => ok[i - 1] === '-p'), ['127.0.0.1:10001:10001', '127.0.0.1:10006:10006']);
});

test('CT-T11 image ngoài danh sách → ném lỗi, không sinh lệnh', () => {
  assert.throws(() => buildRunArgs(base({ booking: { id: 42, use_gpu: false, image: 'ubuntu:latest', ports: [] } }), cfg), /image/i);
});
