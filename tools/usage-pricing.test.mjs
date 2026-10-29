#!/usr/bin/env node
/**
 * Regression tests for usage-stats cost estimation.
 *
 * These exist because cost silently read "—" for the DeepSeek Account route while
 * the panel looked healthy: the route had no pricing family, the model it sends
 * (`deepseek-flash`) was not in the catalog, and the estimator received the
 * route-prefixed key (`deepseek-account/deepseek-flash`) instead of the model id.
 * Three independent faults produced one symptom, so each is pinned here.
 *
 * Run with `node tools/usage-pricing.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const lib = resolve(here, '../packages/usage-stats/lib')
const require = createRequire(import.meta.url)

const { createUsageCostEstimator } = await import(join(lib, 'billing.js'))
const { resolveProviderIdentity } = await import(join(lib, 'provider-identity.js'))
const { matchPricingRule, validatePricingRules, DEEPSEEK_PRICING_RULES } = await import(join(lib, 'pricing.js'))

const failures = []
function check(name, fn) {
	try {
		fn()
		console.log(`  ok   ${name}`)
	} catch (error) {
		failures.push(name)
		console.log(`  FAIL ${name}\n         ${error.message}`)
	}
}

// Wednesday 03:00 UTC is 11:00 in Shanghai (peak); 00:00 UTC is 08:00 (off-peak).
const PEAK = Date.parse('2026-10-28T03:00:00Z')
const OFF_PEAK = Date.parse('2026-10-28T00:00:00Z')

const accountProvider = { id: 'deepseek-account', displayName: 'DeepSeek Account' }
const estimate = createUsageCostEstimator([accountProvider], { monitors: {} })
const buckets = { inputTokens: 1000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, outputTokens: 1000 }

console.log('catalog')

check('shipped catalog validates', () => {
	assert.doesNotThrow(() => validatePricingRules(DEEPSEEK_PRICING_RULES))
})

check('deepseek-flash is priced', () => {
	const identity = resolveProviderIdentity(accountProvider, { monitors: {} })
	const rule = matchPricingRule({ identity, model: 'deepseek-flash', timestamp: OFF_PEAK, currency: 'USD' })
	assert.ok(rule, 'deepseek-flash has no pricing rule')
	assert.equal(rule.id, 'deepseek-flash-usd-weekday-schedule')
})

check('peak doubles input and output while a cache read stays at the pinned rate', () => {
	const identity = resolveProviderIdentity(accountProvider, { monitors: {} })
	const peak = matchPricingRule({ identity, model: 'deepseek-flash', timestamp: PEAK, currency: 'USD' })
	const off = matchPricingRule({ identity, model: 'deepseek-flash', timestamp: OFF_PEAK, currency: 'USD' })
	assert.deepEqual(off.pricing.offPeak, { cacheRead: 0.003, input: 0.15, cacheWrite: null, output: 0.6 })
	// 0.15 -> 0.30 and 0.60 -> 1.20 at peak; the cache-read price is a single
	// pinned figure (0.003), not a doubled one, because only that rate was given.
	assert.deepEqual(peak.pricing.peak, { cacheRead: 0.003, input: 0.3, cacheWrite: null, output: 1.2 })
})

console.log('route identity')

check('the official account route belongs to the DeepSeek price family', () => {
	const identity = resolveProviderIdentity(accountProvider, { monitors: {} })
	assert.equal(identity.providerFamily, 'deepseek')
	assert.equal(identity.pricingFamily, 'deepseek')
})

check('a gateway route prices the pinned model through its own rule', () => {
	const gateway = { id: 'merge-direct-2', displayName: 'Merge Direct 2' }
	const identity = resolveProviderIdentity(gateway, { monitors: {} })
	const rule = matchPricingRule({ identity, model: 'deepseek/deepseek-v4.1-flash-1017', timestamp: OFF_PEAK, currency: 'USD' })
	// The gateway is not the official endpoint, so no deepseek-family rule is
	// eligible for it. The pinned rule covers the *model*, not the endpoint,
	// which is the only way these routes can show a cost at all.
	assert.equal(rule?.id, 'deepseek-v4.1-flash-usd-pinned-any-route')
})

check('an unpinned model on a gateway route stays unpriced rather than guessed', () => {
	const gateway = { id: 'merge-direct-2', displayName: 'Merge Direct 2' }
	const identity = resolveProviderIdentity(gateway, { monitors: {} })
	assert.equal(matchPricingRule({ identity, model: 'deepseek/deepseek-v4-pro', timestamp: OFF_PEAK, currency: 'USD' }), null)
	assert.equal(matchPricingRule({ identity, model: 'runinfra/glm-5-3-flash', timestamp: OFF_PEAK, currency: 'USD' }), null)
})

check('every spelling of the pinned model collapses to one rule', () => {
	const spellings = [
		'deepseek/deepseek-v4.1-flash[1m]',
		'deepseek/deepseek-v4.1-flash-1017',
		'deepseek/deepseek-v4-1-flash',
		'deepseek/deepseek-v4.1-flash'
	]
	for (const model of spellings) {
		const rule = matchPricingRule({ identity: null, model, timestamp: OFF_PEAK, currency: 'USD' })
		assert.equal(rule?.id, 'deepseek-v4.1-flash-usd-pinned-any-route')
	}
})

check('a gateway merge sample now carries a real cost', () => {
	const cost = estimate({ providerId: 'merge-direct-2', model: 'merge-direct-2/deepseek/deepseek-v4.1-flash[1m]', timestamp: OFF_PEAK, buckets })
	// The shared fixture is 1M cache-read + 1k input + 1k output: 0.003 + 0.00015 + 0.0006
	assert.equal(cost.amount.toFixed(6), '0.003750')
	assert.equal(cost.ruleId, 'deepseek-v4.1-flash-usd-pinned-any-route')
})

console.log('estimator')

check('a route-prefixed model key is priced by its bare model id', () => {
	const cost = estimate({ providerId: 'deepseek-account', model: 'deepseek-account/deepseek-flash', timestamp: OFF_PEAK, buckets })
	assert.ok(cost, 'prefixed key produced no estimate')
	assert.equal(cost.ruleId, 'deepseek-flash-usd-weekday-schedule')
})

check('prefix stripping is limited to the route id, not a gateway namespace', () => {
	const cost = estimate({ providerId: 'deepseek-account', model: 'merge-direct/deepseek/deepseek-v4.1-flash[1m]', timestamp: OFF_PEAK, buckets })
	assert.equal(cost, null)
})

check('cache reads dominate the sample cost', () => {
	const cost = estimate({ providerId: 'deepseek-account', model: 'deepseek-flash', timestamp: OFF_PEAK, buckets })
	// 1M cache-read tokens at 0.003 + 1k input at 0.15 + 1k output at 0.6
	assert.equal(cost.amount.toFixed(6), '0.003750')
})

check('an unreadable bucket set yields no estimate instead of a wrong one', () => {
	const cost = estimate({ providerId: 'deepseek-account', model: 'deepseek-flash', timestamp: OFF_PEAK, buckets: { inputTokens: NaN, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } })
	assert.equal(cost, null)
})

if (failures.length > 0) {
	console.error(`\n${failures.length} failure(s): ${failures.join(', ')}`)
	process.exit(1)
}
console.log('\nall usage pricing checks passed')
