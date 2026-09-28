// Gọi Docker CLI thật. Cùng giao diện với backend/tests/helpers/fake-docker.js.
const { execFile } = require('node:child_process');
const { parseDockerStats, parseNvidiaSmi } = require('../monitoring/parse');

function docker(args) {
  return new Promise((resolve, reject) => {
    execFile('docker', args, { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.message = `docker ${args[0]}: ${(stderr || error.message).trim()}`;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

const isNoSuch = (e) => /No such (container|object)/i.test(e.message);

function createDocker() {
  return {
    async run(args) {
      return (await docker(args)).stdout.trim();
    },
    async inspect(name) {
      try {
        const { stdout } = await docker(['inspect', '--type', 'container', '--format', '{{json .State}}', name]);
        const s = JSON.parse(stdout);
        return { running: s.Running, exitCode: s.ExitCode, oomKilled: s.OOMKilled };
      } catch (e) {
        if (isNoSuch(e)) return null;
        throw e;
      }
    },
    async stop(name, timeoutSec) {
      await docker(['stop', '-t', String(timeoutSec), name]);
    },
    async rm(name) {
      await docker(['rm', '-f', name]);
    },
    async logs(name) {
      const { stdout, stderr } = await docker(['logs', '--timestamps', name]);
      return stdout + stderr;
    },
    async exec(name, cmd) {
      await docker(['exec', name, ...cmd]);
    },
    async stats(name) {
      try {
        const { stdout } = await docker(['stats', '--no-stream', '--format', '{{json .}}', name]);
        return parseDockerStats(stdout.trim().split('\n')[0]);
      } catch (e) {
        if (isNoSuch(e)) return null;
        throw e;
      }
    },
    // Chỉ có 1 GPU (device=0) và tại mỗi thời điểm chỉ 1 phiên dùng nó, nên số liệu GPU là của phiên GPU đang chạy
    async gpuStats() {
      const stdout = await new Promise((resolve, reject) => {
        execFile('nvidia-smi', ['--id=0', '--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
          (e, out) => (e ? reject(e) : resolve(out)));
      });
      return parseNvidiaSmi(stdout);
    },
    async listManaged() {
      const { stdout } = await docker(['ps', '-a', '--filter', 'label=vmu.booking', '--format', '{{.Names}}\t{{.Label "vmu.booking"}}\t{{.State}}']);
      return stdout.split('\n').filter(Boolean).map((line) => {
        const [name, id, state] = line.split('\t');
        return { name, bookingId: Number(id), running: state === 'running' };
      });
    },
  };
}

module.exports = { createDocker };
