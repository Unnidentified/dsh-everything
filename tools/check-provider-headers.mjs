/**
 * Assert the provider `headers` override works as the AgentRouter route needs.
 *
 * A gateway that fingerprints the client refuses an ordinary User-Agent with a
 * 401 that looks like a bad key, so the override is the difference between a
 * usable route and one that appears broken. This checks the compiled bundle
 * still carries the field, the merge call sites, and the lowercasing rule.
 *
 * Run with: node tools/check-provider-headers.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'packages', 'llm-direct', 'lib', 'index.js'), 'utf8')

assert.match(source, /headers: z\.dict\(z\.string\(\)\)\.default\(\{\}\)/, 'ProviderConfig must accept a headers map')
assert.match(source, /function extraHeadersOf/, 'the header helper must exist')
assert.match(source, /extraHeadersOf\(profile\)\)/, 'the OpenAI surface must send provider headers')
assert.match(source, /\.\.\.extraHeadersOf\(profile\)/, 'the Anthropic surface must send provider headers')
assert.match(source, /out\[name\.toLowerCase\(\)\]/, 'header names must be lowercased on the wire')

// The patch must declare the provider with the header that unlocks it.
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
assert.match(patch, /agentrouter:/, 'the AgentRouter provider must be declared')
assert.match(patch, /user-agent: claude-cli/, 'AgentRouter requires a claude-cli User-Agent')
assert.match(patch, /^\s+baseURL: https:\/\/agentrouter\.org$/m, 'the base URL must not carry /v1')

process.stdout.write('provider headers: ok\n')
