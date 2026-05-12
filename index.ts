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
  depthGetParamsSchema,
  orderDeleteParamsSchema,
  orderGetParamsSchema,
  orderPostSchema,
} from "./types/zod/order.js";
import {
  balanceGetParamsSchema,
  depositPostParamsSchema,
  depositPostSchema,
} from "./types/zod/balance.js";

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
const zodParamsVerification =
  (schema: z.ZodObject) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.params);
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

app.post(
  "/deposit/:symbol",
  authMiddleware,
  zodBodyVerification(depositPostSchema),
  zodParamsVerification(depositPostParamsSchema),
  async (req, res) => {
    const { amount } = req.body;
    try {
      const { type, payload } = await getEngineResponseForRequest(
        "add_balance",
        {
          userId: req.user?.id,
          amount,
          symbol: req.params.symbol,
        },
      );

      if (type == "error") {
        res.status(400).json({ error: true, payload });
      } else res.status(200).json({ error: false, payload: null });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
    }
  },
);

app.post(
  "/order",
  authMiddleware,
  zodBodyVerification(orderPostSchema),
  async (req, res) => {
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
  },
);

app.get(
  "/order/:orderId",
  authMiddleware,
  zodParamsVerification(orderGetParamsSchema),
  async (req, res) => {
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
  },
);

app.delete(
  "/order/:orderId",
  zodParamsVerification(orderDeleteParamsSchema),
  authMiddleware,
  async (req, res) => {
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
  },
);

app.get(
  "/depth/:symbol",
  zodParamsVerification(depthGetParamsSchema),
  async (req, res) => {
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
  },
);

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

app.get(
  "/balance{/:symbol}",
  authMiddleware,
  zodParamsVerification(balanceGetParamsSchema),
  async (req, res) => {
    try {
      const { type: resType, payload } = await getEngineResponseForRequest(
        "get_balance",
        {
          userId: req.user?.id,
          symbol: req.params.symbol?.toString()?.toUpperCase(),
        },
      );
      console.log("payload", payload, "type ", resType);
      if (resType == "error") {
        res.status(400).json({ error: true, payload });
      } else res.status(200).json({ error: false, payload });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: true, payload: "INTERNAL_SERVER_ERROR" });
    }
  },
);

async function setupServer() {
  redisClient.on("error", (err) => {
    console.log("redis error : ", err);
  });

  await redisClient.connect();
  console.log("REDIS SET UP DONE");

  app.listen(3001);
  console.log("LISTENING ON PORT 3001");
}

setupServer();
