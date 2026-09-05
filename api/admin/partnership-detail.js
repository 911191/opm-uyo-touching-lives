import { getPool } from "../../lib/db.js";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

async function isAdmin(req) {
  const cookie = req.headers.cookie || "";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!cookie || !host) return false;
  const proto = req.headers["x-forwarded-proto"] || "https";
  try {
    const r = await fetch(`${proto}://${host}/api/admin/me`, {
      headers: { cookie },
      cache: "no-store"
    });
    return r.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  if (!(await isAdmin(req))) return send(res, 401, { error: "Unauthorized" });

  const id = Number(req.query?.id);
  if (!Number.isInteger(id) || id < 1) return send(res, 400, { error: "Invalid partnership application ID." });

  try {
    const pool = getPool();
    await pool.query(`ALTER TABLE partnership_applications ADD COLUMN IF NOT EXISTS partnership_type text`);
    const result = await pool.query(`SELECT id, organization_name, contact_name, email, phone, partnership_type, message, status, created_at, updated_at FROM partnership_applications WHERE id=$1 LIMIT 1`, [id]);
    if (!result.rows.length) return send(res, 404, { error: "Partnership / CSR application not found." });
    return send(res, 200, { ok: true, item: result.rows[0] });
  } catch (error) {
    console.error("Partnership detail error:", error);
    return send(res, 500, { error: "Unable to load the partnership application details." });
  }
}
