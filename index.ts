import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { createClient } from "redis";
import { error } from "node:console";

const prismaPgAdapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter: prismaPgAdapter });

const app = express();
const redisClient = createClient({ url: process.env.REDIS_URL! });

app.use(express.json());

//

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
    res.status(401).json({ error: true, result: "unauthorized" });
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
    res.status(401).json({ error: true, result: "unauthorized" });
  }
}

app.post("/signup", async (req, res) => {
  //
  try {
    const { username, password } = req.body;
    const findUser = await prisma.users.findUnique({
      where: { username },
    });
    if (findUser) {
      res.status(403).json({ error: true, result: "username already exists" });
      return;
    }
    const user = await prisma.users.create({ data: { username, password } });

    res.status(201).json({ error: false, result: user.id });
  } catch (e) {
    res.status(500).json({ error: true, result: "server error" });
  }
});

app.post("/signin", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.users.findUnique({
      where: { username },
    });
    if (!user || user.password != password) {
      res.status(400).json({ error: true, result: "incorrect credentials" });
      return;
    }

    const jwt_token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET_KEY!,
    );

    res.status(200).json({
      error: false,
      result: {
        jwt_token,
      },
    });
  } catch (error) {
    res.status(500).json({ error: true, result: "server error" });
  }
});

app.post("/deposit", authMiddleware, async (req, res) => {
  const { amount } = req.body;
  try {
    const { type, payload } = await getEngineResponseForRequest("add_balance", {
      userId: req.user?.id,
      amount,
    });

    if (type == "error") {
      res.status(400).json({ error: true, payload });
    } else res.status(200).json({ error: false, payload: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
  }
});

app.post("/order", authMiddleware, async (req, res) => {
  const { type, price, qty, symbol, side } = req.body;

  try {
    const { type: resType, payload } = await getEngineResponseForRequest(
      "create_order",
      { type, side, price, qty, symbol, userId: req.user!.id },
    );

    if (resType == "error") {
      res.status(400).json({ error: true, payload });
    } else res.status(200).json({ error: false, payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
  }
});

app.get("/order/:orderId", authMiddleware, async (req, res) => {
  try {
    const { type: resType, payload } = await getEngineResponseForRequest(
      "get_order",
      { orderId: req.params.orderId },
    );

    if (resType == "error") {
      res.status(400).json({ error: true, payload });
    } else res.status(200).json({ error: false, payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
  }
});

app.delete("/order/:orderId", authMiddleware, async (req, res) => {
  try {
    const { type: resType, payload } = await getEngineResponseForRequest(
      "cancel_order",
      { orderId: req.params.orderId },
    );

    if (resType == "error") {
      res.status(400).json({ error: true, payload });
    } else res.status(200).json({ error: false, payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
  }
});
app.get("/depth/:symbol", async (req, res) => {
  try {
    const { type: resType, payload } = await getEngineResponseForRequest(
      "get_depth",
      { symbol: req.params.symbol },
    );

    if (resType == "error") {
      res.status(400).json({ error: true, payload });
    } else res.status(200).json({ error: false, payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
  }
});

app.get("/orders", authMiddleware, async (req, res) => {
  try {
    const { type: resType, payload } = await getEngineResponseForRequest(
      "get_orders",
      {},
    );

    if (resType == "error") {
      res.status(400).json({ error: true, payload });
    } else res.status(200).json({ error: false, payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
  }
});

app.get("/fills", async (req, res) => {
  try {
    const { type: resType, payload } = await getEngineResponseForRequest(
      "get_fills",
      {},
    );

    if (resType == "error") {
      res.status(400).json({ error: true, payload });
    } else res.status(200).json({ error: false, payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
  }
});

app.get("/balance/:symbol", authMiddleware, async (req, res) => {
  try {
    const { type: resType, payload } = await getEngineResponseForRequest(
      "get_balance",
      {
        userId: req.user?.id,
        symbol: req.params.symbol?.toString()?.toUpperCase(),
      },
    );

    if (resType == "error") {
      res.status(400).json({ error: true, payload });
    } else res.status(200).json({ error: false, payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
  }
});

async function setupServer() {
  redisClient.on("error", (err) => {
    console.log("redis error : ", err);
  });

  await redisClient.connect();

  app.listen(3001);
}

setupServer();
