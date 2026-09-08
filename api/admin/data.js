import { getPool } from "../../lib/db.js";
import { requireAdmin } from "../../lib/admin-session.js";

const RESOURCE_MAP = {
  "training-skills": {
    table: "training_skills",
    writable: ["name", "description", "active", "sort_order"]
  },
  applications: {
    table: "training_applications",
    writable: []
  },
  "news-events": {
    table: "news_events",
    writable: ["item_type", "title", "summary", "content", "image_url", "event_date", "published"]
  },
  gallery: {
    table: "gallery_items",
    writable: ["title", "description", "image_url", "active", "sort_order"]
  },
  homepage: {
    table: "homepage_specials",
    writable: ["title", "description", "image_url", "active", "sort_order"]
  },
  partnerships: {
    table: "partnership_applications",
    writable: ["organization_name", "contact_name", "email", "phone", "partnership_type", "message", "status"]
  }
};

function json(res, status, body) {
  res.status(status).json(body);
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

async function tableExists(pool, table) {
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table]
  );
  return Boolean(result.rows[0]?.exists);
}

async function columnsFor(pool, table) {
  const result = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  return result.rows.map((row) => row.column_name);
}

async function ensurePartnershipSchema(pool) {
  const exists = await tableExists(pool, "partnership_applications");
  if (!exists) {
    await pool.query(`
      CREATE TABLE public.partnership_applications (
        id BIGSERIAL PRIMARY KEY,
        organization_name TEXT,
        contact_name TEXT,
        email TEXT,
        phone TEXT,
        partnership_type TEXT,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } else {
    const cols = new Set(await columnsFor(pool, "partnership_applications"));
    const additions = {
      organization_name: "TEXT",
      contact_name: "TEXT",
      email: "TEXT",
      phone: "TEXT",
      partnership_type: "TEXT",
      message: "TEXT",
      status: "TEXT DEFAULT 'new'",
      created_at: "TIMESTAMPTZ DEFAULT NOW()",
      updated_at: "TIMESTAMPTZ DEFAULT NOW()"
    };
    for (const [name, type] of Object.entries(additions)) {
      if (!cols.has(name)) {
        await pool.query(`ALTER TABLE public.partnership_applications ADD COLUMN ${quoteIdent(name)} ${type}`);
      }
    }
  }

  await pool.query(`UPDATE public.partnership_applications SET status = 'new' WHERE status IS NULL OR BTRIM(status) = ''`);
}

async function getConfig(pool, resource) {
  const cfg = RESOURCE_MAP[resource];
  if (!cfg) return null;
  if (resource === "partnerships") await ensurePartnershipSchema(pool);
  if (!(await tableExists(pool, cfg.table))) return { ...cfg, columns: [] };
  const columns = await columnsFor(pool, cfg.table);
  return { ...cfg, columns };
}

function safeOrder(columns) {
  if (columns.includes("sort_order")) return ` ORDER BY "sort_order" ASC NULLS LAST, "id" DESC`;
  if (columns.includes("created_at")) return ` ORDER BY "created_at" DESC, "id" DESC`;
  return ` ORDER BY "id" DESC`;
}

async function listRows(pool, cfg) {
  if (!cfg.columns.length) return [];
  const result = await pool.query(
    `SELECT * FROM public.${quoteIdent(cfg.table)}${safeOrder(cfg.columns)}`
  );
  return result.rows;
}

async function insertRow(pool, cfg, body) {
  const allowed = cfg.writable.filter((key) => cfg.columns.includes(key));
  const keys = allowed.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (!keys.length) throw new Error("No writable fields supplied.");

  const values = keys.map((key) => body[key]);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(
    `INSERT INTO public.${quoteIdent(cfg.table)} (${keys.map(quoteIdent).join(", ")})
     VALUES (${placeholders}) RETURNING *`,
    values
  );
  return result.rows[0];
}

async function patchRow(pool, cfg, id, body) {
  const allowed = cfg.writable.filter((key) => cfg.columns.includes(key));
  const keys = allowed.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (!keys.length) throw new Error("No writable fields supplied.");

  const values = keys.map((key) => body[key]);
  const assignments = keys.map((key, i) => `${quoteIdent(key)} = $${i + 1}`).join(", ");
  const idIndex = values.length + 1;
  values.push(id);

  const result = await pool.query(
    `UPDATE public.${quoteIdent(cfg.table)}
        SET ${assignments}${cfg.columns.includes("updated_at") ? `, "updated_at" = NOW()` : ""}
      WHERE "id" = $${idIndex}
      RETURNING *`,
    values
  );
  if (!result.rowCount) throw new Error("Record not found.");
  return result.rows[0];
}

async function deleteRow(pool, cfg, id) {
  const result = await pool.query(
    `DELETE FROM public.${quoteIdent(cfg.table)} WHERE "id" = $1 RETURNING id`,
    [id]
  );
  if (!result.rowCount) throw new Error("Record not found.");
}

export default async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;

  res.setHeader("Cache-Control", "no-store, max-age=0");

  const resource = String(req.query?.resource || "").trim();
  const cfgBase = RESOURCE_MAP[resource];
  if (!cfgBase) return json(res, 400, { error: "Unknown resource." });

  const pool = getPool();

  try {
    const cfg = await getConfig(pool, resource);
    const id = req.query?.id ? Number(req.query.id) : null;

    if (!cfg.columns.length) {
      return json(res, 200, { items: [] });
    }

    if (req.method === "GET") {
      if (id) {
        const result = await pool.query(
          `SELECT * FROM public.${quoteIdent(cfg.table)} WHERE "id" = $1 LIMIT 1`,
          [id]
        );
        if (!result.rowCount) return json(res, 404, { error: "Record not found." });
        return json(res, 200, { item: result.rows[0] });
      }
      return json(res, 200, { items: await listRows(pool, cfg) });
    }

    if (req.method === "POST") {
      if (resource === "applications" || resource === "partnerships") {
        return json(res, 405, { error: `${resource} submissions use their public submission endpoint.` });
      }
      const item = await insertRow(pool, cfg, req.body || {});
      return json(res, 201, { item });
    }

    if (req.method === "PATCH") {
      if (!id) return json(res, 400, { error: "Record id is required." });
      const item = await patchRow(pool, cfg, id, req.body || {});
      return json(res, 200, { item });
    }

    if (req.method === "DELETE") {
      if (!id) return json(res, 400, { error: "Record id is required." });
      await deleteRow(pool, cfg, id);
      return json(res, 200, { success: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return json(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("admin/data error", {
      resource,
      method: req.method,
      message: error?.message,
      code: error?.code
    });
    return json(res, 500, {
      error: "Database operation failed",
      detail: error?.message || "Unknown database error."
    });
  }
}

