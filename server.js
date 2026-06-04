const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DB_PATH = path.join(ROOT, "data.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "adhuneek2026";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml"
};

function readDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.includes("json") ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function isAdmin(req, url = null) {
  const requestUrl = url || new URL(req.url, `http://${req.headers.host}`);
  return req.headers.authorization === `Bearer ${ADMIN_PASSWORD}` || requestUrl.searchParams.get("token") === ADMIN_PASSWORD;
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(PUBLIC, rawPath));
  if (!filePath.startsWith(PUBLIC)) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    res.end(content);
  });
}

function publicProducts(db) {
  return db.products.map(product => ({
    ...product,
    stockLabel: product.stock <= product.lowStockAt ? "Limited stock" : "Ready for bulk orders"
  }));
}

function ensureMovements(db) {
  if (!Array.isArray(db.movements)) db.movements = [];
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
    if (!buckets.has(key)) {
      buckets.set(key, { period: key, sold: 0, added: 0, adjusted: 0, entries: 0 });
    }
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

    const productKey = movement.productId;
    if (!productTotals.has(productKey)) {
      productTotals.set(productKey, {
        productId: productKey,
        productName: product ? product.name : movement.productName || productKey,
        sold: 0,
        added: 0,
        adjusted: 0
      });
    }
    const total = productTotals.get(productKey);
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

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = readDb();

  if (req.method === "GET" && url.pathname === "/api/products") {
    send(res, 200, { company: db.company, products: publicProducts(db) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/inquiries") {
    const body = await readBody(req);
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
      send(res, 400, { error: "Name and phone are required." });
      return;
    }
    db.inquiries.unshift(inquiry);
    writeDb(db);
    send(res, 201, { inquiry });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readBody(req);
    if (body.password === ADMIN_PASSWORD) {
      send(res, 200, { token: ADMIN_PASSWORD });
      return;
    }
    send(res, 401, { error: "Invalid password." });
    return;
  }

  if (!url.pathname.startsWith("/api/admin/")) {
    send(res, 404, { error: "Endpoint not found." });
    return;
  }

  if (!isAdmin(req, url)) {
    send(res, 401, { error: "Admin authorization required." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/dashboard") {
    ensureMovements(db);
    const lowStock = db.products.filter(p => Number(p.stock) <= Number(p.lowStockAt));
    send(res, 200, {
      company: db.company,
      products: db.products,
      inquiries: db.inquiries,
      movements: db.movements.slice(0, 30),
      report: movementReport(db, url.searchParams.get("period") || "day"),
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

  if (req.method === "POST" && url.pathname === "/api/admin/movements") {
    ensureMovements(db);
    const body = await readBody(req);
    const product = db.products.find(p => p.id === body.productId);
    if (!product) {
      send(res, 404, { error: "Product not found." });
      return;
    }
    const type = ["sale", "restock", "adjustment"].includes(body.type) ? body.type : "sale";
    const quantity = Math.max(0, Number(body.quantity || 0));
    if (!quantity) {
      send(res, 400, { error: "Quantity is required." });
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
    writeDb(db);
    send(res, 201, { movement, product, report: movementReport(db, "day") });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/reports") {
    send(res, 200, movementReport(db, url.searchParams.get("period") || "day"));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/products") {
    const body = await readBody(req);
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
    writeDb(db);
    send(res, 201, { product });
    return;
  }

  const productMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const product = db.products.find(p => p.id === productMatch[1]);
    if (!product) {
      send(res, 404, { error: "Product not found." });
      return;
    }
    ["name", "category", "sizes", "material", "image", "status"].forEach(key => {
      if (body[key] !== undefined) product[key] = String(body[key]);
    });
    ["stock", "lowStockAt"].forEach(key => {
      if (body[key] !== undefined) product[key] = Number(body[key]);
    });
    if (body.featured !== undefined) product.featured = Boolean(body.featured);
    writeDb(db);
    send(res, 200, { product });
    return;
  }

  const inquiryMatch = url.pathname.match(/^\/api\/admin\/inquiries\/([^/]+)$/);
  if (inquiryMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const inquiry = db.inquiries.find(i => i.id === inquiryMatch[1]);
    if (!inquiry) {
      send(res, 404, { error: "Inquiry not found." });
      return;
    }
    inquiry.status = String(body.status || inquiry.status);
    writeDb(db);
    send(res, 200, { inquiry });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/export.csv") {
    ensureMovements(db);
    const exportType = url.searchParams.get("type") || "products";
    const rows = exportType === "movements"
      ? [
          ["id", "date", "type", "product", "quantity", "beforeStock", "afterStock", "party", "note"],
          ...db.movements.map(m => [m.id, m.date, m.type, m.productName, m.quantity, m.beforeStock, m.afterStock, m.party, m.note])
        ]
      : [
          ["id", "name", "category", "sizes", "stock", "lowStockAt", "status"],
          ...db.products.map(p => [p.id, p.name, p.category, p.sizes, p.stock, p.lowStockAt, p.status])
        ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    send(res, 200, csv, "text/csv; charset=utf-8");
    return;
  }

  send(res, 404, { error: "Endpoint not found." });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch(error => send(res, 500, { error: error.message }));
    return;
  }
  serveFile(req, res);
});

server.listen(PORT, () => {
  console.log(`Adhuneek website running at http://localhost:${PORT}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
