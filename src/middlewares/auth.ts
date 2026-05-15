import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";

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

export { authMiddleware };
