#!/usr/bin/env node
// Tick / bỏ tick test case trong docs/20-test-cases từ báo cáo JUnit (Bước 6).
//
//   node tools/sync-ticks.js [--commit <sha>] reports/unit.xml reports/integration.xml …
//   node tools/sync-ticks.js reports                     # mọi file .xml trong thư mục
//   node tools/sync-ticks.js --manual SC-T04,CT-T01      # test system/manual, cần reports/system/<ID>.log
//
// Quy tắc:
//   - Test có ID trong báo cáo và mọi lần chạy đều pass  → [x] kèm ✅ `<commit>`
//   - Test có ID trong báo cáo mà fail / error / skipped  → [ ] (regression: bỏ tick)
//   - Test không có trong báo cáo                         → giữ nguyên

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CASES_DIR = path.join(ROOT, 'docs', '20-test-cases');
// ID ở đầu tên test, hoặc ngay sau tiền tố nhóm của Playwright ("nhóm › UI-T10 …")
const ID_RE = /(?:^|› )((?:US|BK|SC|CT|ST|MN|UI|DP)-T\d+)\b/;

function parseArgs(argv) {
  const opts = { commit: null, manual: [], reports: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--commit') opts.commit = argv[++i];
    else if (argv[i] === '--manual') opts.manual.push(...argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
    else if (fs.existsSync(argv[i]) && fs.statSync(argv[i]).isDirectory()) {
      // Thư mục: lấy mọi file .xml bên trong (npm script trên Windows không bung glob)
      opts.reports.push(...fs.readdirSync(argv[i]).filter((f) => f.endsWith('.xml')).map((f) => path.join(argv[i], f)));
    } else opts.reports.push(argv[i]);
  }
  return opts;
}

function resolveCommit(explicit) {
  if (explicit) return explicit;
  const env = process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Trả về Map<ID, 'pass' | 'fail'>
function readJUnit(files) {
  const results = new Map();
  for (const f of files) {
    const xml = fs.readFileSync(f, 'utf8');
    for (const m of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const name = decode((m[1].match(/\bname="([^"]*)"/) || [])[1] || '');
      const id = (name.match(ID_RE) || [])[1];
      if (!id) continue;
      const ok = !/<(failure|error|skipped)\b/.test(m[2] || '');
      results.set(id, results.get(id) === 'fail' || !ok ? 'fail' : 'pass');
    }
  }
  return results;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.reports.length === 0 && opts.manual.length === 0) {
    console.error('Cần ít nhất một file JUnit hoặc --manual <ID>');
    process.exit(2);
  }
  const commit = resolveCommit(opts.commit);
  if (!commit) {
    console.error('Không xác định được commit. Chỉ tick trên CI hoặc truyền --commit <sha>.');
    process.exit(2);
  }

  const results = readJUnit(opts.reports);
  for (const id of opts.manual) {
    const log = path.join(ROOT, 'reports', 'system', `${id}.log`);
    if (!fs.existsSync(log)) {
      console.error(`${id}: thiếu log ${path.relative(ROOT, log)} — không tick`);
      process.exit(1);
    }
    results.set(id, 'pass');
  }

  const seen = new Set();
  const ticked = [];
  const unticked = [];
  const lineRe = /^(\s*- \[)([ x])(\] \*\*)([A-Z]{2}-T\d+)(\*\*.*?)(?:\s+✅ `[^`]*`(?: \(log: [^)]*\))?)?\s*$/;

  for (const file of fs.readdirSync(CASES_DIR).filter((f) => f.endsWith('.md'))) {
    const p = path.join(CASES_DIR, file);
    const src = fs.readFileSync(p, 'utf8');
    const eol = src.includes('\r\n') ? '\r\n' : '\n';
    let changed = false;
    const out = src.split(/\r?\n/).map((line) => {
      const m = line.match(lineRe);
      if (!m || !results.has(m[4])) return line;
      const [, a, tick, b, id, body] = m;
      seen.add(id);
      let next;
      if (results.get(id) === 'pass') {
        const log = opts.manual.includes(id) ? ` (log: reports/system/${id}.log)` : '';
        next = `${a}x${b}${id}${body} ✅ \`${commit}\`${log}`;
        if (tick !== 'x') ticked.push(id);
      } else {
        next = `${a} ${b}${id}${body}`;
        if (tick === 'x') unticked.push(id);
      }
      if (next !== line) changed = true;
      return next;
    });
    if (changed) fs.writeFileSync(p, out.join(eol));
  }

  const unknown = [...results.keys()].filter((id) => !seen.has(id));
  const failing = [...results].filter(([, r]) => r === 'fail').map(([id]) => id);
  console.log(`Tick mới: ${ticked.length}${ticked.length ? ' — ' + ticked.join(', ') : ''}`);
  console.log(`Bỏ tick (regression): ${unticked.length}${unticked.length ? ' — ' + unticked.join(', ') : ''}`);
  console.log(`Đang fail: ${failing.length}${failing.length ? ' — ' + failing.join(', ') : ''}`);
  if (unknown.length) console.log(`⚠ Test có ID không tồn tại trong docs: ${unknown.join(', ')}`);
  if (unticked.length) process.exitCode = 1;
}

main();
