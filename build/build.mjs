#!/usr/bin/env node
// Builds plugins/ and .claude-plugin/marketplace.json from the sources at the
// repository root (skills/, hooks/, notices/) plus build/plugins.json.
//
//   node build/build.mjs           write the build
//   node build/build.mjs --check   verify the build matches the sources (CI)
//
// The build is committed so `claude plugin marketplace add MiguelAguiarDEV/skills`
// works straight off the default branch. Never edit it by hand: --check fails.
//
// No dependencies, on purpose. This has to keep working on a bare Node.

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync,
         lstatSync, readlinkSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')

const PLUGIN_SCHEMA = 'https://www.schemastore.org/claude-code-plugin-manifest.json'
const MARKET_SCHEMA = 'https://www.schemastore.org/claude-code-marketplace.json'

// Directories this script owns end to end: anything inside them that the plan
// does not name is deleted (or, under --check, reported as stale).
const MANAGED = ['plugins']
const MANAGED_FILES = ['.claude-plugin/marketplace.json', 'NOTICE.md']

const errors = []
const warnings = []
const fail = (msg) => errors.push(msg)
const warn = (msg) => warnings.push(msg)

// --------------------------------------------------------------- frontmatter

// Minimal YAML for what SKILL.md frontmatter actually uses: scalars, inline
// lists, block lists and nested maps. Enough to validate against the Agent
// Skills spec without pulling in a YAML dependency.
function parseYaml (lines, indent = 0) {
  const out = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue }
    const ind = line.length - line.trimStart().length
    if (ind < indent) break
    const m = line.trim().match(/^([\w.-]+):\s*(.*)$/)
    if (!m) { i++; continue }
    const [, key, rawValue] = m
    if (rawValue === '') {
      // Block list or nested map: collect the more-indented lines below.
      const block = []
      let j = i + 1
      while (j < lines.length) {
        const l = lines[j]
        if (l.trim() && (l.length - l.trimStart().length) <= ind) break
        block.push(l)
        j++
      }
      out[key] = block.some((l) => l.trim().startsWith('- '))
        ? block.filter((l) => l.trim().startsWith('- ')).map((l) => scalar(l.trim().slice(2)))
        : parseYaml(block, ind + 1)
      i = j
      continue
    }
    out[key] = scalar(rawValue)
    i++
  }
  return out
}

function scalar (raw) {
  const v = raw.trim()
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => scalar(s)).filter((s) => s !== '')
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/''/g, "'")
  }
  return v
}

function readFrontmatter (path) {
  const text = readFileSync(path, 'utf8')
  const lines = text.split('\n')
  if (lines[0].trim() !== '---') return { data: {}, lineCount: lines.length }
  const end = lines.indexOf('---', 1)
  if (end === -1) return { data: {}, lineCount: lines.length }
  return { data: parseYaml(lines.slice(1, end)), lineCount: lines.length }
}

// ------------------------------------------------------------------ validate

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function validateSkill (name, data, lineCount) {
  const where = `skills/${name}/SKILL.md`
  if (!data.name) return fail(`${where}: missing required frontmatter field \`name\``)
  if (data.name !== name) fail(`${where}: \`name: ${data.name}\` must match the directory name (${name})`)
  if (!NAME_RE.test(name)) fail(`${where}: \`${name}\` is not a valid skill name (lowercase, digits and single hyphens)`)
  if (name.length > 64) fail(`${where}: name is ${name.length} chars, the limit is 64`)

  if (!data.description) return fail(`${where}: missing required frontmatter field \`description\``)
  if (data.description.length > 1024) {
    fail(`${where}: description is ${data.description.length} chars, the limit is 1024`)
  }
  if (data.compatibility && data.compatibility.length > 500) {
    fail(`${where}: compatibility is ${data.compatibility.length} chars, the limit is 500`)
  }
  if (data.metadata) {
    if (typeof data.metadata !== 'object' || Array.isArray(data.metadata)) {
      fail(`${where}: \`metadata\` must be a map`)
    } else {
      for (const [k, v] of Object.entries(data.metadata)) {
        if (typeof v !== 'string') fail(`${where}: \`metadata.${k}\` must be a string (the spec allows string values only)`)
      }
    }
  }
  if (lineCount > 500) warn(`${where}: ${lineCount} lines; the spec recommends keeping SKILL.md under 500`)
}

// --------------------------------------------------------------------- read

const manifest = JSON.parse(readFileSync(join(ROOT, 'build/plugins.json'), 'utf8'))

const skillNames = readdirSync(join(ROOT, 'skills'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

const skills = {}
for (const name of skillNames) {
  const path = join(ROOT, 'skills', name, 'SKILL.md')
  if (!existsSync(path)) { fail(`skills/${name}/: no SKILL.md`); continue }
  const { data, lineCount } = readFrontmatter(path)
  validateSkill(name, data, lineCount)
  skills[name] = data
}

// hooks/<skill>.json is the hook config for that skill; hooks/<skill>/ holds
// hook-only scripts (scripts a skill also uses itself live with the skill).
const hookConfigs = {}
const hookScriptDirs = new Set()
for (const entry of readdirSync(join(ROOT, 'hooks'), { withFileTypes: true })) {
  if (entry.isDirectory()) { hookScriptDirs.add(entry.name); continue }
  if (!entry.name.endsWith('.json')) continue
  const name = entry.name.replace(/\.json$/, '')
  hookConfigs[name] = JSON.parse(readFileSync(join(ROOT, 'hooks', entry.name), 'utf8'))
}
for (const name of [...Object.keys(hookConfigs), ...hookScriptDirs]) {
  if (!skills[name]) fail(`hooks/${name}: no skill named \`${name}\``)
}

for (const [slug, covered] of Object.entries(manifest.notices)) {
  if (!existsSync(join(ROOT, 'notices', `${slug}.md`))) fail(`build/plugins.json: notices/${slug}.md does not exist`)
  for (const s of covered) if (!skills[s]) fail(`build/plugins.json: notice \`${slug}\` covers unknown skill \`${s}\``)
}

// ---------------------------------------------------------------- build plan

const plan = new Map()   // repo-relative path -> {file: string} | {link: string}
const file = (path, content) => plan.set(path, { file: content })
const link = (path, target) => plan.set(path, { link: target })
const json = (value) => JSON.stringify(value, null, 2) + '\n'

// Merges per-skill hook configs into one plugin-wide hooks.json, concatenating
// the matcher groups of each event rather than letting one skill win.
function mergeHooks (names) {
  const merged = {}
  for (const name of names) {
    const cfg = hookConfigs[name]
    if (!cfg) continue
    for (const [event, groups] of Object.entries(cfg.hooks)) {
      merged[event] = (merged[event] || []).concat(groups)
    }
  }
  return Object.keys(merged).length ? { hooks: merged } : null
}

function noticeFor (pluginName, names) {
  const sections = []
  for (const [slug, covered] of Object.entries(manifest.notices)) {
    const mine = names.filter((n) => covered.includes(n))
    if (!mine.length) continue
    const heading = mine.map((n) => `\`${n}\``).join(', ')
    sections.push(`## ${heading}\n\n${readFileSync(join(ROOT, 'notices', `${slug}.md`), 'utf8').trim()}`)
  }
  if (!sections.length) return null
  const licensePath = pluginName === null ? './LICENSE' : '../../LICENSE'
  return [
    '<!-- Generated by build/build.mjs from notices/. Do not edit. -->',
    '',
    '# Third-party notice',
    '',
    'Some skills here are ported from other repositories. Each section below',
    'covers one upstream project: which skills come from it, what changed in',
    'the port, and its original license text.',
    '',
    `Everything else is original to this repository and distributed under its own [MIT license](${licensePath}), as are the ports themselves.`,
    '',
    sections.join('\n\n'),
    ''
  ].join('\n')
}

const marketplaceEntries = []

for (const p of manifest.plugins) {
  const names = p.skills === '*' ? skillNames : p.skills
  for (const n of names) if (!skills[n]) fail(`build/plugins.json: plugin \`${p.name}\` lists unknown skill \`${n}\``)

  const dir = `plugins/${p.name}`
  const meta = {
    $schema: PLUGIN_SCHEMA,
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    version: p.version,
    author: manifest.defaults.author,
    homepage: manifest.defaults.homepage,
    repository: manifest.defaults.repository,
    license: manifest.defaults.license,
    keywords: p.keywords
  }
  file(`${dir}/.claude-plugin/plugin.json`, json(meta))

  // Skills are symlinked, never copied: a symlink pointing elsewhere inside the
  // marketplace is dereferenced at install time, so the cache gets real files
  // while git keeps a single copy.
  for (const n of names) link(`${dir}/skills/${n}`, `../../../skills/${n}`)

  const hooks = mergeHooks(names)
  if (hooks) file(`${dir}/hooks/hooks.json`, json(hooks))
  for (const n of names) {
    if (hookScriptDirs.has(n)) link(`${dir}/hooks/${n}`, `../../../hooks/${n}`)
  }

  const notice = noticeFor(p.name, names)
  if (notice) file(`${dir}/NOTICE.md`, notice)
  link(`${dir}/LICENSE`, '../../LICENSE')

  marketplaceEntries.push({
    name: p.name,
    source: `./${dir}`,
    displayName: p.displayName,
    description: p.description,
    version: p.version,
    author: manifest.defaults.author,
    homepage: manifest.defaults.homepage,
    repository: manifest.defaults.repository,
    license: manifest.defaults.license,
    category: p.category,
    keywords: p.keywords
  })
}

file('.claude-plugin/marketplace.json', json({
  $schema: MARKET_SCHEMA,
  name: manifest.marketplace.name,
  owner: manifest.marketplace.owner,
  metadata: {
    description: manifest.marketplace.description,
    version: manifest.marketplace.version
  },
  ...(manifest.renames && Object.keys(manifest.renames).length ? { renames: manifest.renames } : {}),
  plugins: marketplaceEntries
}))

const rootNotice = noticeFor(null, skillNames)
if (rootNotice) file('NOTICE.md', rootNotice)

// install.sh keeps its catalog inline so `curl | sh` works without a checkout.
// Only the block between the markers is generated.
const BEGIN = '# BEGIN GENERATED SKILL_LIST -- node build/build.mjs'
const END = '# END GENERATED SKILL_LIST'
const installPath = join(ROOT, 'install.sh')
if (existsSync(installPath)) {
  const current = readFileSync(installPath, 'utf8')
  const list = manifest.plugins
    .filter((p) => p.name !== 'toolkit')
    .map((p) => `${p.name}|${p.tagline}`)
    .join('\n')
  const block = `${BEGIN}\nSKILL_LIST="${list}"\n${END}`
  const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`)
  if (!re.test(current)) {
    fail('install.sh: the generated SKILL_LIST markers are missing')
  } else {
    file('install.sh', current.replace(re, block))
  }
}

// ------------------------------------------------------------ write or check

function walk (dir, acc = []) {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return acc
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isSymbolicLink() || entry.isFile()) acc.push(rel)
    else if (entry.isDirectory()) walk(rel, acc)
  }
  return acc
}

const onDisk = new Set([
  ...MANAGED.flatMap((d) => walk(d)),
  ...MANAGED_FILES.filter((f) => existsSync(join(ROOT, f)))
])
const stale = [...onDisk].filter((f) => !plan.has(f))

const diffs = []
for (const [path, want] of plan) {
  const abs = join(ROOT, path)
  const exists = existsSync(abs) || (() => { try { lstatSync(abs); return true } catch { return false } })()
  if (!exists) { diffs.push(`missing: ${path}`); continue }
  if (want.link) {
    const st = lstatSync(abs)
    if (!st.isSymbolicLink()) diffs.push(`should be a symlink: ${path}`)
    else if (readlinkSync(abs) !== want.link) diffs.push(`wrong symlink target: ${path}`)
  } else if (readFileSync(abs, 'utf8') !== want.file) {
    diffs.push(`out of date: ${path}`)
  }
}

if (errors.length) {
  console.error('Source errors:\n' + errors.map((e) => `  - ${e}`).join('\n'))
  process.exit(1)
}
if (warnings.length) console.error('Warnings:\n' + warnings.map((w) => `  - ${w}`).join('\n'))

if (CHECK) {
  const problems = [...diffs, ...stale.map((f) => `stale, not in the plan: ${f}`)]
  if (problems.length) {
    console.error('The build does not match the sources:\n' + problems.map((p) => `  - ${p}`).join('\n'))
    console.error('\nRun: node build/build.mjs')
    process.exit(1)
  }
  console.log(`Build is up to date (${manifest.plugins.length} plugins, ${skillNames.length} skills).`)
  process.exit(0)
}

for (const f of stale) rmSync(join(ROOT, f), { force: true })
for (const [path, want] of plan) {
  const abs = join(ROOT, path)
  mkdirSync(dirname(abs), { recursive: true })
  try { rmSync(abs, { force: true }) } catch { /* not there */ }
  if (want.link) symlinkSync(want.link, abs)
  else writeFileSync(abs, want.file)
}
// Drop directories the plan emptied out.
for (const dir of MANAGED) {
  const prune = (rel) => {
    const abs = join(ROOT, rel)
    if (!existsSync(abs) || !statSync(abs).isDirectory()) return
    for (const e of readdirSync(abs)) prune(`${rel}/${e}`)
    if (!readdirSync(abs).length) rmSync(abs, { recursive: true, force: true })
  }
  prune(dir)
}

console.log(`Built ${manifest.plugins.length} plugins from ${skillNames.length} skills.`)
if (stale.length) console.log(`Removed ${stale.length} stale file(s).`)
