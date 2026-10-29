#!/usr/bin/env node
/**
 * Regression test for the Merge vendor pins.
 *
 * Prompt caches live on the serving vendor, not on the model id. A merge model
 * declared without a vendor pin, or pinned to a vendor that does not serve that
 * model's cache, silently loses the prefix: the balance and usage look fine
 * while the cache hit rate collapses. That is exactly what happened when the
 * DeepSeek route was pinned to `particle`.
 *
 * So every model declared on a merge provider must name its vendor, the
 * DeepSeek model must always name `deepseek`, and the usage-stats monitors
 * (which are what the account card reads) must agree with that pin instead of
 * drifting into a different label.
 *
 * Run with `node tools/merge-vendor.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const patch = readFileSync(resolve(here, '../cordis.patch.yml'), 'utf8').split('\n')

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

const indentOf = (line) => line.length - line.trimStart().length

/** Model rows declared under a merge provider, with the route they belong to. */
function mergeModels() {
	const rows = []
	let route = null
	for (let index = 0; index < patch.length; index += 1) {
		const line = patch[index]
		const trimmed = line.trim()
		const indent = indentOf(line)
		// A merge provider is a key at depth 8: `        merge-direct:`.
		const provider = /^([\w-]+):\s*$/.exec(trimmed)
		if (indent === 8 && provider !== null) {
			route = /^merge/.test(provider[1]) ? provider[1] : null
			continue
		}
		if (indent < 8 && trimmed !== '') route = null
		if (route === null) continue
		const model = /^- id:\s*(\S+)\s*$/.exec(trimmed)
		if (model === null || indent !== 10) continue
		let vendor = null
		for (let cursor = index + 1; cursor < patch.length; cursor += 1) {
			const next = patch[cursor]
			if (next.trim() === '') continue
			if (indentOf(next) <= 10) break
			const pin = /^vendor:\s*(\S+)\s*$/.exec(next.trim())
			if (pin !== null && indentOf(next) === 12) { vendor = pin[1]; break }
		}
		rows.push({ route, id: model[1], vendor })
	}
	return rows
}

/** Vendors the usage-stats monitors declare, keyed by merge route. */
function monitorVendors() {
	const out = new Map()
	let inUsage = false
	for (let index = 0; index < patch.length; index += 1) {
		const line = patch[index]
		const trimmed = line.trim()
		const indent = indentOf(line)
		if (/^- id:\s*usage-stats\s*$/.test(trimmed)) { inUsage = true; continue }
		if (/^- id:\s*/.test(trimmed)) { inUsage = false; continue }
		if (!inUsage || indent !== 8) continue
		const route = /^([\w-]+):\s*$/.exec(trimmed)
		if (route === null) continue
		let vendor = null
		for (let cursor = index + 1; cursor < patch.length; cursor += 1) {
			const next = patch[cursor]
			if (next.trim() === '') continue
			if (indentOf(next) <= 8) break
			const hit = /^vendor:\s*(\S+)\s*$/.exec(next.trim())
			if (hit !== null) { vendor = hit[1]; break }
		}
		if (vendor !== null) out.set(route[1], vendor)
	}
	return out
}

console.log('merge vendor pins')

check('the patch actually declares merge models', () => {
	assert.ok(mergeModels().length > 0, 'no merge models found - the parser or the patch changed shape')
})

check('every merge model names its serving vendor', () => {
	const unpinned = mergeModels().filter((model) => model.vendor === null).map((model) => `${model.route}/${model.id}`)
	assert.deepEqual(unpinned, [], `unpinned merge models lose the prompt cache when the gateway reroutes: ${unpinned.join(', ')}`)
})

check('the DeepSeek model is pinned to the deepseek vendor', () => {
	const deepseek = mergeModels().filter((model) => model.id.startsWith('deepseek/'))
	assert.ok(deepseek.length > 0, 'no deepseek merge model found')
	for (const model of deepseek) {
		assert.equal(model.vendor, 'deepseek', `${model.id} must be pinned to deepseek, saw ${model.vendor}`)
	}
})

check('the account card names the vendor each merge route really uses', () => {
	const monitors = monitorVendors()
	// A route carries several models (DeepSeek, GLM) that different vendors serve,
	// so the card names the vendor of the model this route runs. Pin that to the
	// DeepSeek row rather than to whichever model the file lists last.
	const deepseekByRoute = new Map()
	for (const model of mergeModels()) {
		if (model.id.startsWith('deepseek/')) deepseekByRoute.set(model.route, model.vendor)
	}
	assert.ok(deepseekByRoute.size > 0, 'no merge route declares a deepseek model')
	for (const [route, vendor] of deepseekByRoute) {
		assert.ok(monitors.has(route), `${route} has no usage-stats monitor, so its card cannot name a vendor`)
		assert.equal(monitors.get(route), vendor, `${route}'s card would name ${monitors.get(route)} while its deepseek model is pinned to ${vendor}`)
	}
})

if (failures.length > 0) {
	console.error(`\n${failures.length} failure(s): ${failures.join(', ')}`)
	process.exit(1)
}
console.log('\nall merge vendor checks passed')
