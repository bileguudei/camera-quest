import assert from "node:assert/strict";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
const secretKey = required("SUPABASE_SECRET_KEY");
const functionUrl = `${supabaseUrl}/functions/v1/game-api`;
const origin = "http://localhost:3000";

async function jsonRequest(url, init, expectedStatus = 200) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.status !== expectedStatus) {
    throw new Error(`${init.method ?? "GET"} ${url} returned ${response.status}: ${text.slice(0, 300)}`);
  }
  return { response, body };
}

async function createAnonymousUser() {
  const { body } = await jsonRequest(`${supabaseUrl}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { camera_quest_smoke: true }, gotrue_meta_security: {} }),
  });
  assert.equal(typeof body.access_token, "string");
  assert.equal(typeof body.user?.id, "string");
  return { id: body.user.id, token: body.access_token };
}

async function deleteUser(userId) {
  await jsonRequest(
    `${supabaseUrl}/auth/v1/admin/users/${userId}?should_soft_delete=false`,
    {
      method: "DELETE",
      headers: { apikey: secretKey },
    },
  );
}

async function cleanupStaleSmokeUsers() {
  const { body } = await jsonRequest(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: secretKey },
  });
  for (const user of body.users ?? []) {
    if (user.user_metadata?.camera_quest_smoke === true) await deleteUser(user.id);
  }
}

async function command(token, commandName, payload, expectedStatus = 200) {
  const { body } = await jsonRequest(
    functionUrl,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ command: commandName, payload }),
    },
    expectedStatus,
  );
  return body;
}

async function serviceRpc(name, payload) {
  const { body } = await jsonRequest(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: secretKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return body;
}

async function select(path, key, token) {
  const headers = { apikey: key, Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const { body } = await jsonRequest(`${supabaseUrl}/rest/v1/${path}`, {
    headers,
  });
  return body;
}

const createdUsers = [];
let failure;
try {
  await cleanupStaleSmokeUsers();

  const preflight = await fetch(functionUrl, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,apikey,content-type",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);

  const owner = await createAnonymousUser();
  const intruder = await createAnonymousUser();
  createdUsers.push(intruder.id, owner.id);

  const game = await command(owner.token, "create-game", {
    players: [{ seat: 1, name: "Smoke Player", avatar: "🦊", color: "violet" }],
  });
  assert.equal(game.players.length, 1);

  const prepared = await command(owner.token, "prepare-turn", {
    gameId: game.gameId,
    playerId: game.players[0].id,
    round: 1,
    calibrationToken: "smoke-calibration-token",
    backgroundClasses: [],
  });
  assert.equal(prepared.challenge.difficulty, "easy");

  const active = await command(owner.token, "activate-turn", { turnId: prepared.turnId });
  const durationMs = Date.parse(active.deadlineAt) - Date.parse(active.startedAt);
  assert.equal(durationMs, 30_000);

  const outcome = await serviceRpc("resolve_turn", {
    p_turn_id: prepared.turnId,
    p_sequence_no: 1,
    p_latency_ms: 25,
    p_confidence: 0.99,
    p_validator: "smoke",
    p_model_version: "smoke-model",
    p_validator_version: "smoke-validator",
    p_reason: "remote_smoke",
  });
  const duplicate = await serviceRpc("resolve_turn", {
    p_turn_id: prepared.turnId,
    p_sequence_no: 1,
    p_latency_ms: 25,
    p_confidence: 0.99,
    p_validator: "smoke",
    p_model_version: "smoke-model",
    p_validator_version: "smoke-validator",
    p_reason: "duplicate_smoke",
  });
  assert.deepEqual(duplicate, outcome);
  assert.ok(outcome.points > 0);

  const ownerProfiles = await select(
    "player_profiles?select=id,total_xp,current_streak",
    publishableKey,
    owner.token,
  );
  const intruderProfiles = await select(
    "player_profiles?select=id,total_xp,current_streak",
    publishableKey,
    intruder.token,
  );
  assert.equal(ownerProfiles.length, 1);
  assert.equal(intruderProfiles.length, 0);
  assert.equal(ownerProfiles[0].total_xp, outcome.points);

  const gamePlayers = await select(
    `game_players?game_id=eq.${game.gameId}&select=match_score,earned_xp,successful_turns`,
    secretKey,
  );
  assert.deepEqual(gamePlayers, [
    { match_score: outcome.points, earned_xp: outcome.points, successful_turns: 1 },
  ]);

  const attempts = await select(
    `vision_attempts?turn_id=eq.${prepared.turnId}&select=sequence_no,decision`,
    secretKey,
  );
  assert.deepEqual(attempts, [{ sequence_no: 1, decision: "pass" }]);

  const forbidden = await command(
    intruder.token,
    "abandon-game",
    { gameId: game.gameId },
    409,
  );
  assert.equal(forbidden.code, "GAME_NOT_OWNED");

  console.log(
    JSON.stringify({
      status: "ok",
      cors: "allowed",
      anonymousAuth: "ok",
      rlsIsolation: "ok",
      atomicResolution: "ok",
      duplicateAwardCount: 0,
      awardedPoints: outcome.points,
    }),
  );
} catch (error) {
  failure = error;
} finally {
  const cleanupErrors = [];
  for (const userId of createdUsers) {
    try {
      await deleteUser(userId);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (!failure && cleanupErrors.length > 0) failure = cleanupErrors[0];
}

if (failure) throw failure;
