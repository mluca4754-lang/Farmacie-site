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
    
    const imgSrc = product.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFhMjMzMiIvPjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzY0NzQ4YiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkZhcm1hY2lhIE1vbGRvdmE8L3RleHQ+PC9zdmc+';

    return `
      <article class="product-card" style="animation-delay: ${delay}s">
        <div class="product-card-img-wrap">
          <img class="product-card-img" src="${escapeHTML(imgSrc)}" alt="${escapeHTML(product.name)}" loading="lazy"
               onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzFhMjMzMiIvPjx0ZXh0IHg9IjIwMCIgeT0iMTUwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzY0NzQ4YiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkZhcm1hY2lhIE1vbGRvdmE8L3RleHQ+PC9zdmc+'">
          <span class="product-card-badge ${badgeClass}">${badgeText}</span>
          ${product.category ? `<span class="product-card-category">${escapeHTML(product.category)}</span>` : ''}
        </div>
        <div class="product-card-body">
          <h3 class="product-card-name">${escapeHTML(product.name)}</h3>
          ${product.description ? `<p class="product-card-desc">${escapeHTML(product.description)}</p>` : ''}
          <div class="product-card-footer">
            <div class="product-card-price">
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
