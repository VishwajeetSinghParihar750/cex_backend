import z from "zod";

const SUBSCRIBED_EVENT = z.union([
  z.literal("depth_update_sol_usd", "depth_update_btc_usd"),
]);

const subscribeEventSchema = z.object({
  eventType: SUBSCRIBED_EVENT,
});

const unsubscribeEventSchema = z.object({
  eventType: SUBSCRIBED_EVENT,
});

export { subscribeEventSchema, unsubscribeEventSchema };
