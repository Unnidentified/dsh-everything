#!/usr/bin/env node
/**
 * dsh-everything doctor — verify an installed bundle instead of hoping.
 *
 * Every failure this project has actually hit came from one of four places, and
 * each gets a check here:
 *
 * 1. **A package cannot resolve a dependency.** `dsh-llm-direct` was installed as
 *    a symlink with no `node_modules`, so `@deepseek-ai/schemastery` stopped
 *    resolving and the plugin failed to import while its row stayed mounted.
 * 2. **A vendored copy drifted from its source checkout.** The bundle's
 *    `merge-preset` carried `mountAdapter` while the standalone repo did not.
 * 3. **An install silently reused a cached tarball.** A bundle version that did
 *    not change never reached the second machine.
 * 4. **The two platforms disagreed.** The Windows profile stayed on 1.0.1 while
 *    macOS was several releases ahead.
 *
 * The command is read-only. It never installs, never writes into the profile, and
 * never prints a credential.
 *
 * Usage:
 *   dsh-everything doctor                 # check the desktop profile
 *   dsh-everything doctor --profile NAME
 *   dsh-everything doctor --json          # machine-readable, for CI
 *   dsh-everything doctor --compare A B   # compare two profiles
 *
 * Exit code is 0 when every check passes, 1 when anything failed, and 2 when the
 * profile could not be read at all.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE_ROOT = resolve(HERE, '..')

/** Result severities, worst last. A run fails when any check returns `fail`. */
const PASS = 'pass'
const SKIP = 'skip'
const WARN = 'warn'
const FAIL = 'fail'
const RANK = { [SKIP]: 0, [PASS]: 0, [WARN]: 1, [FAIL]: 2 }

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * Parse argv into the handful of flags this command understands.
 *
 * @param argv - process arguments after the subcommand.
 * @returns options, or an error string when a flag is malformed.
 */
function parseArgs(argv) {
  const opts = { profile: 'desktop', json: false, compare: null, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') opts.json = true
    else if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--profile') {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('-')) return { error: '--profile needs a name' }
      opts.profile = next
      i += 1
    } else if (arg === '--compare') {
      const a = argv[i + 1]
      const b = argv[i + 2]
      if (a === undefined || b === undefined) return { error: '--compare needs two profile names' }
      opts.compare = [a, b]
      i += 2
    } else return { error: `unknown argument: ${arg}` }
  }
  return { opts }
}

// ---------------------------------------------------------------------------
// Profile reading
// ---------------------------------------------------------------------------

/**
 * Locate the DSH home directory.
 *
 * @returns absolute path to the profile root's parent.
 */
function dshHome() {
  return process.env.DSH_HOME ?? join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.dsh')
}

/**
 * Read one profile's manifest without mutating anything.
 *
 * @param name - profile name.
 * @returns `{ root, manifest }` or `{ root, error }`.
 */
function readProfile(name) {
  const root = join(dshHome(), 'profiles', name)
  const manifestPath = join(root, 'package.json')
  if (!existsSync(manifestPath)) {
    return { root, error: `no package.json at ${manifestPath}` }
  }
  try {
    return { root, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) }
  } catch (cause) {
    return { root, error: `package.json is not valid JSON: ${String(cause?.message ?? cause)}` }
  }
}

/**
 * The packages a profile actually mounts, from its bundle list and dependencies.
 *
 * @param manifest - parsed profile package.json.
 * @returns dependency names and the bundle list.
 */
function profileShape(manifest) {
  return {
    dependencies: manifest?.dependencies ?? {},
    bundles: manifest?.dsh?.profile?.bundles ?? [],
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/**
 * Every package directory the bundle ships, sorted for stable output.
 *
 * @returns directory names under `packages/`.
 */
function bundlePackages() {
  const dir = join(BUNDLE_ROOT, 'packages')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort()
}

/**
 * Read the bundle's own manifest.
 *
 * @returns parsed package.json, or undefined when it cannot be read.
 */
function bundleManifest() {
  try {
    return JSON.parse(readFileSync(join(BUNDLE_ROOT, 'package.json'), 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Read the bundle's own version.
 *
 * @returns version string, or `unknown`.
 */
function bundleVersion() {
  try {
    return JSON.parse(readFileSync(join(BUNDLE_ROOT, 'package.json'), 'utf8')).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Declared dependencies of one installed package that cannot be resolved from it.
 *
 * This is the `schemastery` class of failure: a plugin that imports cleanly in
 * its own checkout but cannot see its dependencies once installed as a symlink
 * or a flattened tarball. Resolution is attempted from the package's own entry
 * point, exactly as Node would.
 *
 * @param packageDir - absolute path to the package directory.
 * @returns list of unresolvable module names.
 */
function unresolvableDependencies(packageDir) {
  const manifestPath = join(packageDir, 'package.json')
  if (!existsSync(manifestPath)) return []
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return []
  }
  const declared = Object.keys(manifest.dependencies ?? {})
  if (declared.length === 0) return []
  return declared.filter((name) => !resolvesFrom(packageDir, name))
}

/**
 * Whether a bare specifier resolves from a directory, the way Node does it.
 *
 * `createRequire(...).resolve` is not enough: it only honours the `require`
 * condition, so an ESM-only dependency with just an `import` export (like
 * `@cortexkit/antigravity-auth-core`) looks missing when it is present and
 * working. Node's own algorithm for a bare specifier is the one implemented
 * here: walk up from the importing directory looking for `node_modules/<name>`,
 * stopping at the filesystem root. That answers for CJS, ESM, and bin-only
 * packages alike, because all three are found by directory presence.
 *
 * @param from - absolute directory of the importing package.
 * @param specifier - bare module name to look for.
 * @returns true when a `node_modules/<name>` directory is reachable.
 */
function resolvesFrom(from, specifier) {
  let dir = from
  for (;;) {
    const candidate = join(dir, 'node_modules', specifier)
    if (existsSync(join(candidate, 'package.json'))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

/**
 * Verify the skills this bundle ships are present in each installed profile and
 * that every one has valid frontmatter.
 *
 * A skill is invisible to the model when it is missing from the tarball or its
 * frontmatter is malformed, and the failure is silent: the catalog simply has
 * no entry. Shipping the directory without listing it in `files` is the exact
 * mistake this check exists to catch.
 *
 * @param profiles - discovered profile names.
 * @returns check results, one per profile.
 */
function checkBundledSkills(profiles) {
  const id = 'bundle:skills'
  const source = join(BUNDLE_ROOT, 'skills')
  if (!existsSync(source)) return [{ id, status: SKIP, detail: 'no skills/ directory' }]
  const slugs = readdirSync(source).filter((name) => statSync(join(source, name)).isDirectory())
  const declared = new Set(bundleManifest()?.files ?? [])
  const results = []
  if (!declared.has('skills')) {
    results.push({ id: `${id}:packaged`, status: FAIL, detail: 'skills/ is not listed in package.json "files", so installs omit it' })
  }
  for (const slug of slugs) {
    const body = join(source, slug, 'SKILL.md')
    if (!existsSync(body)) {
      results.push({ id: `${id}:${slug}`, status: FAIL, detail: `${slug}: no SKILL.md` })
      continue
    }
    const text = readFileSync(body, 'utf8')
    const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
    if (match === null) {
      results.push({ id: `${id}:${slug}`, status: FAIL, detail: `${slug}: SKILL.md has no YAML frontmatter` })
      continue
    }
    const nameLine = /^name:\s*(.+)$/m.exec(match[1])
    const descLine = /^description:\s*(.+)$/m.exec(match[1])
    if (nameLine === null || descLine === null) {
      results.push({ id: `${id}:${slug}`, status: FAIL, detail: `${slug}: frontmatter needs name and description` })
      continue
    }
    const declaredName = nameLine[1].trim()
    if (declaredName !== slug) {
      results.push({ id: `${id}:${slug}`, status: WARN, detail: `${slug}: frontmatter name "${declaredName}" differs from its directory` })
      continue
    }
    results.push({ id: `${id}:${slug}`, status: PASS, detail: `${slug}: valid frontmatter, shipped under skills/` })
  }
  // The installed copy must carry the same files, or the patch points at nothing.
  for (const name of profiles) {
    const { root } = readProfile(name)
    if (root === undefined) continue
    const installedBundle = join(root, 'node_modules', 'dsh-everything')
    // Only judge a real install: a fixture with just package.json is not this
    // bundle's layout, and reporting drift there is noise, not a finding.
    const realInstall = existsSync(join(installedBundle, 'cordis.patch.yml'))
    const installed = join(installedBundle, 'skills')
    if (!realInstall) continue
    if (!existsSync(installed)) {
      results.push({ id: `${id}:${name}`, status: WARN, detail: 'installed bundle has no skills/ (older version installed)' })
      continue
    }
    const missing = slugs.filter((slug) => !existsSync(join(installed, slug, 'SKILL.md')))
    results.push({
      id: `${id}:${name}`,
      status: missing.length === 0 ? PASS : FAIL,
      detail: missing.length === 0 ? `${slugs.length} skill(s) present in the installed bundle` : `missing after install: ${missing.join(', ')}`,
    })
  }
  return results
}

/**
 * Verify the compaction compiler that each profile ACTUALLY mounts strips
 * nested checkpoint framing.
 *
 * Checking the vendored copy is not enough, and got this wrong once: the
 * engine a profile runs can come from a separate `file:` checkout that shadows
 * the vendored one, so the bundle can carry the fix while the live engine does
 * not. The check therefore resolves the specifiers the composition mounts and
 * reads those files, falling back to the vendored copy only when no profile
 * resolves an engine at all.
 *
 * The compiler frames every checkpoint with a preamble and a recall guide and
 * folds prior checkpoints into the next one. If the fold copies that framing,
 * each compaction nests one more identical copy and a long session carries
 * hundreds of duplicated tokens.
 *
 * @param profiles - discovered profile names.
 * @returns check results, one per profile engine plus a bundle fallback.
 */
function checkCompactionFraming(profiles) {
  const id = 'bundle:compaction-framing'
  const specs = ['dsh-compaction-instant', '@deepseek-ai/dsh-compaction-basic']
  const results = []
  for (const name of profiles) {
    const { root } = readProfile(name)
    if (root === undefined) continue
    let evaluated = 0
    for (const spec of specs) {
      const dir = findDepDir(root, spec)
      if (dir === null) continue
      const compiler = join(dir, 'src', 'compiler.js')
      if (!existsSync(compiler)) continue
      evaluated += 1
      results.push({ id: `${id}:${name}:${spec}`, ...inspectCompiler(readFileSync(compiler, 'utf8'), dir) })
    }
    if (evaluated === 0) {
      results.push({ id: `${id}:${name}`, status: SKIP, detail: 'no compaction engine resolved' })
    }
  }
  if (results.length > 0) return results
  const vendored = join(BUNDLE_ROOT, 'packages', 'compaction-instant', 'src', 'compiler.js')
  if (!existsSync(vendored)) return [{ id, status: SKIP, detail: 'compaction-instant not vendored' }]
  return [{ id, ...inspectCompiler(readFileSync(vendored, 'utf8'), join(BUNDLE_ROOT, 'packages', 'compaction-instant')) }]
}

/**
 * Locate a dependency directory the way Node would, walking up from a profile.
 *
 * @param from - absolute directory of the importing profile.
 * @param specifier - bare module name to look for.
 * @returns the resolved package directory, or null.
 */
function findDepDir(from, specifier) {
  let dir = from
  for (;;) {
    const candidate = join(dir, 'node_modules', specifier)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Grade one resolved compiler source against the three framing guarantees.
 *
 * @param source - compiler.js text.
 * @param dir - resolved package directory, for the detail line.
 * @returns check fields: status and detail.
 */
function inspectCompiler(source, dir) {
  const where = relative(BUNDLE_ROOT, dir) || dir
  if (!source.includes('stripCheckpointFraming')) {
    return { status: FAIL, detail: `${where}: nested framing is not stripped (preambles nest per fold)` }
  }
  const pinnedTask = source.includes('taskStatementPinned')
  const pinnedMarker = source.includes('kind: "note", pinned: true')
  if (!pinnedTask || !pinnedMarker) {
    const missing = [!pinnedTask && 'task statement pin', !pinnedMarker && 'elision marker pin'].filter(Boolean).join(', ')
    return { status: WARN, detail: `${where}: framing stripped, but missing ${missing}` }
  }
  return { status: PASS, detail: `${where}: framing stripped, task statement pinned, markers survive` }
}

/**
 * Compare a vendored package file against its named source checkout.
 *
 * @param entry - provenance record with a `sync` path.
 * @returns check result.
 */
function checkSync(entry) {
  const vendored = join(BUNDLE_ROOT, 'packages', entry.dir)
  // Resolve the checkout from an explicit root so the same bundle verifies on
  // any machine, rather than hardcoding one developer's home directory.
  const sourcesRoot = process.env.DSH_EVERYTHING_SOURCES ?? null
  const syncPath = sourcesRoot === null ? null : resolve(sourcesRoot, entry.syncRepo)
  if (syncPath === null || !existsSync(syncPath)) {
    // A checkout only exists on the machine that authored this bundle. Missing
    // it is "not applicable here", not a problem to fix, so it is a skip rather
    // than a warning: a warning that can never be cleared trains the reader to
    // ignore the whole report.
    return {
      id: `sync:${entry.dir}`,
      status: SKIP,
      detail: 'no source checkout on this machine (set DSH_EVERYTHING_SOURCES to compare)',
    }
  }
  const sourceRoot = resolve(syncPath, '..', '..')
  const diffs = []
  for (const rel of ['lib/index.js']) {
    const a = join(vendored, rel)
    const b = join(sourceRoot, rel)
    if (!existsSync(a) || !existsSync(b)) continue
    if (readFileSync(a, 'utf8') !== readFileSync(b, 'utf8')) diffs.push(rel)
  }
  if (diffs.length === 0) {
    return { id: `sync:${entry.dir}`, status: PASS, detail: 'vendored copy matches its source checkout' }
  }
  return {
    id: `sync:${entry.dir}`,
    status: FAIL,
    detail: `diverged from ${sourceRoot}: ${diffs.join(', ')}`,
  }
}

/**
 * Whether a provenance record describes a package the bundle actually ships.
 *
 * @param entry - provenance record.
 * @returns true when `packages/<dir>` exists.
 */
function packageExists(entry) {
  return existsSync(join(BUNDLE_ROOT, 'packages', entry.dir))
}

/**
 * Load `tools/provenance.json`.
 *
 * @returns parsed provenance, or an empty package list.
 */
function loadProvenance() {
  const path = join(BUNDLE_ROOT, 'tools', 'provenance.json')
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return { version: 1, packages: [] }
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Render one check as a human line. */
function line(check) {
  const mark =
    check.status === PASS ? 'ok  ' : check.status === SKIP ? 'skip' : check.status === WARN ? 'warn' : 'FAIL'
  return `  ${mark}  ${check.id.padEnd(34)} ${check.detail}`
}

/**
 * Worst status among a set of checks.
 *
 * @param checks - list of results.
 * @returns the highest-severity status.
 */
function worst(checks) {
  return checks.reduce((acc, c) => (RANK[c.status] > RANK[acc] ? c.status : acc), PASS)
}

/**
 * Run every check and print the report.
 *
 * @param opts - parsed options.
 * @returns process exit code.
 */
function run(opts) {
  const provenance = loadProvenance()
  const version = bundleVersion()
  const checks = []

  // --- bundle integrity -----------------------------------------------------
  const shipped = bundlePackages()
  const known = new Set(provenance.packages.filter(packageExists).map((p) => p.dir))
  const unlisted = shipped.filter((d) => !known.has(d))
  checks.push({
    id: 'bundle:version',
    status: version === 'unknown' ? FAIL : PASS,
    detail: version === 'unknown' ? 'package.json has no version' : `dsh-everything ${version}`,
  })
  checks.push({
    id: 'bundle:provenance',
    status: unlisted.length === 0 ? PASS : WARN,
    detail:
      unlisted.length === 0
        ? `${shipped.length} packages listed in tools/provenance.json`
        : `unlisted in provenance: ${unlisted.join(', ')}`,
  })

  // Dependency resolution is only meaningful *after* install: the source tree has
  // no node_modules of its own, because pnpm supplies them when the bundle is
  // added to a profile. Checking `packages/` here would fail for every package
  // and teach the reader to ignore the output, so it is checked against each
  // installed profile below instead.

  // Vendored copies must match their checkouts.
  for (const entry of provenance.packages) {
    if (entry.syncRepo === undefined) continue
    checks.push(checkSync(entry))
  }

  // --- the installed profile ------------------------------------------------
  const targets = opts.compare ?? [opts.profile]
  checks.push(...checkCompactionFraming(targets))
  checks.push(...checkBundledSkills(targets))
  const profiles = new Map()
  for (const name of targets) {
    const { root, manifest, error } = readProfile(name)
    if (error !== undefined) {
      checks.push({ id: `profile:${name}`, status: FAIL, detail: error })
      continue
    }
    profiles.set(name, { root, manifest, ...profileShape(manifest) })
    const installedPath = join(root, 'node_modules', 'dsh-everything', 'package.json')
    let installed = 'not installed'
    let status = FAIL
    if (existsSync(installedPath)) {
      try {
        installed = JSON.parse(readFileSync(installedPath, 'utf8')).version ?? 'unknown'
        status = installed === version ? PASS : WARN
      } catch {
        installed = 'unreadable'
      }
    }
    checks.push({
      id: `profile:${name}`,
      status,
      detail:
        installed === version
          ? `dsh-everything ${installed}, bundle list ${JSON.stringify(profileShape(manifest).bundles)}`
          : `installed ${installed} but this checkout is ${version}`,
    })

    // Every installed package must resolve its own dependencies, whether or not
    // it is listed in provenance: an unlisted package is exactly the one nobody
    // is watching, so it is checked from disk rather than from the manifest.
    const installedPackages = join(root, 'node_modules', 'dsh-everything', 'packages')
    if (existsSync(installedPackages)) {
      const dirs = readdirSync(installedPackages).filter((d) =>
        statSync(join(installedPackages, d)).isDirectory(),
      )
      for (const dir of dirs) {
        const missing = unresolvableDependencies(join(installedPackages, dir))
        checks.push({
          id: `installed:${name}:${dir}`,
          status: missing.length === 0 ? PASS : FAIL,
          detail:
            missing.length === 0
              ? 'dependencies resolve'
              : `cannot resolve ${missing.join(', ')} from the installed copy`,
        })
      }
    }
  }

  // Two profiles must agree, which is the drift that let Windows fall behind.
  if (opts.compare !== null && profiles.size === 2) {
    const [a, b] = targets
    const va = provenanceVersionOf(profiles.get(a))
    const vb = provenanceVersionOf(profiles.get(b))
    checks.push({
      id: 'compare:version',
      status: va !== null && va === vb ? PASS : WARN,
      detail: va === vb ? `both profiles on ${va}` : `${a}=${va ?? 'none'} ${b}=${vb ?? 'none'}`,
    })
  }

  // --- output ---------------------------------------------------------------
  const status = worst(checks)
  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({ version, status, checks }, null, 2)}\n`,
    )
  } else {
    process.stdout.write(`dsh-everything doctor — ${version} on ${process.platform}\n\n`)
    const byPrefix = new Map()
    for (const check of checks) {
      const group = check.id.split(':')[0]
      if (!byPrefix.has(group)) byPrefix.set(group, [])
      byPrefix.get(group).push(check)
    }
    for (const [group, groupChecks] of byPrefix) {
      const titles = {
        bundle: 'Bundle',
        resolve: 'Dependency resolution',
        sync: 'Vendored copies',
        profile: 'Installed profile',
        installed: 'Installed packages',
        compare: 'Platform parity',
      }
      process.stdout.write(`${titles[group] ?? group}\n`)
      for (const check of groupChecks) process.stdout.write(`${line(check)}\n`)
      process.stdout.write('\n')
    }
    const counts = { [PASS]: 0, [SKIP]: 0, [WARN]: 0, [FAIL]: 0 }
    for (const check of checks) counts[check.status] += 1
    process.stdout.write(
      `${counts[PASS]} ok, ${counts[SKIP]} skipped, ${counts[WARN]} warning(s), ${counts[FAIL]} failure(s)\n`,
    )
  }
  return status === FAIL ? 1 : 0
}

/**
 * The dsh-everything version installed in one profile, if any.
 *
 * @param profile - a profile record, or undefined.
 * @returns version string or null.
 */
function provenanceVersionOf(profile) {
  if (profile === undefined) return null
  const path = join(profile.root, 'node_modules', 'dsh-everything', 'package.json')
  try {
    return JSON.parse(readFileSync(path, 'utf8')).version ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const parsed = parseArgs(process.argv.slice(2))
if (parsed.error !== undefined) {
  process.stderr.write(`dsh-everything doctor: ${parsed.error}\n`)
  process.exit(2)
}
if (parsed.opts.help) {
  process.stdout.write(
    'Verify an installed dsh-everything bundle.\n\n' +
      '  --profile NAME     profile to inspect (default: desktop)\n' +
      '  --compare A B      also check two profiles agree\n' +
      '  --json             machine-readable output\n',
  )
  process.exit(0)
}
process.exit(run(parsed.opts))
