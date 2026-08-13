export function bearerToken(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/** Prefer Supabase's current publishable-key secret while legacy projects migrate. */
export function supabasePublicKey(
  publishableKeysJson: string | undefined,
  legacyAnonKey: string | undefined,
): string | null {
  if (publishableKeysJson) {
    try {
      const keys: unknown = JSON.parse(publishableKeysJson);
      if (keys && typeof keys === "object" && "default" in keys) {
        const value = (keys as Record<string, unknown>).default;
        if (typeof value === "string" && value.length > 0) return value;
      }
    } catch {
      // Fall through so linked projects can keep working during key migration.
    }
  }
  return legacyAnonKey?.trim() || null;
}
