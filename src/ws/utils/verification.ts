import type { JwtPayload } from "jsonwebtoken";
import type { IncomingMessage } from "node:http";
import type WebSocket from "ws";
import jwt from "jsonwebtoken";

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

export { verifyJwtToken };
