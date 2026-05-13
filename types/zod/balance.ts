import z from "zod";
import { CURRENCY_SYMBOL } from "./common.js";

const addBalanceSchema = z.object({
  amount: z.number(),
  symbol: CURRENCY_SYMBOL,
});
const getBalanceSchema = z.object({ symbol: CURRENCY_SYMBOL.optional() });

export { addBalanceSchema, getBalanceSchema };
