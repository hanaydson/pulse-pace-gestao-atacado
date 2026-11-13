import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
  id: integer().primaryKey({autoIncrement: true}),
  kind: text().notNull(),
  client: integer(),
  source: integer(),
  body: text().notNull(),
  rev: integer().notNull().default(1),
  created: text().notNull(),
  updated: text().notNull(),
}, t => [index("records_kind_client").on(t.kind,t.client), uniqueIndex("records_source").on(t.kind,t.source)]);
export const members = sqliteTable("members", {
  email: text().primaryKey(),
  uid: text().unique(),
  role: text().notNull(),
  client: integer(),
});
export const audit = sqliteTable("audit", {
  id: integer().primaryKey({autoIncrement:true}),
  actor: text().notNull(),
  action: text().notNull(),
  entity: text().notNull(),
  at: text().notNull(),
  detail: text().notNull(),
});
export const files = sqliteTable("files", {
  id: text().primaryKey(),
  parent: integer().notNull(),
  name: text().notNull(),
  category: text().notNull(),
  note: text().notNull(),
  type: text().notNull(),
  size: integer().notNull(),
  actor: text().notNull(),
  created: text().notNull(),
}, t => [index("files_parent").on(t.parent)]);
