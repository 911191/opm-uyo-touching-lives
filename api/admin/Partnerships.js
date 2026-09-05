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
  if (!(await isAdmin(req))) return send(res, 401, { error: "Unauthorized" });

  try {
    const pool = getPool();

    // Keep this compatible with older partnership records while ensuring
    // the newer CSR/partnership type field exists.
    await pool.query(`ALTER TABLE partnership_applications ADD COLUMN IF NOT EXISTS partnership_type text`);

    if (req.method === "GET") {
      const id = req.query?.id ? Number(req.query.id) : null;

      if (id !== null) {
        if (!Number.isInteger(id) || id < 1) {
          return send(res, 400, { error: "Invalid partnership application ID." });
        }
        const result = await pool.query(
          `SELECT * FROM partnership_applications WHERE id=$1 LIMIT 1`,
          [id]
        );
        if (!result.rows.length) {
          return send(res, 404, { error: "Partnership / CSR application not found." });
        }
        return send(res, 200, { ok: true, item: result.rows[0] });
      }

      const result = await pool.query(
        `SELECT * FROM partnership_applications ORDER BY created_at DESC NULLS LAST, id DESC`
      );
      return send(res, 200, { ok: true, items: result.rows });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query?.id);
      if (!Number.isInteger(id) || id < 1) {
        return send(res, 400, { error: "Invalid partnership application ID." });
      }
      const result = await pool.query(
        `DELETE FROM partnership_applications WHERE id=$1 RETURNING id`,
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
    return send(res, 500, { error: "Unable to load partnership / CSR applications." });
  }
}
