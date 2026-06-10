const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOURCE_DB_PATH = path.join(ROOT, "data.json");
const RUNTIME_DB_PATH = path.join("/tmp", "adhuneek-data.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "adhuneek2026";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "adhuneek_state";
const STATE_ID = "main";

function normalizeSupabaseUrl(url) {
  if (!url) return "";
  return String(url).replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function initialDb() {
  return JSON.parse(fs.readFileSync(SOURCE_DB_PATH, "utf8"));
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

function getDbPath() {
  if (!fs.existsSync(RUNTIME_DB_PATH)) {
    fs.copyFileSync(SOURCE_DB_PATH, RUNTIME_DB_PATH);
  }
  return RUNTIME_DB_PATH;
}

async function readDb() {
  if (hasSupabase()) {
    const url = `${normalizeSupabaseUrl(SUPABASE_URL)}/rest/v1/${SUPABASE_TABLE}?id=eq.${STATE_ID}&select=data`;
    const response = await fetch(url, { headers: supabaseHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error(`Supabase read failed: ${response.status} ${await response.text()}`);
    const rows = await response.json();
    if (rows[0] && rows[0].data) return rows[0].data;
    const db = initialDb();
    await writeDb(db);
    return db;
  }
  return JSON.parse(fs.readFileSync(getDbPath(), "utf8"));
}

async function writeDb(db) {
  if (hasSupabase()) {
    const url = `${normalizeSupabaseUrl(SUPABASE_URL)}/rest/v1/${SUPABASE_TABLE}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { ...supabaseHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ id: STATE_ID, data: db, updated_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error(`Supabase write failed: ${response.status} ${await response.text()}`);
    return;
  }
  fs.writeFileSync(getDbPath(), JSON.stringify(db, null, 2));
}

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function isAdmin(req) {
  const auth = req.headers.authorization || "";
  const token = req.query && req.query.token;
  return auth === `Bearer ${ADMIN_PASSWORD}` || token === ADMIN_PASSWORD;
}

function ensureMovements(db) {
  if (!Array.isArray(db.movements)) db.movements = [];
}

function publicProducts(db) {
  return db.products.map(product => ({
    ...product,
    stockLabel: product.stock <= product.lowStockAt ? "Limited stock" : "Ready for bulk orders"
  }));
}

function periodKey(dateText, period) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (period === "year") return year;
  if (period === "month") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function movementReport(db, period = "day") {
  ensureMovements(db);
  const productMap = new Map(db.products.map(product => [product.id, product]));
  const buckets = new Map();
  const productTotals = new Map();
  let sold = 0;
  let added = 0;

  db.movements.forEach(movement => {
    const product = productMap.get(movement.productId);
    const quantity = Number(movement.quantity || 0);
    const key = periodKey(movement.date || movement.createdAt, period);
    const type = movement.type || "sale";
    if (!buckets.has(key)) buckets.set(key, { period: key, sold: 0, added: 0, adjusted: 0, entries: 0 });
    const bucket = buckets.get(key);
    bucket.entries += 1;
    if (type === "sale") {
      bucket.sold += quantity;
      sold += quantity;
    } else if (type === "restock") {
      bucket.added += quantity;
      added += quantity;
    } else {
      bucket.adjusted += quantity;
    }

    if (!productTotals.has(movement.productId)) {
      productTotals.set(movement.productId, {
        productId: movement.productId,
        productName: product ? product.name : movement.productName || movement.productId,
        sold: 0,
        added: 0,
        adjusted: 0
      });
    }
    const total = productTotals.get(movement.productId);
    if (type === "sale") total.sold += quantity;
    if (type === "restock") total.added += quantity;
    if (type === "adjustment") total.adjusted += quantity;
  });

  return {
    period,
    totals: { sold, added, entries: db.movements.length },
    byPeriod: [...buckets.values()].sort((a, b) => b.period.localeCompare(a.period)),
    byProduct: [...productTotals.values()].sort((a, b) => b.sold - a.sold)
  };
}

function csv(rows) {
  return rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const pathQuery = Array.isArray(req.query.path) ? req.query.path.join("/") : req.query.path;
  const endpoint = pathQuery ? `/${pathQuery}` : (req.url.replace(/^\/api/, "").split("?")[0] || "/");

  if (req.method === "GET" && endpoint === "/health") {
    res.status(200).json({
      ok: true,
      storage: hasSupabase() ? "supabase" : "temporary",
      supabaseUrlConfigured: Boolean(SUPABASE_URL),
      serviceRoleConfigured: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      table: SUPABASE_TABLE
    });
    return;
  }

  const db = await readDb();

  if (req.method === "GET" && endpoint === "/products") {
    res.status(200).json({ company: db.company, products: publicProducts(db) });
    return;
  }

  if (req.method === "POST" && endpoint === "/inquiries") {
    const body = bodyOf(req);
    const inquiry = {
      id: `INQ-${Date.now()}`,
      name: String(body.name || "").trim(),
      phone: String(body.phone || "").trim(),
      business: String(body.business || "").trim(),
      city: String(body.city || "").trim(),
      message: String(body.message || "").trim(),
      items: Array.isArray(body.items) ? body.items : [],
      status: "New",
      createdAt: new Date().toISOString()
    };
    if (!inquiry.name || !inquiry.phone) {
      res.status(400).json({ error: "Name and phone are required." });
      return;
    }
    db.inquiries.unshift(inquiry);
    await writeDb(db);
    res.status(201).json({ inquiry });
    return;
  }

  if (req.method === "POST" && endpoint === "/admin/login") {
    if (bodyOf(req).password === ADMIN_PASSWORD) {
      res.status(200).json({ token: ADMIN_PASSWORD });
      return;
    }
    res.status(401).json({ error: "Invalid password." });
    return;
  }

  if (!endpoint.startsWith("/admin/")) {
    res.status(404).json({ error: "Endpoint not found." });
    return;
  }

  if (!isAdmin(req)) {
    res.status(401).json({ error: "Admin authorization required." });
    return;
  }

  if (req.method === "GET" && endpoint === "/admin/dashboard") {
    ensureMovements(db);
    const lowStock = db.products.filter(p => Number(p.stock) <= Number(p.lowStockAt));
    res.status(200).json({
      company: db.company,
      products: db.products,
      inquiries: db.inquiries,
      movements: db.movements.slice(0, 30),
      report: movementReport(db, req.query.period || "day"),
      metrics: {
        totalProducts: db.products.length,
        totalStock: db.products.reduce((sum, p) => sum + Number(p.stock || 0), 0),
        lowStock: lowStock.length,
        newInquiries: db.inquiries.filter(i => i.status === "New").length,
        soldUnits: db.movements.filter(m => m.type === "sale").reduce((sum, m) => sum + Number(m.quantity || 0), 0)
      }
    });
    return;
  }

  if (req.method === "POST" && endpoint === "/admin/movements") {
    ensureMovements(db);
    const body = bodyOf(req);
    const product = db.products.find(p => p.id === body.productId);
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    const type = ["sale", "restock", "adjustment"].includes(body.type) ? body.type : "sale";
    const quantity = Math.max(0, Number(body.quantity || 0));
    if (!quantity) {
      res.status(400).json({ error: "Quantity is required." });
      return;
    }
    const beforeStock = Number(product.stock || 0);
    let afterStock = beforeStock;
    if (type === "sale") afterStock = Math.max(0, beforeStock - quantity);
    if (type === "restock") afterStock = beforeStock + quantity;
    if (type === "adjustment") afterStock = quantity;
    product.stock = afterStock;
    const movement = {
      id: `MOV-${Date.now()}`,
      type,
      productId: product.id,
      productName: product.name,
      quantity,
      beforeStock,
      afterStock,
      party: String(body.party || "").trim(),
      note: String(body.note || "").trim(),
      date: String(body.date || new Date().toISOString().slice(0, 10)),
      createdAt: new Date().toISOString()
    };
    db.movements.unshift(movement);
    await writeDb(db);
    res.status(201).json({ movement, product, report: movementReport(db, "day") });
    return;
  }

  if (req.method === "GET" && endpoint === "/admin/reports") {
    res.status(200).json(movementReport(db, req.query.period || "day"));
    return;
  }

  if (req.method === "POST" && endpoint === "/admin/products") {
    const body = bodyOf(req);
    const id = String(body.id || body.name || `product-${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const product = {
      id,
      name: String(body.name || "New Product"),
      category: String(body.category || "General"),
      sizes: String(body.sizes || "Custom"),
      material: String(body.material || "Virgin plastic"),
      image: String(body.image || "/assets/products/bucket.jpg"),
      stock: Number(body.stock || 0),
      lowStockAt: Number(body.lowStockAt || 50),
      status: String(body.status || "In stock"),
      featured: Boolean(body.featured)
    };
    db.products.unshift(product);
    await writeDb(db);
    res.status(201).json({ product });
    return;
  }

  const productMatch = endpoint.match(/^\/admin\/products\/([^/]+)$/);
  if (productMatch && req.method === "PATCH") {
    const product = db.products.find(p => p.id === productMatch[1]);
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    const body = bodyOf(req);
    ["name", "category", "sizes", "material", "image", "status"].forEach(key => {
      if (body[key] !== undefined) product[key] = String(body[key]);
    });
    ["stock", "lowStockAt"].forEach(key => {
      if (body[key] !== undefined) product[key] = Number(body[key]);
    });
    if (body.featured !== undefined) product.featured = Boolean(body.featured);
    await writeDb(db);
    res.status(200).json({ product });
    return;
  }

  const inquiryMatch = endpoint.match(/^\/admin\/inquiries\/([^/]+)$/);
  if (inquiryMatch && req.method === "PATCH") {
    const inquiry = db.inquiries.find(i => i.id === inquiryMatch[1]);
    if (!inquiry) {
      res.status(404).json({ error: "Inquiry not found." });
      return;
    }
    inquiry.status = String(bodyOf(req).status || inquiry.status);
    await writeDb(db);
    res.status(200).json({ inquiry });
    return;
  }

  if (req.method === "GET" && endpoint === "/admin/export.csv") {
    ensureMovements(db);
    const rows = req.query.type === "movements"
      ? [
          ["id", "date", "type", "product", "quantity", "beforeStock", "afterStock", "party", "note"],
          ...db.movements.map(m => [m.id, m.date, m.type, m.productName, m.quantity, m.beforeStock, m.afterStock, m.party, m.note])
        ]
      : [
          ["id", "name", "category", "sizes", "stock", "lowStockAt", "status"],
          ...db.products.map(p => [p.id, p.name, p.category, p.sizes, p.stock, p.lowStockAt, p.status])
        ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.status(200).send(csv(rows));
    return;
  }

  res.status(404).json({ error: "Endpoint not found." });
}

module.exports = async function wrappedHandler(req, res) {
  try {
    await handler(req, res);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Server error",
      storage: hasSupabase() ? "supabase" : "temporary"
    });
  }
};
