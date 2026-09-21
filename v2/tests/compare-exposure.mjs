import assert from 'node:assert/strict'

// Read-only comparison against the same saved-data fixture on two local previews.
const [baseline, candidate] = process.argv.slice(2)
if (!baseline || !candidate) throw Error('Usage: node v2/tests/compare-exposure.mjs BASELINE_URL CANDIDATE_URL')
const read = async origin => {
  const response = await fetch(new URL('/api/exposure', origin))
  assert.equal(response.ok, true)
  return response.json()
}
const withoutNames = value => Array.isArray(value) ? value.map(withoutNames)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'positionName').map(([key, item]) => [key, withoutNames(item)]))
    : value
const [before, after] = await Promise.all([read(baseline), read(candidate)])
assert.deepEqual(withoutNames(after), withoutNames(before))
console.log('PASS: complete exposure response unchanged except additive saved positionName metadata.')
