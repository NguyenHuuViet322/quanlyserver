#!/usr/bin/env node
// Kiểm tra Gate Bước 2–3 và sinh docs/traceability.md.
//
//   node tools/trace.js           in báo cáo
//   node tools/trace.js --write   ghi docs/traceability.md
//   node tools/trace.js --check   exit 1 nếu Gate Bước 2 hoặc 3 chưa đạt (dùng trong CI)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const MODULES = ['US', 'BK', 'SC', 'CT', 'ST', 'MN', 'UI', 'DP'];
const MOD = MODULES.join('|');

const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const pad = (n) => String(n).padStart(2, '0');

function walk(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p, exts);
    return exts.some((x) => e.name.endsWith(x)) ? [p] : [];
  });
}

// Nhận "REQ-US-01", "SC-06" (viết tắt sau một REQ) và khoảng "REQ-US-01..06".
function findReqs(text, { requirePrefix = false } = {}) {
  const pre = requirePrefix ? 'REQ-' : '(?:REQ-)?';
  const out = new Set();
  for (const m of text.matchAll(new RegExp(`\\b${pre}(${MOD})-(\\d{2})\\.\\.(\\d{2})\\b`, 'g'))) {
    for (let i = +m[2]; i <= +m[3]; i++) out.add(`REQ-${m[1]}-${pad(i)}`);
  }
  for (const m of text.matchAll(new RegExp(`\\b${pre}(${MOD})-(\\d{2})\\b`, 'g'))) {
    out.add(`REQ-${m[1]}-${m[2]}`);
  }
  return out;
}

// --- Spec ---
const spec = read(path.join(DOCS, '00-spec', 'SPEC.md'));
const reqs = new Map(); // id -> { title }
const errors = [];
for (const m of spec.matchAll(new RegExp(`^(?:### |- \\*\\*)(REQ-(?:${MOD})-\\d{2})(?:\\*\\*)?\\s*(?:—\\s*)?(.*)$`, 'gm'))) {
  if (reqs.has(m[1])) errors.push(`[Bước 1] ${m[1]} bị định nghĩa trùng`);
  reqs.set(m[1], { title: m[2].trim() });
}

// --- Docs thiết kế ---
const designFiles = walk(path.join(DOCS, '10-design'), ['.md']);
const docsOf = new Map([...reqs.keys()].map((r) => [r, []]));
for (const f of designFiles) {
  for (const r of findReqs(read(f))) docsOf.get(r)?.push(rel(f).replace(/^docs\/10-design\//, ''));
}

// --- Test case ---
const caseFiles = walk(path.join(DOCS, '20-test-cases'), ['.md']).filter((f) => !f.endsWith('README.md'));
const cases = new Map(); // id -> { ticked, reqs, type, tier, text, file }
const lineRe = new RegExp(`^\\s*- \\[([ x])\\] \\*\\*((?:${MOD})-T\\d+)\\*\\* \\(([^)]*)\\)(.*)$`, 'gm');
for (const f of caseFiles) {
  for (const m of read(f).matchAll(lineRe)) {
    const [, tick, id, reqText, rest] = m;
    if (cases.has(id)) errors.push(`[Bước 3] Test case ${id} bị trùng ID`);
    const tags = rest.split('—')[0].split('·').map((s) => s.trim()).filter(Boolean);
    const c = { ticked: tick === 'x', reqs: [...findReqs(reqText)], type: tags[0], tier: tags[1], text: rest, file: rel(f) };
    for (const r of c.reqs) if (!reqs.has(r)) errors.push(`[Bước 3] ${id} tham chiếu ${r} không có trong SPEC`);
    cases.set(id, c);
  }
}
const casesOf = new Map([...reqs.keys()].map((r) => [r, []]));
for (const [id, c] of cases) for (const r of c.reqs) casesOf.get(r)?.push(id);

// --- Gate Bước 2 & 3 ---
for (const r of reqs.keys()) {
  if (docsOf.get(r).length === 0) errors.push(`[Bước 2] ${r} chưa xuất hiện trong docs/10-design`);
  if (casesOf.get(r).length === 0) errors.push(`[Bước 3] ${r} chưa có test case`);
}
const api = read(path.join(DOCS, '10-design', 'api.md'));
const allCaseText = [...cases.values()].map((c) => c.text).join('\n');
const errorCodes = [...api.matchAll(/^\|\s*(\d{3})\s*\|\s*`([A-Z_]+)`/gm)].map((m) => `${m[1]} ${m[2]}`);
// Test case phải ghi đúng cặp `<HTTP> <CODE>` là kết quả mong đợi, nhắc tên mã lỗi thôi chưa đủ.
for (const code of errorCodes) {
  if (!allCaseText.includes(`\`${code}\``)) errors.push(`[Bước 3] Mã lỗi ${code} chưa có test case gây ra`);
}
for (const mod of MODULES) {
  const types = new Set([...cases].filter(([id]) => id.startsWith(mod)).map(([, c]) => c.type));
  if (!types.has('happy')) errors.push(`[Bước 3] Module ${mod} chưa có test case happy`);
  if (!types.has('negative') && !types.has('edge')) errors.push(`[Bước 3] Module ${mod} chưa có test case negative/edge`);
}

// --- Code & test tự động (Bước 4) ---
const codeOf = new Map([...reqs.keys()].map((r) => [r, new Set()]));
for (const f of [...walk(path.join(ROOT, 'backend', 'src'), ['.js', '.ts']), ...walk(path.join(ROOT, 'frontend', 'src'), ['.js', '.ts', '.tsx', '.vue'])]) {
  for (const r of findReqs(read(f), { requirePrefix: true })) codeOf.get(r)?.add(rel(f));
}
const automated = new Set();
for (const f of [...walk(path.join(ROOT, 'backend', 'tests'), ['.js', '.ts']), ...walk(path.join(ROOT, 'frontend', 'tests'), ['.js', '.ts'])]) {
  for (const m of read(f).matchAll(new RegExp(`\\b((?:${MOD})-T\\d+)\\b`, 'g'))) automated.add(m[1]);
}

// --- Báo cáo ---
function status(r) {
  const ids = casesOf.get(r);
  if (ids.length === 0) return '⛔ Chưa có test case';
  const done = ids.filter((id) => cases.get(id).ticked).length;
  if (done === ids.length) return '✅ Xong';
  if (codeOf.get(r).size === 0) return `Chưa code (0/${ids.length})`;
  return `Đang làm (${done}/${ids.length})`;
}
const esc = (s) => s.replace(/\|/g, '\\|');
const rows = [...reqs].map(([r, { title }]) => {
  const ids = casesOf.get(r).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const auto = ids.filter((id) => automated.has(id) || cases.get(id).tier === 'manual').length;
  return `| ${r} | ${esc(title.length > 60 ? title.slice(0, 57) + '…' : title)} | ${[...new Set(docsOf.get(r))].join(', ') || '—'} | ${ids.map((id) => (cases.get(id).ticked ? `${id} ✅` : id)).join(', ') || '—'} | ${auto}/${ids.length} | ${[...codeOf.get(r)].join(', ') || '—'} | ${status(r)} |`;
});
const ticked = [...cases.values()].filter((c) => c.ticked).length;
const md = `# Ma trận truy vết

> Tự sinh bởi \`node tools/trace.js --write\`. **Không sửa tay.** Chạy lại sau mỗi lần merge.

- REQ: **${reqs.size}** · Test case: **${cases.size}** · Đã tick: **${ticked}/${cases.size}**
- Gate Bước 2–3: ${errors.length === 0 ? '✅ đạt' : `⛔ ${errors.length} vấn đề`}

| REQ | Mô tả | Mục Docs | Test case | Có test tự động | File code | Trạng thái |
|---|---|---|---|---|---|---|
${rows.join('\n')}
${errors.length ? `\n## Vấn đề\n\n${errors.map((e) => `- ${e}`).join('\n')}\n` : ''}`;

const args = process.argv.slice(2);
if (args.includes('--write')) {
  fs.writeFileSync(path.join(DOCS, 'traceability.md'), md);
  console.log('Đã ghi docs/traceability.md');
}
console.log(`REQ: ${reqs.size}, test case: ${cases.size}, đã tick: ${ticked}, test tự động: ${automated.size}`);
if (errors.length) {
  console.log(`\n${errors.length} vấn đề:`);
  for (const e of errors) console.log(`  - ${e}`);
} else {
  console.log('Gate Bước 2–3: đạt');
}
if (args.includes('--check') && errors.length) process.exit(1);
