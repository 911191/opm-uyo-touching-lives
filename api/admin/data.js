import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

const resources = {
  "training-skills": {
    table: "training_skills",
    fields: ["name", "description", "active", "sort_order"],
    order: "sort_order ASC, id ASC",
    required: ["name"],
    booleans: ["active"],
    integers: ["sort_order"],
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
    required: ["full_name"],
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
    required: ["title"],
    booleans: ["published"],
    dates: ["event_date"],
  },

  gallery: {
    table: "gallery_items",
    fields: [
      "title",
      "description",
      "image_url",
      "active",
      "sort_order",
    ],
    order: "sort_order ASC, id ASC",
    required: ["image_url"],
    booleans: ["active"],
    integers: ["sort_order"],
  },

  homepage: {
    table: "homepage_specials",
    fields: [
      "title",
      "description",
      "image_url",
      "active",
      "sort_order",
    ],
    order: "sort_order ASC, id ASC",
    booleans: ["active"],
    integers: ["sort_order"],
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

/**
 * Convert database rows containing PostgreSQL bigint values
 * into JSON-safe values.
 */
function jsonSafe(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(jsonSafe);
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, val] of Object.entries(value)) {
      output[key] = jsonSafe(val);
    }

    return output;
  }

  return value;
}

/**
 * Convert common form values into database-safe values.
 */
function convertValue(resource, field, value) {
  // Boolean fields
  if (resource.booleans?.includes(field)) {
    if (value === true || value === false) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (normalized === "true" || normalized === "1" || normalized === "on") {
        return true;
      }

      if (
        normalized === "false" ||
        normalized === "0" ||
        normalized === "off"
      ) {
        return false;
      }

      if (normalized === "") {
        return undefined;
      }
    }

    return undefined;
  }

  // Integer fields
  if (resource.integers?.includes(field)) {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    const number = Number(value);

    if (!Number.isInteger(number)) {
      throw new Error(`${field} must be a valid integer`);
    }

    return number;
  }

  // Date fields
  if (resource.dates?.includes(field)) {
    if (value === "" || value === null || value === undefined) {
      return null;
    }

    if (typeof value !== "string") {
      throw new Error(`${field} must be a valid date`);
    }

    const date = value.trim();

    // Accept normal HTML date format: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`${field} must use YYYY-MM-DD format`);
    }

    return date;
  }

  // Strings
  if (typeof value === "string") {
    const trimmed = value.trim();

    // Empty optional strings become NULL.
    if (trimmed === "") {
      return null;
    }

    return trimmed;
  }

  return value;
}

/**
 * Build a safe database payload using only fields
 * explicitly allowed for that resource.
 */
function cleanPayload(resource, body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const payload = {};

  for (const field of resource.fields) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      continue;
    }

    const value = convertValue(resource, field, body[field]);

    // undefined means "do not include this field".
    if (value !== undefined) {
      payload[field] = value;
    }
  }

  // Validate required fields.
  if (!partial && resource.required) {
    for (const field of resource.required) {
      const value = payload[field];

      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      ) {
        return {
          __error: `${field} is required`,
        };
      }
    }
  }

  // Gallery image_url is NOT NULL in your database.
  if (
    resource.table === "gallery_items" &&
    !partial &&
    (!payload.image_url ||
      typeof payload.image_url !== "string" ||
      payload.image_url.trim() === "")
  ) {
    return {
      __error: "Gallery image_url is required",
    };
  }

  return payload;
}

function getId(req, res) {
  const rawId = req.query?.id;

  if (
    rawId === undefined ||
    rawId === null ||
    rawId === "" ||
    !/^\d+$/.test(String(rawId))
  ) {
    res.status(400).json({
      error: "Valid id is required",
    });

    return null;
  }

  const id = BigInt(String(rawId));

  if (id < 1n) {
    res.status(400).json({
      error: "Valid id is required",
    });

    return null;
  }

  return id;
}

export default async function handler(req, res) {
  // Only supported methods.
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  // Authentication required for every database operation.
  if (!requireAdmin(req, res)) {
    return;
  }

  const resource = getResource(req, res);

  if (!resource) {
    return;
  }

  try {
    const pool = getPool();

    /*
     * GET
     * Return all records.
     */
    if (req.method === "GET") {
      const result = await pool.query(
        `SELECT *
         FROM ${resource.table}
         ORDER BY ${resource.order}`
      );

      return res.status(200).json({
        ok: true,
        items: jsonSafe(result.rows),
      });
    }

    /*
     * POST
     * Create a new record.
     */
    if (req.method === "POST") {
      const payload = cleanPayload(resource, req.body);

      if (!payload) {
        return res.status(400).json({
          error: "Invalid request body",
        });
      }

      if (payload.__error) {
        return res.status(400).json({
          error: payload.__error,
        });
      }

      const columns = Object.keys(payload);

      if (columns.length === 0) {
        return res.status(400).json({
          error: "No valid fields supplied",
        });
      }

      const values = columns.map((column) => payload[column]);

      const placeholders = values.map(
        (_, index) => `$${index + 1}`
      );

      const result = await pool.query(
        `INSERT INTO ${resource.table}
         (${columns.join(", ")})
         VALUES (${placeholders.join(", ")})
         RETURNING *`,
        values
      );

      return res.status(201).json({
        ok: true,
        item: jsonSafe(result.rows[0]),
      });
    }

    /*
     * PATCH
     * Update an existing record.
     */
    if (req.method === "PATCH") {
      const id = getId(req, res);

      if (id === null) {
        return;
      }

      const payload = cleanPayload(resource, req.body, {
        partial: true,
      });

      if (!payload) {
        return res.status(400).json({
          error: "Invalid request body",
        });
      }

      if (payload.__error) {
        return res.status(400).json({
          error: payload.__error,
        });
      }

      const columns = Object.keys(payload);

      if (columns.length === 0) {
        return res.status(400).json({
          error: "No valid fields supplied",
        });
      }

      const values = columns.map((column) => payload[column]);

      const assignments = columns.map(
        (column, index) => `${column} = $${index + 1}`
      );

      values.push(id);

      const idPlaceholder = `$${values.length}`;

      const result = await pool.query(
        `UPDATE ${resource.table}
         SET ${assignments.join(", ")},
             updated_at = NOW()
         WHERE id = ${idPlaceholder}
         RETURNING *`,
        values
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Item not found",
        });
      }

      return res.status(200).json({
        ok: true,
        item: jsonSafe(result.rows[0]),
      });
    }

    /*
     * DELETE
     */
    if (req.method === "DELETE") {
      const id = getId(req, res);

      if (id === null) {
        return;
      }

      const result = await pool.query(
        `DELETE FROM ${resource.table}
         WHERE id = $1
         RETURNING id`,
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Item not found",
        });
      }

      return res.status(200).json({
        ok: true,
        deletedId: jsonSafe(result.rows[0].id),
      });
    }

    return res.status(405).json({
      error: "Method not allowed",
    });
  } catch (error) {
    console.error("Admin database API error:", error);

    /*
     * Keep database internals out of the browser response.
     * The complete PostgreSQL error remains available in Vercel logs.
     */
    return res.status(500).json({
      error: "Database operation failed",
    });
  }
  }
