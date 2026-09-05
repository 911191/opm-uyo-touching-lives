import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  if (!(await requireAdmin(req, res))) return;

  const id = Number(req.query?.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return send(res, 400, { error: "Invalid partnership application ID." });
  }

  try {
    const pool = getPool();
    const table = await pool.query(`SELECT to_regclass('public.partnership_applications') AS table_name`);
    if (!table.rows[0]?.table_name) {
      return send(res, 404, { error: "No Partnership / CSR applications table exists yet." });
    }

    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='partnership_applications'
    `);
    const available = new Set(cols.rows.map(r => r.column_name));
    const col = (name, fallback="NULL") => available.has(name) ? `p.${name}` : fallback;

    const result = await pool.query(`
      SELECT p.id,
        ${col("organization_name")} AS organization_name,
        ${col("contact_name")} AS contact_name,
        ${col("email")} AS email,
        ${col("phone")} AS phone,
        ${col("partnership_type")} AS partnership_type,
        ${col("message")} AS message,
        ${col("status", "'new'")} AS status,
        ${col("created_at")} AS created_at,
        ${col("updated_at")} AS updated_at
      FROM public.partnership_applications p
      WHERE p.id=$1 LIMIT 1
    `, [id]);

    if (!result.rows.length) return send(res, 404, { error: "Partnership / CSR application not found." });
    return send(res, 200, { ok: true, item: result.rows[0] });
  } catch (error) {
    console.error("Partnership detail error:", error);
    return send(res, 500, { error: "Unable to load the partnership application details." });
  }
}


