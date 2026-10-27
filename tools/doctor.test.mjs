#!/usr/bin/env node
/**
 * Tests for `bin/doctor.mjs`.
 *
 * The doctor is the only thing standing between a bad install and a user who
 * cannot tell why a plugin is missing, so its checks are tested rather than
 * trusted. Every case builds a throwaway profile in a temp directory and runs
 * the real command as a child process, so what is asserted is the output a user
 * actually sees, not an internal function's return value.
 *
 * Run with `node tools/doctor.test.mjs`, or `pnpm test`.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = resolve(HERE, '..')
const DOCTOR = join(BUNDLE, 'bin', 'doctor.mjs')

let passed = 0
let failed = 0

/**
 * Run one named case, reporting pass/fail without stopping the run.
 *
 * @param name - what the case proves.
 * @param fn - the case body.
 */
function test(name, fn) {
  try {
    fn()
    passed += 1
    process.stdout.write(`  ok    ${name}\n`)
  } catch (cause) {
    failed += 1
    process.stdout.write(`  FAIL  ${name}\n        ${String(cause?.message ?? cause)}\n`)
  }
}

/**
 * Invoke the doctor with a throwaway DSH_HOME.
 *
 * @param home - temp directory standing in for the DSH home.
 * @param args - extra arguments.
 * @returns `{ status, stdout, parsed }` with parsed JSON when `--json` was used.
 */
function doctor(home, args = []) {
  const result = spawnSync(process.execPath, [DOCTOR, ...args], {
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
  })
  let parsed
  if (args.includes('--json')) {
    try {
      parsed = JSON.parse(result.stdout)
    } catch {
      parsed = undefined
    }
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed }
}

/**
 * Create a temp DSH home with one profile whose installed bundle version is
 * supplied by the caller.
 *
 * @param version - version to report as installed, or null to omit the install.
 * @param name - profile name.
 * @returns the temp home path.
 */
function makeHome(version, name = 'desktop') {
  const home = mkdtempSync(join(tmpdir(), 'dsh-doctor-'))
  const profile = join(home, 'profiles', name)
  mkdirSync(profile, { recursive: true })
  writeFileSync(
    join(profile, 'package.json'),
    JSON.stringify({
      name: `dsh-profile-${name}`,
      dependencies: version === null ? {} : { 'dsh-everything': 'file:x.tgz' },
      dsh: { profile: { bundles: version === null ? [] : ['@deepseek-ai/dsh-base', 'dsh-everything'] } },
    }),
  )
  if (version !== null) {
    const installed = join(profile, 'node_modules', 'dsh-everything')
    mkdirSync(installed, { recursive: true })
    writeFileSync(join(installed, 'package.json'), JSON.stringify({ name: 'dsh-everything', version }))
  }
  return { home, profile }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

test('a matching install passes and exits 0', () => {
  const { home } = makeHome(versionOfBundle())
  const { status, parsed } = doctor(home, ['--json'])
  assert.equal(status, 0, 'exit code')
  assert.equal(parsed.status, 'pass', 'overall status')
  assert.ok(
    parsed.checks.some((c) => c.id === 'profile:desktop' && c.status === 'pass'),
    'profile check should pass',
  )
  rmSync(home, { recursive: true, force: true })
})

test('a version mismatch is reported as a warning, not a failure', () => {
  const { home } = makeHome('0.0.1')
  const { status, parsed } = doctor(home, ['--json'])
  assert.equal(status, 0, 'a stale install must not fail the run')
  const check = parsed.checks.find((c) => c.id === 'profile:desktop')
  assert.equal(check.status, 'warn')
  assert.match(check.detail, /0\.0\.1/)
  rmSync(home, { recursive: true, force: true })
})

test('a missing profile fails and says where it looked', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-doctor-'))
  const { status, parsed } = doctor(home, ['--json'])
  assert.equal(status, 1, 'exit code')
  const check = parsed.checks.find((c) => c.id === 'profile:desktop')
  assert.equal(check.status, 'fail')
  assert.match(check.detail, /package\.json/)
  rmSync(home, { recursive: true, force: true })
})

test('a profile whose package.json is corrupt is reported, not thrown', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-doctor-'))
  const profile = join(home, 'profiles', 'desktop')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{ not json')
  const { status, parsed } = doctor(home, ['--json'])
  assert.equal(status, 1)
  const check = parsed.checks.find((c) => c.id === 'profile:desktop')
  assert.match(check.detail, /not valid JSON/)
  rmSync(home, { recursive: true, force: true })
})

test('a package that cannot resolve a dependency fails the install check', () => {
  const { home, profile } = makeHome(versionOfBundle())
  // An installed package declaring a dependency that is nowhere on disk is
  // exactly the schema/symlink failure this check exists to catch.
  const pkg = join(profile, 'node_modules', 'dsh-everything', 'packages', 'llm-direct')
  mkdirSync(join(pkg, 'lib'), { recursive: true })
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'dsh-llm-direct', main: 'lib/index.js', dependencies: { 'not-a-real-package-xyz': '1.0.0' } }),
  )
  writeFileSync(join(pkg, 'lib', 'index.js'), '')
  const { status, parsed } = doctor(home, ['--json'])
  assert.equal(status, 1, 'unresolvable dependency must fail')
  const check = parsed.checks.find((c) => c.id === 'installed:desktop:llm-direct')
  assert.ok(check, 'the installed dependency check should run')
  assert.match(check.detail, /not-a-real-package-xyz/)
  rmSync(home, { recursive: true, force: true })
})

test('a resolvable dependency passes, including a hoisted one', () => {
  const { home, profile } = makeHome(versionOfBundle())
  const pkg = join(profile, 'node_modules', 'dsh-everything', 'packages', 'probe')
  mkdirSync(join(pkg, 'lib'), { recursive: true })
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'probe', main: 'lib/index.js', dependencies: { 'real-dep': '1.0.0' } }),
  )
  writeFileSync(join(pkg, 'lib', 'index.js'), '')
  // Hoist it two levels up, as pnpm does for a shared dependency.
  const dep = join(profile, 'node_modules', 'real-dep')
  mkdirSync(dep, { recursive: true })
  writeFileSync(join(dep, 'package.json'), JSON.stringify({ name: 'real-dep', version: '1.0.0' }))
  const { parsed } = doctor(home, ['--json'])
  const check = parsed.checks.find((c) => c.id === 'installed:desktop:probe')
  assert.ok(check, 'the installed dependency check should run')
  assert.equal(check.status, 'pass')
  rmSync(home, { recursive: true, force: true })
})

test('--compare reports both profiles', () => {
  const { home } = makeHome(versionOfBundle(), 'desktop')
  const second = join(home, 'profiles', 'other')
  mkdirSync(join(second, 'node_modules', 'dsh-everything'), { recursive: true })
  writeFileSync(join(second, 'package.json'), JSON.stringify({ name: 'p', dependencies: {} }))
  writeFileSync(
    join(second, 'node_modules', 'dsh-everything', 'package.json'),
    JSON.stringify({ name: 'dsh-everything', version: versionOfBundle() }),
  )
  const { parsed } = doctor(home, ['--compare', 'desktop', 'other', '--json'])
  const check = parsed.checks.find((c) => c.id === 'compare:version')
  assert.ok(check, 'a parity check should be produced')
  assert.equal(check.status, 'pass')
  rmSync(home, { recursive: true, force: true })
})

test('a missing source checkout is skipped, never warned', () => {
  // A checkout exists only where the bundle was authored. Reporting it as a
  // warning on every other machine produces a warning nobody can ever clear.
  const { home } = makeHome(versionOfBundle())
  const result = spawnSync(process.execPath, [DOCTOR, '--json'], {
    env: { ...process.env, DSH_HOME: home, DSH_EVERYTHING_SOURCES: '' },
    encoding: 'utf8',
  })
  const parsed = JSON.parse(result.stdout)
  for (const check of parsed.checks.filter((c) => c.id.startsWith('sync:'))) {
    assert.notEqual(check.status, 'warn', `${check.id} must not warn without a checkout`)
    assert.notEqual(check.status, 'fail', `${check.id} must not fail without a checkout`)
  }
  rmSync(home, { recursive: true, force: true })
})

test('an unknown flag exits 2 rather than guessing', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-doctor-'))
  const { status } = doctor(home, ['--nope'])
  assert.equal(status, 2)
  rmSync(home, { recursive: true, force: true })
})

test('--help exits 0 and documents every flag', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-doctor-'))
  const result = spawnSync(process.execPath, [DOCTOR, '--help'], { encoding: 'utf8', env: { ...process.env, DSH_HOME: home } })
  assert.equal(result.status, 0)
  for (const flag of ['--profile', '--compare', '--json']) {
    assert.ok(result.stdout.includes(flag), `${flag} should be documented`)
  }
  rmSync(home, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------

/** The version this checkout reports. */
function versionOfBundle() {
  return JSON.parse(readFileSync(join(BUNDLE, 'package.json'), 'utf8')).version
}

test('the framing check inspects the engine a profile resolves', () => {
  // A profile whose own node_modules holds a stale engine must fail even when
  // the bundle ships the fix: that false pass already happened once.
  const { home, profile } = makeHome('1.1.3')
  const engine = join(profile, 'node_modules', 'dsh-compaction-instant')
  mkdirSync(join(engine, 'src'), { recursive: true })
  writeFileSync(join(engine, 'package.json'), JSON.stringify({ name: 'dsh-compaction-instant', version: '0.1.4' }))
  writeFileSync(join(engine, 'src', 'compiler.js'), 'export function compileNodes() { return {} }')
  const { parsed, stdout } = doctor(home, ['--json'])
  const framing = (parsed?.checks ?? []).filter((c) => c.id.includes('compaction-framing'))
  assert.ok(framing.length > 0, `no framing checks; ids=${(parsed?.checks ?? []).map((c) => c.id).join(',')} raw=${stdout.slice(0, 200)}`)
  const check = framing.find((c) => c.id.endsWith(':dsh-compaction-instant'))
  assert.equal(check?.status, 'fail', 'a stale resolved engine fails');
  assert.match(check.detail, /nest/);
});

test('the framing check passes when the resolved engine carries the fix', () => {
  const { home, profile } = makeHome('1.1.3')
  const engine = join(profile, 'node_modules', 'dsh-compaction-instant')
  mkdirSync(join(engine, 'src'), { recursive: true })
  writeFileSync(join(engine, 'package.json'), JSON.stringify({ name: 'dsh-compaction-instant', version: '0.1.5' }))
  writeFileSync(
    join(engine, 'src', 'compiler.js'),
    'stripCheckpointFraming(); taskStatementPinned; kind: "note", pinned: true',
  )
  const { parsed } = doctor(home, ['--json'])
  const check = (parsed?.checks ?? []).find((c) => c.id.endsWith(':dsh-compaction-instant'))
  assert.equal(check?.status, 'pass', JSON.stringify(check))
});

test('the framing check reports a profile with no engine as skipped, not failed', () => {
  const { home } = makeHome('1.1.3')
  const { parsed } = doctor(home, ['--json'])
  const check = (parsed.checks ?? []).find((c) => c.id.endsWith(':desktop') && c.id.includes('compaction-framing'))
  assert.equal(check?.status, 'skip', JSON.stringify(check));
});

test('the bundled skill is shipped and validated', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-doctor-sk-'))
  const { parsed } = doctor(home, ['--json'])
  const check = (parsed?.checks ?? []).find((c) => c.id === 'bundle:skills:er-exercise-pdf')
  assert.equal(check?.status, 'pass', check?.detail)
  rmSync(home, { recursive: true, force: true })
})

test('a skill missing from package.json files fails the packaged check', () => {
  // Copy the bundle, drop "skills" from files, and prove the doctor notices:
  // shipping the directory without declaring it hides the skill on install.
  const copy = mkdtempSync(join(tmpdir(), 'dsh-doctor-sk2-'))
  for (const dir of ['bin', 'tools', 'packages', 'skills']) {
    cpSync(join(BUNDLE, dir), join(copy, dir), { recursive: true })
  }
  const pkg = JSON.parse(readFileSync(join(BUNDLE, 'package.json'), 'utf8'))
  pkg.files = pkg.files.filter((f) => f !== 'skills')
  writeFileSync(join(copy, 'package.json'), JSON.stringify(pkg))
  const home = mkdtempSync(join(tmpdir(), 'dsh-doctor-sk3-'))
  const result = spawnSync(process.execPath, [join(copy, 'bin', 'doctor.mjs'), '--json'], {
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
  })
  const parsed = JSON.parse(result.stdout)
  const check = (parsed.checks ?? []).find((c) => c.id === 'bundle:skills:packaged')
  assert.equal(check?.status, 'fail', 'undeclared skills/ must fail');
  assert.match(check.detail, /files/);
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)