import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findListeningDiscards } from '../../rooms/flow/listening-hints.js';
import { validateHu } from '../../rules/hu.js';
import { createDeck, isDiscardRestricted } from '../../rules/deck.js';
import type { Card } from '../../rules/types.js';
const c = (id: string, type: Card['type'], color: Card['color'] = 'red'): Card => ({ id, type, color });
test('discard routes identify a chariot-horse wait and exclude protected discards', () => {
  const hand = [c('a', 'ju'), c('b', 'ma'), c('c', 'zu', 'white'), c('d', 'jiang'), c('e', 'gong', 'gold')];
  const routes = findListeningDiscards(hand);
  assert.ok(routes.find((r) => r.discardCardId === 'c')?.waits.some((c) => c.type === 'pao' && c.color === 'red'));
  assert.ok(routes.every((r) => !['d', 'e'].includes(r.discardCardId)));
  for (const route of routes) for (const response of route.waits) {
    assert.ok(validateHu(hand.filter((card) => card.id !== route.discardCardId), response));
  }
});
test('declared triplets remain required and duplicate faces give equivalent routes', () => {
  const hand = [c('a', 'ma'), c('b', 'ma'), c('c', 'ma'), c('d', 'ju'), c('e', 'pao'), c('f', 'zu', 'white')];
  const routes = findListeningDiscards(hand, 1);
  assert.ok(routes.length);
  for (const route of routes) for (const response of route.waits) assert.ok(validateHu(hand.filter((c) => c.id !== route.discardCardId), response, { minimumHiddenTriplets: 1 }));
  assert.deepEqual(findListeningDiscards([c('a', 'ma'), c('b', 'ma')]).map((r) => r.waits), [findListeningDiscards([c('a', 'ma'), c('b', 'ma')])[0]?.waits, findListeningDiscards([c('a', 'ma'), c('b', 'ma')])[0]?.waits]);
});
test('no legal discards and impossible grouping have no routes', () => {
  assert.deepEqual(findListeningDiscards([c('a', 'jiang'), c('b', 'gong', 'gold')]), []);
  assert.deepEqual(findListeningDiscards([c('a', 'ju'), c('b', 'shi', 'green'), c('c', 'zu', 'white'), c('d', 'pao', 'yellow')], 2), []);
});
test('all returned faces match exhaustive rules and input is unchanged', () => {
  const hand = createDeck().filter((c) => c.color === 'red').slice(0, 12);
  const before = JSON.stringify(hand);
  const routes = findListeningDiscards(hand);
  const faces = createDeck().filter((c) => c.id.endsWith('_01'));
  for (const discard of hand.filter((c) => !isDiscardRestricted(c))) {
    const expected = faces.filter((r) => validateHu(hand.filter((c) => c.id !== discard.id), { ...r, id: 'response' })).map((c) => `${c.color}:${c.type}`);
    assert.deepEqual(routes.find((r) => r.discardCardId === discard.id)?.waits.map((c) => `${c.color}:${c.type}`) ?? [], expected);
  }
  assert.equal(JSON.stringify(hand), before);
});
