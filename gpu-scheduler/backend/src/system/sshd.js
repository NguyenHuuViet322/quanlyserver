// REQ-CT-10: /etc/ssh/sshd_config.d/40-vmu-users.conf — mỗi user chỉ được SSH tunnel tới dải cổng của mình.
// File đứng trước 50-vmu.conf (`PermitOpen none`) nên giá trị riêng của từng user được áp dụng (docs/10-design/ssh.md).
const { portRange } = require('../users/ports');

function renderSshdUsers(users, cfg) {
  const lines = ['# Tự sinh bởi backend VMU — không sửa tay'];
  for (const u of users) {
    if (u.status !== 'active' && u.status !== 'locked') continue;
    const range = portRange(u.slot_index, cfg);
    if (!range) continue;
    const open = [];
    for (let p = range.from; p <= range.to; p++) open.push(`localhost:${p}`, `127.0.0.1:${p}`);
    lines.push(`Match User ${u.username}`, `    PermitOpen ${open.join(' ')}`);
  }
  return `${lines.join('\n')}\n`;
}

module.exports = { renderSshdUsers };
