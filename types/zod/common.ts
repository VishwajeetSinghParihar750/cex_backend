import z from "zod";

const CURRENCY_SYMBOL = z.union([
  z.literal("USD"),
  z.literal("SOL"),
  z.literal("ETH"),
  z.literal("BTC"),
]);

export { CURRENCY_SYMBOL };
