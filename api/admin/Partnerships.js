import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

const REQUIRED_COLUMNS = {
  organization_name: "TEXT",
  contact_name: "TEXT",
  email: "TEXT",
  phone: "TEXT",
  message: "TEXT",
  status: "TEXT NOT NULL DEFAULT 'new'",
  partnership_type: "TEXT",
  created_at: "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  updated_at: "TIMESTAMPTZ NOT NULL DEFAULT NOW()"
};

async function ensureSchema(pool) {
  const exists = await pool.query(`
    SELECT to_regclass('public.partnership_applications') AS table_name
  `);

  if (!exists.rows[0]?.table_name) {
    await pool.query(`
      CREATE TABLE public.partnership_applications (
        id BIGSERIAL PRIMARY KEY,
        organization_name TEXT,
        contact_name TEXT,
        email TEXT,
        phone TEXT,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        partnership_type TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  for (const [column, definition] of Object.entries(REQUIRED_COLUMNS)) {
    await pool.query(
      `ALTER TABLE public.partnership_applications ADD COLUMN IF NOT EXISTS ${column} ${definition}`
    );
  }

  // Normalize legacy NULL statuses without disturbing existing submissions.
  await pool.query(`
    UPDATE public.partnership_applications
       SET status = 'new'
     WHERE status IS NULL
  `);
}

async function getColumns(pool) {
  const result = await pool.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'partnership_applications'
  `);
  return new Set(result.rows.map((row) => row.column_name));
}

function selectExpression(columns, name, fallback = "NULL") {
  return columns.has(name) ? `p.${name}` : fallback;
}

async function listApplications(pool) {
  const columns = await getColumns(pool);
  const created = selectExpression(columns, "created_at");
  const updated = selectExpression(columns, "updated_at");

  const result = await pool.query(`
    SELECT
      p.id,
      ${selectExpression(columns, "organization_name")} AS organization_name,
      ${selectExpression(columns, "contact_name")} AS contact_name,
      ${selectExpression(columns, "email")} AS email,
      ${selectExpression(columns, "phone")} AS phone,
      ${selectExpression(columns, "partnership_type")} AS partnership_type,
      ${selectExpression(columns, "message")} AS message,
      ${selectExpression(columns, "status", "'new'")} AS status,
      ${created} AS created_at,
      ${updated} AS updated_at
    FROM public.partnership_applications p
    ORDER BY ${created} DESC NULLS LAST, p.id DESC
  `);

  return result.rows;
}

async function getApplication(pool, id) {
  const columns = await getColumns(pool);
  const result = await pool.query(`
    SELECT
      p.id,
      ${selectExpression(columns, "organization_name")} AS organization_name,
      ${selectExpression(columns, "contact_name")} AS contact_name,
      ${selectExpression(columns, "email")} AS email,
      ${selectExpression(columns, "phone")} AS phone,
      ${selectExpression(columns, "partnership_type")} AS partnership_type,
      ${selectExpression(columns, "message")} AS message,
      ${selectExpression(columns, "status", "'new'")} AS status,
      ${selectExpression(columns, "created_at")} AS created_at,
      ${selectExpression(columns, "updated_at")} AS updated_at
    FROM public.partnership_applications p
    WHERE p.id = $1
    LIMIT 1
  `, [id]);

  return result.rows[0] || null;
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method !== "GET" && req.method !== "DELETE") {
    return send(res, 405, { error: "Method not allowed" });
  }

  try {
    const pool = getPool();
    await ensureSchema(pool);

    const rawId = req.query?.id;

    if (req.method === "GET") {
      if (rawId !== undefined && rawId !== "") {
        const id = Number(rawId);
        if (!Number.isSafeInteger(id) || id < 1) {
          return send(res, 400, { error: "Invalid partnership application ID." });
        }

        const item = await getApplication(pool, id);
        if (!item) {
          return send(res, 404, { error: "Partnership / CSR application not found." });
        }
        return send(res, 200, { ok: true, item });
      }

      const items = await listApplications(pool);
      return send(res, 200, { ok: true, items });
    }

    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) {
      return send(res, 400, { error: "Invalid partnership application ID." });
    }

    const result = await pool.query(
      `DELETE FROM public.partnership_applications WHERE id = $1 RETURNING id`,
      [id]
    );

    if (!result.rows.length) {
      return send(res, 404, { error: "Partnership / CSR application not found." });
    }

    return send(res, 200, { ok: true, deleted: result.rows[0].id });
  } catch (error) {
    console.error("Partnership admin error:", error);
    return send(res, 500, {
      error: "Partnership / CSR database request failed.",
      detail: process.env.NODE_ENV === "development" ? String(error.message || error) : undefined
    });
  }
}


