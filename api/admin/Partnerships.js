import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partnership_applications (
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

  // Older database versions may not contain this newer field.
  await pool.query(`ALTER TABLE partnership_applications ADD COLUMN IF NOT EXISTS partnership_type TEXT`);
}

export default async function handler(req, res) {
  // Await works whether requireAdmin is synchronous or asynchronous.
  if (!(await requireAdmin(req, res))) return;

  if (req.method !== "GET" && req.method !== "DELETE") {
    return send(res, 405, { error: "Method not allowed" });
  }

  try {
    const pool = getPool();
    await ensureTable(pool);

    if (req.method === "GET") {
      const rawId = req.query?.id;

      if (rawId !== undefined && rawId !== "") {
        const id = Number(rawId);
        if (!Number.isSafeInteger(id) || id < 1) {
          return send(res, 400, { error: "Invalid partnership application ID." });
        }

        const result = await pool.query(
          `SELECT id, organization_name, contact_name, email, phone,
                  partnership_type, message, status, created_at, updated_at
             FROM partnership_applications
            WHERE id = $1
            LIMIT 1`,
          [id]
        );

        if (!result.rows.length) {
          return send(res, 404, { error: "Partnership / CSR application not found." });
        }

        return send(res, 200, { ok: true, item: result.rows[0] });
      }

      const result = await pool.query(
        `SELECT id, organization_name, contact_name, email, phone,
                partnership_type, message, status, created_at, updated_at
           FROM partnership_applications
          ORDER BY created_at DESC NULLS LAST, id DESC`
      );

      return send(res, 200, { ok: true, items: result.rows });
    }

    const id = Number(req.query?.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return send(res, 400, { error: "Invalid partnership application ID." });
    }

    const result = await pool.query(
      `DELETE FROM partnership_applications WHERE id = $1 RETURNING id`,
      [id]
    );

    if (!result.rows.length) {
      return send(res, 404, { error: "Partnership / CSR application not found." });
    }

    return send(res, 200, { ok: true, deleted: result.rows[0].id });
  } catch (error) {
    console.error("Partnership admin error:", error);
    return send(res, 500, {
      error: "Partnership / CSR database request failed. The existing admin session is still protected."
    });
  }
}


