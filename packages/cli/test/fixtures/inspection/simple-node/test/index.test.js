import test from 'node:test';
import assert from 'node:assert/strict';
import { greet } from '../src/index.js';

test('greets by name', () => assert.equal(greet('Ada'), 'Hello, Ada'));
