import { createServer } from "node:http";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import app from "./app";
import { logger } from "./lib/logger";
import { attachCollaborationServer } from "./collaboration";

loadEnv({
  path: path.resolve(process.env.INIT_CWD ?? process.cwd(), ".env"),
});

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
attachCollaborationServer(server);

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
