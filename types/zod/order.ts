import z from "zod";
import { CURRENCY_SYMBOL } from "./common.js";

const orderPostSchema = z.object({
  type: z.enum(["MARKET", "LIMIT"]),
  side: z.enum(["BUY", "SELL"]),
  qty: z.number(),
  symbol: CURRENCY_SYMBOL,
  price: z.number().optional(),
});

const orderGetParamsSchema = z.object({ orderId: z.string() });
const orderDeleteParamsSchema = z.object({ orderId: z.string() });
const depthGetParamsSchema = z.object({ symbol: CURRENCY_SYMBOL });

export {
  orderPostSchema,
  orderGetParamsSchema,
  orderDeleteParamsSchema,
  depthGetParamsSchema,
};
