// REQ-DP-03, REQ-DP-04, REQ-DP-07: tham số tài nguyên từ biến môi trường, kiểm RAM host, dọn image.
const test = require('node:test');
const assert = require('node:assert/strict');
const { configFromEnv, checkHostMemory, GiB, DAY } = require('../../src/config');
const { imagesToRemove } = require('../../src/container/images');

const MiB = 1024 ** 2;

test('DP-T07 configFromEnv: không có biến → giá trị SPEC; có biến → đọc đúng đơn vị', () => {
  const d = configFromEnv({});
  assert.equal(d.sessionMemoryBytes, 28 * GiB);
  assert.equal(d.sessionShmBytes, 8 * GiB);
  assert.equal(d.hostReservedMemoryBytes, 8 * GiB);
  assert.equal(d.hostReservedCpuThreads, 2);
  assert.equal(d.userQuotaSoftBytes, 80 * GiB);
  assert.equal(d.userQuotaHardBytes, 100 * GiB);
  assert.equal(d.userQuotaGraceMs, 7 * DAY);
  assert.equal(d.containerWritableLayer, '20G');
  assert.equal(d.baseImage, 'vmu/base:cuda12.8');

  const t = configFromEnv({
    SESSION_MEMORY: '256M',
    SESSION_SHM: '64M',
    HOST_RESERVED_MEMORY: '384M',
    HOST_RESERVED_CPU_THREADS: '0',
    USER_QUOTA_SOFT: '1G',
    USER_QUOTA_HARD: '2G',
    USER_QUOTA_GRACE: '10m',
    CONTAINER_WRITABLE_LAYER: '2G',
    BASE_IMAGE: 'vmu/base:lite',
  });
  assert.equal(t.sessionMemoryBytes, 268435456);
  assert.equal(t.sessionShmBytes, 64 * MiB);
  assert.equal(t.hostReservedMemoryBytes, 384 * MiB);
  assert.equal(t.hostReservedCpuThreads, 0);
  assert.equal(t.userQuotaSoftBytes, GiB);
  assert.equal(t.userQuotaHardBytes, 2147483648);
  assert.equal(t.userQuotaGraceMs, 600000);
  assert.equal(t.containerWritableLayer, '2G');
  assert.equal(t.baseImage, 'vmu/base:lite');
  // Số byte thuần cũng được
  assert.equal(configFromEnv({ SESSION_MEMORY: '1073741824', SESSION_SHM: '536870912' }).sessionMemoryBytes, GiB);
});

test('DP-T08 configFromEnv: giá trị sai → lỗi nêu tên biến', () => {
  for (const bad of ['28GB', '1.5G', '-1', '0', 'abc', '']) {
    assert.throws(() => configFromEnv({ SESSION_MEMORY: bad }), /SESSION_MEMORY/, JSON.stringify(bad));
  }
  assert.throws(() => configFromEnv({ USER_QUOTA_SOFT: '3G', USER_QUOTA_HARD: '2G' }), /USER_QUOTA_SOFT/);
  assert.throws(() => configFromEnv({ SESSION_SHM: '1G', SESSION_MEMORY: '512M' }), /SESSION_SHM/);
  assert.throws(() => configFromEnv({ USER_QUOTA_GRACE: '7' }), /USER_QUOTA_GRACE/);
  assert.throws(() => configFromEnv({ HOST_RESERVED_CPU_THREADS: '-1' }), /HOST_RESERVED_CPU_THREADS/);
  assert.throws(() => configFromEnv({ CONTAINER_WRITABLE_LAYER: '20GB' }), /CONTAINER_WRITABLE_LAYER/);
  assert.throws(() => configFromEnv({ BASE_IMAGE: 'có dấu cách' }), /BASE_IMAGE/);
});

test('DP-T09 checkHostMemory: tổng RAM container ≤ RAM host − phần dành cho host', () => {
  const prod = configFromEnv({});
  assert.doesNotThrow(() => checkHostMemory(prod, 64 * GiB));
  assert.throws(() => checkHostMemory(prod, 63 * GiB), /RAM/);
  const vps = configFromEnv({ SESSION_MEMORY: '256M', SESSION_SHM: '64M', HOST_RESERVED_MEMORY: '384M' });
  assert.doesNotThrow(() => checkHostMemory(vps, 960 * MiB));
  assert.throws(() => checkHostMemory(vps, 800 * MiB), /RAM/);
});

test('DP-T10 imagesToRemove: chỉ xóa image quá hạn, không phải BASE_IMAGE, không có container dùng', () => {
  const now = Date.parse('2026-10-05T03:00:00Z');
  const ago = (days) => new Date(now - days * DAY).toISOString();
  const images = [
    { id: 'sha256:old', created: ago(31) },
    { id: 'sha256:base', created: ago(90) },
    { id: 'sha256:stopped', created: ago(40) },
    { id: 'sha256:new', created: ago(5) },
  ];
  const out = imagesToRemove(images, { baseImageId: 'sha256:base', usedImageIds: ['sha256:stopped'], now, retentionMs: 30 * DAY });
  assert.deepEqual(out, ['sha256:old']);
  // Không có gì quá hạn → không xóa gì
  assert.deepEqual(imagesToRemove([{ id: 'sha256:a', created: ago(1) }], { baseImageId: null, usedImageIds: [], now, retentionMs: 30 * DAY }), []);
});
