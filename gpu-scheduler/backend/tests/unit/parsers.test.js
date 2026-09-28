// Đọc kết quả lệnh hệ thống. Test hỗ trợ cho ST-T06, MN-T01 (hai test đó là system, chạy trên server thật).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuotaReport } = require('../../src/storage/xfs');
const { parseDockerStats, parseNvidiaSmi } = require('../../src/monitoring/parse');

const GiB = 1024 ** 3;

test('[hỗ trợ ST-T06] đọc `xfs_quota -x -c "report -p -b -N -n"` (đơn vị KiB)', () => {
  const out = [
    '#0                   0          0          0     00 [--------]',
    '#2001         12582912   83886080  104857600     00 [--------]',
    '#2002         88080384   83886080  104857600     00  [6 days]',
    '',
  ].join('\n');
  assert.deepEqual(parseQuotaReport(out), [
    { projectId: 0, usedBytes: 0, softBytes: 0, hardBytes: 0 },
    { projectId: 2001, usedBytes: 12 * GiB, softBytes: 80 * GiB, hardBytes: 100 * GiB },
    { projectId: 2002, usedBytes: 84 * GiB, softBytes: 80 * GiB, hardBytes: 100 * GiB },
  ]);
});

test('[hỗ trợ MN-T01] đọc `docker stats --no-stream --format {{json .}}` và `nvidia-smi --format=csv`', () => {
  const stats = parseDockerStats('{"CPUPerc":"312.50%","MemUsage":"4GiB / 28GiB","Name":"vmu-bk-42"}');
  assert.deepEqual(stats, { cpuPercent: 312.5, memBytes: 4 * GiB, memLimitBytes: 28 * GiB });
  assert.deepEqual(parseDockerStats('{"CPUPerc":"0.00%","MemUsage":"512MiB / 28GiB"}'), { cpuPercent: 0, memBytes: 512 * 1024 ** 2, memLimitBytes: 28 * GiB });
  // nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits (MiB)
  assert.deepEqual(parseNvidiaSmi('97, 20480, 32607\n'), { utilPercent: 97, memUsedBytes: 20480 * 1024 ** 2, memTotalBytes: 32607 * 1024 ** 2 });
});
