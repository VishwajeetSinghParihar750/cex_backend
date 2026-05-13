import z from "zod";

const SUBSCRIBED_EVENT = z.union([
  z.literal("orderbook_update_sol_usd", "orderbook_update_btc_usd"),
]);

const subscribeEventSchema = z.object({
  eventType: SUBSCRIBED_EVENT,
});

const unsubscribeEventSchema = z.object({
  eventType: SUBSCRIBED_EVENT,
});

export { subscribeEventSchema, unsubscribeEventSchema };
