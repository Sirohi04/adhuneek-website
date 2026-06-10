const productGrid = document.querySelector("#productGrid");
const filters = document.querySelector("#filters");
const selectedItems = document.querySelector("#selectedItems");
const quoteForm = document.querySelector("#quoteForm");
const formStatus = document.querySelector("#formStatus");
const selected = new Map();

let products = [];
let activeCategory = "All";

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
  const visible = activeCategory === "All"
    ? products
    : products.filter(product => product.category === activeCategory);

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
          <span>${product.featured ? "Featured" : "Catalog item"}</span>
        </div>
        <button class="secondary add-enquiry" data-id="${product.id}">Add to enquiry</button>
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
      selected.set(product.id, product);
      renderSelected();
      document.querySelector("#quote").scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
