// stripe-webhook — keeps public.subscribers in sync with Stripe.
// Signature-verified (HMAC-SHA256 of "t.payload" against STRIPE_WEBHOOK_SECRET).
// Deployed with verify_jwt=false: Stripe calls this, not users.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

async function validSignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts["t"], v1 = parts["v1"];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // 5 min tolerance
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  const body = await req.text();
  if (!secret || !(await validSignature(body, req.headers.get("Stripe-Signature"), secret)))
    return new Response("bad signature", { status: 400 });

  const event = JSON.parse(body);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date().toISOString();

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    if (s.client_reference_id && s.customer) {
      await admin.from("subscribers").upsert(
        { user_id: s.client_reference_id, email: s.customer_details?.email ?? s.customer_email ?? "", stripe_customer_id: s.customer, updated_at: now },
        { onConflict: "user_id" },
      );
    }
  } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status; // trialing|active|past_due|canceled|...
    const end = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
    await admin.from("subscribers")
      .update({ status, plan: interval === "year" ? "annual" : "monthly", current_period_end: end, dev_grant: false, updated_at: now })
      .eq("stripe_customer_id", sub.customer);
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
