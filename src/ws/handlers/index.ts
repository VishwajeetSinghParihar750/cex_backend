import { zodBodyVerificationWebSocket } from "../../middlewares/zodBodyVerification.js";
import type { WS_REQUEST } from "../../types/wsServer.js";
import {
  addBalanceSchema,
  getBalanceSchema,
} from "../../validations/balance.js";
import WebSocket from "ws";
import {
  createOrderSchema,
  deleteOrderSchema,
  getDepthSchema,
  getOrderSchema,
} from "../../validations/order.js";
import { sendMessageOnWebSocket } from "../utils/messaging.js";
import { HashSet } from "js-sdsl";
import {
  subscribeEventSchema,
  unsubscribeEventSchema,
} from "../../validations/subscribeEvent.js";
import EngineInterface from "../../engineInterface.js";

const engine = new EngineInterface();

async function handleAddBalanceRequest(req: WS_REQUEST, ws: WebSocket) {
  if (zodBodyVerificationWebSocket(addBalanceSchema, req, ws)) {
    try {
      const { type, payload } = await engine.getEngineResponseForRequest(
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

      const { type: responseType, payload } =
        await engine.getEngineResponseForRequest("create_order", {
          type,
          side,
          price,
          qty,
          symbol,
          userId: ws.user.id,
        });

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

      const { type: resType, payload } =
        await engine.getEngineResponseForRequest("get_order", { orderId });

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

      const { type: resType, payload } =
        await engine.getEngineResponseForRequest("cancel_order", { orderId });

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
      const { type: resType, payload } =
        await engine.getEngineResponseForRequest("get_depth", {
          symbol: symbol,
        });

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
    const { type: resType, payload } = await engine.getEngineResponseForRequest(
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
    const { type: resType, payload } = await engine.getEngineResponseForRequest(
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

      const { type: resType, payload } =
        await engine.getEngineResponseForRequest("get_balance", {
          userId: ws.user.id,
          symbol,
        });

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

export { handleWebSocketMessage, engine as wsEngineInterface };
