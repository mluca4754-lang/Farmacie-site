/**
 * Farmacia Moldova — Admin Panel & Multi-Tenant POS System
 * Sistem complet de gestiune multi-filială (Nobis Farm Horești & Zimbreni)
 * RBAC (Șef Rețea / Farmacist Operator), Scanner Barcode USB, Bon POS, Retur Vânzare, Loturi & Expirare, Alerte Rx
 */

(function () {
  'use strict';

  // ──────────────────────────────────────
  //  State
  // ──────────────────────────────────────
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
  let token = localStorage.getItem('farmacia_token') || null;
  let currentUser = null; // { id, username, role, farmacie_id, full_name }
  let activeBranch = 'all'; // 'all' | 'horesti' | 'zimbreni'
  let products = [];
  let orders = [];
  let activeView = 'products';
  let editingProductId = null;
  let deleteProductId = null;
  let deleteOrderId = null;
  let stockProductId = null;
  let filterOnlyOutOfStock = false;

  // POS Cart, Current Receipt & Reports State
  let posCart = []; // [{ id, name, barcode, price, stock, quantity, requires_prescription, farmacie_id }]
  let currentReceiptNumber = generateReceiptNumber();
  let selectedPaymentMethod = 'Numerar';
  let selectedReportDate = new Date().toISOString().split('T')[0];
  let currentViewingReceiptSale = null;

  // ──────────────────────────────────────
  //  DOM Elements
  // ──────────────────────────────────────
  const loginOverlay = document.getElementById('login-overlay');
  const dashboard = document.getElementById('admin-dashboard');
  const loginForm = document.getElementById('login-form');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');
  const presetButtons = document.querySelectorAll('.btn-preset');

  // Topbar & Multi-Location Elements
  const branchSwitcherWrap = document.getElementById('branch-switcher-wrap');
  const branchSelector = document.getElementById('branch-selector');
  const pharmacistBranchBadge = document.getElementById('pharmacist-branch-badge');
  const pharmacistBranchName = document.getElementById('pharmacist-branch-name');
  const userProfilePill = document.getElementById('user-profile-pill');
  const userAvatar = document.getElementById('user-avatar');
  const userDisplayName = document.getElementById('user-display-name');
  const userRoleBadge = document.getElementById('user-role-badge');

  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const sidebarOrdersBadge = document.getElementById('sidebar-orders-badge');

  const viewProducts = document.getElementById('view-products');
  const viewOrders = document.getElementById('view-orders');
  const viewReports = document.getElementById('view-reports');
  const viewAdd = document.getElementById('view-add');
  const viewTitle = document.getElementById('view-title');

  // POS Workstation & Cart Elements
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

  // Rx & Scanner Banner Elements
  const posRxAlertBanner = document.getElementById('pos-rx-alert-banner');
  const posRxAlertText = document.getElementById('pos-rx-alert-text');
  const posClearSearch = document.getElementById('pos-clear-search');
  const posFeedbackMsg = document.getElementById('pos-feedback-msg');

  // Reports View Elements
  const reportsBranchWrap = document.getElementById('reports-branch-wrap');
  const reportsBranchFilter = document.getElementById('reports-branch-filter');
  const reportsDateInput = document.getElementById('reports-date-input');
  const reportsTodayBtn = document.getElementById('reports-today-btn');
  const reportsRefreshBtn = document.getElementById('reports-refresh-btn');
  const repStatRevenue = document.getElementById('rep-stat-revenue');
  const repStatItems = document.getElementById('rep-stat-items');
  const repStatReceipts = document.getElementById('rep-stat-receipts');
  const repStatAvg = document.getElementById('rep-stat-avg');
  const reportsSalesTbody = document.getElementById('reports-sales-tbody');
  const reportsLoading = document.getElementById('reports-loading');

  // Thermal Receipt Modal Elements
  const receiptModal = document.getElementById('receipt-modal');
  const receiptModalClose = document.getElementById('receipt-modal-close');
  const receiptCloseBtn = document.getElementById('receipt-close-btn');
  const receiptPrintBtn = document.getElementById('receipt-print-btn');
  const receiptRefundBtn = document.getElementById('receipt-refund-btn');
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

  // Orders Table & Controls
  const ordersTableBody = document.getElementById('orders-table-body');
  const ordersLoading = document.getElementById('orders-loading');
  const ordersSearch = document.getElementById('orders-search');
  const ordersStatusFilter = document.getElementById('orders-status-filter');

  // Product Form Elements
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
  const prodBranch = document.getElementById('prod-branch');
  const prodExpDate = document.getElementById('prod-exp-date');
  const prodBatch = document.getElementById('prod-batch');
  const prodStock = document.getElementById('prod-stock');
  const prodPrescription = document.getElementById('prod-prescription');
  const prescriptionLabelText = document.getElementById('prescription-label-text');
  const prodImage = document.getElementById('prod-image');
  const prodDescription = document.getElementById('prod-description');

  // Action Modals
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
    setupLoginPresets();
    setupSidebar();
    setupLogout();
    setupBranchSwitcher();
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
  //  Auth & RBAC State
  // ──────────────────────────────────────
  function setupLoginPresets() {
    if (presetButtons) {
      presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          presetButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (loginUsername) loginUsername.value = btn.dataset.user || '';
          if (loginPassword) loginPassword.value = btn.dataset.pass || '';
          if (loginError) loginError.style.display = 'none';
        });
      });
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUsername ? loginUsername.value.trim() : 'admin';
    const password = loginPassword.value.trim();
    if (!password) return;

    loginError.style.display = 'none';

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        loginError.textContent = data.error || 'Nume utilizator sau parolă incorectă.';
        loginError.style.display = 'block';
        return;
      }

      token = data.token;
      currentUser = data.user;
      localStorage.setItem('farmacia_token', token);
      localStorage.setItem('farmacia_user', JSON.stringify(currentUser));
      showDashboard();
      showToast(`Autentificare reușită! Bine ai venit, ${currentUser.full_name || currentUser.username}.`, 'success');

    } catch (err) {
      // Fallback local instant dacă serverul e offline
      if (password === 'Cojocaru1234' || password === 'horesti123' || password === 'zimbreni123') {
        token = 'local_offline_token_' + Date.now();
        localStorage.setItem('farmacia_token', token);

        let role = 'admin';
        let farmId = 'all';
        let name = 'Șef Rețea (Offline)';

        if (username === 'farmacist_horesti') {
          role = 'pharmacist';
          farmId = 'horesti';
          name = 'Farmacist Elena (Horești)';
        } else if (username === 'farmacist_zimbreni') {
          role = 'pharmacist';
          farmId = 'zimbreni';
          name = 'Farmacist Mihai (Zimbreni)';
        }

        currentUser = { username, role, farmacie_id: farmId, full_name: name };
        localStorage.setItem('farmacia_user', JSON.stringify(currentUser));
        showDashboard();
        showToast(`Autentificare locală POS: ${name}`, 'success');
      } else {
        loginError.textContent = 'Parolă sau utilizator incorect.';
        loginError.style.display = 'block';
      }
    }
  });

  async function verifyToken() {
    if (token && token.startsWith('local_offline_token_')) {
      const savedUser = localStorage.getItem('farmacia_user');
      if (savedUser) {
        try { currentUser = JSON.parse(savedUser); } catch(e) {}
      }
      return true;
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        localStorage.setItem('farmacia_user', JSON.stringify(currentUser));
        return true;
      }
      return false;
    } catch {
      const savedUser = localStorage.getItem('farmacia_user');
      if (savedUser) {
        try { currentUser = JSON.parse(savedUser); } catch(e) {}
      }
      return Boolean(token);
    }
  }

  function showLogin() {
    token = null;
    currentUser = null;
    localStorage.removeItem('farmacia_token');
    localStorage.removeItem('farmacia_user');
    document.body.classList.remove('role-pharmacist');
    loginOverlay.style.display = 'flex';
    dashboard.style.display = 'none';
    loginPassword.value = '';
  }

  function showDashboard() {
    loginOverlay.style.display = 'none';
    dashboard.style.display = 'flex';

    if (!currentUser) {
      const saved = localStorage.getItem('farmacia_user');
      if (saved) {
        try { currentUser = JSON.parse(saved); } catch(e) {}
      }
    }

    if (!currentUser) {
      currentUser = { username: 'admin', role: 'admin', farmacie_id: 'all', full_name: 'Șef Rețea' };
    }

    // Configurează interfața în funcție de Rol (Admin vs Farmacist)
    if (currentUser.role === 'pharmacist') {
      document.body.classList.add('role-pharmacist');
      activeBranch = currentUser.farmacie_id || 'horesti';

      if (branchSwitcherWrap) branchSwitcherWrap.style.display = 'none';
      if (pharmacistBranchBadge) {
        pharmacistBranchBadge.style.display = 'flex';
        if (pharmacistBranchName) {
          pharmacistBranchName.textContent = currentUser.farmacie_id === 'zimbreni'
            ? 'Nobis Farm Zimbreni'
            : 'Nobis Farm Horești';
        }
      }
      if (reportsBranchWrap) reportsBranchWrap.style.display = 'none';

      if (userAvatar) userAvatar.textContent = '💊';
      if (userDisplayName) userDisplayName.textContent = currentUser.full_name || 'Farmacist';
      if (userRoleBadge) {
        userRoleBadge.textContent = 'Operator POS';
        userRoleBadge.className = 'user-role-badge badge-pharmacist';
      }

      // Farmacistul are acces doar la POS și rapoartele de tură proprii
      if (activeView === 'add' || activeView === 'orders') {
        switchView('products');
      }
    } else {
      document.body.classList.remove('role-pharmacist');
      activeBranch = branchSelector ? branchSelector.value : 'all';

      if (branchSwitcherWrap) branchSwitcherWrap.style.display = 'flex';
      if (pharmacistBranchBadge) pharmacistBranchBadge.style.display = 'none';
      if (reportsBranchWrap) reportsBranchWrap.style.display = 'flex';

      if (userAvatar) userAvatar.textContent = '👑';
      if (userDisplayName) userDisplayName.textContent = currentUser.full_name || 'Șef Rețea';
      if (userRoleBadge) {
        userRoleBadge.textContent = 'Șef Rețea';
        userRoleBadge.className = 'user-role-badge badge-admin';
      }
    }

    loadDashboardData();
  }

  function setupLogout() {
    logoutBtn.addEventListener('click', () => {
      showToast('Te-ai deconectat.', 'info');
      showLogin();
    });
  }

  function setupBranchSwitcher() {
    if (branchSelector) {
      branchSelector.addEventListener('change', () => {
        activeBranch = branchSelector.value;
        if (reportsBranchFilter) reportsBranchFilter.value = activeBranch;
        loadDashboardData();
        const selectedLabel = branchSelector.options[branchSelector.selectedIndex].text;
        showToast(`Filtrare filială: ${selectedLabel}`, 'info');
      });
    }

    if (reportsBranchFilter) {
      reportsBranchFilter.addEventListener('change', () => {
        loadReports(selectedReportDate);
      });
    }
  }

  // ──────────────────────────────────────
  //  Data Loading (Multi-Tenant)
  // ──────────────────────────────────────
  async function loadDashboardData() {
    await Promise.all([
      loadProducts(),
      currentUser?.role === 'admin' ? loadOrders() : Promise.resolve(),
      loadStats()
    ]);
  }

  async function loadProducts() {
    adminLoading.style.display = 'block';
    try {
      const branchParam = (currentUser && currentUser.role === 'pharmacist')
        ? currentUser.farmacie_id
        : activeBranch;

      const url = `${API_BASE}/api/admin/products?branch=${encodeURIComponent(branchParam)}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

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
          products = [];
        }
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
      const branchParam = (currentUser && currentUser.role === 'pharmacist')
        ? currentUser.farmacie_id
        : activeBranch;

      const res = await fetch(`/api/admin/stats?branch=${encodeURIComponent(branchParam)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const stats = await res.json();
        applyStatsToUI(stats);
      }
    } catch (err) {
      updateDashboardStatsUI();
    }
  }

  function applyStatsToUI({ totalProducts, newOrders, criticalStock, outOfStock }) {
    if (statTotal) statTotal.textContent = totalProducts || 0;
    if (statOrders) statOrders.textContent = newOrders || 0;
    if (statCritical) statCritical.textContent = criticalStock || 0;

    if (sidebarOrdersBadge) {
      if (newOrders > 0 && currentUser?.role === 'admin') {
        sidebarOrdersBadge.textContent = newOrders;
        sidebarOrdersBadge.style.display = 'inline-block';
      } else {
        sidebarOrdersBadge.style.display = 'none';
      }
    }

    if (outOfStockAlert) {
      if (outOfStock > 0) {
        alertTitle.textContent = `Atenție: ${outOfStock} ${outOfStock === 1 ? 'produs are' : 'produse au'} stocul epuizat!`;
        alertDesc.textContent = 'Aceste produse nu pot fi eliberate până la reaprovizionare.';
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

        // Blocare secțiuni restricționate pentru Farmacist
        if (currentUser?.role === 'pharmacist' && (view === 'add' || view === 'orders')) {
          showToast('Acces restricționat: doar Șeful de Rețea poate gestiona aceste module.', 'error');
          return;
        }

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
      viewTitle.textContent = currentUser?.role === 'pharmacist'
        ? `Casă de Marcat (POS) — ${currentUser.farmacie_id === 'zimbreni' ? 'Nobis Farm Zimbreni' : 'Nobis Farm Horești'}`
        : 'Casă de Marcat (POS) & Gestiune Multi-Filială';
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

  // ──────────────────────────────────────
  //  Barcode Scanner & POS Search Controls
  // ──────────────────────────────────────
  function setupProductControls() {
    adminSearch.addEventListener('input', () => {
      if (posClearSearch) {
        posClearSearch.style.display = adminSearch.value ? 'flex' : 'none';
      }
      renderProductsTable();
      checkRxOnInput();
    });

    if (posClearSearch) {
      posClearSearch.addEventListener('click', () => {
        adminSearch.value = '';
        posClearSearch.style.display = 'none';
        hideRxBanner();
        renderProductsTable();
        ensureScannerFocus();
      });
    }

    // Suport Scaner Coduri de Bare USB (tasta Enter trimisă de cititor)
    adminSearch.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = adminSearch.value.trim().toLowerCase();
        if (!val) return;

        // 1. Căutare după cod de bare exact
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
          // Verificare alertă rețetă (Rx)
          if (matched.requires_prescription) {
            triggerRxBanner(matched);
          } else {
            hideRxBanner();
          }

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

  function checkRxOnInput() {
    const val = adminSearch.value.trim().toLowerCase();
    if (!val) {
      hideRxBanner();
      return;
    }
    const rxMatch = products.find(p =>
      p.requires_prescription &&
      ((p.barcode && p.barcode.toLowerCase() === val) || p.name.toLowerCase().includes(val))
    );
    if (rxMatch) {
      triggerRxBanner(rxMatch);
    } else {
      hideRxBanner();
    }
  }

  function triggerRxBanner(prod) {
    if (!posRxAlertBanner) return;
    if (posRxAlertText) {
      posRxAlertText.innerHTML = `Produsul <strong>"${escapeHTML(prod.name)}"</strong> necesită REȚETĂ MEDICALĂ (Rx)! Vă rugăm să solicitați și să verificați rețeta cumpărătorului înainte de eliberare.`;
    }
    posRxAlertBanner.style.display = 'flex';
  }

  function hideRxBanner() {
    if (posRxAlertBanner) posRxAlertBanner.style.display = 'none';
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

  // ──────────────────────────────────────
  //  Render Catalog Table
  // ──────────────────────────────────────
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

    const isAdmin = currentUser?.role === 'admin';

    adminTableBody.innerHTML = filtered.map(p => {
      const inStock = p.stock > 0;
      const isCritical = p.stock > 0 && p.stock < 5;

      // Badge Filială
      const branchBadge = p.farmacie_id === 'zimbreni'
        ? '<span class="badge-branch badge-branch-zimbreni">🏥 Zimbreni</span>'
        : '<span class="badge-branch badge-branch-horesti">🌿 Horești</span>';

      // Badge Expirare & Lot
      let expBadge = '';
      if (p.expiration_date) {
        const expDate = new Date(p.expiration_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
        const expFormatted = p.expiration_date;

        if (diffDays < 0) {
          expBadge = `<div class="badge-exp-soon badge-exp-expired" title="Produsul a expirat!">⚠️ Expirat (${expFormatted})</div>`;
        } else if (diffDays <= 30) {
          expBadge = `<div class="badge-exp-soon" title="Expiră în mai puțin de o lună!">⚠️ Expiră curând (${diffDays}z)</div>`;
        } else {
          expBadge = `<div style="font-size:11px; color:var(--text-muted);">Exp: ${expFormatted}</div>`;
        }
      }
      const batchHtml = p.batch_number
        ? `<div style="font-size:11px; font-family:monospace; color:var(--text-secondary); margin-top:2px;">Lot: ${escapeHTML(p.batch_number)}</div>`
        : '';

      // Rețetă medicală Rx
      const rxBadge = p.requires_prescription
        ? '<span class="rx-badge rx-required" title="Necesită rețetă medicală">⚠️ Rx Rețetă</span>'
        : '<span class="rx-badge rx-free">OTC</span>';

      // Badge Stoc Critic / Epuizat
      let stockBadge = '';
      if (p.stock === 0) {
        stockBadge = '<span class="stock-empty-badge">0 buc (Epuizat)</span>';
      } else if (isCritical) {
        stockBadge = `<span class="badge-stock-critical" title="Stoc sub 5 bucăți!">⚠️ Critic (${p.stock})</span>`;
      }

      // Preț
      const oldPriceHtml = p.old_price
        ? `<span class="table-old-price">${formatPrice(p.old_price)} MDL</span>`
        : '';

      const barcodeHtml = p.barcode
        ? `<div class="table-barcode-chip" onclick="adminActions.searchBarcode('${escapeHTML(p.barcode)}')" title="Click pentru căutare rapidă după cod">🏷️ ${escapeHTML(p.barcode)}</div>`
        : `<div class="table-barcode-chip" style="opacity:0.5; cursor:default;">Fără cod</div>`;

      const defaultImg = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2248%22%20height%3D%2248%22%3E%3Crect%20width%3D%2248%22%20height%3D%2248%22%20fill%3D%22%23f1f5f9%22%2F%3E%3C%2Fsvg%3E';
      const imgSrc = p.image || defaultImg;

      // Restock Box & Actions vizibile doar pentru Șef Rețea / Admin
      const restockCellHtml = isAdmin ? `
        <td class="admin-only-col">
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
      ` : `<td class="admin-only-col" style="display:none;"></td>`;

      const actionsCellHtml = isAdmin ? `
        <td class="admin-only-col" style="text-align:right;">
          <div class="table-actions">
            <button class="btn-icon" title="Editează stocul numeric" onclick="adminActions.editStock(${p.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
              </svg>
            </button>
            <button class="btn-icon" title="Editează datele produsului" onclick="adminActions.edit(${p.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon btn-icon-danger" title="Șterge produsul" onclick="adminActions.deletePrompt(${p.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      ` : `<td class="admin-only-col" style="display:none;"></td>`;

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
          <td>${branchBadge}</td>
          <td>
            ${expBadge}
            ${batchHtml}
            <div style="margin-top:4px;">${rxBadge}</div>
          </td>
          <td>
            <div class="table-price-wrap">
              ${oldPriceHtml}
              <span class="table-price">${formatPrice(p.price)} MDL</span>
            </div>
          </td>
          <td>
            <span class="stock-val" id="stock-val-${p.id}">${p.stock} buc</span>
            ${stockBadge}
          </td>
          <td style="text-align:center;">
            <button class="btn-pos-add ${!inStock ? 'disabled' : ''}" 
                    id="btn-add-cart-${p.id}"
                    ${!inStock ? 'disabled' : ''} 
                    title="${inStock ? 'Adaugă 1 buc. pe bonul curent' : 'Produsul nu mai are stoc'}" 
                    onclick="adminActions.addToCart(${p.id})">
              ${inStock ? '➕ Bon' : '🚫 Fără Stoc'}
            </button>
          </td>
          ${restockCellHtml}
          ${actionsCellHtml}
        </tr>
      `;
    }).join('');
  }

  // ──────────────────────────────────────
  //  Orders Table & Controls
  // ──────────────────────────────────────
  function setupOrderControls() {
    if (ordersSearch) {
      ordersSearch.addEventListener('input', renderOrdersTable);
    }
    if (ordersStatusFilter) {
      ordersStatusFilter.addEventListener('change', renderOrdersTable);
    }
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
        String(o.id).includes(searchVal) ||
        o.customer_name.toLowerCase().includes(searchVal) ||
        o.customer_phone.includes(searchVal) ||
        (o.delivery_address && o.delivery_address.toLowerCase().includes(searchVal))
      );
    }

    if (filtered.length === 0) {
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:48px 20px; color:var(--text-muted);">
            Nicio comandă găsită.
          </td>
        </tr>
      `;
      return;
    }

    ordersTableBody.innerHTML = filtered.map(o => {
      const statusClass = {
        'Nouă': 'status-noua',
        'În procesare': 'status-procesare',
        'Expediată': 'status-expediata',
        'Livrată': 'status-livrata',
        'Anulată': 'status-anulata'
      }[o.status] || 'status-noua';

      const itemsList = Array.isArray(o.items)
        ? o.items.map(it => `<div>${escapeHTML(it.name || it.product_name)} &times; ${it.quantity}</div>`).join('')
        : '—';

      return `
        <tr data-id="${o.id}">
          <td><strong>#${o.id}</strong></td>
          <td>
            <div style="font-weight:600; color:var(--text-primary);">${escapeHTML(o.customer_name)}</div>
            <div style="font-size:12px; color:var(--text-secondary);">${escapeHTML(o.customer_phone)}</div>
            ${o.delivery_address ? `<div style="font-size:11px; color:var(--text-muted); margin-top:2px;">📍 ${escapeHTML(o.delivery_address)}</div>` : ''}
          </td>
          <td><div class="order-items-cell">${itemsList}</div></td>
          <td><strong style="color:var(--primary-dark);">${formatPrice(o.total_price)} MDL</strong></td>
          <td>
            <select class="status-select ${statusClass}" onchange="adminActions.changeOrderStatus(${o.id}, this.value)">
              <option value="Nouă" ${o.status === 'Nouă' ? 'selected' : ''}>Nouă</option>
              <option value="În procesare" ${o.status === 'În procesare' ? 'selected' : ''}>În procesare</option>
              <option value="Expediată" ${o.status === 'Expediată' ? 'selected' : ''}>Expediată</option>
              <option value="Livrată" ${o.status === 'Livrată' ? 'selected' : ''}>Livrată</option>
              <option value="Anulată" ${o.status === 'Anulată' ? 'selected' : ''}>Anulată</option>
            </select>
          </td>
          <td><span style="font-size:12px; color:var(--text-secondary);">${formatDate(o.created_at)}</span></td>
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

      if (currentUser?.role === 'pharmacist') {
        showToast('Acces restricționat: Farmacistul nu poate adăuga sau modifica produse.', 'error');
        return;
      }

      const name = prodName.value.trim();
      const barcode = prodBarcode ? prodBarcode.value.trim() : '';
      const category = prodCategory.value;
      const price = parseFloat(prodPrice.value);
      const oldPriceVal = prodOldPrice.value.trim();
      const old_price = oldPriceVal ? parseFloat(oldPriceVal) : null;
      const farmacie_id = prodBranch ? prodBranch.value : 'horesti';
      const expiration_date = prodExpDate && prodExpDate.value ? prodExpDate.value : null;
      const batch_number = prodBatch && prodBatch.value.trim() ? prodBatch.value.trim() : null;
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
        farmacie_id,
        expiration_date,
        batch_number,
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
  //  USB Barcode Scanner Auto-Refocus
  // ──────────────────────────────────────
  function setupUsbScannerAutoRefocus() {
    document.addEventListener('click', (e) => {
      if (activeView !== 'products') return;
      setTimeout(ensureScannerFocus, 250);
    });

    document.addEventListener('keyup', (e) => {
      if (activeView !== 'products') return;
      if (e.key === 'Escape') {
        adminSearch.value = '';
        if (posClearSearch) posClearSearch.style.display = 'none';
        hideRxBanner();
        renderProductsTable();
        ensureScannerFocus();
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

  // ──────────────────────────────────────
  //  POS Cart (Right Column) & Checkout
  // ──────────────────────────────────────
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
                ${item.requires_prescription ? '<span class="rx-badge rx-required" style="font-size:10px; padding:1px 6px;">Rx Rețetă</span>' : ''}
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
    hideRxBanner();
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

  // ──────────────────────────────────────
  //  Reports View (Filtrabil per filială)
  // ──────────────────────────────────────
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

    const branchVal = (currentUser && currentUser.role === 'pharmacist')
      ? currentUser.farmacie_id
      : (reportsBranchFilter ? reportsBranchFilter.value : activeBranch);

    try {
      const res = await fetch(`${API_BASE}/api/admin/pos/reports?date=${targetDate}&branch=${encodeURIComponent(branchVal)}`, {
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
          <td colspan="10" style="text-align:center; padding: 36px 16px; color: var(--text-muted);">
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

      const branchBadge = s.farmacie_id === 'zimbreni'
        ? `<span class="badge-branch badge-branch-zimbreni">🏥 Zimbreni</span>`
        : `<span class="badge-branch badge-branch-horesti">🌿 Horești</span>`;

      const isRefunded = s.status === 'refunded';
      const statusBadge = isRefunded
        ? `<span class="badge-status-refunded">↩️ Anulat / Retur</span>`
        : `<span style="background:#ecfdf5; color:#059669; font-weight:600; font-size:12px; padding:3px 8px; border-radius:12px; border:1px solid #a7f3d0;">✅ Finalizat</span>`;

      const itemsList = (s.items || []).map(it => `
        <span class="report-item-chip">${escapeHTML(it.name)} <strong>&times; ${it.quantity || 1}</strong></span>
      `).join('');

      const refundBtn = isRefunded ? '' : `
        <button type="button" class="btn btn-outline-danger btn-xs" onclick="adminActions.refundSale('${escapeHTML(s.id)}')" title="Anulează bonul și reîntregește stocul în Supabase">
          ↩️ Retur
        </button>
      `;

      return `
        <tr style="${isRefunded ? 'opacity:0.7; background:#fafafa;' : ''}">
          <td><strong style="font-family:monospace; color:var(--text-primary);">${escapeHTML(s.receipt_number || '')}</strong></td>
          <td>${branchBadge}</td>
          <td><span style="font-size:12px; color:var(--text-secondary);">${escapeHTML(s.operator_name || 'Operator POS')}</span></td>
          <td><span style="font-size:12px; color:var(--text-secondary);">${fullDateStr} ${dateStr}</span></td>
          <td>${payBadge}</td>
          <td>${statusBadge}</td>
          <td><div class="report-items-chips">${itemsList || '—'}</div></td>
          <td style="text-align:center; font-weight:600;">${s.total_items || 1} buc.</td>
          <td><strong style="color:${isRefunded ? '#94a3b8; text-decoration:line-through;' : '#059669'}; font-size:14px;">${formatPrice(s.total_amount)} MDL</strong></td>
          <td style="text-align:right; white-space:nowrap;">
            <button type="button" class="btn btn-outline btn-xs" onclick="adminActions.viewReceiptByNum('${escapeHTML(s.receipt_number)}')">
              👁️ Bon
            </button>
            ${refundBtn}
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderLocalReportsData(targetDate) {
    const sales = getLocalPosSales(targetDate);
    const activeSales = sales.filter(s => s.status !== 'refunded');
    const totalRevenue = activeSales.reduce((acc, s) => acc + (parseFloat(s.total_amount) || 0), 0);
    const totalItems = activeSales.reduce((acc, s) => acc + (parseInt(s.total_items, 10) || 0), 0);
    const count = activeSales.length;
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

  // ──────────────────────────────────────
  //  Thermal Receipt Modal & Retur / Refund
  // ──────────────────────────────────────
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
    if (receiptRefundBtn) {
      receiptRefundBtn.addEventListener('click', () => {
        if (currentViewingReceiptSale) {
          adminActions.refundSale(currentViewingReceiptSale.id || currentViewingReceiptSale.receipt_number);
        }
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
    currentViewingReceiptSale = sale;

    const items = sale.items || [];
    const dateFormatted = sale.created_at
      ? new Date(sale.created_at).toLocaleString('ro-RO')
      : new Date().toLocaleString('ro-RO');

    const branchName = sale.farmacie_id === 'zimbreni'
      ? 'NOBIS FARM ZIMBRENI'
      : 'NOBIS FARM HOREȘTI';

    const branchAddress = sale.farmacie_id === 'zimbreni'
      ? 'sat Zimbreni, r-nul Ialoveni'
      : 'sat Horești, r-nul Ialoveni';

    const isRefunded = sale.status === 'refunded';

    if (receiptRefundBtn) {
      if (isRefunded) {
        receiptRefundBtn.style.display = 'none';
      } else {
        receiptRefundBtn.style.display = 'inline-flex';
      }
    }

    receiptModalBody.innerHTML = `
      <div class="thermal-receipt">
        <div class="receipt-header-text">
          <h4>${branchName}</h4>
          <div>Sănătatea ta, prioritatea noastră</div>
          <div>${branchAddress}, Republica Moldova</div>
          <div>Tel: +373 22 123 456</div>
        </div>
        <div class="receipt-divider"></div>
        ${isRefunded ? '<div style="text-align:center; color:#dc2626; font-weight:bold; font-size:16px; padding:6px 0; border:2px dashed #dc2626; margin-bottom:8px;">*** BON ANULAT / RETUR STOC ***</div>' : ''}
        <div class="receipt-meta-row">
          <span>BON FISCAL:</span>
          <strong>${escapeHTML(sale.receipt_number)}</strong>
        </div>
        <div class="receipt-meta-row">
          <span>FILIALĂ:</span>
          <span>${escapeHTML(branchName)}</span>
        </div>
        <div class="receipt-meta-row">
          <span>DATA / ORA:</span>
          <span>${dateFormatted}</span>
        </div>
        <div class="receipt-meta-row">
          <span>OPERATOR:</span>
          <span>${escapeHTML(sale.operator_name || currentUser?.full_name || 'Farmacist')}</span>
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
  //  Global Actions for Table & POS Buttons
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

      // Verificare alertă rețetă Rx la adăugare
      if (p.requires_prescription) {
        triggerRxBanner(p);
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
            quantity: qty,
            requires_prescription: Boolean(p.requires_prescription),
            farmacie_id: p.farmacie_id || 'horesti'
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
      if (!posCart.some(it => it.requires_prescription)) {
        hideRxBanner();
      }
      renderPosCart();
      ensureScannerFocus();
    },

    clearCart() {
      posCart = [];
      hideRxBanner();
      renderPosCart();
      ensureScannerFocus();
    },

    // ─── POS Checkout (Vânzare Finalizată) ───
    async checkoutPos() {
      if (!posCart.length) {
        showToast('Bonul este gol! Adaugă produse pentru a vinde.', 'error');
        return;
      }

      // Verificare stocuri disponibile
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

      // Determinare filială și operator
      const targetFarmacieId = (currentUser && currentUser.role === 'pharmacist')
        ? currentUser.farmacie_id
        : (activeBranch === 'all' ? (posCart[0]?.farmacie_id || 'horesti') : activeBranch);

      const operatorName = currentUser ? (currentUser.full_name || currentUser.username) : 'Operator POS';

      const payload = {
        receipt_number: receiptNo,
        farmacie_id: targetFarmacieId,
        operator_name: operatorName,
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

        // Actualizare stocuri locale din răspunsul serverului
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
        // Fallback offline: scădere locală instantă
        posCart.forEach(it => {
          const p = products.find(prod => prod.id === it.id);
          if (p) p.stock = Math.max(0, p.stock - it.quantity);
        });
        localStorage.setItem('farmacia_products', JSON.stringify(products));

        const offlineSale = {
          id: 'pos_' + Date.now(),
          receipt_number: receiptNo,
          farmacie_id: targetFarmacieId,
          operator_name: operatorName,
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

    // ─── Retur / Anulare Vânzare POS (Reîntregire Stoc) ───
    async refundSale(saleIdOrReceipt) {
      if (!confirm('Ești sigur că dorești să anulezi acest bon fiscal? Produsele vândute vor fi returnate automat în stocul filialei (+buc)!')) {
        return;
      }

      try {
        const operatorName = currentUser ? (currentUser.full_name || currentUser.username) : 'Operator POS';
        const res = await fetch(`${API_BASE}/api/admin/pos/sales/${encodeURIComponent(saleIdOrReceipt)}/refund`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ operator_name: operatorName })
        });

        if (res.status === 401) return showLogin();
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Eroare la anularea vânzării.');
        }

        const data = await res.json();
        showToast(`✅ Tranzacție anulată! Stocurile au fost reîntregite cu succes.`, 'success');

        if (receiptModal) receiptModal.style.display = 'none';

        await loadProducts();
        await loadReports(selectedReportDate);
        await loadStats();

      } catch (err) {
        showToast(err.message || 'Eroare la procesarea returului.', 'error');
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

    // ─── Editare Produs Formular ───
    edit(id) {
      if (currentUser?.role === 'pharmacist') {
        showToast('Acces restricționat: doar administratorul poate edita produsele.', 'error');
        return;
      }

      const p = products.find(prod => prod.id === id);
      if (!p) return;

      editingProductId = id;
      editIdField.value = id;
      prodName.value = p.name;
      if (prodBarcode) prodBarcode.value = p.barcode || '';
      prodCategory.value = p.category || 'General';
      prodPrice.value = p.price;
      prodOldPrice.value = p.old_price !== null && p.old_price !== undefined ? p.old_price : '';
      if (prodBranch) prodBranch.value = p.farmacie_id || 'horesti';
      if (prodExpDate) prodExpDate.value = p.expiration_date || '';
      if (prodBatch) prodBatch.value = p.batch_number || '';
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

    // ─── Reaprovizionare Marfă (+N bucăți) ───
    async quickRestock(id) {
      if (currentUser?.role === 'pharmacist') {
        showToast('Acces restricționat: Farmacistul nu poate reaproviziona stocul.', 'error');
        return;
      }

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
      checkRxOnInput();
      adminSearch.focus();
    },

    editStock(id) {
      if (currentUser?.role === 'pharmacist') {
        showToast('Acces restricționat: Farmacistul nu poate modifica stocul manual.', 'error');
        return;
      }
      const p = products.find(prod => prod.id === id);
      if (!p) return;
      stockProductId = id;
      stockProductName.textContent = p.name;
      stockInput.value = p.stock;
      stockModal.style.display = 'flex';
      stockInput.focus();
    },

    deletePrompt(id) {
      if (currentUser?.role === 'pharmacist') {
        showToast('Acces restricționat: Farmacistul nu poate șterge produse.', 'error');
        return;
      }
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
  //  Feedback Audio / Beep
  // ──────────────────────────────────────
  function playBeep(success = true) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = success ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(success ? 880 : 220, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.12 : 0.25));

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.12 : 0.25));
    } catch (e) {}
  }

  function generateReceiptNumber() {
    const d = new Date();
    const yr = String(d.getFullYear()).slice(-2);
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const rnd = Math.floor(1000 + Math.random() * 9000);
    return `NF-${yr}${mo}${day}-${rnd}`;
  }

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
    return parseFloat(num || 0).toFixed(2);
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
