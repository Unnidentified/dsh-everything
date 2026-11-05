#!/usr/bin/env node
/**
 * Regression test for typed `content` chunks in the OpenAI-compatible surface.
 *
 * `delta.content` is a string on most routes, but the shape also allows an array
 * of typed chunks, and Mistral streams a reasoning model exactly that way:
 *
 *   {"content":[{"type":"thinking","thinking":[{"type":"text","text":"…"}]}]}
 *   {"content":[{"type":"text","text":"the answer"}]}
 *
 * The adapter used to read only `typeof content === "string"`, so every reply
 * from such a model was dropped while tool calls still worked — the turn came
 * back empty with no error anywhere.
 *
 * The helper is lifted from source and evaluated, so the test runs the shipped
 * code rather than a copy of it.
 *
 * Run with `node tools/llm-content.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../packages/llm-direct/lib/index.js'), 'utf8')

/** Text of a top-level `function name(...) { ... }`, by brace matching. */
function extract(name) {
	const start = source.indexOf(`function ${name}(`)
	assert.notEqual(start, -1, `function ${name} is missing from llm-direct`)
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

const contentChunksOf = new Function(`${extract('contentChunksOf')}; return contentChunksOf;`)()

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

check('a plain string is text', () => {
	assert.deepEqual(contentChunksOf('hello'), { text: 'hello', reasoning: '' })
	assert.deepEqual(contentChunksOf(''), { text: '', reasoning: '' })
})

check('the Mistral reasoning shape yields both parts', () => {
	const value = [
		{ type: 'thinking', thinking: [{ type: 'text', text: 'the image shows ' }, { type: 'text', text: 'a heading' }], closed: true },
		{ type: 'text', text: 'API reference' },
	]
	assert.deepEqual(contentChunksOf(value), { text: 'API reference', reasoning: 'the image shows a heading' })
})

check('text-only chunk arrays concatenate in order', () => {
	const value = [
		{ type: 'text', text: 'one ' },
		{ type: 'text', text: 'two' },
	]
	assert.deepEqual(contentChunksOf(value), { text: 'one two', reasoning: '' })
})

check('unknown chunk types are ignored rather than guessed', () => {
	const value = [{ type: 'image', image_url: { url: 'data:image/png;base64,AA' } }, { type: 'text', text: 'ok' }]
	assert.deepEqual(contentChunksOf(value), { text: 'ok', reasoning: '' })
})

check('malformed values yield nothing instead of throwing', () => {
	for (const value of [null, undefined, 42, {}, [null, 7, { type: 'thinking' }], [{ type: 'text' }]]) {
		assert.deepEqual(contentChunksOf(value), { text: '', reasoning: '' }, JSON.stringify(value))
	}
})

if (failures.length > 0) {
	console.log(`\n${failures.length} content check(s) failed`)
	process.exit(1)
}
console.log('\nall content checks passed')
