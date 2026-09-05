import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  // Use the existing signed HttpOnly admin session directly.
  // Do not make a server-to-server request to /api/admin/me.
  if (!requireAdmin(req, res)) return;

  try {
    const pool = getPool();

    // Ensure the table and newer detail field exist. This makes the endpoint
    // compatible with databases created by the earlier database-sync stages.
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

    await pool.query(`ALTER TABLE partnership_applications ADD COLUMN IF NOT EXISTS partnership_type TEXT`);
    await pool.query(`ALTER TABLE partnership_applications ADD COLUMN IF NOT EXISTS status TEXT`);
    await pool.query(`ALTER TABLE partnership_applications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE partnership_applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);

    if (req.method === "GET") {
      const rawId = req.query?.id;
      const id = rawId !== undefined && rawId !== "" ? Number(rawId) : null;

      if (id !== null) {
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

    if (req.method === "DELETE") {
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
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("Partnership admin error:", error);
    return send(res, 500, {
      error: "Unable to load partnership / CSR applications. Please check the database connection."
    });
  }
}

