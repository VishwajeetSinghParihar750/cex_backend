import z from "zod";
import { CURRENCY_SYMBOL } from "./common.js";

const createOrderSchema = z.object({
  type: z.enum(["MARKET", "LIMIT"]),
  side: z.enum(["BUY", "SELL"]),
  qty: z.number(),
  symbol: CURRENCY_SYMBOL,
  price: z.number().optional(),
});

const getOrderSchema = z.object({ orderId: z.string() });
const deleteOrderSchema = z.object({ orderId: z.string() });
const getDepthSchema = z.object({ symbol: CURRENCY_SYMBOL });

export { createOrderSchema, getOrderSchema, deleteOrderSchema, getDepthSchema };
