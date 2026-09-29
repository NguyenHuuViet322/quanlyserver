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
        const { stdout } = await docker(['inspect', '--type', 'container', '--format', '{"State":{{json .State}},"NanoCpus":{{.HostConfig.NanoCpus}}}', name]);
        const { State: s, NanoCpus } = JSON.parse(stdout);
        return { running: s.Running, exitCode: s.ExitCode, oomKilled: s.OOMKilled, cpus: NanoCpus ? NanoCpus / 1e9 : null };
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
    async exec(name, cmd, opts = {}) {
      await docker(['exec', ...(opts.user ? ['-u', opts.user] : []), name, ...cmd]);
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
    // REQ-DP-04: dữ liệu cho việc dọn image
    async listImages() {
      const ids = (await docker(['image', 'ls', '-aq', '--no-trunc'])).stdout.split('\n').filter(Boolean);
      if (!ids.length) return [];
      const { stdout } = await docker(['image', 'inspect', '--format', '{{.Id}}\t{{.Created}}', ...new Set(ids)]);
      return stdout.split('\n').filter(Boolean).map((line) => {
        const [id, created] = line.split('\t');
        return { id, created };
      });
    },
    async usedImageIds() {
      const names = (await docker(['ps', '-aq'])).stdout.split('\n').filter(Boolean);
      if (!names.length) return [];
      return (await docker(['inspect', '--type', 'container', '--format', '{{.Image}}', ...names])).stdout.split('\n').filter(Boolean);
    },
    async imageId(ref) {
      try {
        return (await docker(['image', 'inspect', '--format', '{{.Id}}', ref])).stdout.trim();
      } catch (e) {
        if (isNoSuch(e)) return null;
        throw e;
      }
    },
    async removeImage(id) {
      await docker(['rmi', id]);
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
