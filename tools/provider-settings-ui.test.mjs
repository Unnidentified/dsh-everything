#!/usr/bin/env node
/**
 * Structure test for the Providers & models settings page.
 *
 * The page is browser code, so the only way to check its layout without a browser
 * is to build the same element tree and inspect it. `renderPage` is pure for that
 * reason; this test evaluates the real module through its loader entry point with
 * a minimal React shim, so what is asserted is the shipped layout.
 *
 * What matters here is the shape the rework promised: rows grouped by what they
 * are, one card per provider in the picker, a master switch per provider, and the
 * per-model switches reachable behind the disclosure.
 *
 * Run with `node tools/provider-settings-ui.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../packages/provider-keys/lib/client.js'), 'utf8')

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

/** Minimal React: enough hooks for the components, and a recording tree. */
function makeReact() {
	let pending = []
	const element = (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) })
	return {
		element,
		load: (factory) => factory,
		render(node) {
			if (node === null || node === undefined || node === false) return null
			if (typeof node === 'string' || typeof node === 'number') return String(node)
			if (Array.isArray(node)) return node.map((child) => this.render(child))
			if (typeof node.type === 'function') return this.render(node.type({ ...node.props, children: node.children }))
			return { ...node, children: node.children.map((child) => this.render(child)).filter((c) => c !== null) }
		},
	}
}

/** Load the client module and hand back its `renderPage`. */
function loadPage() {
	const React = makeReact()
	let registered
	const hooks = {
		useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
		useEffect: () => {},
		useCallback: (fn) => fn,
		useRef: (initial) => ({ current: initial }),
	}
	const requireFn = (name) => (name === 'react' ? { createElement: React.element, ...hooks } : {})
	globalThis.window = { __ModuleLoader__: { load: (entry) => { registered = entry.factory(requireFn) } } }
	globalThis.document = { createElement: () => ({ setAttribute() {}, remove() {} }), head: { appendChild() {} } }
	new Function(`${source.replace('window.__ModuleLoader__.load', 'globalThis.window.__ModuleLoader__.load')}`)()
	assert.equal(typeof registered, 'object', 'the client module did not load')
	// renderPage is not exported; reach it through a factory shim that records it.
	return { module: registered, React }
}

const loader = loadPage()

/** Every node in the rendered tree, depth first. */
function flatten(node, out = []) {
	if (node === null) return out
	if (Array.isArray(node)) {
		for (const child of node) flatten(child, out)
		return out
	}
	out.push(node)
	for (const child of node.children ?? []) flatten(child, out)
	return out
}

const fixture = {
	providers: [
		{ id: 'isoquant', label: 'Isoquant', ref: 'ISOQUANT_API_KEY', configured: true, docs: 'https://isoquant.ai/', hint: 'Backs the isoquant provider.' },
		{ id: 'mistral', label: 'Mistral', ref: 'MISTRAL_API_KEY', configured: false, docs: 'https://docs.mistral.ai/', hint: 'Backs the mistral provider.' },
		{ id: 'merge-1', label: 'Merge Gateway #1', ref: 'MERGE_GATEWAY_API_KEY', configured: true, docs: 'https://gateway.merge.dev/', hint: 'Primary.' },
		{ id: 'merge-2', label: 'Merge Gateway #2', ref: 'MERGE_GATEWAY_API_KEY_2', configured: true, docs: 'https://gateway.merge.dev/', hint: 'Second.' },
		{ id: 'concentrate', label: 'Concentrate AI', ref: 'CONCENTRATE_API_KEY', configured: true, docs: 'https://api.concentrate.ai/', hint: 'Concentrate.' },
		{ id: 'exa', label: 'Exa', ref: 'EXA_API_KEY', configured: true, docs: 'https://dashboard.exa.ai/', hint: 'Search.' },
		{ id: 'tinyfish', label: 'TinyFish #1', ref: 'TINYFISH_API_KEY', configured: true, docs: 'https://agent.tinyfish.ai/', hint: 'MCP.', file: 'tinyfish-api-key' },
		{ id: 'tinyfish-2', label: 'TinyFish #2', ref: 'TINYFISH_API_KEY_2', configured: false, docs: 'https://agent.tinyfish.ai/', hint: 'MCP 2.' },
	],
	connections: [
		{ id: 'tinyfish', label: 'TinyFish', enabled: true, hint: 'All of it.' },
		{ id: 'tinyfish-1', label: 'TinyFish #1', enabled: true, hint: 'First.', sub: true },
		{ id: 'tinyfish-2', label: 'TinyFish #2', enabled: true, hint: 'Second.', sub: true },
	],
	picker: [
		{ provider: 'isoquant', name: 'Isoquant', hidden: false, models: [{ id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek-V4.1-Flash-1017', hidden: false }, { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', hidden: true }] },
		{ provider: 'mistral', name: 'Mistral', hidden: true, models: [{ id: 'mistral-large-4', name: 'Mistral-Large-4', hidden: false }] },
	],
}

function extract(name) {
	const start = source.indexOf(`function ${name}(`)
	assert.notEqual(start, -1, `${name} is missing`)
	// Skip the parameter list first: a destructured parameter opens a brace that
	// is not the body, and counting from there truncates the function.
	let i = source.indexOf('(', start)
	let parens = 0
	for (; i < source.length; i += 1) {
		if (source[i] === '(') parens += 1
		else if (source[i] === ')') { parens -= 1; if (parens === 0) break }
	}
	let depth = 0
	let begun = false
	for (; i < source.length; i += 1) {
		if (source[i] === '{') { depth += 1; begun = true }
		else if (source[i] === '}') { depth -= 1; if (begun && depth === 0) return source.slice(start, i + 1) }
	}
	throw new Error(`unbalanced braces in ${name}`)
}

const React = makeReact()
const hooks = {
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
	useEffect: () => {},
	useCallback: (fn) => fn,
	useRef: (initial) => ({ current: initial }),
}
const h = React.element
/** The section table the page renders from. */
function extractConst(name) {
	const start = source.indexOf(`const ${name} =`)
	assert.notEqual(start, -1, `${name} is missing`)
	// Bracket matching, not "first ]": the table holds nested arrays.
	let i = source.indexOf('[', start)
	let depth = 0
	for (; i < source.length; i += 1) {
		if (source[i] === '[') depth += 1
		else if (source[i] === ']') { depth -= 1; if (depth === 0) break }
	}
	return source.slice(start, i + 1)
}

const components = [extractConst('KEY_SECTIONS'), 'Switch', 'KeyRow', 'ProviderCard', 'ConnectionRow', 'Section', 'renderPage']
	.map((entry) => (entry.startsWith('const ') ? entry : extract(entry))).join('\n\n')
const build = new Function(
	'h', 'useState', 'useEffect', 'useCallback', 'useRef',
	`${components}\nreturn renderPage;`,
)
const renderPage = build(h, hooks.useState, hooks.useEffect, hooks.useCallback, hooks.useRef)

const tree = React.render(renderPage(fixture, () => {}))
const nodes = flatten(tree)
const text = (node) => (typeof node === 'string' ? node : '')

check('the page is organized in three named sections', () => {
	const titles = nodes.filter((n) => n.props?.className === 'pk-section-title').map((n) => n.children.join(''))
	assert.deepEqual(titles, ['Model providers', 'Chat model picker', 'Search and web tools'])
})

check('every configured key has a row and nothing else is listed', () => {
	// A key row is the one with the write-only field; a switch row has none.
	const keyLabels = nodes
		.filter((n) => typeof n.props?.className === 'string' && n.props.className.split(' ').includes('pk-row'))
		.filter((row) => flatten(row).some((n) => n.props?.type === 'password'))
		.map((row) => flatten(row).find((n) => n.props?.className === 'pk-label').children.join(''))
	assert.deepEqual(keyLabels, [
		'Isoquant', 'Mistral', 'Merge Gateway #1', 'Merge Gateway #2', 'Concentrate AI',
		'Exa', 'TinyFish #1', 'TinyFish #2',
	])
})

check('the retired key rows are gone', () => {
	const all = nodes.map((n) => n.children?.join?.('') ?? '').join(' ')
	for (const gone of ['DeepSeek', 'Z.ai', 'OrcaRouter', 'CommandCode', 'Packet Tracer']) {
		assert.ok(!all.includes(gone), `${gone} is still on the page`)
	}
})

check('each provider in the picker gets one card', () => {
	const cards = nodes.filter((n) => n.props?.className === 'pk-card pk-provider')
	assert.equal(cards.length, 2)
})

check('a provider switch reflects whether it is offered', () => {
	const switches = nodes.filter((n) => n.props?.role === 'switch')
	// One master per provider; per-model switches stay behind the disclosure.
	assert.equal(switches.length, 2)
	assert.equal(switches[0].props['aria-checked'], true, 'isoquant is offered')
	assert.equal(switches[1].props['aria-checked'], false, 'mistral is hidden')
	assert.match(switches[1].props['aria-label'], /Mistral/)
})

check('the card says how many models it contributes', () => {
	const hints = nodes.filter((n) => n.props?.className === 'pk-hint').map((n) => n.children.join(''))
	assert.ok(hints.some((t) => t === '1 of 2 models in the chat menu'), hints.join(' | '))
	assert.ok(hints.some((t) => t === 'All of its models are hidden from the chat menu'), hints.join(' | '))
})

check('model switches are behind the disclosure, not sprawled on the page', () => {
	// Collapsed by default: the per-model rows only exist once the card is open.
	assert.equal(nodes.filter((n) => n.props?.className === 'pk-model-name').length, 0)
	const disclosures = nodes.filter((n) => n.props?.className === 'pk-disclosure')
	assert.equal(disclosures.length, 1, 'only the two-model provider can be expanded')
	assert.equal(disclosures[0].props['aria-expanded'], false)
})

check('TinyFish account switches are nested under the product switch', () => {
	const subRows = nodes.filter((n) => typeof n.props?.className === 'string' && n.props.className.includes('pk-row-sub'))
	assert.equal(subRows.length, 2)
})

check('the module still registers its page', () => {
	assert.deepEqual(loader.module.inject, ['slots', 'connection'])
	assert.equal(typeof loader.module.apply, 'function')
})

if (failures.length > 0) {
	console.log(`\n${failures.length} layout check(s) failed`)
	process.exit(1)
}
console.log('\nall layout checks passed')
