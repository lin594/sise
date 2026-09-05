import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FourColorGameRoom } from '../../rooms/GameRoom.js';
import { GameState, PlayerState } from '../../schema/game-state.schema.js';
import { buildChiCandidates } from '../../rooms/flow/action-candidates.js';
import { findListeningDiscards } from '../../rooms/flow/listening-hints.js';
import type { Card } from '../../rules/types.js';

test('private hints cache, chi projection and revision invalidation use only the requesting hand', () => {
  const room = new FourColorGameRoom() as any;
  room.state = new GameState();
  room.state.phase = 'playing';
  room.state.stateRevision = 1;
  const player = new PlayerState();
  player.clientId = 'A';
  room.state.players.set('A', player);
  const hand: Card[] = [
    { id: 'a', color: 'red', type: 'ju' }, { id: 'b', color: 'red', type: 'ma' },
    { id: 'c', color: 'white', type: 'zu' }, { id: 'd', color: 'green', type: 'ju' }, { id: 'e', color: 'green', type: 'ma' },
  ];
  room.playerHands = new Map([['A', hand]]);
  room.awaitingDiscardOwnerId = 'A';
  const response: Card = { id: 'response', color: 'red', type: 'pao' };
  const candidates = buildChiCandidates(hand, response, []);
  let actions: unknown[] = [];
  room.buildClientDecisionView = () => ({ availableActions: actions, decisionTimer: { decisionKey: 'play:1' } });
  const initial = room.buildListeningHints('A');
  assert.deepEqual(initial.discards, findListeningDiscards(hand));
  room.deck = new Proxy([], { get() { throw new Error('Hints must not inspect deck'); } });
  room.playerHands.set('B', new Proxy([], { get() { throw new Error('Hints must not inspect opponents'); } }));
  room.state.stateRevision = 2;
  const cached = room.buildListeningHints('A');
  assert.equal(cached.discards, initial.discards);
  assert.equal(cached.stateRevision, 2);
  assert.equal('listeningHints' in room.buildRoomSnapshot(), false);
  room.awaitingDiscardOwnerId = null;
  room.pendingResponse = { card: response };
  actions = [{ action: 'chi', enabled: true, candidates: candidates.map((c) => c.candidate) }];
  const preview = room.buildListeningHints('A');
  assert.deepEqual(preview.discards, []);
  assert.equal(preview.chi.length, candidates.length);
  for (const item of preview.chi) {
    const plan = candidates.find((c) => c.candidate.id === item.candidateId)!.plan;
    const removed = new Set(plan.handCards.map((c) => c.id));
    assert.deepEqual(item.discards, findListeningDiscards(hand.filter((c) => !removed.has(c.id))));
  }
  actions = [];
  assert.deepEqual(room.buildListeningHints('A').chi, []);
});
