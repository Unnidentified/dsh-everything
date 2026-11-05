#!/usr/bin/env node
/**
 * Protocol test for the Providers & models page.
 *
 * The channel speaks the harness RPC envelope: a `client-request` in, a
 * correlated `server-response` out. The page once posted bare JSON with
 * `fetch`, so the channel rejected every call with an error envelope at status
 * 200 and the UI rendered `request failed (200)` while the routes were fine.
 *
 * So this pins the client half's transport: it goes through
 * `connection.rpc.call` when the harness provides it, falls back to a hand-built
 * envelope when it does not, unwraps `result.value`, and surfaces the server's
 * own message instead of a status-code guess.
 *
 * Run with `node tools/provider-keys-rpc.test.mjs`, or `pnpm test`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../packages/provider-keys/lib/client.js'), 'utf8')

const failures = []
function check(name, fn) {
	return Promise.resolve()
		.then(fn)
		.then(() => console.log(`  ok   ${name}`))
		.catch((error) => {
			failures.push(name)
			console.log(`  FAIL ${name}\n         ${String(error.message).split('\n').join('\n         ')}`)
		})
}

/** Slice one function body by brace matching from its first `{`. */
function extractFunction(marker) {
	const start = source.indexOf(marker)
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

const channel = /const CHANNEL = '([^']+)'/.exec(source)
assert.ok(channel !== null, 'the channel constant is missing')
const contextDecl = 'let pluginCtx'
assert.ok(source.includes(contextDecl), 'the captured context is missing')

const build = new Function(
	'fetch', 'crypto',
	`${`const CHANNEL = '${channel[1]}'`}\n${contextDecl}\n${extractFunction('async function rpc(')}\n` +
	"return { rpc, setContext: (value) => { pluginCtx = value } }",
)

const rpcId = '00000000-0000-4000-8000-000000000000'
const buildCaller = () => build(
	undefined,
	{ randomUUID: () => rpcId },
)

await check('a harness RPC client is used when present, and its value unwrapped', async () => {
	const caller = buildCaller()
	const calls = []
	caller.setContext({
		connection: {
			rpc: {
				call: async (channelName, method, payload) => {
					calls.push([channelName, method, payload])
					return { ok: true, value: { providers: ['isoquant'], picker: [] } }
				},
			},
		},
	})
	const value = await caller.rpc('state')
	assert.deepEqual(value, { providers: ['isoquant'], picker: [] })
	assert.deepEqual(calls, [['/provider-keys', 'state', {}]])
})

await check('an error envelope surfaces the server message, not the status', async () => {
	const caller = buildCaller()
	caller.setContext({
		connection: {
			rpc: {
				call: async () => ({ ok: false, error: { code: 'gateway/bad-request', message: 'unknown credential ref: NOPE_API_KEY' } }),
			},
		},
	})
	await assert.rejects(caller.rpc('setKey', { ref: 'NOPE_API_KEY', value: 'x' }), /unknown credential ref: NOPE_API_KEY/)
})

await check('without an RPC client it sends the envelope and correlates the reply', async () => {
	let sent
	const caller = build(
		async (url, init) => {
			sent = { url, init, body: JSON.parse(init.body) }
			return {
				ok: true,
				status: 200,
				json: async () => ({
					type: 'server-response',
					rpcId: JSON.parse(init.body).rpcId,
					result: { ok: true, value: { providers: [], picker: [{ provider: 'mistral' }] } },
				}),
			}
		},
		{ randomUUID: () => rpcId },
	)
	caller.setContext(undefined)
	const value = await caller.rpc('setModelHidden', { provider: 'mistral', model: 'm', hidden: true })
	assert.equal(sent.url, '/provider-keys/setModelHidden')
	assert.equal(sent.init.method, 'POST')
	assert.deepEqual(sent.body, {
		type: 'client-request',
		rpcId,
		method: 'setModelHidden',
		payload: { provider: 'mistral', model: 'm', hidden: true },
	})
	assert.deepEqual(value, { providers: [], picker: [{ provider: 'mistral' }] })
})

await check('a mismatched correlation id is rejected', async () => {
	const caller = build(
		async () => ({ ok: true, status: 200, json: async () => ({ type: 'server-response', rpcId: 'other', result: { ok: true, value: 1 } }) }),
		{ randomUUID: () => rpcId },
	)
	caller.setContext(undefined)
	await assert.rejects(caller.rpc('state'), /rpcId mismatch/)
})

await check('a transport failure names the endpoint', async () => {
	const caller = build(async () => ({ ok: false, status: 502 }), { randomUUID: () => rpcId })
	caller.setContext(undefined)
	await assert.rejects(caller.rpc('state'), /HTTP 502/)
})

if (failures.length > 0) {
	console.log(`\n${failures.length} protocol check(s) failed`)
	process.exit(1)
}
console.log('\nall protocol checks passed')
