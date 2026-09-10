import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  CreateDocumentBody,
  GetDocumentParams,
  UpdateDocumentBody,
  UpdateDocumentParams,
} from "@workspace/api-zod";
import { db, documentsTable, activityTable } from "@workspace/db";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const currentUser = {
  id: "demo-user",
  name: "You",
  initials: "YO",
  color: "#e76f51",
};

function toDocument(row: typeof documentsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
    owner: {
      id: row.ownerId,
      name: row.ownerName,
      initials: row.ownerInitials,
      color: row.ownerColor,
    },
    collaborators: [],
  };
}

function toActivity(row: typeof activityTable.$inferSelect) {
  return {
    id: row.id,
    type: row.type as "created" | "edited" | "joined" | "saved",
    actor: {
      id: row.actorId,
      name: row.actorName,
      initials: row.actorInitials,
      color: row.actorColor,
    },
    documentName: row.documentName,
    timestamp: row.timestamp.toISOString(),
  };
}

async function recordActivity(type: string, documentName: string) {
  await db.insert(activityTable).values({
    id: randomUUID(),
    type,
    actorId: currentUser.id,
    actorName: currentUser.name,
    actorInitials: currentUser.initials,
    actorColor: currentUser.color,
    documentName,
  });
}

router.get("/documents", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(documentsTable)
      .orderBy(desc(documentsTable.updatedAt));
    res.json(rows.map(toDocument));
  } catch (error) {
    res.status(500).json({ error: "Unable to load documents" });
  }
});

router.post("/documents", async (req, res) => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Document name is required" });
    return;
  }

  try {
    const id = randomUUID();
    const [row] = await db.insert(documentsTable).values({
      id,
      name: parsed.data.name.trim(),
      content: parsed.data.content ?? "",
      ownerId: currentUser.id,
      ownerName: currentUser.name,
      ownerInitials: currentUser.initials,
      ownerColor: currentUser.color,
    }).returning();
    await recordActivity("created", row.name);
    res.status(201).json(toDocument(row));
  } catch (error) {
    res.status(500).json({ error: "Unable to create document" });
  }
});

router.get("/documents/:documentId", async (req, res) => {
  const parsed = GetDocumentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }

  try {
    const [row] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, parsed.data.documentId))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(toDocument(row));
  } catch (error) {
    res.status(500).json({ error: "Unable to load document" });
  }
});

router.patch("/documents/:documentId", async (req, res) => {
  const params = UpdateDocumentParams.safeParse(req.params);
  const body = UpdateDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid document update" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.id, params.data.documentId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const updates: Partial<typeof documentsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.data.name !== undefined) updates.name = body.data.name.trim();
    if (body.data.content !== undefined) updates.content = body.data.content;

    const [row] = await db
      .update(documentsTable)
      .set(updates)
      .where(eq(documentsTable.id, params.data.documentId))
      .returning();
    await recordActivity("saved", row.name);
    res.json(toDocument(row));
  } catch (error) {
    res.status(500).json({ error: "Unable to save document" });
  }
});

router.get("/activity", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(activityTable)
      .orderBy(desc(activityTable.timestamp))
      .limit(12);
    res.json(rows.map(toActivity));
  } catch (error) {
    res.status(500).json({ error: "Unable to load activity" });
  }
});

export { currentUser, recordActivity };
export default router;