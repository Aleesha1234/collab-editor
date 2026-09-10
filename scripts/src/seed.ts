import { db, pool, documentsTable, activityTable } from "@workspace/db";

const documents = [
  {
    id: "starter-brief",
    name: "Product brief",
    content:
      "A shared space for ideas, decisions, and the next clear step.\n\nStart writing here with your team.",
  },
  {
    id: "research-notes",
    name: "Research notes",
    content:
      "Capture the signal while it is fresh.\n\nAdd sources, questions, and the patterns worth sharing.",
  },
];

const owner = {
  ownerId: "demo-user",
  ownerName: "You",
  ownerInitials: "YO",
  ownerColor: "#e76f51",
};

async function seed() {
  for (const document of documents) {
    await db
      .insert(documentsTable)
      .values({ ...document, ...owner })
      .onConflictDoNothing({ target: documentsTable.id });
    await db
      .insert(activityTable)
      .values({
        id: `seed-activity-${document.id}`,
        type: "created",
        actorId: owner.ownerId,
        actorName: owner.ownerName,
        actorInitials: owner.ownerInitials,
        actorColor: owner.ownerColor,
        documentName: document.name,
      })
      .onConflictDoNothing({ target: activityTable.id });
  }
}

seed()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    await pool.end();
    throw error;
  });