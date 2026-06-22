#!/usr/bin/env node
// Asset audit (X02). Verifies every static asset referenced in src/** resolves
// to a file that actually exists on disk, CASE-SENSITIVELY — the exact class of
// bug that "works" on the case-insensitive macOS dev FS / Firebase Hosting but
// 404s on the case-sensitive iOS WKWebView bundle.
//
// Reports per asset root: (a) referenced-but-missing, (b) on-disk-but-
// unreferenced (orphans), (c) case-only mismatches. Exits non-zero on any (a)
// or (c) finding so it can later gate CI. Run: `node scripts/audit-assets.mjs`.
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SRC = join(ROOT, 'src');
const ASSET_EXT = /\.(png|glb|gltf|hdr|html)$/i;
// Files that legitimately live in public/ but are not referenced via BASE in
// src (build-generated or doc/legal), so they should not count as orphans.
const ORPHAN_WHITELIST = new Set(['ads.txt', 'index.html']);

// --- collect every asset-looking path referenced in src/** -------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const referenced = new Set();
// Matches the literal asset path that follows a ${BASE} template prefix or a
// plain string literal, e.g. `${BASE}assets/avatar/body/female/A4.png` or
// 'hdr/city.hdr'. We capture the part after an optional `${BASE}`.
const REF_RE = /(?:\$\{BASE\}|['"`])([A-Za-z0-9_./-]+\.(?:png|glb|gltf|hdr|html))/g;
for (const file of walk(SRC)) {
  if (!/\.(tsx?|jsx?)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  let m;
  while ((m = REF_RE.exec(text)) !== null) {
    let p = m[1].replace(/^\/+/, '');
    if (!p || !ASSET_EXT.test(p)) continue;
    referenced.add(p);
  }
}

// --- resolve a relative path case-sensitively against a root -----------------
function existsCaseSensitive(root, relPath) {
  let cur = root;
  for (const seg of relPath.split('/')) {
    if (!seg) continue;
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      return { ok: false, caseMismatch: false };
    }
    if (entries.includes(seg)) {
      cur = join(cur, seg);
    } else {
      const ci = entries.find((e) => e.toLowerCase() === seg.toLowerCase());
      return { ok: false, caseMismatch: !!ci };
    }
  }
  return { ok: true, caseMismatch: false };
}

// --- list every asset file on disk under a root ------------------------------
function diskAssets(root) {
  const out = new Set();
  if (!existsSync(root)) return out;
  for (const f of walk(root)) {
    if (!ASSET_EXT.test(f)) continue;
    out.add(relative(root, f).split(sep).join('/'));
  }
  return out;
}

const TARGETS = [
  { name: 'public/', dir: join(ROOT, 'public') },
  { name: 'dist/', dir: join(ROOT, 'dist') },
  { name: 'ios/App/App/public/', dir: join(ROOT, 'ios', 'App', 'App', 'public') },
];

// Split references into full relative paths (have a '/') and bare filenames
// (no '/'), which come from interpolated paths like
// `${BASE}characters_animated/animated_models/${gender ? 'man_animated.glb' : ...}`
// where the directory is templated away. Bare names resolve by basename.
const referencedFull = new Set([...referenced].filter((p) => p.includes('/')));
const referencedBare = new Set(
  [...referenced].filter((p) => !p.includes('/'))
);
const basename = (p) => p.split('/').pop();

let hardFail = false;
console.log(
  `Referenced asset paths in src/**: ${referenced.size} ` +
    `(${referencedFull.size} full, ${referencedBare.size} bare)\n`
);

for (const { name, dir } of TARGETS) {
  if (!existsSync(dir)) {
    console.log(`-- ${name} (skipped: not built/synced)\n`);
    continue;
  }
  const onDisk = diskAssets(dir);
  const onDiskBasenames = new Set([...onDisk].map(basename));

  const missing = [];
  const caseMismatch = [];
  for (const rel of referencedFull) {
    const r = existsCaseSensitive(dir, rel);
    if (!r.ok && r.caseMismatch) caseMismatch.push(rel);
    else if (!r.ok) missing.push(rel);
  }
  for (const bare of referencedBare) {
    if (!onDiskBasenames.has(bare)) missing.push(bare);
  }

  const orphans = [...onDisk].filter(
    (f) =>
      !referencedFull.has(f) &&
      !referencedBare.has(basename(f)) &&
      !ORPHAN_WHITELIST.has(basename(f))
  );

  console.log(`-- ${name}`);
  console.log(`   referenced-but-missing: ${missing.length}`);
  missing.forEach((m) => console.log(`     ! ${m}`));
  console.log(`   case-only mismatches:   ${caseMismatch.length}`);
  caseMismatch.forEach((m) => console.log(`     ~ ${m}`));
  console.log(`   on-disk orphans:        ${orphans.length}`);
  orphans.forEach((o) => console.log(`     ? ${o}`));
  console.log('');

  if (missing.length || caseMismatch.length) hardFail = true;
}

if (hardFail) {
  console.error('AUDIT FAILED: referenced-but-missing or case-mismatch found.');
  process.exit(1);
}
console.log('AUDIT OK: no missing files or case mismatches.');
