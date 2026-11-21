'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toHundredths, deliveryPoints } = require('../src/reward/points');

test('the contract example: 2 laptops, 5.0 kg -> 26 and 13', () => {
  assert.deepEqual(deliveryPoints(2, 5.0), { volunteer: 26, resident: 13 });
});

test('small weights stay exact', () => {
  assert.deepEqual(deliveryPoints(1, 0.3), { volunteer: 4.2, resident: 2.1 });
  assert.deepEqual(deliveryPoints(3, 0.6), { volunteer: 11.4, resident: 5.7 });
  assert.deepEqual(deliveryPoints(1, 0.07), { volunteer: 3.28, resident: 1.64 });
});

test('the resident award is always exactly half', () => {
  for (let weight = 0; weight <= 1000; weight += 1) {
    const kg = weight / 100;
    const { volunteer, resident } = deliveryPoints(1, kg);
    assert.equal(toHundredths(resident) * 2, toHundredths(volunteer));
  }
});

test('rejects a quantity that is not a whole number of at least 1', () => {
  assert.throws(() => deliveryPoints(0, 1));
  assert.throws(() => deliveryPoints(1.5, 1));
  assert.throws(() => deliveryPoints('2', 1));
});

test('rejects a weight that is negative, not a number, or has more than 2 decimals', () => {
  assert.throws(() => deliveryPoints(1, -1));
  assert.throws(() => deliveryPoints(1, '5.0'));
  assert.throws(() => deliveryPoints(1, 1.005));
});