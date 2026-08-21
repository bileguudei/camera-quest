"use client";

/**
 * A join code is useless to a friend in another district until it can be sent.
 * The host shares `…/?join=CODE`; opening it drops the player straight on the
 * online screen with the code already filled in.
 */
const JOIN_PARAM = "join";

/** Six characters, any case, punctuation from a chat app stripped. */
export function normalizeJoinCode(
  raw: string | null | undefined,
): string | null {
  const code = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === 6 ? code : null;
}

export function buildInviteUrl(origin: string, joinCode: string): string {
  const url = new URL(origin);
  url.pathname = "/";
  url.searchParams.set(JOIN_PARAM, joinCode);
  return url.toString();
}

let pendingJoinCode: string | null = null;

/**
 * Reads the code once and wipes it from the address bar, so leaving the room
 * and reloading does not throw the player back at it.
 */
export function consumeInviteCode(): string | null {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const code = normalizeJoinCode(url.searchParams.get(JOIN_PARAM));
  if (!code) return null;

  url.searchParams.delete(JOIN_PARAM);
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  pendingJoinCode = code;
  return code;
}

/** Handed to the online screen when it mounts; only ever read once. */
export function takePendingInviteCode(): string {
  const code = pendingJoinCode ?? "";
  pendingJoinCode = null;
  return code;
}

export type ShareOutcome = "shared" | "copied" | "unavailable";

/**
 * Native share sheet first — that is what puts the link into Messenger. Falls
 * back to the clipboard, and reports failure so the caller can show the link
 * instead: both APIs are missing over plain http, which is exactly how a
 * teammate opens the dev server from their phone.
 */
export async function shareInvite(
  url: string,
  text: string,
): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: "Camera Quest", text, url });
      return "shared";
    } catch {
      // Cancelled, or the sheet refused — fall through to the clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "unavailable";
  }
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
