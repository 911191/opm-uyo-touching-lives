import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const session = requireAdmin(req, res);
  if (!session) return;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const pool = getPool();
    await ensureDonationsTable(pool);

    const limitRaw = Number.parseInt(String(req.query?.limit ?? "100"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const status = String(req.query?.status ?? "").trim();

    const columns = await getColumns(pool, "donations");
    const idCol = columns.has("id") ? "id" : null;
    const createdCol = columns.has("created_at") ? "created_at" : null;
    const statusCol = columns.has("status") ? "status" : null;

    if (!idCol) {
      throw new Error("The donations table has no id column.");
    }

    const orderColumn = createdCol || idCol;
    const selected = preferredColumns(columns);
    const params = [];
    let where = "";

    if (status && statusCol) {
      params.push(status);
      where = ` WHERE status = $${params.length}`;
    }

    params.push(limit);

    const query = `
      SELECT ${selected.join(", ")}
      FROM public.donations
      ${where}
      ORDER BY ${quoteIdent(orderColumn)} DESC
      LIMIT $${params.length}
    `;

    const result = await pool.query(query, params);

    const countQuery = status && statusCol
      ? `SELECT COUNT(*)::int AS count FROM public.donations WHERE status = $1`
      : `SELECT COUNT(*)::int AS count FROM public.donations`;
    const countResult = await pool.query(
      countQuery,
      status && statusCol ? [status] : []
    );

    res.status(200).json({
      items: result.rows,
      total: countResult.rows[0]?.count ?? 0
    });
  } catch (error) {
    console.error("[admin/payments]", error);
    res.status(500).json({
      error: "Payment records could not be loaded.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

async function ensureDonationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.donations (
      id BIGSERIAL PRIMARY KEY,
      reference TEXT UNIQUE,
      amount NUMERIC(14,2),
      currency TEXT DEFAULT 'NGN',
      status TEXT DEFAULT 'pending',
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      channel TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const additions = [
    ["reference", "TEXT"],
    ["amount", "NUMERIC(14,2)"],
    ["currency", "TEXT"],
    ["status", "TEXT"],
    ["email", "TEXT"],
    ["first_name", "TEXT"],
    ["last_name", "TEXT"],
    ["phone", "TEXT"],
    ["channel", "TEXT"],
    ["paid_at", "TIMESTAMPTZ"],
    ["created_at", "TIMESTAMPTZ"],
    ["updated_at", "TIMESTAMPTZ"]
  ];

  const existing = await getColumns(pool, "donations");
  for (const [name, type] of additions) {
    if (!existing.has(name)) {
      await pool.query(`ALTER TABLE public.donations ADD COLUMN ${quoteIdent(name)} ${type}`);
    }
  }

  await pool.query(`
    UPDATE public.donations
    SET status = 'pending'
    WHERE status IS NULL OR BTRIM(status) = ''
  `);
}

async function getColumns(pool, table) {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function preferredColumns(columns) {
  const wanted = [
    "id",
    "reference",
    "amount",
    "currency",
    "status",
    "email",
    "first_name",
    "last_name",
    "phone",
    "channel",
    "paid_at",
    "created_at",
    "updated_at"
  ];

  return wanted.filter((column) => columns.has(column)).map(quoteIdent);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

