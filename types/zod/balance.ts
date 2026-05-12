import z from "zod";
import { CURRENCY_SYMBOL } from "./common.js";

const depositPostParamsSchema = z.object({
  symbol: CURRENCY_SYMBOL,
});
const depositPostSchema = z.object({
  amount: z.number(),
});
const balanceGetParamsSchema = z.object({ symbol: CURRENCY_SYMBOL.optional() });

export { depositPostParamsSchema, depositPostSchema, balanceGetParamsSchema };
