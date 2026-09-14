import { requireAdmin } from "../../lib/admin-session.js";

function send(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: "Method not allowed" });
  }

  if (!requireAdmin(req, res)) return;

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return send(res, 500, { error: "PAYSTACK_SECRET_KEY is not configured." });
  }

  try {
    const subscriptions = [];
    let page = 1;
    let pageCount = 1;

    while (page <= 10 && page <= pageCount) {
      const response = await fetch(`https://api.paystack.co/subscription?perPage=100&page=${page}`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store"
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.status !== true) {
        const detail = payload?.message || `Paystack returned HTTP ${response.status}`;
        return send(res, 502, { error: `Unable to load recurring supporters: ${detail}` });
      }

      if (Array.isArray(payload.data)) subscriptions.push(...payload.data);
      pageCount = Number(payload?.meta?.pageCount || 1);
      page += 1;
    }

    const active = subscriptions
      .filter((item) => String(item?.status || "").toLowerCase() === "active")
      .filter((item) => ["monthly", "quarterly"].includes(String(item?.plan?.interval || "").toLowerCase()))
      .map((item) => ({
        id: item.id,
        subscription_code: item.subscription_code,
        status: item.status,
        amount: item.amount,
        interval: item?.plan?.interval || null,
        plan_name: item?.plan?.name || null,
        plan_code: item?.plan?.plan_code || null,
        currency: item?.plan?.currency || "NGN",
        next_payment_date: item.next_payment_date || null,
        start: item.start || null,
        created_at: item.createdAt || null,
        updated_at: item.updatedAt || null,
        first_name: item?.customer?.first_name || "",
        last_name: item?.customer?.last_name || "",
        email: item?.customer?.email || "",
        phone: item?.customer?.phone || "",
        customer_code: item?.customer?.customer_code || "",
        channel: item?.authorization?.channel || "",
        brand: item?.authorization?.brand || ""
      }));

    active.sort((a, b) => String(a.next_payment_date || "9999").localeCompare(String(b.next_payment_date || "9999")));

    return send(res, 200, {
      items: active,
      count: active.length,
      source: "paystack",
      supported_intervals: ["monthly", "quarterly"]
    });
  } catch (error) {
    return send(res, 500, {
      error: error?.message || "Unable to load recurring supporters."
    });
  }
}
