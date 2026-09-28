// Đọc số liệu `docker stats` và `nvidia-smi` — REQ-MN-01.
const UNITS = {
  B: 1,
  KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12,
  KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4,
};

function parseSize(s) {
  const m = String(s).trim().match(/^([\d.]+)\s*([a-z]*)$/i);
  if (!m) return null;
  const unit = UNITS[(m[2] || 'B').toUpperCase()];
  return unit ? Math.round(parseFloat(m[1]) * unit) : null;
}

// Một dòng của `docker stats --no-stream --format '{{json .}}'`
function parseDockerStats(line) {
  const j = JSON.parse(line);
  const [used, limit] = String(j.MemUsage).split('/');
  return {
    cpuPercent: parseFloat(String(j.CPUPerc).replace('%', '')) || 0,
    memBytes: parseSize(used),
    memLimitBytes: parseSize(limit),
  };
}

// `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits` (MiB)
function parseNvidiaSmi(text) {
  const [util, used, total] = String(text).split('\n')[0].split(',').map((x) => Number(x.trim()));
  return { utilPercent: util, memUsedBytes: used * 1024 ** 2, memTotalBytes: total * 1024 ** 2 };
}

module.exports = { parseSize, parseDockerStats, parseNvidiaSmi };
