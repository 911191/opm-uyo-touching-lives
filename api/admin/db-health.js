import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireAdmin(req, res)) return;

  try {
    const pool = getPool();
    const result = await pool.query("SELECT NOW() AS server_time");
    return res.status(200).json({
      ok: true,
      database: "connected",
      serverTime: result.rows[0].server_time,
    });
  } catch (error) {
    console.error("Database health check failed:", error);
    return res.status(500).json({
      ok: false,
      error: "Database connection failed",
    });
  }
}
