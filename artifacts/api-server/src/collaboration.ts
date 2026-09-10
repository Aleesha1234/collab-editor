import { type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { eq } from "drizzle-orm";
import { db, documentsTable } from "@workspace/db";
import { logger } from "./lib/logger";
import { recordActivity } from "./routes/documents";

type Stamp = {
  timestamp: number;
  clientId: string;
  opId: string;
};

type Atom = Stamp & {
  id: string;
  leftId: string | null;
  char: string;
  deleted: boolean;
  deleteStamp?: Stamp;
};

type User = {
  id: string;
  name: string;
  initials: string;
  color: string;
  cursor?: { anchor: number; head: number };
};

type Client = {
  socket: WebSocket;
  clientId: string;
  user: User;
};

type Room = {
  documentId: string;
  documentName: string;
  atoms: Map<string, Atom>;
  clients: Map<WebSocket, Client>;
  version: number;
  loading?: Promise<void>;
  lastPersistedContent: string;
};

const rooms = new Map<string, Room>();

function compareStamp(a: Stamp, b: Stamp) {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  const client = a.clientId.localeCompare(b.clientId);
  if (client !== 0) return client;
  return a.opId.localeCompare(b.opId);
}

function visibleOrder(room: Room) {
  const children = new Map<string | null, Atom[]>();
  for (const atom of room.atoms.values()) {
    const siblings = children.get(atom.leftId) ?? [];
    siblings.push(atom);
    children.set(atom.leftId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => compareStamp(a, b));
  }

  const order: Atom[] = [];
  const visit = (leftId: string | null) => {
    for (const atom of children.get(leftId) ?? []) {
      order.push(atom);
      visit(atom.id);
    }
  };
  visit(null);
  return order;
}

function materialize(room: Room) {
  return visibleOrder(room)
    .filter((atom) => !atom.deleted)
    .map((atom) => atom.char)
    .join("");
}

function publicAtoms(room: Room) {
  return visibleOrder(room).map((atom) => ({
    id: atom.id,
    leftId: atom.leftId,
    char: atom.char,
    deleted: atom.deleted,
  }));
}

async function loadRoom(documentId: string) {
  const existing = rooms.get(documentId);
  if (existing) {
    if (existing.loading) await existing.loading;
    return existing;
  }

  const room: Room = {
    documentId,
    documentName: documentId,
    atoms: new Map(),
    clients: new Map(),
    version: 0,
    lastPersistedContent: "",
  };
  rooms.set(documentId, room);
  room.loading = (async () => {
    const [document] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1);
    if (document) {
      room.documentName = document.name;
      let leftId: string | null = null;
      for (const [index, char] of [...document.content].entries()) {
        const id = `seed:${index}`;
        room.atoms.set(id, {
          id,
          leftId,
          char,
          deleted: false,
          timestamp: 0,
          clientId: "seed",
          opId: id,
        });
        leftId = id;
      }
      room.lastPersistedContent = document.content;
    }
  })();
  await room.loading;
  delete room.loading;
  return room;
}

function send(socket: WebSocket, message: unknown) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(room: Room, message: unknown, except?: WebSocket) {
  for (const client of room.clients.values()) {
    if (client.socket !== except) send(client.socket, message);
  }
}

async function persist(room: Room) {
  const content = materialize(room);
  if (content === room.lastPersistedContent) return;
  room.lastPersistedContent = content;
  await db
    .update(documentsTable)
    .set({ content, updatedAt: new Date() })
    .where(eq(documentsTable.id, room.documentId));
}

function normalizedUser(value: unknown, clientId: string): User {
  const candidate = (value ?? {}) as Partial<User>;
  const name = typeof candidate.name === "string" && candidate.name.trim()
    ? candidate.name.trim().slice(0, 40)
    : "Guest";
  return {
    id: clientId,
    name,
    initials: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    color: typeof candidate.color === "string" ? candidate.color : "#2a9d8f",
  };
}

async function handleMessage(room: Room, client: Client, raw: RawData) {
  let message: any;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (message?.type === "cursor") {
    const cursor = message.cursor;
    if (cursor && Number.isInteger(cursor.anchor) && Number.isInteger(cursor.head)) {
      client.user.cursor = { anchor: cursor.anchor, head: cursor.head };
      broadcast(room, { type: "presence", users: [...room.clients.values()].map((entry) => entry.user) });
    }
    return;
  }

  if (message?.type !== "edit" || !Array.isArray(message.operations)) return;

  const accepted = [];
  for (const operation of message.operations) {
    if (!operation || typeof operation !== "object") continue;
    const stamp: Stamp = {
      timestamp: Number.isFinite(operation.timestamp) ? operation.timestamp : Date.now(),
      clientId: client.clientId,
      opId: typeof operation.opId === "string" ? operation.opId : randomUUID(),
    };
    if (operation.action === "insert" && typeof operation.text === "string") {
      let leftId = typeof operation.leftId === "string" ? operation.leftId : null;
      for (const [index, char] of [...operation.text].entries()) {
        const id = typeof operation.ids?.[index] === "string"
          ? operation.ids[index]
          : `${client.clientId}:${stamp.opId}:${index}`;
        if (!room.atoms.has(id)) {
          room.atoms.set(id, {
            ...stamp,
            id,
            leftId,
            char,
            deleted: false,
          });
          accepted.push({ action: "insert", id, leftId, char, stamp });
        }
        leftId = id;
      }
    } else if (operation.action === "delete" && Array.isArray(operation.ids)) {
      for (const id of operation.ids) {
        const atom = room.atoms.get(id);
        if (!atom) continue;
        if (!atom.deleteStamp || compareStamp(atom.deleteStamp, stamp) < 0) {
          atom.deleted = true;
          atom.deleteStamp = stamp;
          accepted.push({ action: "delete", id, stamp });
        }
      }
    }
  }

  if (accepted.length === 0) return;
  room.version += 1;
  const content = materialize(room);
  send(client.socket, {
    type: "ack",
    version: room.version,
    content,
    atoms: publicAtoms(room),
  });
  broadcast(room, {
    type: "operations",
    version: room.version,
    operations: accepted,
    content,
    atoms: publicAtoms(room),
  }, client.socket);
  try {
    await persist(room);
    await recordActivity("edited", room.documentName);
  } catch (error) {
    logger.error({ error, documentId: room.documentId }, "Unable to persist collaboration edit");
  }
}

export function attachCollaborationServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", "http://localhost");
    if (url.pathname !== "/api/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (websocket) => {
      wss.emit("connection", websocket, request);
    });
  });

  wss.on("connection", (socket) => {
    let room: Room | undefined;
    let client: Client | undefined;

    socket.on("message", async (raw) => {
      if (!client) {
        let hello: any;
        try {
          hello = JSON.parse(raw.toString());
        } catch {
          socket.close(1008, "Invalid handshake");
          return;
        }
        if (hello?.type !== "join" || typeof hello.documentId !== "string") {
          socket.close(1008, "Join required");
          return;
        }
        try {
          room = await loadRoom(hello.documentId);
          const clientId = typeof hello.clientId === "string" ? hello.clientId : randomUUID();
          client = { socket, clientId, user: normalizedUser(hello.user, clientId) };
          room.clients.set(socket, client);
          send(socket, {
            type: "snapshot",
            documentId: room.documentId,
            version: room.version,
            content: materialize(room),
            atoms: publicAtoms(room),
            users: [...room.clients.values()].map((entry) => entry.user),
          });
          broadcast(room, { type: "presence", users: [...room.clients.values()].map((entry) => entry.user) });
          await recordActivity("joined", room.documentId);
        } catch (error) {
          logger.error({ error }, "Unable to join collaboration room");
          socket.close(1011, "Unable to load document");
        }
        return;
      }
      if (room) await handleMessage(room, client, raw);
    });

    socket.on("close", () => {
      if (!room || !client) return;
      room.clients.delete(socket);
      broadcast(room, { type: "presence", users: [...room.clients.values()].map((entry) => entry.user) });
      if (room.clients.size === 0) {
        void persist(room).finally(() => rooms.delete(room?.documentId ?? ""));
      }
    });
  });
}