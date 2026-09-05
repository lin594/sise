import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVisibleRemainingByFace, findListeningDiscards } from '../../rooms/flow/listening-hints.js';
import { validateHu } from '../../rules/hu.js';
import { createDeck, isDiscardRestricted } from '../../rules/deck.js';
import type { Card } from '../../rules/types.js';
const c = (id: string, type: Card['type'], color: Card['color'] = 'red'): Card => ({ id, type, color });
test('discard routes identify a chariot-horse wait and exclude protected discards', () => {
  const hand = [c('a', 'ju'), c('b', 'ma'), c('c', 'zu', 'white'), c('d', 'jiang'), c('e', 'gong', 'gold')];
  const routes = findListeningDiscards(hand);
  assert.ok(routes.find((r) => r.discardCardId === 'c')?.waits.some(({ card }) => card.type === 'pao' && card.color === 'red'));
  assert.ok(routes.every((r) => !['d', 'e'].includes(r.discardCardId)));
  for (const route of routes) for (const response of route.waits) {
    assert.ok(validateHu(hand.filter((card) => card.id !== route.discardCardId), response.card));
  }
});
test('declared triplets remain required and duplicate faces give equivalent routes', () => {
  const hand = [c('a', 'ma'), c('b', 'ma'), c('c', 'ma'), c('d', 'ju'), c('e', 'pao'), c('f', 'zu', 'white')];
  const routes = findListeningDiscards(hand, 1);
  assert.ok(routes.length);
  for (const route of routes) for (const response of route.waits) assert.ok(validateHu(hand.filter((c) => c.id !== route.discardCardId), response.card, { minimumHiddenTriplets: 1 }));
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
    assert.deepEqual(routes.find((r) => r.discardCardId === discard.id)?.waits.map(({ card }) => `${card.color}:${card.type}`) ?? [], expected);
  }
  assert.equal(JSON.stringify(hand), before);
});

test('visible remaining counts own and public cards once by physical id', () => {
  const hand = [c('a', 'ju'), c('b', 'ma'), c('discard', 'zu', 'white')];
  const remaining = buildVisibleRemainingByFace([
    ...hand,
    c('pao-1', 'pao'),
    c('pao-2', 'pao'),
    c('pao-2', 'pao'),
    c('pao-3', 'pao'),
  ]);
  const wait = findListeningDiscards(hand, 0, remaining)
    .find((route) => route.discardCardId === 'discard')
    ?.waits.find(({ card }) => card.color === 'red' && card.type === 'pao');
  assert.equal(wait?.visibleRemaining, 1);
  assert.equal(buildVisibleRemainingByFace([c('gold', 'gong', 'gold')]).get('gold:gong'), 0);
});
