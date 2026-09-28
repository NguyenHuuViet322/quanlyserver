// Bản giả của lớp thao tác hệ điều hành (useradd, thư mục, XFS quota, mật khẩu, SSH key).
// Cùng giao diện với backend/src/system/linux.js; ghi lại trạng thái để test kiểm tra
// và cho phép giả lập lỗi ở một bước bất kỳ.

function createFakeSystem() {
  const state = {
    users: new Map(), // username -> { uid, password, mustChange, locked, keys }
    homes: new Map(), // username -> uid
    quotas: new Map(), // uid -> { soft, hard, path }
    purged: [],
    usage: new Map(), // uid -> số byte đã dùng (giả lập xfs_quota)
  };
  const failures = new Set();
  const calls = [];

  function step(name, fn) {
    return async (...args) => {
      calls.push([name, ...args]);
      if (failures.has(name)) throw new Error(`giả lập lỗi ở ${name}`);
      return fn(...args);
    };
  }

  return {
    state,
    calls,
    failOn: (name) => failures.add(name),
    clearFailures: () => failures.clear(),

    createUser: step('createUser', ({ username, uid }) => {
      state.users.set(username, { uid, password: null, mustChange: false, locked: false, keys: [] });
    }),
    deleteUser: step('deleteUser', ({ username }) => {
      state.users.delete(username);
    }),
    createHome: step('createHome', ({ username, uid }) => {
      state.homes.set(username, uid);
    }),
    removeHome: step('removeHome', ({ username }) => {
      state.homes.delete(username);
    }),
    setProjectQuota: step('setProjectQuota', ({ username, uid, softBytes, hardBytes }) => {
      state.quotas.set(uid, { soft: softBytes, hard: hardBytes, path: `/data/users/${username}` });
    }),
    removeProjectQuota: step('removeProjectQuota', ({ uid }) => {
      state.quotas.delete(uid);
    }),
    setPassword: step('setPassword', ({ username, password, expireNow }) => {
      const u = state.users.get(username);
      u.password = password;
      u.mustChange = !!expireNow;
    }),
    lockUser: step('lockUser', ({ username }) => {
      const u = state.users.get(username);
      if (u) u.locked = true;
    }),
    unlockUser: step('unlockUser', ({ username }) => {
      const u = state.users.get(username);
      if (u) u.locked = false;
    }),
    setAuthorizedKeys: step('setAuthorizedKeys', ({ username, keys }) => {
      state.users.get(username).keys = [...keys];
    }),
    readQuotas: step('readQuotas', () =>
      [...state.quotas].map(([uid, q]) => ({ projectId: uid, usedBytes: state.usage.get(uid) || 0, softBytes: q.soft, hardBytes: q.hard }))),
    purgeUser: step('purgeUser', ({ username, uid }) => {
      state.users.delete(username);
      state.homes.delete(username);
      state.quotas.delete(uid);
      state.purged.push(username);
    }),
  };
}

module.exports = { createFakeSystem };
