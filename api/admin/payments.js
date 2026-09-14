import { requireAdmin } from "../../lib/admin-session.js";

const PAYSTACK_API = "https://api.paystack.co";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function paystack(path) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured on Vercel.");

  const response = await fetch(`${PAYSTACK_API}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.status) {
    throw new Error(data.message || `Paystack request failed (HTTP ${response.status}).`);
  }
  return data;
}

function parseQuery(req) {
  return new URL(req.url || "/api/admin/payments", "http://localhost").searchParams;
}

function normalizeTransaction(item) {
  const customer = item.customer || {};
  return {
    id: item.id,
    reference: item.reference,
    status: item.status,
    amount: Number(item.amount || 0),
    currency: item.currency || "NGN",
    channel: item.channel || "",
    gateway_response: item.gateway_response || "",
    paid_at: item.paid_at || null,
    created_at: item.created_at || null,
    customer: customer,
    customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
    customer_email: customer.email || "",
    metadata: item.metadata || null,
    plan: item.plan || null,
    plan_object: item.plan_object || null,
    fees: Number(item.fees || 0),
  };
}

function normalizeSubscription(item) {
  const customer = item.customer || {};
  const plan = item.plan || {};
  return {
    id: item.id,
    subscription_code: item.subscription_code || "",
    status: item.status || "",
    amount: Number(item.amount || plan.amount || 0),
    currency: item.currency || plan.currency || "NGN",
    interval: plan.interval || item.interval || "",
    first_name: customer.first_name || "",
    last_name: customer.last_name || "",
    email: customer.email || "",
    phone: customer.phone || null,
    customer,
    next_payment_date: item.next_payment_date || null,
    created_at: item.createdAt || item.created_at || null,
    start: item.start || null,
    plan,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed." });
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  try {
    const q = parseQuery(req);
    const transactionId = q.get("id");
    const subscriptionCode = q.get("subscription");

    if (transactionId) {
      const result = await paystack(`/transaction/${encodeURIComponent(transactionId)}`);
      return json(res, 200, { ok: true, item: normalizeTransaction(result.data || {}) });
    }

    if (subscriptionCode) {
      const result = await paystack(`/subscription/${encodeURIComponent(subscriptionCode)}`);
      return json(res, 200, { ok: true, item: normalizeSubscription(result.data || {}) });
    }

    const page = Math.max(1, Number(q.get("page") || 1));
    const perPage = Math.min(100, Math.max(1, Number(q.get("perPage") || 100)));
    const status = q.get("status");
    const from = q.get("from");
    const to = q.get("to");

    const transactionParams = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    const allowedStatuses = new Set(["success", "failed", "abandoned", "reversed", "pending", "ongoing", "processing", "queued"]);
    if (status && allowedStatuses.has(status)) transactionParams.set("status", status);
    if (from) transactionParams.set("from", from);
    if (to) transactionParams.set("to", to);

    const warnings = [];
    const [transactionResult, subscriptionResult] = await Promise.all([
      paystack(`/transaction?${transactionParams.toString()}`),
      paystack(`/subscription?page=1&perPage=100`).catch((error) => {
        warnings.push({ area: "subscriptions", message: error.message });
        return { data: [], meta: { total: 0, page: 1, perPage: 100, pageCount: 0 } };
      }),
    ]);

    const transactions = Array.isArray(transactionResult.data)
      ? transactionResult.data.map(normalizeTransaction)
      : [];
    const subscriptions = Array.isArray(subscriptionResult.data)
      ? subscriptionResult.data.map(normalizeSubscription)
      : [];

    const successful = transactions.filter((row) => row.status === "success");
    const activeSubscriptions = subscriptions.filter((row) => row.status === "active");
    const activeMonthly = activeSubscriptions.filter((row) => String(row.interval).toLowerCase() === "monthly");
    const activeQuarterly = activeSubscriptions.filter((row) => String(row.interval).toLowerCase() === "quarterly");

    return json(res, 200, {
      ok: true,
      generated_at: new Date().toISOString(),
      items: transactions,
      transactions,
      subscriptions,
      warnings,
      summary: {
        successful_transaction_count: successful.length,
        successful_transaction_total_kobo: successful.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        failed_transaction_count: transactions.filter((row) => row.status === "failed").length,
        abandoned_transaction_count: transactions.filter((row) => row.status === "abandoned").length,
        active_subscription_count: activeSubscriptions.length,
        active_monthly_count: activeMonthly.length,
        active_quarterly_count: activeQuarterly.length,
      },
      meta: transactionResult.meta || { page, perPage, total: transactions.length, pageCount: 1 },
    });
  } catch (error) {
    console.error("Admin Paystack payments error:", error);
    return json(res, 500, { error: error?.message || "Unable to load Paystack payments." });
  }
}

