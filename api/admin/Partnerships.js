import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

// This endpoint intentionally does READ/DELETE work only.
// It does not ALTER the table on every request. The public submission endpoint
// is responsible for adding partnership_type when needed.
const SELECT_FIELDS = `
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
`;

async function listApplications(pool) {
  const result = await pool.query(`
    SELECT ${SELECT_FIELDS}
    FROM public.partnership_applications
    ORDER BY created_at DESC NULLS LAST, id DESC
  `);
  return result.rows;
}

async function getApplication(pool, id) {
  const result = await pool.query(`
    SELECT ${SELECT_FIELDS}
    FROM public.partnership_applications
    WHERE id = $1
    LIMIT 1
  `, [id]);
  return result.rows[0] || null;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method !== "GET" && req.method !== "DELETE") {
    return send(res, 405, { error: "Method not allowed" });
  }

  try {
    const pool = getPool();
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
      error: "Unable to load Partnership / CSR applications. Please check the partnership_applications database table."
    });
  }
}


