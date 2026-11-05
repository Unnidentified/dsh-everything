#!/usr/bin/env node
/**
 * Install this bundle into a profile's node_modules, including the copies the
 * loader actually resolves.
 *
 * pnpm materialises a `file:` dependency as a copy under `.pnpm`, and the loader
 * imports that copy — not `packages/<dir>`. Editing the bundle in place therefore
 * changes nothing at runtime, silently: the app keeps running the old build while
 * `git status` says everything is committed. That is exactly how a settings
 * rework looked unchanged after a restart.
 *
 * So an install is two writes: the bundle root (what the loader reads for the
 * patch, skills and version) and every `.pnpm` package copy (what it imports).
 *
 * Usage: node bin/install-profile.mjs [profile]
 *        DSH_HOME=/path/to/home node bin/install-profile.mjs desktop
 *
 * @module dsh-everything/install-profile
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const BUNDLE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh')
const profileName = process.argv[2] ?? 'desktop'
const profileRoot = join(HOME, 'profiles', profileName)
const installedBundle = join(profileRoot, 'node_modules', 'dsh-everything')

if (!existsSync(join(installedBundle, 'package.json'))) {
	console.error(`install-profile: ${installedBundle} is not an installed bundle`)
	console.error('Install the bundle into the profile first (Plugins page or pnpm add).')
	process.exit(1)
}

/** Root entries the loader reads straight from the bundle package. */
const ROOT_ENTRIES = ['package.json', 'README.md', 'cordis.patch.yml', 'bin', 'tools', 'skills', 'locale', 'icon.svg']

let copied = 0
for (const entry of ROOT_ENTRIES) {
	const from = join(BUNDLE_ROOT, entry)
	if (!existsSync(from)) continue
	cpSync(from, join(installedBundle, entry), { recursive: true, force: true })
	copied += 1
}

const require = createRequire(join(installedBundle, 'package.json'))
const packagesDir = join(BUNDLE_ROOT, 'packages')
/** One line per package: whether the running copy was refreshed. */
const report = []

for (const dir of existsSync(packagesDir) ? readdirSync(packagesDir) : []) {
	const source = join(packagesDir, dir)
	const manifestPath = join(source, 'package.json')
	if (!existsSync(manifestPath)) continue
	const name = JSON.parse(readFileSync(manifestPath, 'utf8')).name
	let target
	try {
		target = dirname(require.resolve(`${name}/package.json`))
	} catch {
		report.push(`  ${dir.padEnd(24)} not installed in this profile`)
		continue
	}
	// Copy the package over the resolved directory, keeping its node_modules.
	for (const entry of readdirSync(source)) {
		if (entry === 'node_modules') continue
		const from = join(source, entry)
		const to = join(target, entry)
		// Replace rather than merge: a file removed from the source must disappear,
		// or a deleted module keeps loading from the previous build.
		rmSync(to, { recursive: true, force: true })
		cpSync(from, to, { recursive: true })
	}
	report.push(`  ${dir.padEnd(24)} ${target.includes('.pnpm') ? 'store copy refreshed' : 'refreshed'}`)
}

mkdirSync(profileRoot, { recursive: true })
console.log(`installed ${copied} bundle entries into ${installedBundle}`)
console.log(report.join('\n'))
console.log('\nRestart the app (or reload the page) for the new code to load.')
