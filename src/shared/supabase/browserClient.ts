"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/shared/env/publicEnv";
import { AppError } from "@/shared/errors/appError";
import type { Database } from "@/generated/database.types";

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!publicEnv.supabaseUrl || !publicEnv.supabasePublishableKey) {
    throw new AppError("GAME_UNAVAILABLE", "Supabase environment тохируулаагүй байна.");
  }

  browserClient ??= createClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        // The SDK default of 10 events/second is a client-side throttle that
        // would cap the live spectator view at a slideshow. The turn preview
        // runs at 12fps and still leaves headroom for state changes.
        params: { eventsPerSecond: 24 },
      },
    },
  );
  return browserClient;
}

export async function ensureAnonymousAccessToken(): Promise<string> {
  const client = getSupabaseBrowserClient();
  const current = await client.auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session?.access_token) return current.data.session.access_token;

  const created = await client.auth.signInAnonymously();
  if (created.error || !created.data.session?.access_token) {
    throw created.error ?? new AppError("UNAUTHORIZED", "Anonymous session үүссэнгүй.");
  }
  return created.data.session.access_token;
}
