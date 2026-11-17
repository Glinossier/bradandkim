import { getStore } from "@netlify/blobs";

// Shared storage for the rep follow-up pages.
// Each account is saved as its own record: <page-slug>/<account-id>
const FIELDS = ["account","contact","state","rep","type","apptStatus","apptDate"];
const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const ID_RE = /^[a-z0-9-]{1,100}$/;
const MAX_COMMENTS = 300;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const clean = (v, max) => String(v ?? "").slice(0, max);

export default async (req) => {
  const url = new URL(req.url);
  const page = url.searchParams.get("agency") || "";
  if (!SLUG_RE.test(page)) return json({ error: "Unknown page" }, 400);
  const store = getStore({ name: "rep-tracker", consistency: "strong" });

  if (req.method === "GET") {
    const { blobs } = await store.list({ prefix: page + "/" });
    const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    return json(items.filter(Boolean));
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid data" }, 400); }
    const id = String(body?.id || "");
    if (!ID_RE.test(id)) return json({ error: "Invalid account id" }, 400);
    const key = `${page}/${id}`;
    const existing = (await store.get(key, { type: "json" })) || {};
    const record = { comments: [], ...existing, id };
    const by = clean(body.by, 60);
    const now = new Date().toISOString();

    if (body.action === "comment") {
      const text = clean(body.text, 4000).trim();
      if (!text) return json({ error: "Empty comment" }, 400);
      // keep basic details so a comment on a starting account creates a usable record
      for (const f of ["account", "rep", "type"]) if (!record[f] && body[f]) record[f] = clean(body[f], 200);
      record.comments = [...(record.comments || []), { id: now + "-" + Math.random().toString(36).slice(2, 7), author: by || "Unknown", text, at: now }].slice(-MAX_COMMENTS);
    } else {
      for (const f of FIELDS) if (body[f] !== undefined) record[f] = clean(body[f], 200);
    }
    record.updatedAt = now;
    record.updatedBy = by;
    await store.setJSON(key, record);
    return json(record);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/accounts" };
