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
      environment: "home",
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

Deno.test("accepts a lowercase join code and rejects malformed ones", () => {
  assertEquals(
    commandSchema.safeParse({
      command: "join-game",
      payload: { joinCode: "kx7m2p", name: "Bat" },
    }).success,
    true,
  );
  assertEquals(
    commandSchema.safeParse({
      command: "join-game",
      payload: { joinCode: "KX7M2", name: "Bat" },
    }).success,
    false,
  );
});

Deno.test("advance-turn carries the pointer the caller observed", () => {
  assertEquals(
    commandSchema.safeParse({
      command: "advance-turn",
      payload: {
        gameId: "5c1f8f38-4b1e-4a4a-9a3c-2c6b0f4d7a11",
        fromRound: 1,
        fromSeat: 3,
      },
    }).success,
    true,
  );
  // A pointer-free advance would let a stale phone skip a player.
  assertEquals(
    commandSchema.safeParse({
      command: "advance-turn",
      payload: { gameId: "5c1f8f38-4b1e-4a4a-9a3c-2c6b0f4d7a11", fromRound: 1 },
    }).success,
    false,
  );
});

Deno.test("rejects an oversized lobby display name", () => {
  assertEquals(
    commandSchema.safeParse({
      command: "create-online-game",
      payload: { name: "x".repeat(25), environment: "home" },
    }).success,
    false,
  );
});

Deno.test("create-online-game requires a known environment", () => {
  assertEquals(
    commandSchema.safeParse({
      command: "create-online-game",
      payload: { name: "Bat", environment: "outdoor" },
    }).success,
    true,
  );
  // A room the seeded quests know nothing about would leave a game unplayable.
  assertEquals(
    commandSchema.safeParse({
      command: "create-online-game",
      payload: { name: "Bat", environment: "moon" },
    }).success,
    false,
  );
});
