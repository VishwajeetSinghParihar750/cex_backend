import { redisClient as redisClientGlobal } from "./db/redis/index.js";
import { HashSet } from "js-sdsl";
import { sendMessageOnWebSocket } from "./ws/utils/messaging.js";
import WebSocket from "ws";
import type { RedisClientType } from "redis";
import { error } from "node:console";

type SUBSCRIBED_EVENT = "depth_update_sol_usd" | "depth_update_btc_usd";

class EngineInterface {
  redisClient: RedisClientType;

  eventSubscriptions: Record<SUBSCRIBED_EVENT, HashSet<WebSocket>> = {
    depth_update_btc_usd: new HashSet(),
    depth_update_sol_usd: new HashSet(),
  };

  setupEventSubscriptionHandling = async () => {
    await this.redisClient.connect();
    await this.publishDepthUpdateEvents(); // for now just doing depth updates
  };

  constructor() {
    this.redisClient = redisClientGlobal.duplicate();
    this.setupEventSubscriptionHandling();
  }

  publishDepthUpdateEvents = async () => {
    // create the consumer group  first
    // this is assumed to be last delivered message id

    try {
      await this.redisClient.xGroupCreate(
        "depth_update_btc_usd",
        process.env.REDIS_ENGINE_UPDATES_GROUP!,
        "0",
        { MKSTREAM: true },
      );
    } catch (err: any) {
      if (!(err.message as string).includes("BUSYGROUP")) throw err;
    }

    try {
      await this.redisClient.xGroupCreate(
        "depth_update_sol_usd",
        process.env.REDIS_ENGINE_UPDATES_GROUP!,
        "0",
        { MKSTREAM: true },
      );
    } catch (err: any) {
      if (!(err.message as string).includes("BUSYGROUP")) throw err;
    }

    while (true) {
      const streamsReadResponse = await this.redisClient.xReadGroup(
        process.env.REDIS_ENGINE_UPDATES_GROUP!,
        "worker1", // coz there is only one worker per group , so no .env needed
        [
          { id: "0", key: "depth_update_btc_usd" }, // this id is what u want right now from stream
          { id: "0", key: "depth_update_sol_usd" },
        ],
        {
          BLOCK: 0,
          COUNT: 100,
        },
      );
      // {
      //   name: string;
      //   messages: {
      //       id: string;
      //       message: {
      //           [x: string]: string;
      //       };
      //   }[]

      await Promise.all(
        (streamsReadResponse as any).map(async (streamReadResponse: any) => {
          (streamReadResponse as any).messages.map(
            async ({ id, message }: { id: any; message: any }) => {
              let subscriptions =
                this.eventSubscriptions[
                  streamReadResponse.name as SUBSCRIBED_EVENT
                ];

              if (!subscriptions.empty()) {
                const {
                  offset,
                  data,
                }: { offset: number; data: { price: number; qty: number }[] } =
                  message;

                subscriptions.forEach((ws) => {
                  sendMessageOnWebSocket(ws, {
                    payload: { offset, data },
                    type: streamReadResponse.name as SUBSCRIBED_EVENT,
                  });
                });
              }

              // ack redis for messagie
              await this.redisClient.xAck(
                streamReadResponse.name,
                process.env.REDIS_ENGINE_UPDATES_GROUP!,
                id,
              );
            },
          );
        }),
      );
    }
  };

  getEngineResponse = async (requestId: string) => {
    let res = await this.redisClient.blPop(`engine_response_${requestId}`, 0);
    if (res && res.element) {
      return JSON.parse(res.element);
    }
    throw new Error("ERROR IN GETTING ENGINE RESPONSE");
  };

  // returns request id of request to look for in response
  sendEngineRequest = async (type: string, payload: any): Promise<string> => {
    let id: string = crypto.randomUUID();

    await this.redisClient.rPush(
      "engine_request",
      JSON.stringify({ requestId: id, type, payload }),
    );

    return id;
  };

  getEngineResponseForRequest = async (type: string, payload: any) => {
    let id = await this.sendEngineRequest(type, payload);
    return await this.getEngineResponse(id);
  };
}

export default EngineInterface;
