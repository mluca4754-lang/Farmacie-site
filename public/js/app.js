/**
 * Farmacia Moldova — Frontend Principal (Pagina Publică)
 */

(function () {
  'use strict';

  // ──────────────────────────────────────
  //  State
  // ──────────────────────────────────────
  let allProducts = [];
  let activeCategory = 'all';
  let searchQuery = '';

  // ──────────────────────────────────────
  //  DOM Elements
  // ──────────────────────────────────────
  const productsGrid = document.getElementById('products-grid');
  const loadingEl = document.getElementById('loading');
  const emptyState = document.getElementById('empty-state');
  const filterBar = document.getElementById('filter-bar');
  const searchInput = document.getElementById('search-input');
  const statProducts = document.getElementById('stat-products');
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');
  const header = document.getElementById('header');

  // ──────────────────────────────────────
  //  Init
  // ──────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setupScrollEffects();
    setupHamburger();
    setupSearch();
    await loadProducts();
  }

  // ──────────────────────────────────────
  //  API
  // ──────────────────────────────────────
  async function loadProducts() {
    loadingEl.style.display = 'block';
    productsGrid.style.display = 'none';
    emptyState.style.display = 'none';

    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Eroare la încărcarea produselor');
      allProducts = await res.json();
      
      // Actualizăm statistica din hero
      if (statProducts) {
        animateCounter(statProducts, allProducts.length);
      }

      // Generăm filtrele de categorii
      buildCategoryFilters();

      // Afișăm produsele
      renderProducts();
    } catch (err) {
      console.error(err);
      loadingEl.innerHTML = '<p style="color: var(--accent-red);">❌ Eroare la încărcarea produselor. Reîncarcă pagina.</p>';
    }
  }

  // ──────────────────────────────────────
  //  Category Filters
  // ──────────────────────────────────────
  function buildCategoryFilters() {
    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
    
    // Păstrăm butonul "Toate" și adăugăm categoriile
    filterBar.innerHTML = '<button class="filter-btn active" data-category="all" id="filter-all">Toate</button>';
    
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.dataset.category = cat;
      btn.textContent = cat;
      filterBar.appendChild(btn);
    });

    // Event listeners
    filterBar.addEventListener('click', (e) => {
      if (!e.target.classList.contains('filter-btn')) return;
      
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      activeCategory = e.target.dataset.category;
      renderProducts();
    });
  }

  // ──────────────────────────────────────
  //  Search
  // ──────────────────────────────────────
  function setupSearch() {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderProducts();
      }, 200);
    });
  }

  // ──────────────────────────────────────
  //  Render Products
  // ──────────────────────────────────────
  function renderProducts() {
    let filtered = allProducts;

    // Filtrare pe categorie
    if (activeCategory !== 'all') {
      filtered = filtered.filter(p => p.category === activeCategory);
    }

    // Filtrare pe căutare
    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchQuery) ||
        (p.description && p.description.toLowerCase().includes(searchQuery)) ||
        (p.category && p.category.toLowerCase().includes(searchQuery))
      );
    }

    loadingEl.style.display = 'none';

    if (filtered.length === 0) {
      productsGrid.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    productsGrid.style.display = 'grid';
    productsGrid.innerHTML = filtered.map((p, i) => createProductCard(p, i)).join('');
  }

  function createProductCard(product, index) {
    const inStock = product.stock > 0;
    const badgeClass = inStock ? 'badge-in-stock' : 'badge-out-of-stock';
    const badgeText = inStock ? 'În stoc' : 'Stoc epuizat';
    const stockDotClass = inStock ? 'green' : 'red';
    const stockText = inStock ? `${product.stock} buc.` : 'Indisponibil';
    const delay = Math.min(index * 0.05, 0.5);
    
    const defaultImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22300%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Ctext%20x%3D%22200%22%20y%3D%22150%22%20font-family%3D%22sans-serif%22%20font-size%3D%2216%22%20fill%3D%22%2394a3b8%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3EFarmacia%20Moldova%3C%2Ftext%3E%3C%2Fsvg%3E';
    const imgSrc = product.image || defaultImg;

    return `
      <article class="product-card" style="animation-delay: ${delay}s">
        <div class="product-card-img-wrap">
          <img class="product-card-img" src="${escapeHTML(imgSrc)}" alt="${escapeHTML(product.name)}" loading="lazy"
               onerror="this.src='${defaultImg}'">
          <span class="product-card-badge ${badgeClass}">${badgeText}</span>
          ${product.requires_prescription ? '<span class="product-card-rx">💊 Rețetă</span>' : ''}
          ${product.category ? `<span class="product-card-category">${escapeHTML(product.category)}</span>` : ''}
        </div>
        <div class="product-card-body">
          <h3 class="product-card-name">${escapeHTML(product.name)}</h3>
          ${product.description ? `<p class="product-card-desc">${escapeHTML(product.description)}</p>` : ''}
          <div class="product-card-footer">
            <div class="product-card-price">
              ${product.old_price ? `<span class="product-old-price">${formatPrice(product.old_price)} MDL</span>` : ''}
              ${formatPrice(product.price)} <span>MDL</span>
            </div>
            <div class="product-card-stock">
              <span class="stock-dot ${stockDotClass}"></span>
              ${stockText}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  // ──────────────────────────────────────
  //  UI Helpers
  // ──────────────────────────────────────
  function setupScrollEffects() {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  function setupHamburger() {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      nav.classList.toggle('open');
    });

    // Închidem meniul la click pe un link
    nav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        nav.classList.remove('open');
      });
    });
  }

  function animateCounter(el, target) {
    let current = 0;
    const step = Math.ceil(target / 30);
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(interval);
      }
      el.textContent = current;
    }, 30);
  }

  function formatPrice(price) {
    return parseFloat(price).toFixed(2);
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
