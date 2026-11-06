#!/usr/bin/env node
/**
 * Pins the Mistral model rows the chat menu renders.
 *
 * Two things here are easy to lose and hard to notice:
 *
 * - The DeepSeek row's display name. It carried the upstream suffix
 *   (`-1017-Mistral`), which is vendor bookkeeping, not something to show in a
 *   model picker.
 * - The reasoning ladder. Mistral enforces it per model and names the accepted
 *   values in the error for an unsupported one, so each row's map was probed
 *   against the live API rather than guessed. A row missing a value the API
 *   accepts hides a real setting; a row claiming one it rejects fails at send
 *   time, mid-conversation.
 *
 * Run with `node tools/mistral-models.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const patch = readFileSync(resolve(here, '../cordis.patch.yml'), 'utf8')

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

/** The Mistral provider block, as lines. */
function mistralBlock() {
	const start = patch.indexOf('      mistral:')
	assert.notEqual(start, -1, 'the mistral provider is missing')
	const end = patch.indexOf('      concentrate-direct:', start)
	return patch.slice(start, end).split('\n')
}

/** One row's fields, keyed by the indentation the patch uses. */
function rows() {
	const out = []
	let current
	for (const line of mistralBlock()) {
		const id = /^          - id: (.+)$/.exec(line)
		if (id !== null) {
			current = { id: id[1], name: undefined, efforts: {} }
			out.push(current)
			continue
		}
		if (current === undefined) continue
		const name = /^            name: (.+)$/.exec(line)
		if (name !== null) { current.name = name[1]; continue }
		const effort = /^              ([a-z]+): ([a-z]+)$/.exec(line)
		if (effort !== null) current.efforts[effort[1]] = effort[2]
	}
	return out
}

const table = rows()
const byId = new Map(table.map((row) => [row.id, row]))

check('every Mistral model row is parsed', () => {
	assert.equal(table.length, 9, `expected 9 rows, parsed ${table.length}`)
})

check('the DeepSeek row is named for the model, not the vendor', () => {
	const row = byId.get('deepseek-v4-1-flash-1017')
	assert.ok(row !== undefined, 'the DeepSeek row is missing')
	assert.equal(row.name, 'DeepSeek-V4.1-Flash')
})

check('the DeepSeek row offers the whole ladder the API accepts', () => {
	// Probed: none, low, high, xhigh, max (medium and minimal are rejected).
	assert.deepEqual(byId.get('deepseek-v4-1-flash-1017').efforts, {
		off: 'none',
		low: 'low',
		high: 'high',
		xhigh: 'xhigh',
		max: 'max',
	})
})

check('every ladder matches what the API accepted per model', () => {
	assert.deepEqual(byId.get('mistral-large-4').efforts, { low: 'low', medium: 'medium', high: 'high' })
	assert.deepEqual(byId.get('mistral-small-2603').efforts, { off: 'none', high: 'high' })
	assert.deepEqual(byId.get('zai-glm-5-3').efforts, { low: 'low', high: 'high', max: 'max' })
	assert.deepEqual(byId.get('zai-glm-5-3-flash').efforts, { low: 'low', high: 'high', max: 'max' })
})

check('models with no reasoning support declare no rungs', () => {
	// Sending `reasoning_effort` to these is rejected, so the field must stay off.
	for (const id of ['codestral-latest', 'ministral-14b-latest', 'ministral-8b-latest', 'ministral-3b-latest']) {
		assert.deepEqual(byId.get(id).efforts, {}, `${id} declares reasoning it does not accept`)
	}
})

check('every declared rung is a harness effort id', () => {
	const known = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
	for (const row of table) {
		for (const key of Object.keys(row.efforts)) {
			assert.ok(known.has(key), `${row.id} declares ${key}, which the harness does not model`)
		}
	}
})

if (failures.length > 0) {
	console.log(`\n${failures.length} model check(s) failed`)
	process.exit(1)
}
console.log('\nall mistral model checks passed')
