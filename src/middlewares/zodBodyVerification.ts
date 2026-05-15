import { type NextFunction, type Request, type Response } from "express";
import z from "zod";
import { sendMessageOnWebSocket } from "../ws/utils/messaging.js";
import type { WS_REQUEST } from "../types/wsServer.js";
import WebSocket from "ws";

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

export { zodBodyVerification, zodBodyVerificationWebSocket };
