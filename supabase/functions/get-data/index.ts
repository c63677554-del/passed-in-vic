// get-data — the gated data endpoint.
// Anonymous callers get the free teaser (latest week, no price guides/links).
// Authenticated + entitled subscribers get the full payload.
// Deployed with verify_jwt=false: auth is handled here so anon teaser works.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  // Who's asking?
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
    const { data } = await admin.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }

  let entitled = false;
  if (userId) {
    const { data } = await admin.rpc("is_entitled", { uid: userId });
    entitled = data === true;
  }

  const { data: row, error } = await admin.from("app_data").select("generated, payload").eq("key", "passed_in").single();
  if (error || !row) return json({ error: "data unavailable" }, 503);

  const payload = row.payload as { generated: string; properties: Record<string, unknown>[] };
  if (entitled) return json({ tier: "pro", generated: payload.generated, properties: payload.properties });

  // Teaser: latest week only, guides + listing links stripped.
  const weeks = [...new Set(payload.properties.map((p) => p.week as string))].sort().reverse();
  const latest = weeks[0];
  const teaser = payload.properties
    .filter((p) => p.week === latest)
    .map((p) => ({ ...p, listLow: null, listHigh: null, listUrl: null, bid: null }));
  return json({ tier: userId ? "free" : "anon", generated: payload.generated, latestWeek: latest, weeksAvailable: weeks.length, properties: teaser });
});
