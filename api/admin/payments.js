import { requireAdmin } from "../../lib/admin-session.js";

const PAYSTACK_BASE = "https://api.paystack.co";

function json(res, status, body) {
  res.status(status).setHeader("Cache-Control", "no-store").json(body);
}

async function paystack(path) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured on Vercel.");

  const response = await fetch(`${PAYSTACK_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) {
    throw new Error(payload.message || `Paystack request failed (HTTP ${response.status})`);
  }
  return payload;
}

async function getTransactions() {
  const all = [];
  // Load up to 1,000 recent transactions so the admin page is useful without
  // creating a large number of Paystack requests.
  for (let page = 1; page <= 10; page += 1) {
    const payload = await paystack(`/transaction?perPage=100&page=${page}`);
    const items = Array.isArray(payload.data) ? payload.data : [];
    all.push(...items);
    const meta = payload.meta || {};
    if (!items.length || page >= Number(meta.pageCount || page)) break;
  }
  return all;
}

async function getSubscriptions() {
  const payload = await paystack("/subscription?perPage=100&page=1");
  return Array.isArray(payload.data) ? payload.data : [];
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  if (!requireAdmin(req, res)) return;

  try {
    const [transactions, subscriptions] = await Promise.all([
      getTransactions(),
      getSubscriptions()
    ]);

    const successTransactions = transactions.filter((item) => item.status === "success");
    const activeSubscriptions = subscriptions.filter((item) => item.status === "active");

    const totalSuccessful = successTransactions.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const recurring = activeSubscriptions.map((item) => ({
      id: item.id,
      subscription_code: item.subscription_code,
      status: item.status,
      amount: Number(item.amount || 0),
      interval: item.plan?.interval || "",
      plan_name: item.plan?.name || "",
      email: item.customer?.email || "",
      first_name: item.customer?.first_name || "",
      last_name: item.customer?.last_name || "",
      phone: item.customer?.phone || "",
      next_payment_date: item.next_payment_date || null,
      created_at: item.createdAt || item.created_at || null,
      updated_at: item.updatedAt || item.updated_at || null
    }));

    return json(res, 200, {
      ok: true,
      currency: "NGN",
      generated_at: new Date().toISOString(),
      summary: {
        successful_transaction_count: successTransactions.length,
        successful_transaction_total_kobo: totalSuccessful,
        active_subscription_count: activeSubscriptions.length,
        active_monthly_count: activeSubscriptions.filter((item) => item.plan?.interval === "monthly").length,
        active_quarterly_count: activeSubscriptions.filter((item) => item.plan?.interval === "quarterly").length
      },
      transactions: transactions.map((item) => ({
        id: item.id,
        reference: item.reference,
        status: item.status,
        amount: Number(item.amount || 0),
        currency: item.currency || "NGN",
        channel: item.channel || "",
        customer_email: item.customer?.email || "",
        customer_name: [item.customer?.first_name, item.customer?.last_name].filter(Boolean).join(" "),
        customer_phone: item.customer?.phone || "",
        paid_at: item.paid_at || null,
        created_at: item.created_at || null,
        gateway_response: item.gateway_response || "",
        fees: Number(item.fees || 0),
        plan: item.plan || null
      })),
      subscriptions: recurring
    });
  } catch (error) {
    console.error("Donation admin Paystack error:", error);
    return json(res, 500, { error: error?.message || "Unable to load Paystack donation data." });
  }
}
