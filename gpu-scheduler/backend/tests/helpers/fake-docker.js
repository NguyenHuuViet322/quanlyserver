// Bản giả của backend/src/container/docker.js: ghi lại lệnh, giả lập container chạy/thoát/OOM.

function createFakeDocker({ runDelayMs = 0 } = {}) {
  const containers = new Map(); // name -> { args, running, exitCode, oomKilled, logs, labels }
  const calls = [];
  const failures = new Set();

  const nameOf = (args) => args[args.indexOf('--name') + 1];
  const labelsOf = (args) => {
    const labels = {};
    args.forEach((a, i) => {
      if (a === '--label') {
        const [k, v] = args[i + 1].split('=');
        labels[k] = v;
      }
    });
    return labels;
  };

  return {
    containers,
    calls,
    failOn: (op) => failures.add(op),
    clearFailures: () => failures.clear(),
    runsOf: (name) => calls.filter((c) => c[0] === 'run' && nameOf(c[1]) === name),

    // Giả lập: container tự thoát (oom = bị OOM killer)
    exit(name, { oom = false, code = oom ? 137 : 0 } = {}) {
      const c = containers.get(name);
      c.running = false;
      c.exitCode = code;
      c.oomKilled = oom;
    },
    // Giả lập container tồn tại mà Scheduler không biết (vd sau khi Scheduler crash)
    addContainer(name, bookingId, { running = true, cpus = null } = {}) {
      containers.set(name, { args: cpus ? ['--cpus', String(cpus)] : [], running, exitCode: null, oomKilled: false, logs: '', labels: { 'vmu.booking': String(bookingId) } });
    },

    async run(args) {
      calls.push(['run', args]);
      if (runDelayMs) await new Promise((r) => setTimeout(r, runDelayMs));
      if (failures.has('run')) throw new Error('Unable to find image: image hỏng');
      const name = nameOf(args);
      if (containers.has(name)) throw new Error(`Conflict. The container name "/${name}" is already in use`);
      containers.set(name, { args, running: true, exitCode: null, oomKilled: false, logs: `khởi chạy ${name}\n`, labels: labelsOf(args) });
      return `id-${name}`;
    },
    async inspect(name) {
      calls.push(['inspect', name]);
      const c = containers.get(name);
      if (!c) return null;
      const cpus = c.args.includes('--cpus') ? Number(c.args[c.args.indexOf('--cpus') + 1]) : null;
      return { running: c.running, exitCode: c.exitCode, oomKilled: c.oomKilled, cpus };
    },
    async stop(name, timeoutSec) {
      calls.push(['stop', name, timeoutSec]);
      const c = containers.get(name);
      if (c) c.running = false;
    },
    async rm(name) {
      calls.push(['rm', name]);
      containers.delete(name);
    },
    async logs(name) {
      calls.push(['logs', name]);
      return containers.get(name)?.logs ?? '';
    },
    async exec(name, cmd, opts = {}) {
      calls.push(['exec', name, cmd, opts]);
      const c = containers.get(name);
      if (c) c.logs += `${cmd.join(' ')}\n`;
    },
    async stats(name) {
      calls.push(['stats', name]);
      const c = containers.get(name);
      if (!c || !c.running) return null;
      return { cpuPercent: 312.5, memBytes: 4 * 1024 ** 3, memLimitBytes: 28 * 1024 ** 3 };
    },
    async gpuStats() {
      calls.push(['gpuStats']);
      return { utilPercent: 97, memUsedBytes: 20 * 1024 ** 3, memTotalBytes: 32 * 1024 ** 3 };
    },
    async listManaged() {
      calls.push(['listManaged']);
      return [...containers].filter(([, c]) => c.labels['vmu.booking']).map(([name, c]) => ({ name, bookingId: Number(c.labels['vmu.booking']), running: c.running }));
    },
  };
}

module.exports = { createFakeDocker };
