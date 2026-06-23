#!/usr/bin/env node
// Asset alignment audit (X02 §9).
//
// Scans src/ for static asset references and checks each one resolves to a real
// file under public/. Catches filename/case drift and missing assets before they
// ship as broken images at runtime. Dynamic references (paths built with a
// runtime `${id}` in the middle, e.g. skin_tone_assets/${id}.png) cannot be
// resolved statically and are reported separately, not failed.
//
// Usage:
//   node scripts/audit-assets.mjs            # report only (exit 0)
//   node scripts/audit-assets.mjs --strict   # exit 1 if anything is missing
//
// Resolution rules (mirror how the app builds URLs):
//   `${BASE}assets/avatar/x.png`  -> public/assets/avatar/x.png   (BASE prefix stripped)
//   '/logo.png' or './logo.png'   -> public/logo.png
// A token is "dynamic" if, after stripping a single leading `${...}`, it still
// contains `${` — those are skipped (can't be checked statically).

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const PUBLIC = join(ROOT, 'public')

const ASSET_EXT =
  'png|jpe?g|webp|gif|svg|glb|gltf|hdr|wav|mp3|ogg|woff2?|ttf|otf'
const TOKEN_RE = new RegExp(
  `[A-Za-z0-9_./$%{}-]+\\.(?:${ASSET_EXT})\\b`,
  'gi'
)

function walk(dir, test, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, test, out)
    else if (test(name)) out.push(full)
  }
  return out
}

// Normalize a referenced token to a path relative to public/, or a marker for
// dynamic / external / not-a-public-asset.
function toPublicRel(token) {
  if (token.includes('://')) return null // external URL
  // Strip a single leading ${...} (the BASE prefix) if present.
  let p = token.replace(/^\$\{[^}]+\}/, '')
  // Any remaining interpolation or stray brace means the path is built at
  // runtime (e.g. `${id}.png`, or a `}.jpg` fragment of a template literal).
  if (p.includes('${') || p.includes('%') || p.includes('{') || p.includes('}'))
    return { dynamic: true }
  p = p.replace(/^[./]+/, '').replace(/^public\//, '') // leading ./ or / or public/
  if (!p) return null
  // A first segment with a dot is a hostname (e.g. `mainwrld-f7acf.web.app/...`
  // from an absolute OG-image URL the regex captured after `https://`), not a
  // public asset directory.
  const firstSeg = p.split('/')[0]
  if (p.includes('/') && firstSeg.includes('.')) return null
  return { rel: p }
}

// Index public assets up front: full relative paths + a basename → rel map, so a
// bare filename reference (`man_animated.glb`) whose directory is concatenated
// at runtime still resolves by basename.
const publicFiles = existsSync(PUBLIC)
  ? walk(PUBLIC, (n) => new RegExp(`\\.(?:${ASSET_EXT})$`, 'i').test(n)).map(
      (f) => f.replace(PUBLIC + '/', '')
    )
  : []
const publicSet = new Set(publicFiles)
const byBasename = new Map()
for (const rel of publicFiles) {
  const base = rel.split('/').pop()
  if (!byBasename.has(base)) byBasename.set(base, rel)
}

// Scan source + CSS, plus index.html and public CSS (index.html preloads fonts
// and public/fonts/fonts.css declares the @font-face url()s for the bundled
// fonts) so those assets resolve and don't show as false orphans.
const srcFiles = [
  ...walk(SRC, (n) => /\.(ts|tsx|js|jsx|css)$/.test(n)),
  ...(existsSync(join(ROOT, 'index.html')) ? [join(ROOT, 'index.html')] : []),
  ...(existsSync(PUBLIC) ? walk(PUBLIC, (n) => /\.(css|html)$/.test(n)) : [])
]

const missing = new Map() // rel -> Set(sourceFile)
const dynamicCount = { n: 0 }
const referenced = new Set() // rel paths that resolved OK

for (const file of srcFiles) {
  const text = readFileSync(file, 'utf8')
  const matches = text.match(TOKEN_RE)
  if (!matches) continue
  for (const token of matches) {
    const r = toPublicRel(token)
    if (!r) continue
    if (r.dynamic) {
      dynamicCount.n++
      continue
    }
    if (publicSet.has(r.rel)) {
      referenced.add(r.rel)
    } else if (!r.rel.includes('/') && byBasename.has(r.rel)) {
      // Bare filename whose directory is supplied at runtime — match by basename.
      referenced.add(byBasename.get(r.rel))
    } else {
      if (!missing.has(r.rel)) missing.set(r.rel, new Set())
      missing.get(r.rel).add(file.replace(ROOT + '/', ''))
    }
  }
}

// Orphans: public files never referenced by any static path. Best-effort only
// (dynamic references can legitimately use files this can't see), so orphans are
// informational and never fail the run.
const orphans = publicFiles.filter((rel) => !referenced.has(rel))

console.log('— Asset audit (X02) —')
console.log(`Scanned ${srcFiles.length} source files.`)
console.log(`Static references resolved OK: ${referenced.size}`)
console.log(`Dynamic references skipped:    ${dynamicCount.n}`)
console.log(`Referenced-but-missing:        ${missing.size}`)

if (missing.size) {
  console.log('\nMISSING (referenced in code, absent from public/):')
  for (const [rel, files] of missing) {
    console.log(`  ✗ ${rel}`)
    for (const f of files) console.log(`      ← ${f}`)
  }
}

if (orphans.length) {
  console.log(
    `\nPossible orphans (in public/, no static reference — may be used dynamically): ${orphans.length}`
  )
  for (const rel of orphans.slice(0, 40)) console.log(`  • ${rel}`)
  if (orphans.length > 40) console.log(`  …and ${orphans.length - 40} more`)
}

const strict = process.argv.includes('--strict')
if (missing.size && strict) {
  console.error(`\nFAIL: ${missing.size} referenced-but-missing asset(s).`)
  process.exit(1)
}
console.log(
  `\n${missing.size === 0 ? '✓ 0 referenced-but-missing.' : 'Done (non-strict: not failing).'}`
)
