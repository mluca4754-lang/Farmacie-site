/**
 * Farmacia Moldova — Admin Panel JavaScript
 * Sistem complet de gestiune (Dashboard, Produse CRUD, Comenzi)
 */

(function () {
  'use strict';

  // ──────────────────────────────────────
  //  State
  // ──────────────────────────────────────
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
  let token = localStorage.getItem('farmacia_token') || null;
  let products = [];
  let orders = [];
  let activeView = 'products';
  let editingProductId = null;
  let deleteProductId = null;
  let deleteOrderId = null;
  let stockProductId = null;
  let filterOnlyOutOfStock = false;

  // POS Cart & Reports State
  let posCart = []; // [{ id, name, barcode, price, stock, quantity }]
  let currentReceiptNumber = generateReceiptNumber();
  let selectedPaymentMethod = 'Numerar';
  let selectedReportDate = new Date().toISOString().split('T')[0];

  // ──────────────────────────────────────
  //  DOM Elements
  // ──────────────────────────────────────
  const loginOverlay = document.getElementById('login-overlay');
  const dashboard = document.getElementById('admin-dashboard');
  const loginForm = document.getElementById('login-form');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const sidebarOrdersBadge = document.getElementById('sidebar-orders-badge');

  const viewProducts = document.getElementById('view-products');
  const viewOrders = document.getElementById('view-orders');
  const viewReports = document.getElementById('view-reports');
  const viewAdd = document.getElementById('view-add');
  const viewTitle = document.getElementById('view-title');

  // POS Cart (Right Column) Elements
  const posCartContainer = document.getElementById('pos-cart-container');
  const posCartReceiptNo = document.getElementById('pos-cart-receipt-no');
  const posClearCartBtn = document.getElementById('pos-clear-cart-btn');
  const posCartItemsWrap = document.getElementById('pos-cart-items-wrap');
  const posCartEmptyState = document.getElementById('pos-cart-empty-state');
  const posCartItemsList = document.getElementById('pos-cart-items-list');
  const payMethodCash = document.getElementById('pay-method-cash');
  const payMethodCard = document.getElementById('pay-method-card');
  const posCartItemCount = document.getElementById('pos-cart-item-count');
  const posCartTotalPrice = document.getElementById('pos-cart-total-price');
  const posCheckoutBtn = document.getElementById('pos-checkout-btn');

  // Reports View Elements
  const reportsDateInput = document.getElementById('reports-date-input');
  const reportsTodayBtn = document.getElementById('reports-today-btn');
  const reportsRefreshBtn = document.getElementById('reports-refresh-btn');
  const repStatRevenue = document.getElementById('rep-stat-revenue');
  const repStatItems = document.getElementById('rep-stat-items');
  const repStatReceipts = document.getElementById('rep-stat-receipts');
  const repStatAvg = document.getElementById('rep-stat-avg');
  const reportsSalesTbody = document.getElementById('reports-sales-tbody');
  const reportsLoading = document.getElementById('reports-loading');

  // Receipt Modal Elements
  const receiptModal = document.getElementById('receipt-modal');
  const receiptModalClose = document.getElementById('receipt-modal-close');
  const receiptCloseBtn = document.getElementById('receipt-close-btn');
  const receiptPrintBtn = document.getElementById('receipt-print-btn');
  const receiptModalBody = document.getElementById('receipt-modal-body');

  // Stats & Alert
  const statTotal = document.getElementById('admin-stat-total');
  const statOrders = document.getElementById('admin-stat-orders');
  const statCritical = document.getElementById('admin-stat-critical');
  const outOfStockAlert = document.getElementById('out-of-stock-alert');
  const alertTitle = document.getElementById('alert-title');
  const alertDesc = document.getElementById('alert-desc');
  const filterOutOfStockBtn = document.getElementById('filter-out-of-stock-btn');

  // Products Table & Controls
  const adminTableBody = document.getElementById('admin-table-body');
  const adminLoading = document.getElementById('admin-loading');
  const adminSearch = document.getElementById('admin-search');
  const adminCategoryFilter = document.getElementById('admin-category-filter');
  const posClearSearch = document.getElementById('pos-clear-search');
  const posFeedbackMsg = document.getElementById('pos-feedback-msg');

  // Orders Table & Controls
  const ordersTableBody = document.getElementById('orders-table-body');
  const ordersLoading = document.getElementById('orders-loading');
  const ordersSearch = document.getElementById('orders-search');
  const ordersStatusFilter = document.getElementById('orders-status-filter');

  // Product Form
  const productForm = document.getElementById('product-form');
  const formTitle = document.getElementById('form-title');
  const formCancel = document.getElementById('form-cancel');
  const editIdField = document.getElementById('edit-id');
  const prodName = document.getElementById('prod-name');
  const prodBarcode = document.getElementById('prod-barcode');
  const btnGenBarcode = document.getElementById('btn-gen-barcode');
  const prodCategory = document.getElementById('prod-category');
  const prodPrice = document.getElementById('prod-price');
  const prodOldPrice = document.getElementById('prod-old-price');
  const prodStock = document.getElementById('prod-stock');
  const prodPrescription = document.getElementById('prod-prescription');
  const prescriptionLabelText = document.getElementById('prescription-label-text');
  const prodImage = document.getElementById('prod-image');
  const prodDescription = document.getElementById('prod-description');

  // Modals
  const stockModal = document.getElementById('stock-modal');
  const stockModalClose = document.getElementById('stock-modal-close');
  const stockInput = document.getElementById('stock-input');
  const stockProductName = document.getElementById('stock-product-name');
  const stockCancel = document.getElementById('stock-cancel');
  const stockSave = document.getElementById('stock-save');

  const deleteModal = document.getElementById('delete-modal');
  const deleteModalClose = document.getElementById('delete-modal-close');
  const deleteProductName = document.getElementById('delete-product-name');
  const deleteCancel = document.getElementById('delete-cancel');
  const deleteConfirm = document.getElementById('delete-confirm');

  const deleteOrderModal = document.getElementById('delete-order-modal');
  const deleteOrderClose = document.getElementById('delete-order-close');
  const deleteOrderInfo = document.getElementById('delete-order-info');
  const deleteOrderCancel = document.getElementById('delete-order-cancel');
  const deleteOrderConfirm = document.getElementById('delete-order-confirm');

  const toastContainer = document.getElementById('toast-container');

  // ──────────────────────────────────────
  //  Init
  // ──────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setupSidebar();
    setupLogout();
    setupForm();
    setupModals();
    setupProductControls();
    setupOrderControls();
    setupOutOfStockFilter();
    setupPosCart();
    setupUsbScannerAutoRefocus();
    setupReportsView();
    setupReceiptModal();

    if (token) {
      const valid = await verifyToken();
      if (valid) {
        showDashboard();
      } else {
        showLogin();
      }
    } else {
      showLogin();
    }
  }

  // ──────────────────────────────────────
  //  Auth
  // ──────────────────────────────────────
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = loginPassword.value.trim();
    if (!password) return;

    loginError.style.display = 'none';

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok) {
        loginError.textContent = data.error || 'Parolă incorectă.';
        loginError.style.display = 'block';
        return;
      }

      token = data.token;
      localStorage.setItem('farmacia_token', token);
      showDashboard();
      showToast('Autentificare reușită! Bine ai venit.', 'success');

    } catch (err) {
      if (password === 'Cojocaru1234') {
        token = 'local_offline_token_' + Date.now();
        localStorage.setItem('farmacia_token', token);
        showDashboard();
        showToast('Autentificare POS locală reușită!', 'success');
      } else {
        loginError.textContent = 'Parolă incorectă (implicit: Cojocaru1234).';
        loginError.style.display = 'block';
      }
    }
  });

  async function verifyToken() {
    if (token && token.startsWith('local_offline_token_')) return true;
    try {
      const res = await fetch(`${API_BASE}/api/admin/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.ok;
    } catch {
      return Boolean(token);
    }
  }

  function showLogin() {
    token = null;
    localStorage.removeItem('farmacia_token');
    loginOverlay.style.display = 'flex';
    dashboard.style.display = 'none';
    loginPassword.value = '';
  }

  function showDashboard() {
    loginOverlay.style.display = 'none';
    dashboard.style.display = 'flex';
    loadDashboardData();
  }

  function setupLogout() {
    logoutBtn.addEventListener('click', () => {
      showToast('Te-ai deconectat.', 'info');
      showLogin();
    });
  }

  // ──────────────────────────────────────
  //  Data Loading
  // ──────────────────────────────────────
  async function loadDashboardData() {
    await Promise.all([
      loadProducts(),
      loadOrders(),
      loadStats()
    ]);
  }

  async function loadProducts() {
    adminLoading.style.display = 'block';
    try {
      const res = await fetch(`${API_BASE}/api/products`);
      if (!res.ok) throw new Error();
      products = await res.json();
      localStorage.setItem('farmacia_products', JSON.stringify(products));
      renderProductsTable();
      updateDashboardStatsUI();
    } catch (err) {
      const saved = localStorage.getItem('farmacia_products');
      if (saved) {
        try {
          products = JSON.parse(saved);
        } catch (e) {
          products = DEFAULT_PRODUCTS;
        }
      } else {
        products = DEFAULT_PRODUCTS;
        localStorage.setItem('farmacia_products', JSON.stringify(DEFAULT_PRODUCTS));
      }
      renderProductsTable();
      updateDashboardStatsUI();
    } finally {
      adminLoading.style.display = 'none';
    }
  }

  async function loadOrders() {
    try {
      const res = await fetch('/api/admin/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) return showLogin();
      if (!res.ok) throw new Error();
      orders = await res.json();
      renderOrdersTable();
      updateDashboardStatsUI();
    } catch (err) {
      console.error('Eroare la încărcarea comenzilor:', err);
    }
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const stats = await res.json();
        applyStatsToUI(stats);
      }
    } catch (err) {
      // Fallback la calculul local dacă endpoint-ul nu răspunde
      updateDashboardStatsUI();
    }
  }

  function applyStatsToUI({ totalProducts, newOrders, criticalStock, outOfStock }) {
    if (statTotal) statTotal.textContent = totalProducts || 0;
    if (statOrders) statOrders.textContent = newOrders || 0;
    if (statCritical) statCritical.textContent = criticalStock || 0;

    // Badge pe meniul de comenzi
    if (sidebarOrdersBadge) {
      if (newOrders > 0) {
        sidebarOrdersBadge.textContent = newOrders;
        sidebarOrdersBadge.style.display = 'inline-block';
      } else {
        sidebarOrdersBadge.style.display = 'none';
      }
    }

    // Alertă vizuală roșie pentru stoc 0
    if (outOfStockAlert) {
      if (outOfStock > 0) {
        alertTitle.textContent = `Atenție: ${outOfStock} ${outOfStock === 1 ? 'produs are' : 'produse au'} stocul epuizat!`;
        alertDesc.textContent = 'Aceste produse nu pot fi onorate pentru comenzi până la reaprovizionare.';
        outOfStockAlert.style.display = 'flex';
      } else {
        outOfStockAlert.style.display = 'none';
      }
    }
  }

  function updateDashboardStatsUI() {
    const totalProducts = products.length;
    const newOrders = orders.filter(o => o.status === 'Nouă').length;
    const criticalStock = products.filter(p => p.stock > 0 && p.stock < 5).length;
    const outOfStock = products.filter(p => p.stock === 0).length;

    applyStatsToUI({ totalProducts, newOrders, criticalStock, outOfStock });
  }

  // ──────────────────────────────────────
  //  Navigation & Views
  // ──────────────────────────────────────
  function setupSidebar() {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    sidebarLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        switchView(view);
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
        }
      });
    });
  }

  function switchView(view) {
    activeView = view;
    sidebarLinks.forEach(l => l.classList.toggle('active', l.dataset.view === view));

    viewProducts.style.display = 'none';
    if (viewOrders) viewOrders.style.display = 'none';
    if (viewReports) viewReports.style.display = 'none';
    viewAdd.style.display = 'none';

    if (view === 'products') {
      viewProducts.style.display = 'block';
      viewTitle.textContent = 'Casă de Marcat (POS) & Gestiune';
      filterOnlyOutOfStock = false;
      renderProductsTable();
      renderPosCart();
      ensureScannerFocus();
    } else if (view === 'reports') {
      if (viewReports) viewReports.style.display = 'block';
      viewTitle.textContent = 'Rapoarte Vânzări & Încasări POS';
      loadReports(selectedReportDate);
    } else if (view === 'orders') {
      viewOrders.style.display = 'block';
      viewTitle.textContent = 'Comenzi Primite & Expedieri';
      loadOrders();
    } else if (view === 'add') {
      viewAdd.style.display = 'block';
      if (!editingProductId) {
        resetForm();
        viewTitle.textContent = 'Adaugă Produs Nou';
      } else {
        viewTitle.textContent = 'Editează Produs';
      }
    }
  }

  function setupOutOfStockFilter() {
    if (filterOutOfStockBtn) {
      filterOutOfStockBtn.addEventListener('click', () => {
        switchView('products');
        filterOnlyOutOfStock = true;
        renderProductsTable();
        showToast('Filtru aplicat: doar produse fără stoc.', 'info');
      });
    }
  }

  function setupProductControls() {
    adminSearch.addEventListener('input', () => {
      if (posClearSearch) {
        posClearSearch.style.display = adminSearch.value ? 'flex' : 'none';
      }
      renderProductsTable();
    });

    if (posClearSearch) {
      posClearSearch.addEventListener('click', () => {
        adminSearch.value = '';
        posClearSearch.style.display = 'none';
        renderProductsTable();
        ensureScannerFocus();
      });
    }

    // Suport Scaner Coduri de Bare USB (tasta Enter trimisă de scaner)
    adminSearch.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = adminSearch.value.trim().toLowerCase();
        if (!val) return;

        // 1. Căutare după cod de bare
        let matched = products.find(p => p.barcode && p.barcode.trim().toLowerCase() === val);

        // 2. Căutare după ID
        if (!matched) {
          matched = products.find(p => String(p.id) === val);
        }

        // 3. Căutare după nume exact
        if (!matched) {
          matched = products.find(p => p.name.trim().toLowerCase() === val);
        }

        // 4. Dacă există un singur produs filtrat în listă
        if (!matched) {
          const matching = products.filter(p =>
            (p.barcode && p.barcode.toLowerCase().includes(val)) ||
            p.name.toLowerCase().includes(val)
          );
          if (matching.length === 1) {
            matched = matching[0];
          }
        }

        if (matched) {
          if (matched.stock > 0) {
            adminActions.addToCart(matched.id, 1);
            adminSearch.value = '';
            if (posClearSearch) posClearSearch.style.display = 'none';
            renderProductsTable();
            flashPosFeedback(`⚡ Adăugat pe bon: <strong>${escapeHTML(matched.name)}</strong> (+1 buc.).`, 'success');
          } else {
            playBeep(false);
            flashPosFeedback(`⚠️ Produsul <strong>${escapeHTML(matched.name)}</strong> este FĂRĂ STOC (0 buc)!`, 'error');
            showToast(`Produsul "${matched.name}" are stocul epuizat.`, 'error');
          }
        } else {
          playBeep(false);
          flashPosFeedback(`❌ Niciun produs găsit pentru codul / denumirea "${escapeHTML(val)}".`, 'error');
        }

        ensureScannerFocus();
      }
    });

    adminCategoryFilter.addEventListener('change', () => {
      filterOnlyOutOfStock = false;
      renderProductsTable();
      ensureScannerFocus();
    });
  }

  function flashPosFeedback(msg, type = 'success') {
    if (!posFeedbackMsg) return;
    posFeedbackMsg.innerHTML = msg;
    posFeedbackMsg.className = `pos-feedback-msg pos-feedback-${type}`;
    posFeedbackMsg.style.display = 'block';
    setTimeout(() => {
      posFeedbackMsg.style.display = 'none';
    }, 4500);
  }

  function renderProductsTable() {
    const searchVal = adminSearch.value.trim().toLowerCase();
    const categoryVal = adminCategoryFilter.value;

    let filtered = products;

    if (filterOnlyOutOfStock) {
      filtered = filtered.filter(p => p.stock === 0);
    }

    if (categoryVal) {
      filtered = filtered.filter(p => p.category === categoryVal);
    }

    if (searchVal) {
      filtered = filtered.filter(p =>
        (p.barcode && p.barcode.toLowerCase().includes(searchVal)) ||
        p.name.toLowerCase().includes(searchVal) ||
        (p.description && p.description.toLowerCase().includes(searchVal)) ||
        (p.category && p.category.toLowerCase().includes(searchVal))
      );
    }

    if (filtered.length === 0) {
      adminTableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; padding:48px 20px; color:var(--text-muted);">
            Niciun produs găsit conform filtrelor sau codului scanat.
          </td>
        </tr>
      `;
      return;
    }

    adminTableBody.innerHTML = filtered.map(p => {
      const inStock = p.stock > 0;
      const isCritical = p.stock > 0 && p.stock < 5;

      let statusClass = 'status-in-stock';
      let statusText = 'În stoc';
      let statusBadgeStyle = '';

      if (p.stock === 0) {
        statusClass = 'status-out-of-stock';
        statusText = 'Fără stoc';
      } else if (isCritical) {
        statusClass = '';
        statusText = 'Stoc limitat';
        statusBadgeStyle = 'background:#fffbeb; color:#b45309; border:1px solid #fde68a;';
      }

      const defaultImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2248%22%20height%3D%2248%22%3E%3Crect%20width%3D%2248%22%20height%3D%2248%22%20fill%3D%22%23f1f5f9%22%2F%3E%3C%2Fsvg%3E';
      const imgSrc = p.image || defaultImg;

      // Indicator Stoc Critic / Epuizat
      let stockBadge = '';
      if (p.stock === 0) {
        stockBadge = '<span class="stock-empty-badge">0 buc</span>';
      } else if (isCritical) {
        stockBadge = `<span class="stock-critical-badge">Limitat (&lt;5)</span>`;
      }

      // Rețetă medicală
      const rxBadge = p.requires_prescription
        ? '<span class="rx-badge rx-required">💊 Rețetă</span>'
        : '<span class="rx-badge rx-free">OTC</span>';

      // Preț & Preț Vechi
      const oldPriceHtml = p.old_price
        ? `<span class="table-old-price">${formatPrice(p.old_price)} MDL</span>`
        : '';

      const barcodeHtml = p.barcode
        ? `<div class="table-barcode-chip" onclick="adminActions.searchBarcode('${escapeHTML(p.barcode)}')" title="Click pentru căutare rapidă după cod">🏷️ ${escapeHTML(p.barcode)}</div>`
        : `<div class="table-barcode-chip" style="opacity:0.5; cursor:default;">Fără cod</div>`;

      return `
        <tr data-id="${p.id}">
          <td>
            <img class="table-img" src="${escapeHTML(imgSrc)}" alt="${escapeHTML(p.name)}"
                 onerror="this.src='${defaultImg}'">
          </td>
          <td>
            <div class="table-product-name">${escapeHTML(p.name)}</div>
            ${barcodeHtml}
            <div class="table-product-desc">${escapeHTML(p.description || '')}</div>
          </td>
          <td><span class="table-category">${escapeHTML(p.category || 'General')}</span></td>
          <td>${rxBadge}</td>
          <td>
            <div class="table-price-wrap">
              ${oldPriceHtml}
              <span class="table-price">${formatPrice(p.price)} MDL</span>
            </div>
          </td>
          <td>
            <span class="stock-val" id="stock-val-${p.id}">${p.stock}</span>
            ${stockBadge}
          </td>
          <td>
            <span class="table-status ${statusClass}" style="${statusBadgeStyle}" id="stock-status-${p.id}">${statusText}</span>
          </td>
          <td style="text-align:center;">
            <!-- Buton Adaugă pe Bon POS -->
            <button class="btn-pos-add ${!inStock ? 'disabled' : ''}" 
                    id="btn-add-cart-${p.id}"
                    ${!inStock ? 'disabled' : ''} 
                    title="${inStock ? 'Adaugă 1 buc. pe bonul curent' : 'Produsul nu mai are stoc'}" 
                    onclick="adminActions.addToCart(${p.id})">
              ${inStock ? '➕ Bon' : '🚫 Fără Stoc'}
            </button>
          </td>
          <td>
            <!-- Reaprovizionare Rapidă (+N) -->
            <div class="restock-box">
              <div class="restock-row">
                <input type="number" min="1" class="restock-input" id="restock-input-${p.id}" placeholder="+buc" value="10">
                <button class="btn-restock" onclick="adminActions.quickRestock(${p.id})">➕ Adaugă</button>
              </div>
              <div class="restock-presets">
                <button type="button" class="preset-chip" onclick="adminActions.setRestockVal(${p.id}, 5)">+5</button>
                <button type="button" class="preset-chip" onclick="adminActions.setRestockVal(${p.id}, 10)">+10</button>
                <button type="button" class="preset-chip" onclick="adminActions.setRestockVal(${p.id}, 25)">+25</button>
                <button type="button" class="preset-chip" onclick="adminActions.setRestockVal(${p.id}, 50)">+50</button>
              </div>
            </div>
          </td>
          <td>
            <div class="table-actions">
              <!-- Editare Stoc Numeric Modal -->
              <button class="btn-icon" title="Editează stocul numeric" onclick="adminActions.editStock(${p.id})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                  <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
                </svg>
              </button>
              <!-- Editare Produs Formular -->
              <button class="btn-icon" title="Editează datele produsului" onclick="adminActions.edit(${p.id})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <!-- Ștergere Produs -->
              <button class="btn-icon btn-icon-danger" title="Șterge produsul" onclick="adminActions.deletePrompt(${p.id})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ──────────────────────────────────────
  //  Orders Table Rendering & Controls
  // ──────────────────────────────────────
  function setupOrderControls() {
    if (ordersSearch) ordersSearch.addEventListener('input', () => renderOrdersTable());
    if (ordersStatusFilter) ordersStatusFilter.addEventListener('change', () => renderOrdersTable());
  }

  function renderOrdersTable() {
    if (!ordersTableBody) return;

    const searchVal = ordersSearch ? ordersSearch.value.trim().toLowerCase() : '';
    const statusVal = ordersStatusFilter ? ordersStatusFilter.value : '';

    let filtered = orders;

    if (statusVal) {
      filtered = filtered.filter(o => o.status === statusVal);
    }

    if (searchVal) {
      filtered = filtered.filter(o =>
        (o.customer_name && o.customer_name.toLowerCase().includes(searchVal)) ||
        (o.customer_phone && o.customer_phone.toLowerCase().includes(searchVal)) ||
        (o.delivery_address && o.delivery_address.toLowerCase().includes(searchVal))
      );
    }

    if (filtered.length === 0) {
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:48px 20px; color:var(--text-muted);">
            Nicio comandă găsită conform căutării.
          </td>
        </tr>
      `;
      return;
    }

    ordersTableBody.innerHTML = filtered.map(o => {
      const dateStr = formatDate(o.created_at);
      const statusClass = getStatusClass(o.status);

      return `
        <tr data-id="${o.id}">
          <td class="order-id">#${o.id}</td>
          <td class="order-customer">${escapeHTML(o.customer_name || 'Client')}</td>
          <td class="order-phone">
            <a href="tel:${escapeHTML(o.customer_phone || '')}" style="color:var(--primary); font-weight:600;">
              ${escapeHTML(o.customer_phone || '')}
            </a>
          </td>
          <td class="order-address">${escapeHTML(o.delivery_address || '')}</td>
          <td class="order-items-cell">${escapeHTML(o.items || '')}</td>
          <td class="order-total">${formatPrice(o.total_price)} MDL</td>
          <td class="order-date">${dateStr}</td>
          <td>
            <select class="order-status-select ${statusClass}" onchange="adminActions.changeOrderStatus(${o.id}, this.value)">
              <option value="Nouă" ${o.status === 'Nouă' ? 'selected' : ''}>Nouă</option>
              <option value="În procesare" ${o.status === 'În procesare' ? 'selected' : ''}>În procesare</option>
              <option value="Trimisă" ${o.status === 'Trimisă' ? 'selected' : ''}>Trimisă</option>
              <option value="Finalizată" ${o.status === 'Finalizată' ? 'selected' : ''}>Finalizată</option>
              <option value="Anulată" ${o.status === 'Anulată' ? 'selected' : ''}>Anulată</option>
            </select>
          </td>
          <td style="text-align:right;">
            <button class="btn-icon btn-icon-danger" title="Șterge comanda" onclick="adminActions.deleteOrderPrompt(${o.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function getStatusClass(status) {
    switch (status) {
      case 'Nouă': return 'status-noua';
      case 'În procesare': return 'status-in-procesare';
      case 'Trimisă': return 'status-trimisa';
      case 'Finalizată': return 'status-finalizata';
      case 'Anulată': return 'status-anulata';
      default: return '';
    }
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('ro-RO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  }

  // ──────────────────────────────────────
  //  Product Form (Add / Edit)
  // ──────────────────────────────────────
  function setupForm() {
    prodPrescription.addEventListener('change', () => {
      prescriptionLabelText.textContent = prodPrescription.checked
        ? 'Da (necesită rețetă medicală)'
        : 'Nu (fără rețetă)';
    });

    if (btnGenBarcode) {
      btnGenBarcode.addEventListener('click', () => {
        const random10 = Math.floor(1000000000 + Math.random() * 9000000000);
        if (prodBarcode) prodBarcode.value = `594${random10}`;
        showToast('Cod de bare EAN-13 generat!', 'info');
      });
    }

    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = prodName.value.trim();
      const barcode = prodBarcode ? prodBarcode.value.trim() : '';
      const category = prodCategory.value;
      const price = parseFloat(prodPrice.value);
      const oldPriceVal = prodOldPrice.value.trim();
      const old_price = oldPriceVal ? parseFloat(oldPriceVal) : null;
      const stock = parseInt(prodStock.value, 10);
      const requires_prescription = prodPrescription.checked;
      const image = prodImage.value.trim();
      const description = prodDescription.value.trim();

      if (!name || isNaN(price) || isNaN(stock)) {
        showToast('Completează denumirea, prețul și stocul corect.', 'error');
        return;
      }

      const body = {
        name,
        barcode,
        category,
        price,
        old_price,
        stock,
        requires_prescription,
        image,
        description
      };

      try {
        let res;
        if (editingProductId) {
          res = await fetch(`/api/admin/products/${editingProductId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
          });
        } else {
          res = await fetch('/api/admin/products', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
          });
        }

        if (res.status === 401) return showLogin();

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Eroare la salvare.');
        }

        showToast(editingProductId ? 'Produsul a fost actualizat cu succes!' : 'Produsul nou a fost adăugat!', 'success');
        resetForm();
        switchView('products');
        await loadProducts();

      } catch (err) {
        showToast(err.message || 'Eroare la salvare.', 'error');
      }
    });

    formCancel.addEventListener('click', () => {
      resetForm();
      switchView('products');
    });
  }

  function resetForm() {
    editingProductId = null;
    editIdField.value = '';
    if (prodBarcode) prodBarcode.value = '';
    productForm.reset();
    formTitle.textContent = 'Adaugă Produs Nou';
    prescriptionLabelText.textContent = 'Nu (fără rețetă)';
    prodPrescription.checked = false;
  }

  // ──────────────────────────────────────
  //  Modals & Actions
  // ──────────────────────────────────────
  function setupModals() {
    // Stock modal
    stockModalClose.addEventListener('click', () => stockModal.style.display = 'none');
    stockCancel.addEventListener('click', () => stockModal.style.display = 'none');
    stockSave.addEventListener('click', saveStock);

    // Delete product modal
    deleteModalClose.addEventListener('click', () => deleteModal.style.display = 'none');
    deleteCancel.addEventListener('click', () => deleteModal.style.display = 'none');
    deleteConfirm.addEventListener('click', confirmDeleteProduct);

    // Delete order modal
    deleteOrderClose.addEventListener('click', () => deleteOrderModal.style.display = 'none');
    deleteOrderCancel.addEventListener('click', () => deleteOrderModal.style.display = 'none');
    deleteOrderConfirm.addEventListener('click', confirmDeleteOrder);

    // Click outside modal to close
    window.addEventListener('click', (e) => {
      if (e.target === stockModal) stockModal.style.display = 'none';
      if (e.target === deleteModal) deleteModal.style.display = 'none';
      if (e.target === deleteOrderModal) deleteOrderModal.style.display = 'none';
    });
  }

  async function saveStock() {
    const val = parseInt(stockInput.value, 10);
    if (isNaN(val) || val < 0) {
      showToast('Introdu un număr valid de bucăți.', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/admin/products/${stockProductId}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ stock: val })
      });

      if (res.status === 401) return showLogin();
      if (!res.ok) throw new Error();

      showToast('Stocul a fost actualizat cu succes!', 'success');
      stockModal.style.display = 'none';
      await loadProducts();
    } catch {
      showToast('Eroare la actualizarea stocului.', 'error');
    }
  }

  async function confirmDeleteProduct() {
    try {
      const res = await fetch(`/api/admin/products/${deleteProductId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) return showLogin();
      if (!res.ok) throw new Error();

      showToast('Produsul a fost șters.', 'success');
      deleteModal.style.display = 'none';
      await loadProducts();
    } catch {
      showToast('Eroare la ștergerea produsului.', 'error');
    }
  }

  async function confirmDeleteOrder() {
    try {
      const res = await fetch(`/api/admin/orders/${deleteOrderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) return showLogin();
      if (!res.ok) throw new Error();

      showToast('Comanda a fost ștearsă.', 'success');
      deleteOrderModal.style.display = 'none';
      await loadOrders();
    } catch {
      showToast('Eroare la ștergerea comenzii.', 'error');
    }
  }

  // ──────────────────────────────────────
  //  POS Cart, USB Barcode Scanner & Reports Helpers
  // ──────────────────────────────────────

  function generateReceiptNumber() {
    const d = new Date();
    const datePart = d.getFullYear().toString().slice(-2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BON-${datePart}-${rand}`;
  }

  function playBeep(success = true) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (success) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {}
  }

  function setupUsbScannerAutoRefocus() {
    window.addEventListener('focus', () => {
      if (activeView === 'products') ensureScannerFocus();
    });

    document.addEventListener('click', (e) => {
      if (activeView !== 'products') return;
      const target = e.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('.modal-overlay') ||
        target.closest('.pos-qty-controls')
      ) {
        return;
      }
      ensureScannerFocus();
    });

    document.addEventListener('keydown', (e) => {
      if (activeView !== 'products') return;
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
      ) {
        return;
      }
      if (document.querySelector('.modal-overlay[style*="display: flex"]')) return;

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (adminSearch) {
          adminSearch.focus();
        }
      }
    });
  }

  function ensureScannerFocus() {
    if (activeView !== 'products') return;
    const active = document.activeElement;
    if (
      active &&
      (active.classList.contains('pos-qty-input') ||
       active.classList.contains('restock-input') ||
       active.tagName === 'SELECT' ||
       active.closest('.modal-overlay') ||
       active.closest('#product-form'))
    ) {
      return;
    }
    if (adminSearch && active !== adminSearch) {
      adminSearch.focus();
    }
  }

  function setupPosCart() {
    if (payMethodCash) {
      payMethodCash.addEventListener('click', () => {
        selectedPaymentMethod = 'Numerar';
        payMethodCash.classList.add('active');
        if (payMethodCard) payMethodCard.classList.remove('active');
      });
    }

    if (payMethodCard) {
      payMethodCard.addEventListener('click', () => {
        selectedPaymentMethod = 'Card Bancar';
        payMethodCard.classList.add('active');
        if (payMethodCash) payMethodCash.classList.remove('active');
      });
    }

    if (posClearCartBtn) {
      posClearCartBtn.addEventListener('click', () => {
        if (!posCart.length) return;
        if (confirm('Ești sigur că vrei să golești bonul curent?')) {
          adminActions.clearCart();
        }
      });
    }

    if (posCheckoutBtn) {
      posCheckoutBtn.addEventListener('click', () => {
        adminActions.checkoutPos();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (activeView === 'products') {
        if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) {
          e.preventDefault();
          if (posCart.length > 0) {
            adminActions.checkoutPos();
          }
        }
      }
    });

    renderPosCart();
  }

  function renderPosCart() {
    if (!posCartReceiptNo) return;
    posCartReceiptNo.textContent = currentReceiptNumber;

    if (!posCart.length) {
      if (posCartEmptyState) posCartEmptyState.style.display = 'flex';
      if (posCartItemsList) {
        posCartItemsList.style.display = 'none';
        posCartItemsList.innerHTML = '';
      }
      if (posCheckoutBtn) {
        posCheckoutBtn.disabled = true;
        posCheckoutBtn.innerHTML = `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Finalizează Vânzare (Achitat)
        `;
      }
      if (posCartItemCount) posCartItemCount.textContent = '0 buc.';
      if (posCartTotalPrice) posCartTotalPrice.textContent = '0.00 MDL';
      return;
    }

    if (posCartEmptyState) posCartEmptyState.style.display = 'none';
    if (posCartItemsList) posCartItemsList.style.display = 'flex';
    if (posCheckoutBtn) {
      posCheckoutBtn.disabled = false;
      posCheckoutBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Finalizează Vânzare (Achitat)
      `;
    }

    const totalCount = posCart.reduce((sum, it) => sum + it.quantity, 0);
    const totalPrice = posCart.reduce((sum, it) => sum + (it.price * it.quantity), 0);

    if (posCartItemCount) posCartItemCount.textContent = `${totalCount} buc.`;
    if (posCartTotalPrice) posCartTotalPrice.textContent = `${formatPrice(totalPrice)} MDL`;

    if (posCartItemsList) {
      posCartItemsList.innerHTML = posCart.map(item => `
        <div class="pos-cart-item" data-id="${item.id}">
          <div class="pos-cart-item-header">
            <div class="pos-cart-item-info">
              <div class="pos-cart-item-name">${escapeHTML(item.name)}</div>
              <div class="pos-cart-item-meta">
                ${item.barcode ? `<span>🏷️ ${escapeHTML(item.barcode)}</span>` : ''}
                <span class="pos-cart-item-price">${formatPrice(item.price)} MDL / buc</span>
              </div>
            </div>
            <button type="button" class="pos-cart-item-remove" onclick="adminActions.removeFromCart(${item.id})" title="Șterge de pe bon">&times;</button>
          </div>
          <div class="pos-cart-item-footer">
            <div class="pos-qty-controls">
              <button type="button" class="pos-qty-btn" onclick="adminActions.changeCartQty(${item.id}, -1)">&minus;</button>
              <input type="number" class="pos-qty-input" min="1" max="${item.stock}" value="${item.quantity}" onchange="adminActions.setCartQty(${item.id}, this.value)">
              <button type="button" class="pos-qty-btn" onclick="adminActions.changeCartQty(${item.id}, 1)">&plus;</button>
            </div>
            <div class="pos-item-subtotal">${formatPrice(item.price * item.quantity)} MDL</div>
          </div>
        </div>
      `).join('');
    }
  }

  function onSaleFinalized(sale) {
    playBeep(true);
    showReceiptModal(sale);
    showToast(`✅ Vânzare finalizată! #${sale.receipt_number} — ${formatPrice(sale.total_amount)} MDL achitat.`, 'success');

    posCart = [];
    currentReceiptNumber = generateReceiptNumber();
    renderPosCart();
    renderProductsTable();
    updateDashboardStatsUI();
    ensureScannerFocus();
  }

  function saveLocalPosSale(sale) {
    try {
      const sales = JSON.parse(localStorage.getItem('farmacia_pos_sales') || '[]');
      sales.unshift(sale);
      localStorage.setItem('farmacia_pos_sales', JSON.stringify(sales.slice(0, 500)));
    } catch (e) {}
  }

  function getLocalPosSales(targetDate) {
    try {
      const all = JSON.parse(localStorage.getItem('farmacia_pos_sales') || '[]');
      if (!targetDate) return all;
      return all.filter(s => {
        const d = s.created_at ? s.created_at.split('T')[0] : '';
        return d === targetDate;
      });
    } catch (e) {
      return [];
    }
  }

  function setupReportsView() {
    if (reportsDateInput) {
      reportsDateInput.value = selectedReportDate;
      reportsDateInput.addEventListener('change', () => {
        selectedReportDate = reportsDateInput.value || new Date().toISOString().split('T')[0];
        loadReports(selectedReportDate);
      });
    }

    if (reportsTodayBtn) {
      reportsTodayBtn.addEventListener('click', () => {
        selectedReportDate = new Date().toISOString().split('T')[0];
        if (reportsDateInput) reportsDateInput.value = selectedReportDate;
        loadReports(selectedReportDate);
      });
    }

    if (reportsRefreshBtn) {
      reportsRefreshBtn.addEventListener('click', () => {
        loadReports(selectedReportDate);
      });
    }
  }

  async function loadReports(date) {
    const targetDate = date || selectedReportDate || new Date().toISOString().split('T')[0];
    if (reportsLoading) reportsLoading.style.display = 'block';

    try {
      const res = await fetch(`${API_BASE}/api/admin/pos/reports?date=${targetDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const report = await res.json();
      renderReportsData(report);
    } catch (err) {
      renderLocalReportsData(targetDate);
    } finally {
      if (reportsLoading) reportsLoading.style.display = 'none';
    }
  }

  function renderReportsData(report) {
    if (repStatRevenue) repStatRevenue.textContent = `${formatPrice(report.totalRevenue || 0)} MDL`;
    if (repStatItems) repStatItems.textContent = `${report.totalItemsSold || 0} buc.`;
    if (repStatReceipts) repStatReceipts.textContent = `${report.totalReceipts || 0}`;
    if (repStatAvg) repStatAvg.textContent = `${formatPrice(report.avgReceipt || 0)} MDL`;

    if (!reportsSalesTbody) return;
    const sales = report.sales || [];
    if (!sales.length) {
      reportsSalesTbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 36px 16px; color: var(--text-muted);">
            Nicio vânzare înregistrată în data de ${selectedReportDate}.
          </td>
        </tr>
      `;
      return;
    }

    reportsSalesTbody.innerHTML = sales.map(s => {
      const dateStr = s.created_at ? new Date(s.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) : '';
      const fullDateStr = s.created_at ? new Date(s.created_at).toLocaleDateString('ro-RO') : '';
      const payBadge = s.payment_method === 'Card Bancar'
        ? `<span class="badge-payment-card">💳 Card</span>`
        : `<span class="badge-payment-cash">💵 Numerar</span>`;

      const itemsList = (s.items || []).map(it => `
        <span class="report-item-chip">${escapeHTML(it.name)} <strong>&times; ${it.quantity || 1}</strong></span>
      `).join('');

      return `
        <tr>
          <td><strong style="font-family:monospace; color:var(--text-primary);">${escapeHTML(s.receipt_number || '')}</strong></td>
          <td><span style="font-size:12px; color:var(--text-secondary);">${fullDateStr} ${dateStr}</span></td>
          <td>${payBadge}</td>
          <td><div class="report-items-chips">${itemsList || '—'}</div></td>
          <td style="text-align:center; font-weight:600;">${s.total_items || 1} buc.</td>
          <td><strong style="color:#059669; font-size:14px;">${formatPrice(s.total_amount)} MDL</strong></td>
          <td style="text-align:right;">
            <button type="button" class="btn btn-outline btn-xs" onclick="adminActions.viewReceiptByNum('${escapeHTML(s.receipt_number)}')">
              👁️ Bon
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderLocalReportsData(targetDate) {
    const sales = getLocalPosSales(targetDate);
    const totalRevenue = sales.reduce((acc, s) => acc + (parseFloat(s.total_amount) || 0), 0);
    const totalItems = sales.reduce((acc, s) => acc + (parseInt(s.total_items, 10) || 0), 0);
    const count = sales.length;
    const avg = count > 0 ? totalRevenue / count : 0;

    renderReportsData({
      date: targetDate,
      totalRevenue,
      totalItemsSold: totalItems,
      totalReceipts: count,
      avgReceipt: avg,
      sales
    });
  }

  function setupReceiptModal() {
    if (receiptModalClose) {
      receiptModalClose.addEventListener('click', () => {
        receiptModal.style.display = 'none';
        ensureScannerFocus();
      });
    }
    if (receiptCloseBtn) {
      receiptCloseBtn.addEventListener('click', () => {
        receiptModal.style.display = 'none';
        ensureScannerFocus();
      });
    }
    if (receiptPrintBtn) {
      receiptPrintBtn.addEventListener('click', () => {
        window.print();
      });
    }
    if (receiptModal) {
      receiptModal.addEventListener('click', (e) => {
        if (e.target === receiptModal) {
          receiptModal.style.display = 'none';
          ensureScannerFocus();
        }
      });
    }
  }

  function showReceiptModal(sale) {
    if (!receiptModal || !receiptModalBody) return;
    const items = sale.items || [];
    const dateFormatted = sale.created_at
      ? new Date(sale.created_at).toLocaleString('ro-RO')
      : new Date().toLocaleString('ro-RO');

    receiptModalBody.innerHTML = `
      <div class="thermal-receipt">
        <div class="receipt-header-text">
          <h4>FARMACIA MOLDOVA</h4>
          <div>Sănătatea ta, grija noastră</div>
          <div>Chișinău, Bd. Ștefan cel Mare 100</div>
          <div>Tel: +373 22 123 456</div>
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-meta-row">
          <span>BON FISCAL:</span>
          <strong>${escapeHTML(sale.receipt_number)}</strong>
        </div>
        <div class="receipt-meta-row">
          <span>DATA / ORA:</span>
          <span>${dateFormatted}</span>
        </div>
        <div class="receipt-meta-row">
          <span>OPERATOR:</span>
          <span>Farmacist / Admin</span>
        </div>
        <div class="receipt-divider"></div>
        <table class="receipt-table">
          <thead>
            <tr>
              <th>Articol</th>
              <th style="text-align:center;">Cant.</th>
              <th class="r-price">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td>${escapeHTML(it.name)}</td>
                <td style="text-align:center;">${it.quantity}</td>
                <td class="r-price">${formatPrice(it.subtotal || (it.price * it.quantity))} MDL</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="receipt-total-row">
          <span>TOTAL ACHITAT:</span>
          <span>${formatPrice(sale.total_amount)} MDL</span>
        </div>
        <div class="receipt-meta-row">
          <span>METODĂ PLATĂ:</span>
          <strong>${escapeHTML(sale.payment_method || 'Numerar')}</strong>
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-footer-text">
          *** VĂ MULȚUMIM PENTRU VIZITĂ! ***<br>
          SĂNĂTATE ȘI O ZI BUNĂ!
        </div>
      </div>
    `;

    receiptModal.style.display = 'flex';
  }

  // ──────────────────────────────────────
  //  Global Actions for Table Buttons
  // ──────────────────────────────────────
  window.adminActions = {
    // ─── POS Cart Operations ───
    addToCart(id, qty = 1) {
      const p = products.find(prod => prod.id === id);
      if (!p) {
        showToast('Produsul nu a fost găsit.', 'error');
        return;
      }
      if (p.stock <= 0) {
        playBeep(false);
        showToast(`Produsul "${p.name}" are stoc 0!`, 'error');
        return;
      }

      const existing = posCart.find(it => it.id === id);
      const currentQtyInCart = existing ? existing.quantity : 0;
      const targetQty = currentQtyInCart + qty;

      if (targetQty > p.stock) {
        playBeep(false);
        showToast(`Stoc insuficient pentru "${p.name}". Maxim disponibil: ${p.stock} buc.`, 'error');
        if (existing) existing.quantity = p.stock;
      } else {
        if (existing) {
          existing.quantity = targetQty;
        } else {
          posCart.push({
            id: p.id,
            name: p.name,
            barcode: p.barcode || '',
            price: parseFloat(p.price) || 0,
            stock: parseInt(p.stock, 10) || 0,
            quantity: qty
          });
        }
        playBeep(true);
      }

      renderPosCart();
      ensureScannerFocus();
    },

    changeCartQty(id, delta) {
      const idx = posCart.findIndex(it => it.id === id);
      if (idx === -1) return;
      const item = posCart[idx];
      const nextQty = item.quantity + delta;

      if (nextQty <= 0) {
        posCart.splice(idx, 1);
      } else if (nextQty > item.stock) {
        playBeep(false);
        showToast(`Stoc maxim atins pentru "${item.name}" (${item.stock} buc).`, 'info');
        item.quantity = item.stock;
      } else {
        item.quantity = nextQty;
      }

      renderPosCart();
      ensureScannerFocus();
    },

    setCartQty(id, rawVal) {
      const item = posCart.find(it => it.id === id);
      if (!item) return;
      let val = parseInt(rawVal, 10);
      if (isNaN(val) || val <= 0) {
        this.removeFromCart(id);
        return;
      }
      if (val > item.stock) {
        playBeep(false);
        showToast(`Stoc maxim atins pentru "${item.name}" (${item.stock} buc).`, 'info');
        val = item.stock;
      }
      item.quantity = val;
      renderPosCart();
      ensureScannerFocus();
    },

    removeFromCart(id) {
      posCart = posCart.filter(it => it.id !== id);
      renderPosCart();
      ensureScannerFocus();
    },

    clearCart() {
      posCart = [];
      renderPosCart();
      ensureScannerFocus();
    },

    async checkoutPos() {
      if (!posCart.length) {
        showToast('Bonul este gol! Adaugă produse pentru a vinde.', 'error');
        return;
      }

      // Check stocks before submitting
      for (const it of posCart) {
        const p = products.find(prod => prod.id === it.id);
        if (p && it.quantity > p.stock) {
          playBeep(false);
          showToast(`Stoc insuficient pentru "${it.name}" (stoc: ${p.stock}, cerut: ${it.quantity})`, 'error');
          return;
        }
      }

      if (posCheckoutBtn) {
        posCheckoutBtn.disabled = true;
        posCheckoutBtn.innerHTML = `⏳ Se procesează bonul...`;
      }

      const totalAmount = posCart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
      const totalItems = posCart.reduce((sum, it) => sum + it.quantity, 0);
      const receiptNo = currentReceiptNumber;

      const payload = {
        receipt_number: receiptNo,
        items: posCart.map(it => ({
          id: it.id,
          name: it.name,
          barcode: it.barcode,
          price: it.price,
          quantity: it.quantity,
          subtotal: it.price * it.quantity
        })),
        total_amount: totalAmount,
        total_items: totalItems,
        payment_method: selectedPaymentMethod,
        notes: ''
      };

      try {
        const res = await fetch(`${API_BASE}/api/admin/pos/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (res.status === 401) return showLogin();
        if (!res.ok) throw new Error('Eroare server checkout');

        const data = await res.json();
        const savedSale = data.sale || { ...payload, created_at: new Date().toISOString() };
        
        // Update product stocks locally from server response
        if (Array.isArray(data.updated_products)) {
          data.updated_products.forEach(up => {
            const idx = products.findIndex(p => p.id === up.id);
            if (idx !== -1) products[idx] = up;
          });
        } else {
          posCart.forEach(it => {
            const p = products.find(prod => prod.id === it.id);
            if (p) p.stock = Math.max(0, p.stock - it.quantity);
          });
        }
        localStorage.setItem('farmacia_products', JSON.stringify(products));
        saveLocalPosSale(savedSale);

        onSaleFinalized(savedSale);
      } catch (err) {
        // Fallback local instant: finalizare chiar și offline
        posCart.forEach(it => {
          const p = products.find(prod => prod.id === it.id);
          if (p) p.stock = Math.max(0, p.stock - it.quantity);
        });
        localStorage.setItem('farmacia_products', JSON.stringify(products));

        const offlineSale = {
          id: 'pos_' + Date.now(),
          receipt_number: receiptNo,
          total_amount: totalAmount,
          total_items: totalItems,
          payment_method: selectedPaymentMethod,
          items: payload.items,
          created_at: new Date().toISOString()
        };
        saveLocalPosSale(offlineSale);

        onSaleFinalized(offlineSale);
      }
    },

    async viewReceiptByNum(receiptNum) {
      if (!receiptNum) return;
      try {
        const res = await fetch(`${API_BASE}/api/admin/pos/sales?receipt_number=${encodeURIComponent(receiptNum)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const sales = await res.json();
          if (sales.length) {
            showReceiptModal(sales[0]);
            return;
          }
        }
      } catch (e) {}

      // Fallback local
      const localSales = JSON.parse(localStorage.getItem('farmacia_pos_sales') || '[]');
      const found = localSales.find(s => s.receipt_number === receiptNum);
      if (found) {
        showReceiptModal(found);
      } else {
        showToast(`Bonul #${receiptNum} nu a fost găsit.`, 'error');
      }
    },

    edit(id) {
      const p = products.find(prod => prod.id === id);
      if (!p) return;

      editingProductId = id;
      editIdField.value = id;
      prodName.value = p.name;
      if (prodBarcode) prodBarcode.value = p.barcode || '';
      prodCategory.value = p.category || 'General';
      prodPrice.value = p.price;
      prodOldPrice.value = p.old_price !== null && p.old_price !== undefined ? p.old_price : '';
      prodStock.value = p.stock;
      prodPrescription.checked = Boolean(p.requires_prescription);
      prescriptionLabelText.textContent = prodPrescription.checked
        ? 'Da (necesită rețetă medicală)'
        : 'Nu (fără rețetă)';
      prodImage.value = p.image || '';
      prodDescription.value = p.description || '';

      formTitle.textContent = 'Editează Produsul';
      switchView('add');
    },

    // ─── POS: Vânzare rapidă (-1 Vândut) ───
    async quickSell(id) {
      const p = products.find(prod => prod.id === id);
      if (!p) return;
      if (p.stock <= 0) {
        showToast(`Produsul "${p.name}" are deja stocul 0 (Fără stoc).`, 'error');
        return;
      }

      const btn = document.getElementById(`btn-sell-${id}`);
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ ...';
      }

      try {
        const res = await fetch(`${API_BASE}/api/admin/products/${id}/sell`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) return showLogin();
        let updated;
        if (res.ok) {
          const data = await res.json();
          updated = data.product;
        } else {
          throw new Error();
        }

        const idx = products.findIndex(prod => prod.id === id);
        if (idx !== -1) {
          products[idx] = updated;
        }
        localStorage.setItem('farmacia_products', JSON.stringify(products));

        if (updated.stock === 0) {
          showToast(`⚠️ Produsul "${updated.name}" a ajuns la STOC 0 și s-a marcat ca "Fără stoc"!`, 'info');
        } else {
          showToast(`⚡ Vânzare POS: "${updated.name}". Stoc rămas: ${updated.stock} buc.`, 'success');
        }

        renderProductsTable();
        updateDashboardStatsUI();
      } catch (err) {
        // Fallback local instant: scădere directă de stoc
        const idx = products.findIndex(prod => prod.id === id);
        if (idx !== -1) {
          products[idx].stock = Math.max(0, products[idx].stock - 1);
          localStorage.setItem('farmacia_products', JSON.stringify(products));
          const updated = products[idx];
          if (updated.stock === 0) {
            showToast(`⚠️ Produsul "${updated.name}" a ajuns la STOC 0 și s-a marcat ca "Fără stoc"!`, 'info');
          } else {
            showToast(`⚡ Vânzare POS: "${updated.name}". Stoc rămas: ${updated.stock} buc.`, 'success');
          }
          renderProductsTable();
          updateDashboardStatsUI();
        }
      }
    },

    // ─── POS: Reaprovizionare marfă (+N bucăți) ───
    async quickRestock(id) {
      const inputEl = document.getElementById(`restock-input-${id}`);
      const qty = parseInt(inputEl ? inputEl.value : 0, 10);
      if (isNaN(qty) || qty <= 0) {
        showToast('Introdu un număr pozitiv de bucăți (> 0).', 'error');
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/admin/products/${id}/restock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ quantity: qty })
        });

        if (res.status === 401) return showLogin();
        let updated;
        if (res.ok) {
          const data = await res.json();
          updated = data.product;
        } else {
          throw new Error();
        }

        const idx = products.findIndex(prod => prod.id === id);
        if (idx !== -1) {
          products[idx] = updated;
        }
        localStorage.setItem('farmacia_products', JSON.stringify(products));

        showToast(`📦 Reaprovizionare: +${qty} bucăți la "${updated.name}". Stoc nou: ${updated.stock} buc.`, 'success');
        renderProductsTable();
        updateDashboardStatsUI();
      } catch (err) {
        // Fallback local: adăugare stoc
        const idx = products.findIndex(prod => prod.id === id);
        if (idx !== -1) {
          products[idx].stock = (parseInt(products[idx].stock, 10) || 0) + qty;
          localStorage.setItem('farmacia_products', JSON.stringify(products));
          showToast(`📦 Reaprovizionare: +${qty} bucăți la "${products[idx].name}". Stoc nou: ${products[idx].stock} buc.`, 'success');
          renderProductsTable();
          updateDashboardStatsUI();
        }
      }
    },

    setRestockVal(id, val) {
      const inputEl = document.getElementById(`restock-input-${id}`);
      if (inputEl) {
        inputEl.value = val;
        inputEl.focus();
      }
    },

    searchBarcode(barcode) {
      if (!barcode) return;
      adminSearch.value = barcode;
      if (posClearSearch) posClearSearch.style.display = 'flex';
      renderProductsTable();
      adminSearch.focus();
    },

    async toggleStock(id) {
      try {
        const res = await fetch(`/api/admin/products/${id}/toggle-stock`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) return showLogin();
        if (!res.ok) throw new Error();

        const updated = await res.json();
        const msg = updated.stock > 0
          ? `Produsul "${updated.name}" este acum În Stoc (${updated.stock} buc).`
          : `Produsul "${updated.name}" a fost marcat ca Fără Stoc (0 buc).`;

        showToast(msg, updated.stock > 0 ? 'success' : 'info');
        await loadProducts();
      } catch (err) {
        showToast('Eroare la comutarea stocului.', 'error');
      }
    },

    editStock(id) {
      const p = products.find(prod => prod.id === id);
      if (!p) return;
      stockProductId = id;
      stockProductName.textContent = p.name;
      stockInput.value = p.stock;
      stockModal.style.display = 'flex';
      stockInput.focus();
    },

    deletePrompt(id) {
      const p = products.find(prod => prod.id === id);
      if (!p) return;
      deleteProductId = id;
      deleteProductName.textContent = `${p.name} (${p.category})`;
      deleteModal.style.display = 'flex';
    },

    deleteOrderPrompt(id) {
      const o = orders.find(ord => ord.id === id);
      if (!o) return;
      deleteOrderId = id;
      deleteOrderInfo.textContent = `Comanda #${o.id} — ${o.customer_name} (${formatPrice(o.total_price)} MDL)`;
      deleteOrderModal.style.display = 'flex';
    },

    async changeOrderStatus(id, newStatus) {
      try {
        const res = await fetch(`/api/admin/orders/${id}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        });

        if (res.status === 401) return showLogin();
        if (!res.ok) throw new Error();

        showToast(`Statusul comenzii #${id} a fost schimbat în "${newStatus}".`, 'success');
        await loadOrders();
      } catch {
        showToast('Eroare la actualizarea statusului comenzii.', 'error');
      }
    }
  };

  // ──────────────────────────────────────
  //  Toast Utility
  // ──────────────────────────────────────
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${escapeHTML(message)}</span>
      <span class="toast-close">&times;</span>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ──────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────
  function formatPrice(num) {
    return parseFloat(num).toFixed(2);
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
