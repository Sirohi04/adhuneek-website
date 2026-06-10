const loginPanel = document.querySelector("#loginPanel");
const loginForm = document.querySelector("#loginForm");
const loginStatus = document.querySelector("#loginStatus");
const dashboard = document.querySelector("#dashboard");
const metrics = document.querySelector("#metrics");
const stockTable = document.querySelector("#stockTable");
const inquiries = document.querySelector("#inquiries");
const productForm = document.querySelector("#productForm");
const refreshData = document.querySelector("#refreshData");
const exportCsv = document.querySelector("#exportCsv");
const exportMovements = document.querySelector("#exportMovements");
const movementForm = document.querySelector("#movementForm");
const movementProduct = document.querySelector("#movementProduct");
const reportPeriod = document.querySelector("#reportPeriod");
const periodReport = document.querySelector("#periodReport");
const productReport = document.querySelector("#productReport");
const ledgerList = document.querySelector("#ledgerList");
const adminStatus = document.querySelector("#adminStatus");
const STOCK_COLORS = ["Blue", "Red", "Green", "Pink", "White", "Yellow"];

localStorage.removeItem("adhuneekAdminToken");
let token = "";
let dashboardData = null;

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

function setAdminStatus(message, isError = false) {
  if (!adminStatus) return;
  adminStatus.textContent = message;
  adminStatus.classList.toggle("error", isError);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginStatus.textContent = "Checking password...";
  const password = new FormData(loginForm).get("password");
  let data;
  try {
    data = await requestJson("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
  } catch (error) {
    loginStatus.textContent = error.message || "Login failed.";
    return;
  }
  token = data.token;
  await loadDashboard();
});

async function loadDashboard() {
  try {
    dashboardData = await requestJson(`/api/admin/dashboard?period=${reportPeriod?.value || "day"}`, { headers: headers() });
  } catch (error) {
    localStorage.removeItem("adhuneekAdminToken");
    loginPanel.classList.remove("hidden");
    dashboard.classList.add("hidden");
    loginStatus.textContent = error.message || "Please login again.";
    return;
  }
  loginPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
  setAdminStatus("");
  renderMetrics();
  renderMovementOptions();
  renderReports();
  renderStockTable();
  renderInquiries();
  renderLedger();
}

function renderMetrics() {
  const m = dashboardData.metrics;
  metrics.innerHTML = `
    <div class="metric"><strong>${m.totalProducts}</strong><span>Products</span></div>
    <div class="metric"><strong>${m.totalStock}</strong><span>Total stock</span></div>
    <div class="metric"><strong>${m.lowStock}</strong><span>Low stock</span></div>
    <div class="metric"><strong>${m.soldUnits}</strong><span>Total sold</span></div>
  `;
}

function renderMovementOptions() {
  movementProduct.innerHTML = dashboardData.products.map(product => `
    <option value="${product.id}">${product.name} | Stock ${product.stock}</option>
  `).join("");
  movementForm.date.value = new Date().toISOString().slice(0, 10);
}

function renderReports() {
  const report = dashboardData.report;
  periodReport.innerHTML = report.byPeriod.length ? report.byPeriod.map(row => `
    <div class="report-row">
      <strong>${row.period}</strong>
      <span>Sold: ${row.sold}</span>
      <span>Stock in: ${row.added}</span>
      <span>Entries: ${row.entries}</span>
    </div>
  `).join("") : "<p>No sales or stock records yet.</p>";

  productReport.innerHTML = report.byProduct.length ? report.byProduct.map(row => `
    <div class="report-row">
      <strong>${row.productName}</strong>
      <span>Sold: ${row.sold}</span>
      <span>Stock in: ${row.added}</span>
      <span>Adjusted: ${row.adjusted}</span>
    </div>
  `).join("") : "<p>No product movement yet.</p>";
}

function renderStockTable() {
  stockTable.innerHTML = dashboardData.products.map(product => `
    <div class="stock-row" data-product="${product.id}">
      <div class="stock-thumb">
        <img src="${product.image}" alt="">
      </div>
      <div>
        <strong>${product.name}</strong>
        <span>${product.category} | ${product.sizes}</span>
      </div>
      <span class="${product.stock <= product.lowStockAt ? "stock-low" : ""}">
        ${product.stock <= product.lowStockAt ? "Low stock" : product.status}
      </span>
      <label>Stock<input type="number" min="0" value="${product.stock}" data-field="stock"></label>
      <label>Alert<input type="number" min="0" value="${product.lowStockAt}" data-field="lowStockAt"></label>
      <label>Rate<input type="number" min="0" value="${Number(product.rate || 0)}" data-field="rate"></label>
      <div class="admin-color-stock">
        <strong>Color stock</strong>
        <div class="admin-color-grid">
          ${STOCK_COLORS.map(color => `
            <label><span>${color}</span><input type="number" min="0" value="${Number((product.colorStock || {})[color] || 0)}" data-color="${color}"></label>
          `).join("")}
        </div>
      </div>
      <button class="primary" data-save="${product.id}">Save</button>
    </div>
  `).join("");

  stockTable.querySelectorAll("[data-save]").forEach(button => {
    button.addEventListener("click", () => saveProduct(button.dataset.save));
  });
}

async function saveProduct(id) {
  setAdminStatus("Saving stock...");
  const row = stockTable.querySelector(`[data-product="${id}"]`);
  const payload = {};
  row.querySelectorAll("[data-field]").forEach(input => {
    payload[input.dataset.field] = Number(input.value);
  });
  payload.colorStock = {};
  row.querySelectorAll("[data-color]").forEach(input => {
    payload.colorStock[input.dataset.color] = Number(input.value || 0);
  });
  try {
    await requestJson(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(payload)
    });
    setAdminStatus("Stock updated.");
    await loadDashboard();
  } catch (error) {
    setAdminStatus(error.message, true);
  }
}

function renderInquiries() {
  if (!dashboardData.inquiries.length) {
    inquiries.innerHTML = "<p>No enquiries yet.</p>";
    return;
  }

  const groups = ["New", "Contacted", "Quoted"];
  inquiries.innerHTML = groups.map(group => {
    const groupItems = dashboardData.inquiries.filter(inquiry => (inquiry.status || "New") === group);
    return `
      <section class="inquiry-group">
        <div class="inquiry-group-head">
          <h3>${group}</h3>
          <span>${groupItems.length}</span>
        </div>
        ${groupItems.length ? groupItems.map(renderInquiryCard).join("") : `<p class="empty-group">No ${group.toLowerCase()} enquiries.</p>`}
      </section>
    `;
  }).join("");

  inquiries.querySelectorAll("[data-inquiry]").forEach(select => {
    select.addEventListener("change", async () => {
      try {
        await requestJson(`/api/admin/inquiries/${select.dataset.inquiry}`, {
          method: "PATCH",
          headers: headers(),
          body: JSON.stringify({ status: select.value })
        });
        await loadDashboard();
      } catch (error) {
        setAdminStatus(error.message, true);
      }
    });
  });
}

function renderInquiryCard(inquiry) {
  return `
    <article class="inquiry">
      <div>
        <strong>${inquiry.name} | ${inquiry.phone}</strong>
        <p>${inquiry.business || "Business not added"} ${inquiry.city ? `| ${inquiry.city}` : ""}</p>
        <p>${inquiry.message || "No message"}</p>
        <small>${inquiry.items.map(item => item.name).join(", ") || "No products selected"} | ${new Date(inquiry.createdAt).toLocaleString()}</small>
      </div>
      <label>Status
        <select data-inquiry="${inquiry.id}">
          ${["New", "Contacted", "Quoted", "Closed"].map(status => `
            <option ${status === inquiry.status ? "selected" : ""}>${status}</option>
          `).join("")}
        </select>
      </label>
    </article>
  `;
}

function renderLedger() {
  if (!dashboardData.movements.length) {
    ledgerList.innerHTML = "<p>No stock ledger records yet.</p>";
    return;
  }

  ledgerList.innerHTML = dashboardData.movements.map(movement => `
    <article class="ledger-entry">
      <div>
        <strong>${movement.productName}</strong>
        <p>${movement.type.toUpperCase()} | Qty ${movement.quantity}${movement.color ? ` | ${movement.color}` : ""} | ${movement.date}</p>
        <small>${movement.beforeStock} to ${movement.afterStock}${movement.party ? ` | ${movement.party}` : ""}${movement.note ? ` | ${movement.note}` : ""}</small>
      </div>
      <span class="ledger-type ${movement.type}">${movement.type}</span>
    </article>
  `).join("");
}

productForm.addEventListener("submit", async event => {
  event.preventDefault();
  setAdminStatus("Adding product...");
  const payload = Object.fromEntries(new FormData(productForm).entries());
  payload.stock = Number(payload.stock || 0);
  payload.lowStockAt = Number(payload.lowStockAt || 0);
  payload.rate = Number(payload.rate || 0);
  payload.colorStock = Object.fromEntries(STOCK_COLORS.map(color => [color, 0]));
  try {
    await requestJson("/api/admin/products", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload)
    });
    productForm.reset();
    productForm.image.value = "/assets/products/bucket.jpg";
    productForm.material.value = "100% virgin plastic";
    productForm.stock.value = 100;
    productForm.lowStockAt.value = 25;
    productForm.rate.value = 0;
    setAdminStatus("Product added.");
    await loadDashboard();
  } catch (error) {
    setAdminStatus(error.message, true);
  }
});

movementForm.addEventListener("submit", async event => {
  event.preventDefault();
  setAdminStatus("Saving stock record...");
  const payload = Object.fromEntries(new FormData(movementForm).entries());
  payload.quantity = Number(payload.quantity || 0);
  try {
    await requestJson("/api/admin/movements", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload)
    });
    const previousDate = movementForm.date.value;
    movementForm.reset();
    movementForm.date.value = previousDate || new Date().toISOString().slice(0, 10);
    movementForm.quantity.value = 1;
    setAdminStatus("Stock record saved.");
    await loadDashboard();
  } catch (error) {
    setAdminStatus(error.message, true);
  }
});

refreshData.addEventListener("click", loadDashboard);
reportPeriod.addEventListener("change", loadDashboard);

exportCsv.addEventListener("click", () => {
  window.location.href = `/api/admin/export.csv?token=${encodeURIComponent(token)}`;
});

exportMovements.addEventListener("click", () => {
  window.location.href = `/api/admin/export.csv?type=movements&token=${encodeURIComponent(token)}`;
});
