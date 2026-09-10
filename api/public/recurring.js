import { randomUUID } from "node:crypto";

const PAYSTACK_API = "https://api.paystack.co";
const MIN_AMOUNT = 1000;
const ALLOWED_INTERVALS = new Set(["monthly", "quarterly"]);

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function paystack(path, options = {}) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured on Vercel.");
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.status) {
    throw new Error(data.message || `Paystack request failed (${response.status}).`);
  }
  return data;
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const email = String(body.email || "").trim().toLowerCase();
      const firstName = String(body.firstName || "").trim();
      const lastName = String(body.lastName || "").trim();
      const phone = String(body.phone || "").trim();
      const amount = Math.round(Number(body.amount));
      const interval = String(body.interval || "").trim().toLowerCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: "Please enter a valid email address." });
      if (!Number.isFinite(amount) || amount < MIN_AMOUNT) return json(res, 400, { error: "Recurring support must be at least ₦1,000." });
      if (!ALLOWED_INTERVALS.has(interval)) return json(res, 400, { error: "Choose Monthly or Quarterly." });

      // Create a plan for this exact amount + interval, then initialize the first payment.
      // This keeps the recurring interval under our control instead of exposing Paystack's
      // flexible hosted interval selector (weekly/daily/annual/etc.).
      const plan = await paystack("/plan", {
        method: "POST",
        body: JSON.stringify({
          name: `OPM UYO TOUCHING LIVES ${interval === "monthly" ? "Monthly" : "Quarterly"} Support - ${amount} NGN`,
          description: "Recurring support for OPM UYO TOUCHING LIVES humanitarian and skills empowerment work.",
          amount: amount * 100,
          interval,
          currency: "NGN",
          invoice_limit: 0,
          send_invoices: true,
          send_sms: false
        })
      });

      const reference = `OPM-R-${interval.slice(0, 1).toUpperCase()}-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const origin = process.env.PUBLIC_SITE_URL || "https://opmuyotouchinglives.vercel.app";
      const callback = `${origin}/recurring-success.html`;
      const transaction = await paystack("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email,
          amount: amount * 100,
          plan: plan.data.plan_code,
          reference,
          callback_url: callback,
          metadata: JSON.stringify({
            source: "OPM UYO TOUCHING LIVES",
            type: "recurring_support",
            interval,
            amount,
            first_name: firstName,
            last_name: lastName,
            phone
          })
        })
      });

      return json(res, 200, {
        ok: true,
        authorization_url: transaction.data.authorization_url,
        reference,
        interval,
        amount
      });
    }

    if (req.method === "GET") {
      const reference = String(req.query?.reference || "").trim();
      if (!reference) return json(res, 400, { error: "Missing payment reference." });
      const verified = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
      const data = verified.data || {};
      return json(res, 200, {
        ok: true,
        status: data.status,
        reference: data.reference,
        amount: data.amount ? data.amount / 100 : 0,
        currency: data.currency,
        customer: data.customer?.email || "",
        plan: data.plan || null,
        paidAt: data.paid_at || null
      });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Recurring Paystack error:", error);
    return json(res, 500, { error: error?.message || "Unable to start recurring support." });
  }
}
