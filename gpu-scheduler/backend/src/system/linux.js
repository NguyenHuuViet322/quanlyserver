// Thao tác hệ điều hành thật cho REQ-US-07, 10..13, 16, REQ-ST-01.
// Backend không chạy bằng root: mọi lệnh đi qua helper cố định `vmu-provision` được phép bằng sudo
// (deploy/vmu-provision, docs/10-design/storage.md). Mật khẩu và SSH key truyền qua stdin, không qua argv.
const { spawn } = require('node:child_process');

const HELPER = process.env.VMU_PROVISION || '/usr/local/sbin/vmu-provision';

function run(action, args = [], input) {
  return new Promise((resolve, reject) => {
    const child = spawn('sudo', ['-n', HELPER, action, ...args.map(String)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`vmu-provision ${action} lỗi ${code}: ${stderr.trim()}`))));
    child.stdin.end(input ?? '');
  });
}

function createLinuxSystem() {
  return {
    createUser: ({ username, uid }) => run('create-user', [username, uid]),
    deleteUser: ({ username }) => run('delete-user', [username]),
    createHome: ({ username, uid }) => run('create-home', [username, uid]),
    removeHome: ({ username }) => run('remove-home', [username]),
    setProjectQuota: ({ username, uid, softBytes, hardBytes }) => run('set-quota', [username, uid, softBytes, hardBytes]),
    removeProjectQuota: ({ uid }) => run('remove-quota', [uid]),
    setPassword: ({ username, password, expireNow }) => run('set-password', [username, expireNow ? 'expire' : 'keep'], `${password}\n`),
    lockUser: ({ username }) => run('lock-user', [username]),
    unlockUser: ({ username }) => run('unlock-user', [username]),
    setAuthorizedKeys: ({ username, keys }) => run('set-keys', [username], keys.map((k) => `${k}\n`).join('')),
    purgeUser: ({ username, uid }) => run('purge-user', [username, uid]),
  };
}

module.exports = { createLinuxSystem };
