import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseDefaultShippingRate, isPickupRate, rateCost, sortRatesPickupLast} from '../shared/utils/shippingRateDefaults.mjs';

// Real Ontario rates from PROD-03 (2026-11-13), as WPGraphQL for WooCommerce 1.0.3 returns them.
const ontario = [
  {id: 'table_rate:17:184', label: 'Store Pickup', cost: '$0.00&nbsp;CAD'},
  {id: 'table_rate:17:2', label: 'Courier Ground 1-2 BDs', cost: '$12.00&nbsp;CAD'},
  {id: 'table_rate:17:30', label: 'Courier Next B Day', cost: '$15.00&nbsp;CAD'},
];
const ontarioFree = [
  {id: 'table_rate:20:185', label: 'Store Pickup', cost: '$0.00&nbsp;CAD'},
  {id: 'table_rate:20:36', label: 'Free Courier Ground 1-2 BDs', cost: '$0.00&nbsp;CAD'},
  {id: 'table_rate:20:13', label: 'Courier Next B Day', cost: '$5.00&nbsp;CAD'},
];
const bc = [
  {id: 'table_rate:43:133', label: 'Courier Ground 3-5 BDs', cost: '$15.00&nbsp;CAD'},
  {id: 'table_rate:43:136', label: 'Courier Expedited 2-3 BDs', cost: '$26.00&nbsp;CAD'},
];

test('recognises pickup rates by label or Woo method id', () => {
  assert.equal(isPickupRate(ontario[0]), true);
  assert.equal(isPickupRate({id: 'local_pickup:3', label: 'Collect in store'}), true);
  assert.equal(isPickupRate({id: 'pickup_location:0', label: 'Mississauga'}), true);
  assert.equal(isPickupRate({id: 'x', label: 'Curbside pick-up'}), true);
  assert.equal(isPickupRate(ontario[1]), false);
  assert.equal(isPickupRate(null), false);
});

test('reads formatted and bare costs', () => {
  assert.equal(rateCost({cost: '$12.00&nbsp;CAD'}), 12);
  assert.equal(rateCost({cost: '12.00'}), 12);
  assert.equal(rateCost({cost: null}), 0);
  assert.equal(rateCost({cost: '<span>$1,234.50</span>&nbsp;CAD'}), 1234.5);
  assert.equal(rateCost({cost: 'n/a'}), Number.POSITIVE_INFINITY);
});

test('Woo preselected Store Pickup: switch to the cheapest delivery rate', () => {
  assert.equal(chooseDefaultShippingRate(ontario, 'table_rate:17:184'), 'table_rate:17:2');
  assert.equal(chooseDefaultShippingRate(ontarioFree, 'table_rate:20:185'), 'table_rate:20:36');
  assert.equal(chooseDefaultShippingRate(ontario, ''), 'table_rate:17:2');
});

test('keeps a delivery rate that is already chosen', () => {
  assert.equal(chooseDefaultShippingRate(ontario, 'table_rate:17:30'), null);
  assert.equal(chooseDefaultShippingRate(bc, 'table_rate:43:136'), null);
});

test('keeps pickup when the shopper picked it', () => {
  assert.equal(chooseDefaultShippingRate(ontario, 'table_rate:17:184', true), null);
  assert.equal(chooseDefaultShippingRate(ontarioFree, 'table_rate:20:185', true), null);
});

test('never moves an in-store POS checkout to delivery', () => {
  const pos = [{id: 'local_pickup:8', label: 'POS | Local Store Purchase', cost: '$0.00&nbsp;CAD'}, ...ontario];
  assert.equal(chooseDefaultShippingRate(pos, 'local_pickup:8'), null);
  // ...but a POS cashier's online-style order that landed on Store Pickup still gets the delivery default.
  assert.equal(chooseDefaultShippingRate(pos, 'table_rate:17:184'), 'table_rate:17:2');
});

test('does nothing when pickup is the only option or there are no rates', () => {
  assert.equal(chooseDefaultShippingRate([ontario[0]], 'table_rate:17:184'), null);
  assert.equal(chooseDefaultShippingRate([], ''), null);
  assert.equal(chooseDefaultShippingRate(undefined, ''), null);
});

test('lists pickup last and keeps Woo order otherwise', () => {
  assert.deepEqual(
    sortRatesPickupLast(ontario).map((rate) => rate.id),
    ['table_rate:17:2', 'table_rate:17:30', 'table_rate:17:184'],
  );
  assert.deepEqual(sortRatesPickupLast(bc), bc);
  assert.deepEqual(sortRatesPickupLast(null), []);
});
