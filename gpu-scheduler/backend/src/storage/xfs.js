// Đọc `xfs_quota -x -c 'report -p -b -N -n' /data` — REQ-ST-05. Đơn vị cột là KiB.
// Mỗi dòng: #<project id> <used> <soft> <hard> <warn> [<grace>]
function parseQuotaReport(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = line.match(/^#?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\b/);
    if (!m) continue;
    const [, id, used, soft, hard] = m.map(Number);
    out.push({ projectId: id, usedBytes: used * 1024, softBytes: soft * 1024, hardBytes: hard * 1024 });
  }
  return out;
}

module.exports = { parseQuotaReport };
