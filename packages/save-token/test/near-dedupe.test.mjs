/**
 * Near-duplicate detection for tool-output dedupe.
 *
 * Byte-exact fingerprints miss the repeat that actually costs tokens during an
 * edit loop: the same tool returning almost the same output. These cases pin
 * the properties that make a delta stub safe to emit.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { nearDiff } from '../src/compress.js'

const listing = (n, extra = '') => {
  const rows = Array.from({ length: n }, (_, i) => `-rw-r--r-- 1 user staff ${1000 + i} file${i}.js`).join('\n')
  return extra === '' ? rows : `${rows}\n${extra}`
}

test('identical outputs report no change', () => {
  const d = nearDiff(listing(20), listing(20))
  assert.deepEqual(d.added, [])
  assert.deepEqual(d.removed, [])
  assert.equal(d.changedRatio, 0)
})

test('one appended line is a small change with that exact line reported', () => {
  const d = nearDiff(listing(50), listing(50, '-rw-r--r-- 1 user staff 1200 newfile.js'))
  assert.deepEqual(d.added, ['-rw-r--r-- 1 user staff 1200 newfile.js'])
  assert.deepEqual(d.removed, [])
  assert.ok(d.changedRatio < 0.25, `ratio ${d.changedRatio} must pass the default gate`)
})

test('an unrelated output is rejected by the change ratio', () => {
  const d = nearDiff(listing(50), Array.from({ length: 50 }, (_, i) => `unrelated ${i}`).join('\n'))
  assert.ok(d.changedRatio > 0.25, `ratio ${d.changedRatio} must fail the default gate`)
})

test('a prepended line does not reclassify the lines below it', () => {
  // Order-preserving multiset comparison, not a naive index-wise diff: a line
  // added at the top must not make every following line look changed.
  const d = nearDiff('a\nb\nc', 'NEW\na\nb\nc')
  assert.deepEqual(d.added, ['NEW'])
  assert.deepEqual(d.removed, [])
})

test('duplicate lines are counted, so one removal is one removal', () => {
  const d = nearDiff('}\n}\n}\nx', '}\n}\nx')
  assert.deepEqual(d.removed, ['}'])
  assert.deepEqual(d.added, [])
})

test('a removed line is reported as removed, not silently dropped', () => {
  const d = nearDiff('keep\nGONE\nkeep2', 'keep\nkeep2')
  assert.deepEqual(d.removed, ['GONE'])
  assert.deepEqual(d.added, [])
})

test('the ratio is relative to payload size, so big repeats qualify', () => {
  const small = nearDiff('a\nb', 'a\nc')
  const big = nearDiff(listing(200), listing(200, 'one-more'))
  assert.ok(small.changedRatio > big.changedRatio, 'a two-line payload must look more changed than a 200-line one')
})
