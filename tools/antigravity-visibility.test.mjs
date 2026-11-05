#!/usr/bin/env node
/**
 * Regression test for the Antigravity model switches.
 *
 * The Providers page writes one visibility store for every route
 * (`llm-direct-visibility.json`). An adapter that keeps advertising a model the
 * page hid makes the switch a lie — the dropdown would still offer it after a
 * restart, and the page would show it switched off.
 *
 * So the adapter reads the same store per `listModels` call. This pins the
 * reading rules: a missing, malformed or empty store means "nothing hidden",
 * and only this provider's own ids are filtered.
 *
 * Run with `node tools/antigravity-visibility.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../packages/antigravity-auth/lib/llm-adapter.js'), 'utf8')

const failures = []
function check(name, fn) {
	try {
		fn()
		console.log(`  ok   ${name}`)
	} catch (error) {
		failures.push(name)
		console.log(`  FAIL ${name}\n         ${String(error.message).split('\n').join('\n         ')}`)
	}
}

/** Slice the helper out of the built adapter so the test reads the shipped code. */
function extract(name) {
	const start = source.indexOf(`function ${name}(`)
	assert.notEqual(start, -1, `${name} is missing`)
	const body = source.indexOf('{', start)
	let depth = 0
	for (let i = body; i < source.length; i += 1) {
		if (source[i] === '{') depth += 1
		else if (source[i] === '}') {
			depth -= 1
			if (depth === 0) return source.slice(start, i + 1)
		}
	}
	throw new Error(`unbalanced braces in ${name}`)
}

const helper = extract('withoutHiddenModels')
const build = new Function(
	'readFileSync', 'join', 'homedir', 'process',
	`const ANTIGRAVITY_PROVIDER = 'google-antigravity'\n${helper}\nreturn withoutHiddenModels`,
)

/** A reader that serves one store document, or throws like a missing file. */
const readerOf = (document) => () => {
	if (document === undefined) throw new Error('ENOENT')
	return JSON.stringify(document)
}

const visible = (document) => build(
	readerOf(document),
	(...parts) => parts.join('/'),
	() => '/home/tester',
	{ env: { DSH_HOME: '/home/tester/.dsh' } },
)

const models = [
	{ id: 'gemini-3.1-flash', name: 'Gemini 3.1 Flash' },
	{ id: 'claude-opus-4', name: 'Claude Opus 4' },
]

check('a missing store hides nothing', () => {
	assert.deepEqual(visible(undefined)(models), models)
})

check('a malformed store hides nothing', () => {
	assert.deepEqual(visible({ hidden: { 'google-antigravity': 'claude-opus-4' } })(models), models)
	assert.deepEqual(visible({ hidden: null })(models), models)
	assert.deepEqual(visible({})(models), models)
})

check('an empty hidden list hides nothing', () => {
	assert.deepEqual(visible({ hidden: { 'google-antigravity': [] } })(models), models)
})

check('this provider\u2019s hidden ids are removed and the rest kept', () => {
	const filtered = visible({ hidden: { 'google-antigravity': ['claude-opus-4'] } })(models)
	assert.deepEqual(filtered.map((m) => m.id), ['gemini-3.1-flash'])
})

check('another route\u2019s hidden ids are ignored', () => {
	assert.deepEqual(visible({ hidden: { isoquant: ['claude-opus-4'] } })(models), models)
})

check('non-string ids in the list do not break filtering', () => {
	const filtered = visible({ hidden: { 'google-antigravity': [null, 7, 'claude-opus-4'] } })(models)
	assert.deepEqual(filtered.map((m) => m.id), ['gemini-3.1-flash'])
})

check('hiding everything yields an empty catalog, not the snapshot', () => {
	assert.deepEqual(visible({ hidden: { 'google-antigravity': models.map((m) => m.id) } })(models), [])
})

check('the adapter reads the store on every listing', () => {
	// A cached read would keep serving a model hidden after the toggle.
	const calls = { count: 0 }
	const read = build(
		() => { calls.count += 1; return JSON.stringify({ hidden: {} }) },
		(...parts) => parts.join('/'),
		() => '/home/tester',
		{ env: {} },
	)
	read(models)
	read(models)
	assert.equal(calls.count, 2)
})

if (failures.length > 0) {
	console.log(`\n${failures.length} visibility check(s) failed`)
	process.exit(1)
}
console.log('\nall antigravity visibility checks passed')
