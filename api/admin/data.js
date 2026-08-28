import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

const resources = {
  "training-skills": {
    table: "training_skills",
    fields: ["name", "description", "active", "sort_order"],
    order: "sort_order ASC, id ASC",
  },
  applications: {
    table: "training_applications",
    fields: [
      "full_name",
      "email",
      "phone",
      "preferred_skill",
      "message",
      "status",
    ],
    order: "created_at DESC, id DESC",
  },
  "news-events": {
    table: "news_events",
    fields: [
      "item_type",
      "title",
      "summary",
      "content",
      "image_url",
      "event_date",
      "published",
    ],
    order: "created_at DESC, id DESC",
  },
  gallery: {
    table: "gallery_items",
    fields: ["title", "description", "image_url", "active", "sort_order"],
    order: "sort_order ASC, id ASC",
  },
  homepage: {
    table: "homepage_specials",
    fields: ["title", "description", "image_url", "active", "sort_order"],
    order: "sort_order ASC, id ASC",
  },
  partnerships: {
    table: "partnership_applications",
    fields: [
      "organization_name",
      "contact_name",
      "email",
      "phone",
      "message",
      "status",
    ],
    order: "created_at DESC, id DESC",
  },
};

function getResource(req, res) {
  const key = req.query?.resource;
  const resource = resources[key];

  if (!resource) {
    res.status(400).json({
      error: "Invalid resource",
      allowed: Object.keys(resources),
    });
    return null;
  }

  return resource;
}

function cleanPayload(resource, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const payload = {};

  for (const field of resource.fields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      payload[field] = body[field];
    }
  }

  return payload;
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireAdmin(req, res)) return;

  const resource = getResource(req, res);
  if (!resource) return;

  try {
    const pool = getPool();

    if (req.method === "GET") {
      const result = await pool.query(
        `SELECT * FROM ${resource.table} ORDER BY ${resource.order}`
      );
      return res.status(200).json({ ok: true, items: result.rows });
    }

    if (req.method === "POST") {
      const payload = cleanPayload(resource, req.body);
      if (!payload || Object.keys(payload).length === 0) {
        return res.status(400).json({ error: "No valid fields supplied" });
      }

      const columns = Object.keys(payload);
      const values = Object.values(payload);
      const placeholders = values.map((_, i) => `$${i + 1}`);

      const result = await pool.query(
        `INSERT INTO ${resource.table}
         (${columns.join(", ")})
         VALUES (${placeholders.join(", ")})
         RETURNING *`,
        values
      );

      return res.status(201).json({ ok: true, item: result.rows[0] });
    }

    const id = Number(req.query?.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Valid id is required" });
    }

    if (req.method === "PATCH") {
      const payload = cleanPayload(resource, req.body);
      if (!payload || Object.keys(payload).length === 0) {
        return res.status(400).json({ error: "No valid fields supplied" });
      }

      const columns = Object.keys(payload);
      const values = Object.values(payload);
      const assignments = columns.map(
        (column, i) => `${column} = $${i + 1}`
      );

      values.push(id);

      const result = await pool.query(
        `UPDATE ${resource.table}
         SET ${assignments.join(", ")}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING *`,
        values
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Item not found" });
      }

      return res.status(200).json({ ok: true, item: result.rows[0] });
    }

    const result = await pool.query(
      `DELETE FROM ${resource.table} WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    return res.status(200).json({ ok: true, deletedId: id });
  } catch (error) {
    console.error("Admin database API error:", error);
    return res.status(500).json({
      error: "Database operation failed",
    });
  }
}
