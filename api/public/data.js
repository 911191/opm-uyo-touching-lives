import { getPool } from "../../lib/db.js";

const resources = {
  "training-skills": {
    table: "training_skills",
    order: "sort_order ASC, id ASC",
  },
  "news-events": {
    table: "news_events",
    order: "created_at DESC, id DESC",
  },
  gallery: {
    table: "gallery_items",
    order: "sort_order ASC, id ASC",
  },
  homepage: {
    table: "homepage_specials",
    order: "sort_order ASC, id ASC",
  },
};

function send(res, status, body) {
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, { error: "Method not allowed" });
  }

  const resourceKey = typeof req.query?.resource === "string"
    ? req.query.resource
    : "";

  const resource = resources[resourceKey];
  if (!resource) {
    return send(res, 400, {
      error: "Invalid resource",
      allowed: Object.keys(resources),
    });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM ${resource.table} ORDER BY ${resource.order}`
    );

    // Only active/published content is exposed publicly.
    let items = result.rows;
    if (resourceKey === "training-skills" || resourceKey === "gallery" || resourceKey === "homepage") {
      items = items.filter((item) => item.active !== false);
    }
    if (resourceKey === "news-events") {
      items = items.filter((item) => item.published !== false);
    }

    return send(res, 200, { ok: true, items });
  } catch (error) {
    console.error("Public database API error:", error);
    return send(res, 500, {
      error: "Unable to load public content",
    });
  }
}
