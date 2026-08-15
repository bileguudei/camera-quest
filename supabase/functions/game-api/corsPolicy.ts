const allowedRequestHeaders = [
  "authorization",
  "apikey",
  "content-type",
  "x-client-info",
  // Supabase FunctionsClient adds this header when a region is forced.
  "x-region",
];

export const headersFor = (origin: string | null, allowedOrigins: ReadonlySet<string>) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "null",
  "Access-Control-Allow-Headers": allowedRequestHeaders.join(", "),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
});
