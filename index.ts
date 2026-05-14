import "dotenv/config";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { createClient } from "redis";
import z from "zod";
import { signinSchema, signupSchema } from "./types/zod/auth.js";
import {
  createOrderSchema,
  deleteOrderSchema,
  getDepthSchema,
  getOrderSchema,
} from "./types/zod/order.js";
import { addBalanceSchema, getBalanceSchema } from "./types/zod/balance.js";
import {
  subscribeEventSchema,
  unsubscribeEventSchema,
} from "./types/zod/subscribeEvent.js";

import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage } from "node:http";
import { HashSet } from "js-sdsl";

const prismaPgAdapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter: prismaPgAdapter });

const app = express();
const wss = new WebSocketServer({ port: 8080 });

const redisClient = createClient({ url: process.env.REDIS_URL! });

app.use(express.json());

//

type WS_REQUEST_TYPE =
  | "subscribe_event"
  | "unsubscribe_event"
  | "create_order"
  | "cancel_order"
  | "get_balance"
  | "add_balance"
  | "get_depth"
  | "get_orders"
  | "get_order"
  | "get_fills";

type WS_RESPONSE_TYPE =
  | "event_subscribed"
  | "event_unsubscribed"
  | "order_created"
  | "order_cancelled"
  | "balance"
  | "balance_updated"
  | "depth"
  | "orders"
  | "order"
  | "fills"
  | "error" // for anything that did not succeed
  | "depth_update_btc_usd"
  | "depth_update_sol_usd";

type WS_REQUEST = {
  type: WS_REQUEST_TYPE;
  payload: any; // here put zod inferred types
  rqeuestId: string;
};
type WS_RESPONSE = {
  type: WS_RESPONSE_TYPE;
  payload: any;
  requestId?: string;
};

async function getEngineResponse(requestId: string) {
  let res = await redisClient.blPop(`engine_response_${requestId}`, 0);
  if (res && res.element) {
    return JSON.parse(res.element);
  }
  throw new Error("ERROR IN GETTING ENGINE RESPONSE");
}

// returns request id of request to look for in response
async function sendEngineRequest(type: string, payload: any): Promise<string> {
  let id: string = crypto.randomUUID();

  await redisClient.rPush(
    "engine_request",
    JSON.stringify({ requestId: id, type, payload }),
  );

  return id;
}

async function getEngineResponseForRequest(type: string, payload: any) {
  let id = await sendEngineRequest(type, payload);
  return await getEngineResponse(id);
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: true, payload: "unauthorized" });
    return;
  }
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET_KEY!,
    ) as JwtPayload;
    req.user = { username: decoded.username, id: decoded.id };

    next();
  } catch (error) {
    res.status(401).json({ error: true, payload: "unauthorized" });
  }
}

const zodBodyVerification =
  (schema: z.ZodObject) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      res.status(400).json({ error: true, payload: "WRONG_REQUEST_FORMAT" });
    }
  };

app.post("/signup", zodBodyVerification(signupSchema), async (req, res) => {
  //
  try {
    const { username, password } = req.body;
    const findUser = await prisma.users.findUnique({
      where: { username },
    });
    if (findUser) {
      res.status(403).json({ error: true, payload: "username already exists" });
      return;
    }
    const user = await prisma.users.create({ data: { username, password } });

    res.status(201).json({ error: false, payload: user.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: true, payload: "server error" });
  }
});

app.post("/signin", zodBodyVerification(signinSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await prisma.users.findUnique({
      where: { username },
    });
    if (!user || user.password != password) {
      res.status(400).json({ error: true, payload: "incorrect credentials" });
      return;
    }

    const jwt_token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET_KEY!,
    );

    res.status(200).json({
      error: false,
      payload: {
        jwt_token,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: true, payload: "server error" });
  }
});

const sendMessageOnWebSocket = (ws: WebSocket, message: WS_RESPONSE) => {
  ws.send(JSON.stringify(message));
};

const zodBodyVerificationWebSocket = (
  schema: z.ZodObject,
  request: WS_REQUEST,
  ws: WebSocket,
): boolean => {
  const { success } = schema.safeParse(request.payload);
  if (!success) {
    sendMessageOnWebSocket(ws, {
      requestId: request.rqeuestId,
      type: "error",
      payload: "INVALID_REQUEST_FORMAT",
    });
    return false;
  }
  return true;
};

async function handleAddBalanceRequest(req: WS_REQUEST, ws: WebSocket) {
  if (zodBodyVerificationWebSocket(addBalanceSchema, req, ws)) {
    try {
      const { type, payload } = await getEngineResponseForRequest(
        "add_balance",
        {
          userId: ws.user.id,
          amount: req.payload.amount,
          symbol: req.payload.symbol,
        },
      );

      if (type == "error") {
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "error",
        });
      } else
        sendMessageOnWebSocket(ws, {
          payload: null,
          requestId: req.rqeuestId,
          type: "balance",
        });
    } catch (error) {
      sendMessageOnWebSocket(ws, {
        type: "error",
        payload: "INTERNAL_SERVER_ERROR",
        requestId: req.rqeuestId,
      });
    }
  }
}

async function handleCreateOrderRequest(req: WS_REQUEST, ws: WebSocket) {
  if (zodBodyVerificationWebSocket(createOrderSchema, req, ws)) {
    try {
      const { type, price, qty, symbol, side } = req.payload;

      const { type: responseType, payload } = await getEngineResponseForRequest(
        "create_order",
        { type, side, price, qty, symbol, userId: ws.user.id },
      );

      if (responseType == "error") {
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "error",
        });
      } else
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "order_created",
        });
    } catch (error) {
      sendMessageOnWebSocket(ws, {
        type: "error",
        payload: "INTERNAL_SERVER_ERROR",
        requestId: req.rqeuestId,
      });
    }
  }
}

async function handleGetOrderRequest(req: WS_REQUEST, ws: WebSocket) {
  if (zodBodyVerificationWebSocket(getOrderSchema, req, ws)) {
    try {
      const { orderId } = req.payload;

      const { type: resType, payload } = await getEngineResponseForRequest(
        "get_order",
        { orderId },
      );

      if (resType == "error") {
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "error",
        });
      } else
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "order",
        });
    } catch (error) {
      sendMessageOnWebSocket(ws, {
        type: "error",
        payload: "INTERNAL_SERVER_ERROR",
        requestId: req.rqeuestId,
      });
    }
  }
}

async function handleCancelOrderRequest(req: WS_REQUEST, ws: WebSocket) {
  if (zodBodyVerificationWebSocket(deleteOrderSchema, req, ws)) {
    try {
      const { orderId } = req.payload;

      const { type: resType, payload } = await getEngineResponseForRequest(
        "cancel_order",
        { orderId },
      );

      if (resType == "error") {
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "error",
        });
      } else
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "order_cancelled",
        });
    } catch (error) {
      sendMessageOnWebSocket(ws, {
        type: "error",
        payload: "INTERNAL_SERVER_ERROR",
        requestId: req.rqeuestId,
      });
    }
  }
}

async function handleGetDepthRequest(req: WS_REQUEST, ws: WebSocket) {
  if (zodBodyVerificationWebSocket(getDepthSchema, req, ws)) {
    try {
      const { symbol } = req.payload;
      const { type: resType, payload } = await getEngineResponseForRequest(
        "get_depth",
        { symbol: symbol },
      );

      if (resType == "error") {
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "error",
        });
      } else
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "depth",
        });
    } catch (error) {
      sendMessageOnWebSocket(ws, {
        type: "error",
        payload: "INTERNAL_SERVER_ERROR",
        requestId: req.rqeuestId,
      });
    }
  }
}

async function handleGetOrdersRequest(req: WS_REQUEST, ws: WebSocket) {
  try {
    const { type: resType, payload } = await getEngineResponseForRequest(
      "get_orders",
      {},
    );

    if (resType == "error") {
      sendMessageOnWebSocket(ws, {
        payload,
        requestId: req.rqeuestId,
        type: "error",
      });
    } else
      sendMessageOnWebSocket(ws, {
        payload,
        requestId: req.rqeuestId,
        type: "orders",
      });
  } catch (error) {
    sendMessageOnWebSocket(ws, {
      type: "error",
      payload: "INTERNAL_SERVER_ERROR",
      requestId: req.rqeuestId,
    });
  }
}

async function handleGetFillsRequest(req: WS_REQUEST, ws: WebSocket) {
  try {
    const { type: resType, payload } = await getEngineResponseForRequest(
      "get_fills",
      {},
    );

    if (resType == "error") {
      sendMessageOnWebSocket(ws, {
        payload,
        requestId: req.rqeuestId,
        type: "error",
      });
    } else
      sendMessageOnWebSocket(ws, {
        payload,
        requestId: req.rqeuestId,
        type: "fills",
      });
  } catch (error) {
    sendMessageOnWebSocket(ws, {
      type: "error",
      payload: "INTERNAL_SERVER_ERROR",
      requestId: req.rqeuestId,
    });
  }
}

async function handleGetBalanceRequest(req: WS_REQUEST, ws: WebSocket) {
  if (zodBodyVerificationWebSocket(getBalanceSchema, req, ws)) {
    try {
      const { symbol } = req.payload;

      const { type: resType, payload } = await getEngineResponseForRequest(
        "get_balance",
        {
          userId: ws.user.id,
          symbol,
        },
      );

      if (resType == "error") {
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "error",
        });
      } else
        sendMessageOnWebSocket(ws, {
          payload,
          requestId: req.rqeuestId,
          type: "balance",
        });
    } catch (error) {
      sendMessageOnWebSocket(ws, {
        type: "error",
        payload: "INTERNAL_SERVER_ERROR",
        requestId: req.rqeuestId,
      });
    }
  }
}

type SUBSCRIBED_EVENT = "depth_update_sol_usd" | "depth_update_btc_usd";

let eventSubscriptions: Record<SUBSCRIBED_EVENT, HashSet<WebSocket>> = {
  depth_update_btc_usd: new HashSet(),
  depth_update_sol_usd: new HashSet(),
};

function setupEventSubscriptionHandling() {
  publishDepthUpdateEvents();
}
async function publishDepthUpdateEvents() {
  //
  const currentRedisClient = redisClient.duplicate();
  // duplicating coz this client will be kept on hold on block and no other guy would be able to use it, so creating a separate one from global redisClient
  // this will creaate a new client

  await currentRedisClient.connect();

  // create the consumer group  first
  // this is assumed to be last delivered message id
  await redisClient.xGroupCreate(
    "depth_update_btc_usd",
    process.env.REDIS_ENGINE_UPDATES_GROUP!,
    "0",
    { MKSTREAM: true },
  );

  while (true) {
    const streamsReadResponse = await currentRedisClient.xReadGroup(
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
              eventSubscriptions[streamReadResponse.name as SUBSCRIBED_EVENT];

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
            await redisClient.xAck(
              streamReadResponse.name,
              process.env.REDIS_ENGINE_UPDATES_GROUP!,
              id,
            );
          },
        );
      }),
    );
  }
}

async function handleSubscribeEventRequest(req: WS_REQUEST, ws: WebSocket) {
  if (zodBodyVerificationWebSocket(subscribeEventSchema, req, ws)) {
    const { eventType }: { eventType: SUBSCRIBED_EVENT } = req.payload;

    switch (eventType) {
      case "depth_update_btc_usd":
        eventSubscriptions.depth_update_btc_usd.insert(ws);
        break;
      case "depth_update_sol_usd":
        eventSubscriptions.depth_update_sol_usd.insert(ws);
        break;

      default:
        break;
    }

    sendMessageOnWebSocket(ws, {
      requestId: req.rqeuestId,
      type: "event_subscribed",
      payload: null,
    });
  }
}

async function handleUnsubscribeEventRequest(req: WS_REQUEST, ws: WebSocket) {
  if (zodBodyVerificationWebSocket(unsubscribeEventSchema, req, ws)) {
    const { eventType }: { eventType: SUBSCRIBED_EVENT } = req.payload;

    switch (eventType) {
      case "depth_update_btc_usd":
        eventSubscriptions.depth_update_btc_usd.eraseElementByKey(ws);
        break;
      case "depth_update_sol_usd":
        eventSubscriptions.depth_update_sol_usd.eraseElementByKey(ws);
        break;

      default:
        break;
    }

    sendMessageOnWebSocket(ws, {
      requestId: req.rqeuestId,
      type: "event_unsubscribed",
      payload: null,
    });
  }
}

const handleWebSocketMessage = async (ws: WebSocket, request: WS_REQUEST) => {
  switch (request.type) {
    case "subscribe_event":
      await handleSubscribeEventRequest(request, ws);
      break;
    case "unsubscribe_event":
      await handleUnsubscribeEventRequest(request, ws);
      break;
    case "add_balance":
      await handleAddBalanceRequest(request, ws);
      break;
    case "cancel_order":
      await handleCancelOrderRequest(request, ws);
      break;

    case "create_order":
      await handleCreateOrderRequest(request, ws);
      break;
    case "get_balance":
      await handleGetBalanceRequest(request, ws);
      break;
    case "get_depth":
      await handleGetDepthRequest(request, ws);
      break;
    case "get_fills":
      await handleGetFillsRequest(request, ws);
      break;
    case "get_order":
      await handleGetOrderRequest(request, ws);
      break;
    case "get_orders":
      await handleGetOrdersRequest(request, ws);
      break;

    default:
      throw new Error("WRONG_REQUEST_FORMAT");
  }
};

function verifyJwtToken(ws: WebSocket, req: IncomingMessage): boolean {
  //
  try {
    if (!req.url) return false;
    const url = new URL(req.url, "http://anythingWorksHere");
    const jwt_token = url.searchParams.get("jwt_token");

    if (!jwt_token) return false;

    const decodedUser = jwt.verify(
      jwt_token,
      process.env.JWT_SECRET_KEY!,
    ) as JwtPayload;
    ws.user = { username: decodedUser.username, id: decodedUser.id };

    return true;
  } catch (e) {
    return false;
  }
}

async function setupServer() {
  redisClient.on("error", (err) => {
    console.log("redis error : ", err);
  });

  await redisClient.connect();
  setupEventSubscriptionHandling();

  console.log("REDIS SET UP DONE");

  wss.on("connection", (ws, req) => {
    if (!verifyJwtToken(ws, req)) {
      ws.close(400, "BAD_CONNECTION_URL");
      return;
    }

    ws.on("message", async (networkData, isBinary) => {
      if (isBinary) {
        console.error("is binary data, ignoring");
        return;
      }

      const jsonParsedData = JSON.parse(networkData.toString());
      //
      await handleWebSocketMessage(ws, jsonParsedData);
    });
  });

  app.listen(3001);
  console.log("LISTENING ON PORT 3001");
}

setupServer();
