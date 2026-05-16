import app from "./app.js";
import { wsServer } from "./ws/index.js";
import { wsEngineInterface } from "./ws/handlers/index.js";

async function setupServer() {
  await wsEngineInterface.initialize();

  app.listen(3001);
  console.log("running http server on port 3001");
  wsServer.listen(3000);
  console.log("running ws server on port 3000");
}

setupServer();
