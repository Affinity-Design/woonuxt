// WooCommerce lists "Store Pickup" first in every Canadian shipping zone, so it is the rate Woo selects when a
// shopper never touches the shipping options. A shopper in Vancouver who skips the choice then pays no shipping
// and expects a parcel (seen in the 2026-11-13 pre-launch test order). The checkout defaults to the cheapest
// delivery rate instead and lists pickup last; a shopper who clicks pickup keeps it.

const PICKUP_LABEL = /\bpick\s*-?\s*up\b/i;
const PICKUP_METHOD_ID = /^(local_pickup|pickup_location)\b/;
// In-store POS checkouts (staff only) use "POS | Local Store Purchase" (local_pickup:8); never move those to delivery.
const POS_LABEL = /\bPOS\b/;

function plainText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, '');
}

export function isPickupRate(rate) {
  if (!rate) return false;
  if (PICKUP_METHOD_ID.test(String(rate.id ?? ''))) return true;
  return PICKUP_LABEL.test(plainText(rate.label));
}

// Rate cost arrives as a bare number ("12.00", null when free) or, from WPGraphQL for WooCommerce 1.0+, as formatted
// text ("$12.00&nbsp;CAD"). Unreadable costs sort last.
export function rateCost(rate) {
  const text = plainText(rate?.cost).replace(/,/g, '');
  if (text.trim() === '') return 0;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
}

// Delivery rates first (in Woo's order), pickup rates last.
export function sortRatesPickupLast(rates) {
  if (!Array.isArray(rates)) return [];
  return [...rates.filter((rate) => !isPickupRate(rate)), ...rates.filter((rate) => isPickupRate(rate))];
}

// The rate id the checkout should switch to, or null to keep Woo's choice. Switches only when Woo's choice is a
// pickup rate (or nothing) that the shopper did not pick themselves, and a delivery rate exists.
export function chooseDefaultShippingRate(rates, chosenId, shopperChosePickup = false) {
  if (shopperChosePickup || !Array.isArray(rates) || rates.length === 0) return null;

  const chosen = rates.find((rate) => rate?.id === chosenId);
  if (chosen && (!isPickupRate(chosen) || POS_LABEL.test(plainText(chosen.label)))) return null;

  const delivery = rates.filter((rate) => rate?.id && !isPickupRate(rate));
  if (delivery.length === 0) return null;

  const cheapest = delivery.reduce((best, rate) => (rateCost(rate) < rateCost(best) ? rate : best));
  return cheapest.id === chosenId ? null : cheapest.id;
}
