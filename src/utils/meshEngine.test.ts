import assert from 'node:assert/strict';
import test from 'node:test';
import { findRoutePath, generateCrc16, INITIAL_LINKS, INITIAL_NODES } from './meshEngine.ts';
import { RADIO_PRESETS } from '../types/mesh.ts';

test('default demo route connects the sender and receiver in three hops', () => {
  const route = findRoutePath('node-alpha-01', 'node-echo-05', INITIAL_NODES, INITIAL_LINKS, RADIO_PRESETS.medium_fast.maxRangeKm);
  assert.equal(route[0], 'node-alpha-01');
  assert.equal(route.at(-1), 'node-echo-05');
  assert.equal(route.length, 4);
});

test('router returns no route when radio range cannot reach any neighbor', () => {
  assert.deepEqual(findRoutePath('node-alpha-01', 'node-echo-05', INITIAL_NODES, INITIAL_LINKS, 1), []);
});

test('packet CRC is computed over payload bytes', () => {
  assert.equal(generateCrc16('123456789'), '0x4B37');
});
