import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const projectRef = process.env.SUPABASE_PROJECT_REF;
const connectionArgs = projectRef ? ["--project-id", projectRef] : ["--local"];

const generated = execFileSync(
  "supabase",
  ["gen", "types", "typescript", ...connectionArgs, "--schema", "public"],
  { cwd: root, encoding: "utf8" },
);
const directory = join(root, "supabase/migrations");
const hash = createHash("sha256");
for (const file of readdirSync(directory).filter((item) => item.endsWith(".sql")).sort()) {
  hash.update(readFileSync(join(directory, file)));
}
const header = `/** Generated from Supabase schema. Do not edit by hand.\n * schema-sha256: ${hash.digest("hex")}\n */\n\n`;
writeFileSync(join(root, "src/generated/database.types.ts"), header + generated, "utf8");
