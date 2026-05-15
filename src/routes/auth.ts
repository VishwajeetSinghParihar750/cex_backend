import { Router } from "express";
import { zodBodyVerification } from "../middlewares/zodBodyVerification.js";
import { signinSchema, signupSchema } from "../validations/auth.js";
import prisma from "../db/pg/index.js";
import jwt from "jsonwebtoken";

const router = Router();
router.post("/signup", zodBodyVerification(signupSchema), async (req, res) => {
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

router.post("/signin", zodBodyVerification(signinSchema), async (req, res) => {
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
