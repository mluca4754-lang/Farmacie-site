/**
 * Farmacia Moldova — Admin Panel JavaScript
 */

(function () {
  'use strict';

  // ──────────────────────────────────────
  //  State
  // ──────────────────────────────────────
  let token = localStorage.getItem('farmacia_token') || null;
  let products = [];
  let editingProductId = null;
  let deleteProductId = null;
  let stockProductId = null;

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

  const viewProducts = document.getElementById('view-products');
  const viewAdd = document.getElementById('view-add');
  const viewTitle = document.getElementById('view-title');

  const adminTableBody = document.getElementById('admin-table-body');
  const adminLoading = document.getElementById('admin-loading');
  const adminSearch = document.getElementById('admin-search');

  const productForm = document.getElementById('product-form');
  const formTitle = document.getElementById('form-title');
  const formCancel = document.getElementById('form-cancel');
  const editIdField = document.getElementById('edit-id');

  // Stats
  const statTotal = document.getElementById('admin-stat-total');
  const statInStock = document.getElementById('admin-stat-instock');
  const statOutOfStock = document.getElementById('admin-stat-outofstock');
  const statCategories = document.getElementById('admin-stat-categories');

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
    setupAdminSearch();

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
      const res = await fetch('/api/login', {
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
      loginError.textContent = 'Eroare de conexiune. Încearcă din nou.';
      loginError.style.display = 'block';
    }
  });

  async function verifyToken() {
    try {
      const res = await fetch('/api/admin/verify', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function showLogin() {
    token = null;
    localStorage.removeItem('farmacia_token');
    loginOverlay.style.display = 'flex';
    dashboard.style.display = 'none';
    loginPassword.value = '';
    loginPassword.focus();
  }

  function showDashboard() {
    loginOverlay.style.display = 'none';
    dashboard.style.display = 'flex';
    loadProducts();
  }

  function setupLogout() {
    logoutBtn.addEventListener('click', () => {
      showLogin();
      showToast('Deconectat cu succes.', 'info');
    });
  }

  // ──────────────────────────────────────
  //  API Calls
  // ──────────────────────────────────────
  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  async function loadProducts() {
    adminLoading.style.display = 'block';
    adminTableBody.innerHTML = '';

    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error();
      products = await res.json();
      updateStats();
      renderTable();
    } catch (err) {
      showToast('Eroare la încărcarea produselor.', 'error');
    } finally {
      adminLoading.style.display = 'none';
    }
  }

  async function createProduct(data) {
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    return res.json();
  }

  async function updateProductAPI(id, data) {
    const res = await fetch(`/api/admin/products/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    return res.json();
  }

  async function updateStockAPI(id, stock) {
    const res = await fetch(`/api/admin/products/${id}/stock`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ stock })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    return res.json();
  }

  async function deleteProductAPI(id) {
    const res = await fetch(`/api/admin/products/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    return res.json();
  }

  // ──────────────────────────────────────
  //  Stats
  // ──────────────────────────────────────
  function updateStats() {
    const total = products.length;
    const inStock = products.filter(p => p.stock > 0).length;
    const outOfStock = products.filter(p => p.stock === 0).length;
    const categories = new Set(products.map(p => p.category).filter(Boolean)).size;

    statTotal.textContent = total;
    statInStock.textContent = inStock;
    statOutOfStock.textContent = outOfStock;
    statCategories.textContent = categories;
  }

  // ──────────────────────────────────────
  //  Table Rendering
  // ──────────────────────────────────────
  function renderTable(filter = '') {
    let filtered = products;
    if (filter) {
      const q = filter.toLowerCase();
      filtered = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      adminTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px; color:var(--text-muted);">
            ${filter ? 'Niciun produs găsit.' : 'Nu există produse. Adaugă primul produs!'}
          </td>
        </tr>
      `;
      return;
    }

    adminTableBody.innerHTML = filtered.map(p => {
      const inStock = p.stock > 0;
      const statusClass = inStock ? 'status-in-stock' : 'status-out-of-stock';
      const statusText = inStock ? 'În stoc' : 'Stoc epuizat';
      const imgSrc = p.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjMWEyMzMyIi8+PC9zdmc+';

      return `
        <tr data-id="${p.id}">
          <td>
            <img class="table-img" src="${escapeHTML(imgSrc)}" alt="${escapeHTML(p.name)}"
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjMWEyMzMyIi8+PC9zdmc+'">
          </td>
          <td>
            <div class="table-product-name">${escapeHTML(p.name)}</div>
            <div class="table-product-desc">${escapeHTML(p.description || '')}</div>
          </td>
          <td><span class="table-category">${escapeHTML(p.category || 'General')}</span></td>
          <td><span class="table-price">${formatPrice(p.price)} MDL</span></td>
          <td class="table-stock">${p.stock}</td>
          <td><span class="table-status ${statusClass}">${statusText}</span></td>
          <td>
            <div class="table-actions">
              <button class="btn-icon" title="Editează" onclick="adminActions.edit(${p.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-icon" title="Modifică stoc" onclick="adminActions.stock(${p.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
                </svg>
              </button>
              <button class="btn-icon btn-icon-danger" title="Șterge" onclick="adminActions.confirmDelete(${p.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
  //  Sidebar / Navigation
  // ──────────────────────────────────────
  function setupSidebar() {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    sidebarLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;

        sidebarLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        switchView(view);
        sidebar.classList.remove('open');
      });
    });
  }

  function switchView(view) {
    viewProducts.style.display = 'none';
    viewAdd.style.display = 'none';

    if (view === 'products') {
      viewProducts.style.display = 'block';
      viewTitle.textContent = 'Gestionare Produse';
      loadProducts();
    } else if (view === 'add') {
      viewAdd.style.display = 'block';
      viewTitle.textContent = editingProductId ? 'Editează Produs' : 'Adaugă Produs Nou';
      if (!editingProductId) resetForm();
    }
  }

  // ──────────────────────────────────────
  //  Product Form
  // ──────────────────────────────────────
  function setupForm() {
    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = {
        name: document.getElementById('prod-name').value.trim(),
        description: document.getElementById('prod-description').value.trim(),
        price: parseFloat(document.getElementById('prod-price').value),
        stock: parseInt(document.getElementById('prod-stock').value),
        image: document.getElementById('prod-image').value.trim(),
        category: document.getElementById('prod-category').value.trim() || 'General'
      };

      if (!data.name || isNaN(data.price) || isNaN(data.stock)) {
        showToast('Completează câmpurile obligatorii.', 'error');
        return;
      }

      try {
        if (editingProductId) {
          await updateProductAPI(editingProductId, data);
          showToast('Produs actualizat cu succes!', 'success');
        } else {
          await createProduct(data);
          showToast('Produs adăugat cu succes!', 'success');
        }

        editingProductId = null;
        resetForm();
        switchToProducts();
      } catch (err) {
        showToast(err.message || 'Eroare la salvarea produsului.', 'error');
      }
    });

    formCancel.addEventListener('click', () => {
      editingProductId = null;
      resetForm();
      switchToProducts();
    });
  }

  function resetForm() {
    productForm.reset();
    editIdField.value = '';
    formTitle.textContent = 'Adaugă Produs Nou';
    document.getElementById('prod-category').value = 'General';
  }

  function populateForm(product) {
    document.getElementById('prod-name').value = product.name || '';
    document.getElementById('prod-description').value = product.description || '';
    document.getElementById('prod-price').value = product.price || '';
    document.getElementById('prod-stock').value = product.stock || 0;
    document.getElementById('prod-image').value = product.image || '';
    document.getElementById('prod-category').value = product.category || 'General';
  }

  function switchToProducts() {
    sidebarLinks.forEach(l => l.classList.remove('active'));
    document.getElementById('sidebar-products').classList.add('active');
    switchView('products');
  }

  // ──────────────────────────────────────
  //  Modals
  // ──────────────────────────────────────
  function setupModals() {
    // Stock modal
    stockModalClose.addEventListener('click', closeStockModal);
    stockCancel.addEventListener('click', closeStockModal);
    stockSave.addEventListener('click', saveStock);

    // Delete modal
    deleteModalClose.addEventListener('click', closeDeleteModal);
    deleteCancel.addEventListener('click', closeDeleteModal);
    deleteConfirm.addEventListener('click', confirmDeleteProduct);

    // Close on overlay click
    stockModal.addEventListener('click', (e) => {
      if (e.target === stockModal) closeStockModal();
    });
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) closeDeleteModal();
    });
  }

  function openStockModal(product) {
    stockProductId = product.id;
    stockProductName.textContent = product.name;
    stockInput.value = product.stock;
    stockModal.style.display = 'flex';
    stockInput.focus();
  }

  function closeStockModal() {
    stockModal.style.display = 'none';
    stockProductId = null;
  }

  async function saveStock() {
    const newStock = parseInt(stockInput.value);
    if (isNaN(newStock) || newStock < 0) {
      showToast('Introdu un număr valid.', 'error');
      return;
    }

    try {
      await updateStockAPI(stockProductId, newStock);
      showToast('Stocul a fost actualizat!', 'success');
      closeStockModal();
      await loadProducts();
    } catch (err) {
      showToast(err.message || 'Eroare la actualizarea stocului.', 'error');
    }
  }

  function openDeleteModal(product) {
    deleteProductId = product.id;
    deleteProductName.textContent = product.name;
    deleteModal.style.display = 'flex';
  }

  function closeDeleteModal() {
    deleteModal.style.display = 'none';
    deleteProductId = null;
  }

  async function confirmDeleteProduct() {
    try {
      await deleteProductAPI(deleteProductId);
      showToast('Produs șters cu succes.', 'success');
      closeDeleteModal();
      await loadProducts();
    } catch (err) {
      showToast(err.message || 'Eroare la ștergerea produsului.', 'error');
    }
  }

  // ──────────────────────────────────────
  //  Admin Search
  // ──────────────────────────────────────
  function setupAdminSearch() {
    let timer;
    adminSearch.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        renderTable(e.target.value.trim());
      }, 200);
    });
  }

  // ──────────────────────────────────────
  //  Toast Notifications
  // ──────────────────────────────────────
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${escapeHTML(message)}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4000);
  }

  // ──────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────
  function formatPrice(price) {
    return parseFloat(price).toFixed(2);
  }

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ──────────────────────────────────────
  //  Global Actions (called from inline onclick)
  // ──────────────────────────────────────
  window.adminActions = {
    edit(id) {
      const product = products.find(p => p.id === id);
      if (!product) return;

      editingProductId = id;
      formTitle.textContent = `Editează: ${product.name}`;
      populateForm(product);

      sidebarLinks.forEach(l => l.classList.remove('active'));
      document.getElementById('sidebar-add').classList.add('active');
      switchView('add');
      viewTitle.textContent = 'Editează Produs';
    },

    stock(id) {
      const product = products.find(p => p.id === id);
      if (!product) return;
      openStockModal(product);
    },

    confirmDelete(id) {
      const product = products.find(p => p.id === id);
      if (!product) return;
      openDeleteModal(product);
    }
  };

})();
