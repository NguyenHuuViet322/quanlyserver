// Gọi Docker CLI thật. Cùng giao diện với backend/tests/helpers/fake-docker.js.
const { execFile } = require('node:child_process');

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
