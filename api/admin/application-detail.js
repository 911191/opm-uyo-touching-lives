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
  if (!Number.isInteger(id) || id < 1) return send(res, 400, { error: "Invalid application ID." });

  try {
    const pool = getPool();
    await pool.query(`ALTER TABLE training_applications ADD COLUMN IF NOT EXISTS date_of_birth text, ADD COLUMN IF NOT EXISTS gender text, ADD COLUMN IF NOT EXISTS address text, ADD COLUMN IF NOT EXISTS reason text`);
    await pool.query(`CREATE TABLE IF NOT EXISTS training_application_private (id BIGSERIAL PRIMARY KEY, application_id BIGINT NOT NULL UNIQUE REFERENCES training_applications(id) ON DELETE CASCADE, passport_data TEXT NOT NULL, passport_type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);

    const result = await pool.query(`SELECT id, full_name, email, phone, preferred_skill, message, status, date_of_birth, gender, address, reason, created_at, updated_at FROM training_applications WHERE id=$1 LIMIT 1`, [id]);
    if (!result.rows.length) return send(res, 404, { error: "Training application not found." });

    const privateResult = await pool.query(`SELECT passport_data, passport_type, created_at FROM training_application_private WHERE application_id=$1 LIMIT 1`, [id]);
    const item = result.rows[0];
    if (privateResult.rows.length) Object.assign(item, privateResult.rows[0]);

    return send(res, 200, { ok: true, item });
  } catch (error) {
    console.error("Application detail error:", error);
    return send(res, 500, { error: "Unable to load the training application details." });
  }
}
