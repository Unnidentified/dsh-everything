#!/usr/bin/env node
/**
 * Regression test for the Merge vendor pins.
 *
 * Prompt caches live on the serving vendor, not on the model id. A merge model
 * that is declared without a vendor pin, or pinned to a vendor that does not
 * serve that model's cache, silently loses the prefix: the balance and usage
 * look fine while the cache hit rate collapses. That is exactly what happened
 * when the DeepSeek route was pinned to `particle`.
 *
 * So every model declared on a merge provider must name its vendor, and the
 * DeepSeek model must always name `deepseek`.
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

/** Model entries declared under a merge provider, with the vendor pinned below them. */
function mergeModels() {
	const indentOf = (line) => line.length - line.trimStart().length
	const rows = []
	let inMerge = false
	for (let index = 0; index < patch.length; index += 1) {
		const line = patch[index]
		const indent = indentOf(line)
		const trimmed = line.trim()
		// A merge provider is the only place these rows live: a key at the same
		// depth that does not start with "merge" ends the section.
		if (/^merge[\w-]*:\s*$/.test(trimmed) && indent === 8) {
			inMerge = true
			continue
		}
		if (indent === 8 && /^[\w-]+:\s*$/.test(trimmed)) {
			inMerge = false
			continue
		}
		if (indent < 8 && trimmed !== "") inMerge = false
		if (!inMerge) continue
		const model = /^- id:\s*(\S+)\s*$/.exec(trimmed)
		if (model === null || indent !== 10) continue
		// Read the model's own fields (indent 12 and deeper) until the next entry.
		let vendor = null
		for (let cursor = index + 1; cursor < patch.length; cursor += 1) {
			const next = patch[cursor]
			if (next.trim() === "") continue
			const nextIndent = indentOf(next)
			if (nextIndent <= 10) break
			const pin = /^vendor:\s*(\S+)\s*$/.exec(next.trim())
			if (pin !== null && nextIndent === 12) vendor = pin[1]
		}
		rows.push({ id: model[1], vendor })
	}
	return rows
}

console.log('merge vendor pins')

check('the patch actually declares merge models', () => {
	assert.ok(mergeModels().length > 0, 'no merge models found - the parser or the patch changed shape')
})

check('every merge model names its serving vendor', () => {
	const unpinned = mergeModels().filter((model) => model.vendor === null).map((model) => model.id)
	assert.deepEqual(unpinned, [], `unpinned merge models lose the prompt cache when the gateway reroutes: ${unpinned.join(', ')}`)
})

check('the DeepSeek model is pinned to the deepseek vendor', () => {
	const deepseek = mergeModels().filter((model) => model.id.startsWith('deepseek/'))
	assert.ok(deepseek.length > 0, 'no deepseek merge model found')
	for (const model of deepseek) {
		assert.equal(model.vendor, 'deepseek', `${model.id} must be pinned to deepseek, saw ${model.vendor}`)
	}
})

if (failures.length > 0) {
	console.error(`\n${failures.length} failure(s): ${failures.join(', ')}`)
	process.exit(1)
}
console.log('\nall merge vendor checks passed')
