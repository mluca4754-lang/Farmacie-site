/**
 * Farmacia Moldova — Frontend Principal (Pagina Publică)
 */

(function () {
  'use strict';

  // ──────────────────────────────────────
  //  State
  // ──────────────────────────────────────
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
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
    startLiveStockPolling();
  }

  const DEFAULT_PRODUCTS = [
    {
      id: 1,
      name: 'Paracetamol 500mg',
      barcode: '5941234567890',
      description: 'Analgezic și antipiretic. Cutie cu 20 comprimate filmate. Ameliorează durerea și reduce febra.',
      price: 25.50,
      old_price: 32.00,
      stock: 150,
      image: 'https://images.unsplash.com/photo-1584308666544-ad5e1f2a6610?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: false
    },
    {
      id: 2,
      name: 'Ibuprofen 400mg',
      barcode: '5942345678901',
      description: 'Anti-inflamator nesteroidian. Cutie cu 10 comprimate. Eficient împotriva durerilor musculare și articulare.',
      price: 35.00,
      old_price: null,
      stock: 80,
      image: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: false
    },
    {
      id: 3,
      name: 'Vitamina C 1000mg',
      barcode: '5943456789012',
      description: 'Supliment alimentar. 20 comprimate efervescente cu aromă de portocale. Susține imunitatea.',
      price: 65.90,
      old_price: 79.90,
      stock: 200,
      image: 'https://images.unsplash.com/photo-1556227834-09f1de7a7d14?w=400&h=300&fit=crop',
      category: 'Suplimente',
      requires_prescription: false
    },
    {
      id: 4,
      name: 'Amoxicilină 500mg',
      barcode: '5944567890123',
      description: 'Antibiotic cu spectru larg. Cutie cu 16 capsule. Se eliberează strict pe bază de rețetă.',
      price: 42.00,
      old_price: null,
      stock: 0,
      image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: true
    },
    {
      id: 5,
      name: 'Cremă Hidratantă cu Acid Hialuronic',
      barcode: '5945678901234',
      description: 'Cosmetice dermatologice. Flacon 50ml. Hidratare intensă 24h pentru ten sensibil.',
      price: 145.00,
      old_price: 180.00,
      stock: 3,
      image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=300&fit=crop',
      category: 'Cosmetice',
      requires_prescription: false
    },
    {
      id: 6,
      name: 'Șampon Dermatologic Calmant',
      barcode: '5946789012345',
      description: 'Îngrijire personală. 250ml. Fără sulfați, reduce iritația scalpului și mâncărimea.',
      price: 98.00,
      old_price: null,
      stock: 15,
      image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=400&h=300&fit=crop',
      category: 'Îngrijire personală',
      requires_prescription: false
    },
    {
      id: 7,
      name: 'Sirop Alinare Colici Bebeluși',
      barcode: '5947890123456',
      description: 'Copii & Mămici. 100ml. Formulă naturală pe bază de mărar și mușețel pentru bebeluși.',
      price: 85.00,
      old_price: 99.00,
      stock: 4,
      image: 'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?w=400&h=300&fit=crop',
      category: 'Copii & Mămici',
      requires_prescription: false
    },
    {
      id: 8,
      name: 'Spray Nazal Xilometazolină',
      barcode: '5948901234567',
      description: 'Decongestionant nazal cu acțiune rapidă. Flacon 10ml.',
      price: 45.00,
      old_price: null,
      stock: 0,
      image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: false
    }
  ];

  // ──────────────────────────────────────
  //  API & Live Sync
  // ──────────────────────────────────────
  async function loadProducts(silent = false) {
    if (!silent) {
      loadingEl.style.display = 'block';
      productsGrid.style.display = 'none';
      emptyState.style.display = 'none';
    }

    try {
      const res = await fetch(`${API_BASE}/api/products`);
      if (!res.ok) throw new Error('Eroare rețea');
      allProducts = await res.json();
      localStorage.setItem('farmacia_products', JSON.stringify(allProducts));
    } catch (err) {
      // Fallback la localStorage sau catalogul pre-configurat cu stoc live
      const saved = localStorage.getItem('farmacia_products');
      if (saved) {
        try {
          allProducts = JSON.parse(saved);
        } catch (e) {
          allProducts = DEFAULT_PRODUCTS;
        }
      } else {
        allProducts = DEFAULT_PRODUCTS;
        localStorage.setItem('farmacia_products', JSON.stringify(DEFAULT_PRODUCTS));
      }
    }

    // Actualizăm statistica din hero
    if (statProducts && !silent) {
      animateCounter(statProducts, allProducts.length);
    } else if (statProducts) {
      statProducts.textContent = allProducts.length;
    }

    // Generăm filtrele de categorii
    if (!silent) {
      buildCategoryFilters();
    }

    // Afișăm produsele
    renderProducts();
  }

  function startLiveStockPolling() {
    // Sincronizare instantanee între tab-uri (Admin POS <-> Catalog) prin evenimentul storage
    window.addEventListener('storage', (e) => {
      if (e.key === 'farmacia_products' && e.newValue) {
        try {
          allProducts = JSON.parse(e.newValue);
          if (statProducts) statProducts.textContent = allProducts.length;
          renderProducts();
        } catch (err) {}
      }
    });

    // Polling periodic la fiecare 3 secunde pentru stoc live sincronizat cu POS-ul / serverul
    setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/products`);
        if (!res.ok) throw new Error('rețea');
        const fresh = await res.json();

        // Verificăm dacă sunt diferențe la stoc sau preț
        const currentSig = allProducts.map(p => `${p.id}:${p.stock}:${p.price}`).join('|');
        const freshSig = fresh.map(p => `${p.id}:${p.stock}:${p.price}`).join('|');

        if (currentSig !== freshSig) {
          allProducts = fresh;
          localStorage.setItem('farmacia_products', JSON.stringify(fresh));
          if (statProducts) statProducts.textContent = allProducts.length;
          renderProducts();
        }
      } catch (e) {
        // Fallback offline / local: sincronizare prin localStorage
        const saved = localStorage.getItem('farmacia_products');
        if (saved) {
          try {
            const fresh = JSON.parse(saved);
            const currentSig = allProducts.map(p => `${p.id}:${p.stock}:${p.price}`).join('|');
            const freshSig = fresh.map(p => `${p.id}:${p.stock}:${p.price}`).join('|');
            if (currentSig !== freshSig) {
              allProducts = fresh;
              if (statProducts) statProducts.textContent = allProducts.length;
              renderProducts();
            }
          } catch (err) {}
        }
      }
    }, 3000);

    // Reîmprospătare la revenirea în tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadProducts(true);
      }
    });
  }

  // ──────────────────────────────────────
  //  Category Filters
  // ──────────────────────────────────────
  function buildCategoryFilters() {
    if (!filterBar) return;
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
    const stockNum = parseInt(product.stock, 10) || 0;
    let stockDotClass = '';
    let stockText = '';
    let cardUnavailableClass = '';

    if (stockNum <= 0) {
      stockDotClass = 'red';
      stockText = 'Fără stoc';
      cardUnavailableClass = 'product-card-unavailable';
    } else if (stockNum <= 5) {
      stockDotClass = 'amber';
      stockText = `Stoc limitat · ${stockNum} buc.`;
    } else {
      stockDotClass = 'green';
      stockText = `Disponibil · ${stockNum} buc.`;
    }

    const delay = Math.min(index * 0.05, 0.35);
    const defaultImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22300%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Ctext%20x%3D%22200%22%20y%3D%22150%22%20font-family%3D%22sans-serif%22%20font-size%3D%2216%22%20fill%3D%22%2394a3b8%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3EFarmacia%20Moldova%3C%2Ftext%3E%3C%2Fsvg%3E';
    const imgSrc = product.image || defaultImg;

    const rxTag = product.requires_prescription
      ? '<span class="product-tag product-tag-rx">Rețetă obligatorie</span>'
      : '';

    return `
      <article class="product-card ${cardUnavailableClass}" data-id="${product.id}" style="animation-delay: ${delay}s">
        <div class="product-card-img-wrap">
          <img class="product-card-img" src="${escapeHTML(imgSrc)}" alt="${escapeHTML(product.name)}" loading="lazy"
               onerror="this.src='${defaultImg}'">
        </div>
        <div class="product-card-body">
          <div class="product-card-meta">
            ${product.category ? `<span class="product-tag">${escapeHTML(product.category)}</span>` : ''}
            ${rxTag}
          </div>
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
