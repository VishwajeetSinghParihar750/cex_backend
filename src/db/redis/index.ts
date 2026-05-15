import "dotenv/config";
import { createClient } from "redis";
const redisClient = createClient({ url: process.env.REDIS_URL! });
redisClient.on("error", (err) => {
  console.log("redis error : ", err);
});

export { redisClient };
