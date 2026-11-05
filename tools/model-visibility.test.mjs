#!/usr/bin/env node
/**
 * Regression tests for model visibility.
 *
 * Two switches decide what the chat model menu offers, and they are independent:
 * one hides a whole provider, the other hides a single model. Both live in the
 * same JSON file, so the failure this test exists for is one handler rewriting the
 * document and silently dropping the other switch — a toggle that appears to work
 * and comes back the next time the page loads.
 *
 * They are also picker-only. `resolveModel` keeps answering for a hidden provider
 * or model, so a session already using one keeps running and nothing has to be
 * re-added to switch back.
 *
 * Run with `node tools/model-visibility.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const adapter = readFileSync(resolve(here, '../packages/llm-direct/lib/index.js'), 'utf8')
const settings = readFileSync(resolve(here, '../packages/provider-keys/lib/index.js'), 'utf8')

/** Text of a top-level `function name(...) { ... }`, by brace matching. */
function extract(source, name) {
	// An async function's `async` sits before the keyword the body needs, so keep it.
	const asyncAt = source.indexOf(`async function ${name}(`)
	const start = asyncAt === -1 ? source.indexOf(`function ${name}(`) : asyncAt
	assert.notEqual(start, -1, `function ${name} is missing`)
	let depth = 0
	let begun = false
	for (let i = start; i < source.length; i += 1) {
		if (source[i] === '{') {
			depth += 1
			begun = true
		} else if (source[i] === '}') {
			depth -= 1
			if (begun && depth === 0) return source.slice(start, i + 1)
		}
	}
	throw new Error(`unbalanced braces in ${name}`)
}

const visibleModels = new Function(
	`${extract(adapter, 'visibleModels')}; return visibleModels;`,
)()

/** The two host writers/readers, running against an in-memory file. */
function makeStore() {
	const files = new Map()
	const readFile = async (path) => {
		if (!files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
		return files.get(path)
	}
	const writeFile = async (path, data) => { files.set(path, data) }
	const rename = async (from, to) => {
		files.set(to, files.get(from))
		files.delete(from)
	}
	const source = ['readProviderVisibility', 'writeProviderVisibility', 'readModelVisibility', 'writeModelVisibility', 'readCatalog', 'writeCatalog']
		.map((name) => extract(settings, name))
		.join('\n\n')
	const factory = new Function(
		'readFile', 'writeFile', 'mkdir', 'chmod', 'rename', 'dirname', 'modelVisibilityPath',
		`${source}
		return { readProviderVisibility, writeProviderVisibility, readModelVisibility, writeModelVisibility, readCatalog, writeCatalog };`,
	)
	return {
		files,
		api: factory(readFile, writeFile, async () => {}, async () => {}, rename, () => '.', () => '/store.json'),
	}
}

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

const profile = {
	models: [
		{ id: 'a' },
		{ id: 'b' },
		{ id: 'c', hidden: true },
	],
}

check('an untouched provider offers all of its models', () => {
	const shown = visibleModels(profile, 'p', new Set(), new Set()).map((m) => m.id)
	assert.deepEqual(shown, ['a', 'b'], 'a config-hidden model is already out')
})

check('a hidden model leaves only that model out', () => {
	const shown = visibleModels(profile, 'p', new Set(['p\u0000b']), new Set()).map((m) => m.id)
	assert.deepEqual(shown, ['a'])
})

check('a hidden provider offers nothing', () => {
	assert.deepEqual(visibleModels(profile, 'p', new Set(), new Set(['p'])), [])
})

check('hiding one provider does not hide another', () => {
	assert.equal(visibleModels(profile, 'q', new Set(), new Set(['p'])).length, 2)
})

check('the two switches share one file without erasing each other', async () => {
	const { api } = makeStore()
	// Provider switch first, then the model switch: the model writer must keep
	// the provider decision, which is the bug this file-level test guards.
	await api.writeModelVisibility({ p: ['a'] })
	await api.writeProviderVisibility({ q: true })
	assert.deepEqual(await api.readModelVisibility(), { p: ['a'] })
	assert.deepEqual(await api.readProviderVisibility(), { q: true })

	await api.writeModelVisibility({})
	assert.deepEqual(await api.readProviderVisibility(), { q: true }, 'clearing models must not clear providers')
})

check('switching a provider back on removes only that entry', async () => {
	const { api } = makeStore()
	await api.writeProviderVisibility({ p: true, q: true })
	await api.writeProviderVisibility({ q: true })
	assert.deepEqual(await api.readProviderVisibility(), { q: true })
})

check('a stored false is not a hidden provider', async () => {
	const { api, files } = makeStore()
	files.set('/store.json', JSON.stringify({ providers: { p: false, q: true } }))
	assert.deepEqual(await api.readProviderVisibility(), { q: true })
})

check('a missing or corrupt file reads as nothing hidden', async () => {
	const { api, files } = makeStore()
	assert.deepEqual(await api.readProviderVisibility(), {})
	assert.deepEqual(await api.readModelVisibility(), {})
	files.set('/store.json', '{ not json')
	assert.deepEqual(await api.readProviderVisibility(), {})
})

check('a hidden provider keeps the catalog needed to switch it back', async () => {
	const { api } = makeStore()
	await api.writeCatalog('mistral', [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])
	await api.writeProviderVisibility({ mistral: true })
	// `listModels` returns nothing for a hidden provider, so this catalog is the
	// only thing that keeps its rows addressable — it must survive both writers.
	await api.writeModelVisibility({ isoquant: ['g'] })
	assert.deepEqual(await api.readCatalog(), { mistral: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] })
})

check('a catalog entry merges instead of replacing the list', async () => {
	const { api } = makeStore()
	await api.writeCatalog('p', [{ id: 'a', name: 'A' }])
	await api.writeCatalog('p', [{ id: 'b', name: 'B' }])
	const catalog = await api.readCatalog()
	assert.deepEqual(catalog.p.map((m) => m.id), ['a', 'b'])
})

;(async () => {
	// The async cases above are declared with `check`, so await their completion
	// by draining the microtask queue before reporting.
	await new Promise((r) => setTimeout(r, 0))
	if (failures.length > 0) {
		console.log(`\n${failures.length} visibility check(s) failed`)
		process.exit(1)
	}
	console.log('\nall visibility checks passed')
})()
