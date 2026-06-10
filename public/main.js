const productGrid = document.querySelector("#productGrid");
const filters = document.querySelector("#filters");
const productSearch = document.querySelector("#productSearch");
const publicRateGrid = document.querySelector("#publicRateGrid");
const selectedItems = document.querySelector("#selectedItems");
const quoteForm = document.querySelector("#quoteForm");
const formStatus = document.querySelector("#formStatus");
const productModal = document.querySelector("#productModal");
const modalContent = document.querySelector("#modalContent");
const modalClose = document.querySelector("#modalClose");
const selected = new Map();

let products = [];
let activeCategory = "All";
let searchTerm = "";

document.querySelectorAll("[data-scroll]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelector(button.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
  });
});

async function loadProducts() {
  const response = await fetch("/api/products");
  const data = await response.json();
  products = data.products;
  renderFilters();
  renderProducts();
  renderPublicRateCard();
}

function renderFilters() {
  const categories = ["All", ...new Set(products.map(product => product.category))];
  filters.innerHTML = categories.map(category => `
    <button class="filter-button ${category === activeCategory ? "active" : ""}" data-category="${category}">
      ${category}
    </button>
  `).join("");

  filters.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderFilters();
      renderProducts();
    });
  });
}

function renderProducts() {
  const categoryFiltered = activeCategory === "All"
    ? products
    : products.filter(product => product.category === activeCategory);
  const visible = categoryFiltered.filter(product => {
    const haystack = `${product.name} ${product.category} ${product.sizes} ${product.material}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  productGrid.innerHTML = visible.map(product => `
    <article class="product-card reveal">
      <div class="product-image">
        <img src="${product.image}" alt="${product.name}">
      </div>
      <div class="product-content">
        <div class="tag-row">
          <span class="tag">${product.category}</span>
          <span class="tag stock">${product.stockLabel}</span>
        </div>
        <h3>${product.name}</h3>
        <p><strong>Sizes:</strong> ${product.sizes}</p>
        <p><strong>Material:</strong> ${product.material}</p>
        <div class="product-meta">
          <span>Stock ${product.stock}</span>
          <span>${Number(product.rate || 0) ? `Rate Rs. ${product.rate}` : (product.featured ? "Featured" : "Catalog item")}</span>
        </div>
        <div class="color-dots" aria-label="Available color style examples">
          <span style="--dot:#159de0"></span><span style="--dot:#19b8a4"></span><span style="--dot:#f15a4a"></span><span style="--dot:#f7d84b"></span>
        </div>
        <div class="product-actions">
          <button class="secondary quick-view" data-view="${product.id}">Quick view</button>
          <button class="secondary add-enquiry" data-id="${product.id}">Add to enquiry</button>
        </div>
      </div>
    </article>
  `).join("");

  productGrid.querySelectorAll(".product-card").forEach((card, index) => {
    card.style.transitionDelay = `${Math.min(index * 45, 220)}ms`;
  });

  observeReveals();

  productGrid.querySelectorAll("[data-id]").forEach(button => {
    button.addEventListener("click", () => {
      const product = products.find(item => item.id === button.dataset.id);
      addProductToEnquiry(product);
    });
  });

  productGrid.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      const product = products.find(item => item.id === button.dataset.view);
      openProductModal(product);
    });
  });
}

function renderPublicRateCard() {
  if (!publicRateGrid) return;
  publicRateGrid.innerHTML = products.map(product => `
    <article class="public-rate-card">
      <img src="${product.image}" alt="${product.name}">
      <div>
        <span>${product.category}</span>
        <strong>${product.name}</strong>
        <p>${product.sizes}</p>
      </div>
      <b>${Number(product.rate || 0) ? `Rs. ${product.rate}` : "On request"}</b>
    </article>
  `).join("");
}

function addProductToEnquiry(product) {
  selected.set(product.id, product);
  renderSelected();
  document.querySelector("#quote").scrollIntoView({ behavior: "smooth", block: "start" });
}

function openProductModal(product) {
  modalContent.innerHTML = `
    <div class="modal-product">
      <div class="modal-image"><img src="${product.image}" alt="${product.name}"></div>
      <div class="modal-copy">
        <p class="eyebrow">${product.category}</p>
        <h2>${product.name}</h2>
        <p><strong>Sizes:</strong> ${product.sizes}</p>
        <p><strong>Material:</strong> ${product.material}</p>
        <p><strong>Temporary rate:</strong> ${Number(product.rate || 0) ? `Rs. ${product.rate}` : "Available on request"}</p>
        <p><strong>Stock:</strong> ${product.stock} units | ${product.stockLabel}</p>
        <div class="modal-points">
          <span>Bulk enquiry ready</span>
          <span>Dealer supply focused</span>
          <span>Catalog listed item</span>
        </div>
        <button class="primary" data-modal-enquiry="${product.id}">Add to enquiry</button>
      </div>
    </div>
  `;
  productModal.classList.remove("hidden");
  modalContent.querySelector("[data-modal-enquiry]").addEventListener("click", () => {
    productModal.classList.add("hidden");
    addProductToEnquiry(product);
  });
}

function renderSelected() {
  if (!selected.size) {
    selectedItems.textContent = "No products selected yet.";
    return;
  }

  selectedItems.innerHTML = [...selected.values()].map(product => `
    <div class="selected-pill">
      <span>${product.name}</span>
      <button class="remove-item" data-remove="${product.id}" aria-label="Remove ${product.name}">Remove</button>
    </div>
  `).join("");

  selectedItems.querySelectorAll("[data-remove]").forEach(button => {
    button.addEventListener("click", () => {
      selected.delete(button.dataset.remove);
      renderSelected();
    });
  });
}

quoteForm.addEventListener("submit", async event => {
  event.preventDefault();
  formStatus.textContent = "Sending enquiry...";
  const formData = new FormData(quoteForm);
  const payload = Object.fromEntries(formData.entries());
  payload.items = [...selected.values()].map(product => ({
    id: product.id,
    name: product.name,
    category: product.category
  }));

  let data = {};
  try {
    const response = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    data = await response.json();
    if (!response.ok) {
      formStatus.textContent = data.error || "Could not send enquiry.";
      return;
    }
  } catch (error) {
    formStatus.textContent = "Backend is not reachable. Please try again.";
    return;
  }

  quoteForm.reset();
  selected.clear();
  renderSelected();
  formStatus.textContent = `Enquiry sent. Reference: ${data.inquiry.id}`;
});

productSearch?.addEventListener("input", () => {
  searchTerm = productSearch.value.trim().toLowerCase();
  renderProducts();
});

modalClose?.addEventListener("click", () => productModal.classList.add("hidden"));
productModal?.addEventListener("click", event => {
  if (event.target === productModal) productModal.classList.add("hidden");
});

loadProducts().catch(() => {
  productGrid.innerHTML = "<p>Products could not load. Please start the backend server.</p>";
});

function observeReveals() {
  const elements = document.querySelectorAll(".reveal:not(.visible)");
  if (!("IntersectionObserver" in window)) {
    elements.forEach(element => element.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  elements.forEach(element => observer.observe(element));
}

document.querySelectorAll(".section, .quality-band, .catalog-cta, .quote-section, .stats-band").forEach(element => {
  element.classList.add("reveal");
});

observeReveals();
