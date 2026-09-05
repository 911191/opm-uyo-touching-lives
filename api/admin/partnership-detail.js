import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  const id = Number(req.query?.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return send(res, 400, { error: "Invalid partnership application ID." });
  }

  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT
        id,
        organization_name,
        contact_name,
        email,
        phone,
        partnership_type,
        message,
        status,
        created_at,
        updated_at
      FROM public.partnership_applications
      WHERE id = $1
      LIMIT 1
    `, [id]);

    if (!result.rows.length) {
      return send(res, 404, { error: "Partnership / CSR application not found." });
    }

    return send(res, 200, { ok: true, item: result.rows[0] });
  } catch (error) {
    console.error("Partnership detail error:", error);
    return send(res, 500, {
      error: "Unable to load Partnership / CSR application details."
    });
  }
}

