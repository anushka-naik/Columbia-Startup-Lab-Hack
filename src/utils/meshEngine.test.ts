import assert from 'node:assert/strict';
import test from 'node:test';
import { findRoutePath, generateCrc16, INITIAL_LINKS, INITIAL_NODES } from './meshEngine.ts';
import { RADIO_PRESETS } from '../types/mesh.ts';

test('default demo route relays over five distinct virtual nodes', () => {
  const route = findRoutePath('node-alpha-01', 'node-echo-05', INITIAL_NODES, INITIAL_LINKS, RADIO_PRESETS.medium_fast);
  assert.equal(route.length, 5);
  assert.deepEqual(route, ['node-alpha-01', 'node-relay-02', 'node-relay-03', 'node-solar-04', 'node-echo-05']);
});

test('router returns no route if a required relay is offline and range is insufficient', () => {
  const nodes = INITIAL_NODES.map(node => node.id === 'node-solar-04' ? { ...node, isOnline: false } : node);
  assert.deepEqual(findRoutePath('node-alpha-01', 'node-echo-05', nodes, INITIAL_LINKS, RADIO_PRESETS.short_fast), []);
});

test('packet CRC is computed over payload bytes', () => {
  assert.equal(generateCrc16(new TextEncoder().encode('123456789')), '0x4B37');
});
