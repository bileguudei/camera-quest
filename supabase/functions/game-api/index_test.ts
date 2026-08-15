import { assertEquals } from "jsr:@std/assert@1";
import { bearerToken, supabasePublicKey } from "./requestPolicy.ts";
import { commandSchema } from "./schema.ts";
import { headersFor } from "./corsPolicy.ts";

Deno.test("allows the Supabase SDK region header in browser preflights", () => {
  const headers = headersFor("http://localhost:3000", new Set(["http://localhost:3000"]));
  const allowedHeaders = headers["Access-Control-Allow-Headers"]
    .split(",")
    .map((header) => header.trim());

  assertEquals(allowedHeaders.includes("x-region"), true);
});

Deno.test("rejects an unbounded player roster", () => {
  const result = commandSchema.safeParse({
    command: "create-game",
    payload: {
      players: Array.from({ length: 7 }, (_, index) => ({
        seat: index + 1,
        name: "Player",
        avatar: "🦊",
        color: "violet",
      })),
    },
  });
  assertEquals(result.success, false);
});

Deno.test("rejects invalid turn ids", () => {
  assertEquals(
    commandSchema.safeParse({ command: "activate-turn", payload: { turnId: "not-a-uuid" } })
      .success,
    false,
  );
});

Deno.test("requires a non-empty bearer token", () => {
  assertEquals(bearerToken(null), null);
  assertEquals(bearerToken("Basic abc"), null);
  assertEquals(bearerToken("Bearer   "), null);
  assertEquals(bearerToken("Bearer signed.jwt"), "signed.jwt");
});

Deno.test("prefers the current publishable key and supports legacy projects", () => {
  assertEquals(
    supabasePublicKey('{"default":"sb_publishable_current"}', "legacy-anon"),
    "sb_publishable_current",
  );
  assertEquals(supabasePublicKey(undefined, "legacy-anon"), "legacy-anon");
  assertEquals(supabasePublicKey("not-json", "legacy-anon"), "legacy-anon");
  assertEquals(supabasePublicKey('{"other":"unused"}', undefined), null);
});
