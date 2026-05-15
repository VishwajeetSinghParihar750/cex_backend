import type { WS_RESPONSE } from "../../types/wsServer.js";
import WebSocket from "ws";

const sendMessageOnWebSocket = (ws: WebSocket, message: WS_RESPONSE) => {
  ws.send(JSON.stringify(message));
};
export { sendMessageOnWebSocket };
