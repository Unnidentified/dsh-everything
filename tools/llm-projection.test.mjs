#!/usr/bin/env node
/**
 * Regression test for how llm-direct projects conversation history onto the wire.
 *
 * Two defects are pinned here, both of which showed up as literal text in the
 * chat transcript:
 *
 *  1. `openaiContentOf` renders an assistant message for the OpenAI surface but
 *     handles no `tool-call` block, so every assistant turn that called a tool
 *     counted one "omitted" block and had `[1 unsupported block(s) omitted by
 *     dsh-llm-direct]` appended to its own text. The model then read that back as
 *     its own words and copied it into answers, where it was stored as ordinary
 *     text — so the marker survived the next request and compounded.
 *
 *  2. The marker was appended to assistant content at all. An assistant message
 *     is our own past output, so telling the model what its own turn dropped is
 *     the mechanism that created the feedback loop.
 *
 * The projection helpers are not exported (the module is loaded by the harness,
 * which supplies `@deepseek-ai/dsh-llm`), so the real function bodies are lifted
 * from source and evaluated against stubs. That keeps the test on shipped code
 * rather than a reimplementation of it.
 *
 * Run with `node tools/llm-projection.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../packages/llm-direct/lib/index.js'), 'utf8')

/** Text of a top-level `function name(...) { ... }`, by brace matching. */
function extract(name) {
	const start = source.indexOf(`function ${name}(`)
	assert.notEqual(start, -1, `function ${name} is missing from llm-direct`)
	let depth = 0
	let begun = false
	for (let i = start; i < source.length; i += 1) {
		const ch = source[i]
		if (ch === '{') {
			depth += 1
			begun = true
		} else if (ch === '}') {
			depth -= 1
			if (begun && depth === 0) return source.slice(start, i + 1)
		}
	}
	throw new Error(`unbalanced braces in ${name}`)
}

const stubs = `
const PKG = "dsh-llm-direct";
const imageIdOf = (b) => b.attachment?.id ?? "img";
const toBase64 = (b) => Buffer.from(b).toString("base64");
const offloadedImageText = (a) => "[offloaded " + (a?.id ?? "file") + "]";
const fileHandleText = (a) => "[file " + (a?.id ?? "f") + "]";
`

const functions = ['scrubOmissionMarker', 'openaiContentOf', 'openaiMessages', 'anthropicBlocks', 'anthropicMessages']
const dir = mkdtempSync(join(tmpdir(), 'llm-projection-'))
const modulePath = join(dir, 'probe.mjs')
writeFileSync(
	modulePath,
	`${stubs}\n${functions.map(extract).join('\n\n')}\n\nexport { ${functions.join(', ')} };\n`,
)
const { openaiMessages, anthropicMessages, scrubOmissionMarker } = await import(pathToFileURL(modulePath).href)

const noVersions = new Map()
const marker = 'unsupported block(s) omitted'
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

const conversation = {
	messages: [
		{ role: 'user', content: [{ type: 'text', text: 'do the thing' }] },
		{
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Running the checks.' },
				{ type: 'tool-call', id: 't1', name: 'bash', arguments: '{"command":"ls"}' },
			],
		},
		{ role: 'tool', toolCallId: 't1', content: [{ type: 'text', text: 'ok' }] },
	],
}

check('a tool call is not an omission on the OpenAI surface', () => {
	const body = openaiMessages(conversation, noVersions)
	const assistant = body.find((message) => message.role === 'assistant')
	assert.equal(assistant.content, 'Running the checks.')
	assert.deepEqual(assistant.tool_calls, [
		{ id: 't1', type: 'function', function: { name: 'bash', arguments: '{"command":"ls"}' } },
	])
	assert.ok(!JSON.stringify(body).includes(marker), 'the request carried an omission marker')
})

check('a tool call is still rendered on the Anthropic surface', () => {
	const body = anthropicMessages(conversation, noVersions)
	const assistant = body.find((message) => message.role === 'assistant')
	assert.deepEqual(assistant.content, [
		{ type: 'text', text: 'Running the checks.' },
		{ type: 'tool_use', id: 't1', name: 'bash', input: { command: 'ls' } },
	])
	assert.ok(!JSON.stringify(body).includes(marker), 'the request carried an omission marker')
})

check('a dropped user block is still reported to the model', () => {
	const body = openaiMessages(
		{ messages: [{ role: 'user', content: [{ type: 'text', text: 'see this' }, { type: 'image', attachment: { id: 'a1' } }] }] },
		noVersions,
	)
	assert.equal(body[0].content, `see this[1 ${marker} by dsh-llm-direct]`)
})

check('a dropped block in an assistant turn stays silent', () => {
	const body = openaiMessages(
		{
			messages: [
				{ role: 'user', content: [{ type: 'text', text: 'hi' }] },
				{ role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'image', attachment: { id: 'a1' } }] },
			],
		},
		noVersions,
	)
	const assistant = body.find((message) => message.role === 'assistant')
	assert.equal(assistant.content, 'ok')
	assert.ok(!JSON.stringify(body).includes(marker), 'the request carried an omission marker')
})

check('an assistant-held image stays silent on the Anthropic surface', () => {
	const body = anthropicMessages(
		{
			messages: [
				{ role: 'user', content: [{ type: 'text', text: 'hi' }] },
				{ role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'image', attachment: { id: 'a1' } }] },
			],
		},
		noVersions,
	)
	assert.ok(!JSON.stringify(body).includes(marker), 'the request carried an omission marker')
})

check('a marker recorded in history is scrubbed before it reaches the model', () => {
	assert.equal(scrubOmissionMarker('[1 unsupported block(s) omitted by dsh-llm-direct]'), '')
	assert.equal(
		scrubOmissionMarker('All C3/C4 findings confirmed.[1 unsupported block(s) omitted by dsh-llm-direct]'),
		'All C3/C4 findings confirmed.',
	)
})

check('the marker is scrubbed in every degraded shape it was copied in', () => {
	// The model reproduced it in pieces, so a bracket is often missing.
	for (const text of [
		'[1][1][1] unsupported block(s) omitted by dsh-llm-direct]',
		'[1][1][1 unsupported block(s) omitted by dsh-llm-direct]',
		'[1 unsupported block(s) omitted by dsh-llm-direct][1 unsupported block(s) omitted by dsh-llm-direct]',
	]) {
		assert.equal(scrubOmissionMarker(text), '', `not scrubbed: ${text}`)
	}
	assert.equal(
		scrubOmissionMarker('Let me check.[1][1] unsupported block(s) omitted by dsh-llm-direct]Now, beaker'),
		'Let me check.Now, beaker',
	)
})

check('ordinary text survives scrubbing unchanged', () => {
	for (const text of ['plain words', 'a [bracket] and a 1', 'code: const x = { a: 1 }', 'see [1](https://x) and [2]']) {
		assert.equal(scrubOmissionMarker(text), text)
	}
})

check('a scrubbed history still carries the conversation', () => {
	const body = openaiMessages(
		{
			messages: [
				{ role: 'user', content: [{ type: 'text', text: 'first' }] },
				{ role: 'assistant', content: [{ type: 'text', text: 'answer [1 unsupported block(s) omitted by dsh-llm-direct]' }] },
				{ role: 'user', content: [{ type: 'text', text: 'second' }] },
			],
		},
		noVersions,
	)
	assert.equal(body[1].content, 'answer')
	assert.equal(body.length, 3)
})

if (failures.length > 0) {
	console.log(`\n${failures.length} projection check(s) failed`)
	process.exit(1)
}
console.log('\nall projection checks passed')
