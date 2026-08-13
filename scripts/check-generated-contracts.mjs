import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import openapiTS, { astToString } from "openapi-typescript";

const root = resolve(import.meta.dirname, "..");
const migrationsDirectory = join(root, "supabase/migrations");
const migrations = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const schemaHash = createHash("sha256");
for (const migration of migrations) {
  schemaHash.update(readFileSync(join(migrationsDirectory, migration)));
}

const databaseTypes = readFileSync(join(root, "src/generated/database.types.ts"), "utf8");
const expectedHash = schemaHash.digest("hex");
if (!databaseTypes.includes(`schema-sha256: ${expectedHash}`)) {
  throw new Error("database.types.ts is stale; run npm run generate:database");
}

const schemaPath = join(root, "vision-service/openapi.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const generatedVision = astToString(await openapiTS(schema));
const committedVision = readFileSync(join(root, "src/generated/vision-api.ts"), "utf8");
const committedBody = committedVision.slice(committedVision.indexOf("export interface paths"));
if (generatedVision !== committedBody) {
  throw new Error("vision-api.ts is stale; run npm run generate:vision");
}

console.log("Generated database and vision contracts are current.");
