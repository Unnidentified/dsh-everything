#!/usr/bin/env node
/**
 * Regression test for the usage panel's provider picker and plan-only balance.
 *
 * Three rules are pinned here, each of which was wrong in a way the UI could not
 * explain:
 *
 * 1. The picker must not offer the key-based `deepseek-official` route. This
 *    bundle's DeepSeek access is the signed-in account, which has its own entry,
 *    so the twin rendered as a second, permanently empty "DeepSeek".
 * 2. A provider with no credential must not be offered at all: selecting it can
 *    only ever report "not configured". A route whose status is already `ok` is
 *    kept, because that means the host resolved a credential the registry does
 *    not name.
 * 3. Mistral publishes a plan and no balance. The card must say that rather than
 *    "no public balance interface", which is true but leaves the reader with
 *    nothing to act on.
 *
 * Run with `node tools/usage-picker.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const client = readFileSync(resolve(here, '../packages/usage-stats/lib/client.js'), 'utf8')
const accounts = readFileSync(resolve(here, '../packages/usage-stats/lib/accounts.js'), 'utf8')
const identity = readFileSync(resolve(here, '../packages/usage-stats/lib/provider-identity.js'), 'utf8')
const host = readFileSync(resolve(here, '../packages/usage-stats/lib/index.js'), 'utf8')

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

/** Slice one function body out of a shipped file by brace matching. */
function extractFunction(source, marker, isAsync = false) {
	const start = source.indexOf(`${isAsync ? 'async ' : ''}function ${marker}(`)
	assert.notEqual(start, -1, `${marker} is missing`)
	const body = source.indexOf('{', start)
	let depth = 0
	for (let i = body; i < source.length; i += 1) {
		if (source[i] === '{') depth += 1
		else if (source[i] === '}') {
			depth -= 1
			if (depth === 0) return source.slice(start, i + 1)
		}
	}
	throw new Error(`unbalanced braces in ${marker}`)
}

const buildChoices = new Function(
	`${extractFunction(client, 'buildProviderChoices')}\nreturn buildProviderChoices`,
)()

/** The provider rows the live host answered with, trimmed to the fields used. */
const live = [
	{ id: 'deepseek-official', configured: false, status: 'not-configured' },
	{ id: 'isoquant', configured: false, status: 'pending' },
	{ id: 'mistral', configured: true, status: 'ok' },
	{ id: 'concentrate-direct', configured: false, status: 'pending' },
	{ id: 'merge-direct', configured: true, status: 'ok' },
	{ id: 'merge-direct-2', configured: true, status: 'ok' },
	{ id: 'deepseek-account', configured: true, status: 'ok' },
	{ id: 'google-antigravity', configured: false, status: 'pending' },
	{ id: 'opencode-go', configured: false, status: 'not-configured' },
	{ id: 'zai', configured: false, status: 'not-configured' },
	{ id: 'commandcode', configured: false, status: 'not-configured' },
]

check('the picker never offers the key-based DeepSeek route', () => {
	const ids = buildChoices(live).map((p) => p.id)
	assert.equal(ids.includes('deepseek-official'), false, 'deepseek-official is still offered')
	// The signed-in account is the one DeepSeek entry that remains.
	assert.equal(ids.filter((id) => id.startsWith('deepseek')).join(','), 'deepseek-account')
})

check('only configured providers are offered', () => {
	const ids = buildChoices(live).map((p) => p.id)
	assert.deepEqual(ids, ['mistral', 'merge-direct', 'merge-direct-2', 'deepseek-account'])
})

check('a route the host already resolved is kept even without a configured flag', () => {
	// Some routes answer `ok` from a credential the registry does not name.
	const ids = buildChoices([
		{ id: 'mystery', configured: false, status: 'ok' },
		{ id: 'dead', configured: false, status: 'not-configured' },
	]).map((p) => p.id)
	assert.deepEqual(ids, ['mystery'])
})

check('a malformed provider list yields an empty picker, not a throw', () => {
	assert.deepEqual(buildChoices(undefined), [])
	assert.deepEqual(buildChoices(null), [])
	assert.deepEqual(buildChoices([]), [])
})

check('the default selection never names a provider the picker dropped', () => {
	const reconcile = extractFunction(client, 'reconcileSelectedProvider')
	assert.doesNotMatch(reconcile, /deepseek-official/, 'the fallback chain still names the dropped route')
})

check('the server-side default agrees with the picker', () => {
	const handler = extractFunction(host, 'selectedProviderId', true)
	assert.doesNotMatch(handler, /deepseek-official/, 'the server can still answer with the dropped route')
})

check('Mistral resolves to the plan-only adapter', () => {
	assert.match(identity, /\["mistral", Object\.freeze\(\{[^}]*accountAdapter: "plan-only"/)
})

check('the plan-only adapter is registered and dispatched', () => {
	assert.match(accounts, /"plan-only",/, 'the adapter is not in the ADAPTERS set')
	assert.match(accounts, /spec\.adapter === "plan-only"\) return finish\(await queryPlanOnly/, 'it is never dispatched')
})

check('the plan-only adapter reads the subscription endpoint and no money', () => {
	const adapter = extractFunction(accounts, 'queryPlanOnly', true)
	assert.match(adapter, /\/v1\/billing\/subscription/, 'the documented endpoint is not used')
	assert.match(adapter, /plan_name/, 'the plan field is not read')
	// A monetary field here would be invented: the API returns none.
	assert.doesNotMatch(adapter, /total_balance|credit_balance|balance_infos/, 'it reads a balance the API does not return')
})

check('the card has a plan-only state, localized in both languages', () => {
	assert.match(client, /state === "plan-only"/, 'the state is never rendered')
	assert.match(client, /"balance\.planOnly": "[^"]*套餐/, 'no Chinese copy')
	assert.match(client, /"balance\.planOnly": "This provider publishes its plan/, 'no English copy')
})

check('each provider card carries its own refresh control', () => {
	assert.match(client, /"data-refresh-balance": provider\.id/, 'the card has no refresh button')
	assert.match(client, /"account\.refreshBalance"/, 'the control has no label')
	assert.match(client, /"account\.refreshBalance": "/, 'the label is not localized')
})

if (failures.length > 0) {
	console.log(`\n${failures.length} picker check(s) failed`)
	process.exit(1)
}
console.log('\nall usage picker checks passed')
