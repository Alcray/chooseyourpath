import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const blueprints = sqliteTable(
  "blueprints",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    briefJson: text("brief_json").notNull(),
    planJson: text("plan_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_blueprints_owner_created").on(table.ownerUserId, table.createdAt)],
);

export const stories = sqliteTable(
  "stories",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    briefJson: text("brief_json").notNull(),
    planJson: text("plan_json").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_stories_owner_idempotency").on(table.ownerUserId, table.idempotencyKey),
    index("idx_stories_owner_updated").on(table.ownerUserId, table.updatedAt),
  ],
);

export const clips = sqliteTable(
  "clips",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
    status: text("status").notNull(),
    providerJobId: text("provider_job_id"),
    extensionCount: integer("extension_count").notNull().default(0),
    r2Key: text("r2_key"),
    mimeType: text("mime_type"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_clips_story_slot").on(table.storyId, table.slot),
    index("idx_clips_story_status_updated").on(table.storyId, table.status, table.updatedAt),
  ],
);
