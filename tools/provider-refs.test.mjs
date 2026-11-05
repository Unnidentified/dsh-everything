#!/usr/bin/env node
/**
 * Regression test for the credential batch the settings page describes.
 *
 * The page asks the credential service for every provider's key state in one
 * call. An account provider (Antigravity) signs in through OAuth and has no
 * stored key, so its row has no `ref`. Passing that `undefined` along with the
 * real refs makes the service reject the whole batch, and then **every** row
 * reads "Not set" — including the four that have a key.
 *
 * So the refs are collected defensively, and this pins both the collector and
 * the fact that the provider table really does contain a ref-less row (which is
 * what makes the guard necessary rather than hypothetical).
 *
 * Run with `node tools/provider-refs.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../packages/provider-keys/lib/index.js'), 'utf8')

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

/** Slice a top-level function or `const` table by balanced brackets. */
function extract(marker) {
	const start = source.indexOf(marker)
	assert.notEqual(start, -1, `${marker} is missing`)
	const opener = /function/.test(marker) ? '{' : '['
	const body = source.indexOf(opener, start)
	let depth = 0
	for (let i = body; i < source.length; i += 1) {
		if (source[i] === opener) depth += 1
		else if (source[i] === (opener === '{' ? '}' : ']')) {
			depth -= 1
			if (depth === 0) return source.slice(start, i + 1)
		}
	}
	throw new Error(`unbalanced brackets in ${marker}`)
}

const build = new Function(
	`${extract('const PROVIDERS =')}\n${extract('function credentialRefs(')}\nreturn { PROVIDERS, credentialRefs }`,
)
const { PROVIDERS, credentialRefs } = build()

check('the provider table really contains a ref-less account row', () => {
	// Without this the guard below could be deleted and the test would still pass.
	assert.ok(PROVIDERS.some((p) => p.oauth === true && p.ref === undefined), 'no OAuth provider in the table')
})

check('only real credential references are described', () => {
	const refs = credentialRefs(PROVIDERS)
	assert.ok(refs.length > 0, 'no refs collected')
	for (const ref of refs) {
		assert.equal(typeof ref, 'string', `a ${typeof ref} reached the batch`)
		assert.ok(ref.length > 0, 'an empty ref reached the batch')
	}
	assert.equal(refs.includes(undefined), false)
})

check('every keyed provider is represented exactly once', () => {
	const refs = credentialRefs(PROVIDERS)
	const keyed = PROVIDERS.filter((p) => typeof p.ref === 'string' && p.ref.length > 0).map((p) => p.ref)
	assert.deepEqual(refs, keyed)
	assert.equal(new Set(refs).size, refs.length, 'a ref is described twice')
})

check('the expected providers are covered', () => {
	const refs = credentialRefs(PROVIDERS)
	for (const ref of [
		'MERGE_GATEWAY_API_KEY',
		'MERGE_GATEWAY_API_KEY_2',
		'ISOQUANT_API_KEY',
		'MISTRAL_API_KEY',
		'CONCENTRATE_API_KEY',
	]) {
		assert.ok(refs.includes(ref), `${ref} would read as unset`)
	}
})

check('every ref matches the grammar the credential service accepts', () => {
	// The service validates the batch against this shape; a ref outside it
	// rejects the call and blanks every row, which is the bug this file exists for.
	const grammar = /^[A-Za-z_][A-Za-z0-9_]*$/
	for (const ref of credentialRefs(PROVIDERS)) {
		assert.match(ref, grammar, `${ref} would be rejected by credentials.describe`)
	}
})

check('the describe call uses the collected list', () => {
	// A helper nobody calls would leave the live bug in place.
	assert.match(source, /const refs = credentialRefs\(PROVIDERS\)/, 'state() does not use credentialRefs')
	assert.doesNotMatch(source, /PROVIDERS\.map\(\(p\) => p\.ref\)/, 'a raw provider map still feeds the batch')
})

if (failures.length > 0) {
	console.log(`\n${failures.length} reference check(s) failed`)
	process.exit(1)
}
console.log('\nall provider reference checks passed')
