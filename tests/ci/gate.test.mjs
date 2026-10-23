import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, required, comparison } from '../../scripts/ci/gate.mjs';
const result = (includeComparison = false) => Object.fromEntries([...required, ...comparison].map((name) => [name, {
  result: comparison.includes(name) && !includeComparison ? 'skipped' : 'success',
}]));
test('full coverage succeeds in ordinary and explicitly selected comparison modes', () => {
  evaluate(result(), false);
  evaluate(result(true), true);
});
for (const status of ['failure', 'cancelled', 'skipped', undefined]) test(`required ${status ?? 'missing'} never gives a green gate`, () => {
  for (const name of required) {
    const needs = result();
    if (status) needs[name].result = status; else delete needs[name];
    assert.throws(() => evaluate(needs, false), new RegExp(name));
  }
});
test('selected comparison cannot be omitted, cancelled or failed', () => {
  for (const name of comparison) for (const status of ['skipped', 'failure', 'cancelled']) {
    const needs = result(true); needs[name].result = status;
    assert.throws(() => evaluate(needs, true), new RegExp(name));
  }
});
test('unselected comparison cannot conceal an unexpected execution', () => assert.throws(() => evaluate(result(true), false)));
test('gate refuses unknown dependency instead of silently ignoring it', () => assert.throws(() => evaluate({ ...result(), unknown: { result: 'success' } }, false)));
