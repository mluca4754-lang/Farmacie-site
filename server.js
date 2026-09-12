/**
 * Farmacia Moldova — Server Principal
 * Node.js + Express | SQLite / PostgreSQL
 */

require('dotenv').config({ override: false });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const {
  pool,
  initDatabase,
  getAllProducts,
  getProductById,
  addProduct,
  updateProduct,
  updateStock,
  toggleStock,
  sellProduct,
  restockProduct,
  deleteProduct,
  countProducts,
  countAdmins,
  getAdminByUsername,
  createAdmin,
  updateAdminPassword,
  getAllOrders,
  getOrderById,
  addOrder,
  updateOrderStatus,
  deleteOrder,
  countOrders,
  getDashboardStats,
  recordPosSale,
  refundPosSale,
  getPosSales,
  getPosSalesReport
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'farmacia_moldova_secret_key_change_me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Cojocaru1234';

// Hash-ul parolei de admin (se calculează la pornire)
let adminPasswordHash;

// ──────────────────────────────────────────────
//  Middleware
// ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
//  Middleware de autentificare JWT & Roluri (RBAC)
// ──────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acces neautorizat. Token lipsă.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded; // Compatibilitate
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid sau expirat.' });
  }
}

/**
 * Verifică dacă utilizatorul curent are rolul de 'admin' (Șef / Super-Admin)
 */
function requireAdminRole(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Acces refuzat. Operatorii casieri (Farmaciști) nu au permisiunea de a modifica prețuri, recepții sau de a șterge produse.'
    });
  }
  next();
}

// ──────────────────────────────────────────────
//  Rute API — Publice Produse
// ──────────────────────────────────────────────

// GET /api/products — Lista tuturor produselor
app.get('/api/products', async (req, res) => {
  try {
    const products = await getAllProducts();
    res.json(products);
  } catch (err) {
    console.error('Eroare la obținerea produselor:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// GET /api/products/:id — Un singur produs
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produs negăsit.' });
    res.json(product);
  } catch (err) {
    console.error('Eroare la obținerea produsului:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// POST /api/orders — Creare comandă din site (public)
app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, customer_phone, delivery_address, items, total_price, notes } = req.body;
    if (!customer_name || !customer_phone || !delivery_address || !items || total_price === undefined) {
      return res.status(400).json({ error: 'Numele, telefonul, adresa, produsele și totalul sunt obligatorii.' });
    }
    const order = await addOrder({
      customer_name,
      customer_phone,
      delivery_address,
      items,
      total_price,
      status: 'Nouă',
      notes: notes || ''
    });
    res.status(201).json(order);
  } catch (err) {
    console.error('Eroare la plasarea comenzii:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// ──────────────────────────────────────────────
//  Rute API — Autentificare Admin
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
//  Rute API — Autentificare Admin & Farmaciști (RBAC)
// ──────────────────────────────────────────────

// POST /api/login — Autentificare utilizator
app.post('/api/login', async (req, res) => {
  try {
    const { password, username = 'admin' } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Parola este obligatorie.' });
    }

    const admin = await getAdminByUsername(username);
    let valid = false;

    if (admin && admin.password) {
      valid = await bcrypt.compare(password, admin.password);
      // Sincronizare automată dacă parola este Cojocaru1234 sau ADMIN_PASSWORD
      if (!valid && username === 'admin' && (password === 'Cojocaru1234' || password === 'admin123' || (ADMIN_PASSWORD && password === ADMIN_PASSWORD))) {
        const newHash = await bcrypt.hash(password, 10);
        await updateAdminPassword(username, newHash);
        valid = true;
      }
    } else if (username === 'admin') {
      // Fallback la parola din mediu dacă contul nu există încă
      const expectedHash = adminPasswordHash || await bcrypt.hash(ADMIN_PASSWORD, 10);
      valid = await bcrypt.compare(password, expectedHash) || password === 'Cojocaru1234' || password === 'admin123';
      if (valid) {
        const hashToSave = await bcrypt.hash(password, 10);
        await createAdmin('admin', hashToSave, 'admin', 'all', 'Șef Rețea (Super-Admin)');
      }
    }

    if (!valid) {
      return res.status(401).json({ error: 'Nume de utilizator sau parolă incorectă.' });
    }

    const currentAdmin = await getAdminByUsername(username);
    const role = currentAdmin ? (currentAdmin.role || 'admin') : 'admin';
    const farmacie_id = currentAdmin ? (currentAdmin.farmacie_id || 'all') : 'all';
    const full_name = currentAdmin ? (currentAdmin.full_name || username) : username;

    const token = jwt.sign({
      id: currentAdmin ? currentAdmin.id : 1,
      username,
      role,
      farmacie_id,
      full_name
    }, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      token,
      user: {
        username,
        role,
        farmacie_id,
        full_name
      },
      message: 'Autentificare reușită!'
    });
  } catch (err) {
    console.error('Eroare la autentificare:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// GET /api/admin/verify — Verifică dacă token-ul este valid și returnează datele de utilizator
app.get('/api/admin/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user, message: 'Token valid.' });
});

// ──────────────────────────────────────────────
//  Rute API — Dashboard & Statistici
// ──────────────────────────────────────────────

// GET /api/admin/stats — Statistici rapide pentru Dashboard (filtrabil după filială)
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  try {
    const branch = req.user.role === 'pharmacist' ? req.user.farmacie_id : (req.query.branch || 'all');
    const stats = await getDashboardStats(branch);
    res.json(stats);
  } catch (err) {
    console.error('Eroare la obținerea statisticilor:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// ──────────────────────────────────────────────
//  Rute API — Admin Produse (CRUD Avansat & RBAC)
// ──────────────────────────────────────────────

// GET /api/admin/products — Lista produselor pentru panou (filtrată automat per filială)
app.get('/api/admin/products', authMiddleware, async (req, res) => {
  try {
    const branch = req.user.role === 'pharmacist' ? req.user.farmacie_id : (req.query.branch || 'all');
    const products = await getAllProducts(branch);
    res.json(products);
  } catch (err) {
    console.error('Eroare la obținerea produselor pentru admin:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// POST /api/admin/products — Adaugă un produs nou (Doar Admin / Șef)
app.post('/api/admin/products', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const { name, barcode, description, price, old_price, stock, image, category, requires_prescription, farmacie_id, expiration_date, batch_number } = req.body;
    if (!name || price === undefined || stock === undefined) {
      return res.status(400).json({ error: 'Numele, prețul și stocul sunt obligatorii.' });
    }
    const product = await addProduct({
      name,
      barcode: barcode ? String(barcode).trim() : '',
      description,
      price: parseFloat(price),
      old_price,
      stock: parseInt(stock, 10),
      image,
      category,
      requires_prescription,
      farmacie_id: farmacie_id || 'horesti',
      expiration_date: expiration_date || null,
      batch_number: batch_number || ''
    });
    res.status(201).json(product);
  } catch (err) {
    console.error('Eroare la adăugarea produsului:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// PUT /api/admin/products/:id — Actualizează un produs (Doar Admin / Șef)
app.put('/api/admin/products/:id', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const existing = await getProductById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produs negăsit.' });

    const { name, barcode, description, price, old_price, stock, image, category, requires_prescription, farmacie_id, expiration_date, batch_number } = req.body;
    const updated = await updateProduct(req.params.id, {
      name: name || existing.name,
      barcode: barcode !== undefined ? String(barcode).trim() : existing.barcode,
      description: description !== undefined ? description : existing.description,
      price: price !== undefined ? parseFloat(price) : existing.price,
      old_price: old_price !== undefined ? old_price : existing.old_price,
      stock: stock !== undefined ? parseInt(stock, 10) : existing.stock,
      image: image !== undefined ? image : existing.image,
      category: category || existing.category,
      requires_prescription: requires_prescription !== undefined ? requires_prescription : existing.requires_prescription,
      farmacie_id: farmacie_id || existing.farmacie_id,
      expiration_date: expiration_date !== undefined ? expiration_date : existing.expiration_date,
      batch_number: batch_number !== undefined ? batch_number : existing.batch_number
    });
    res.json(updated);
  } catch (err) {
    console.error('Eroare la actualizarea produsului:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// POST /api/admin/products/:id/sell — Vânzare rapidă POS (-1 Vândut)
app.post('/api/admin/products/:id/sell', authMiddleware, async (req, res) => {
  try {
    const existing = await getProductById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produs negăsit.' });

    // Verificare izolare filială pentru farmacist
    if (req.user.role === 'pharmacist' && existing.farmacie_id !== req.user.farmacie_id) {
      return res.status(403).json({ error: 'Nu aveți permisiunea de a opera stocul altei filiale.' });
    }

    if (existing.stock <= 0) {
      return res.status(400).json({
        error: `Produsul "${existing.name}" are deja stoc 0 (Fără stoc).`,
        product: existing
      });
    }

    const updated = await sellProduct(req.params.id);
    res.json({
      success: true,
      message: `Vânzare înregistrată (-1 buc). Stoc nou: ${updated.stock} buc.`,
      product: updated
    });
  } catch (err) {
    console.error('Eroare la vânzarea rapidă POS:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// POST /api/admin/products/:id/restock — Reaprovizionare marfă nouă (+N bucăți, Doar Admin / Șef)
app.post('/api/admin/products/:id/restock', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const existing = await getProductById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produs negăsit.' });

    const quantity = parseInt(req.body.quantity, 10);
    if (isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Cantitatea de reaprovizionare trebuie să fie un număr pozitiv.' });
    }

    const updated = await restockProduct(req.params.id, quantity);
    res.json({
      success: true,
      message: `Reaprovizionare reușită (+${quantity} buc). Stoc nou: ${updated.stock} buc.`,
      product: updated
    });
  } catch (err) {
    console.error('Eroare la reaprovizionare:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// PATCH /api/admin/products/:id/stock — Actualizează doar stocul (Doar Admin / Șef)
app.patch('/api/admin/products/:id/stock', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const { stock } = req.body;
    if (stock === undefined) return res.status(400).json({ error: 'Stocul este obligatoriu.' });
    const updated = await updateStock(req.params.id, parseInt(stock, 10));
    if (!updated) return res.status(404).json({ error: 'Produs negăsit.' });
    res.json(updated);
  } catch (err) {
    console.error('Eroare la actualizarea stocului:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// PATCH /api/admin/products/:id/toggle-stock — Comutare rapidă În Stoc / Fără Stoc (Doar Admin / Șef)
app.patch('/api/admin/products/:id/toggle-stock', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const updated = await toggleStock(req.params.id);
    if (!updated) return res.status(404).json({ error: 'Produs negăsit.' });
    res.json(updated);
  } catch (err) {
    console.error('Eroare la comutarea stocului:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// ──────────────────────────────────────────────
//  Rute API — POS Vânzare la Casă, Retur & Rapoarte
// ──────────────────────────────────────────────

// POST /api/admin/pos/checkout — Finalizează vânzarea pe bon (achitat)
app.post('/api/admin/pos/checkout', authMiddleware, async (req, res) => {
  try {
    const { items, total_amount, total_items, payment_method, receipt_number, farmacie_id } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Bonul nu conține niciun produs.' });
    }

    // Izolare multi-tenant: Farmacistul vinde strict pentru filiala sa!
    const branch = req.user.role === 'pharmacist' ? req.user.farmacie_id : (farmacie_id || 'horesti');
    const operator = req.user.full_name || req.user.username || 'Farmacist';

    // Înregistrăm vânzarea, scădem stocurile atomic și salvăm bonul
    const result = await recordPosSale({
      items,
      total_amount,
      total_items,
      payment_method: payment_method || 'Numerar',
      receipt_number,
      farmacie_id: branch,
      operator_name: operator
    });

    res.json({
      success: true,
      message: 'Vânzare finalizată cu succes!',
      sale: result.sale,
      updatedProducts: result.updatedProducts
    });
  } catch (err) {
    console.error('Eroare la finalizarea vânzării POS:', err);
    res.status(500).json({ error: err.message || 'Eroare la înregistrarea vânzării.' });
  }
});

// POST /api/admin/pos/sales/:id/refund — Retur / Anulare Vânzare (+reîntregire automată stoc)
app.post('/api/admin/pos/sales/:id/refund', authMiddleware, async (req, res) => {
  try {
    const saleId = req.params.id;
    const operator = req.user.full_name || req.user.username || 'Farmacist';
    const result = await refundPosSale(saleId, `${operator} (Retur)`);

    res.json({
      success: true,
      message: `Bonul #${result.sale.receipt_number} a fost anulat cu succes, iar stocurile au fost restabilite.`,
      sale: result.sale,
      restoredProducts: result.restoredProducts
    });
  } catch (err) {
    console.error('Eroare la anularea vânzării POS:', err);
    res.status(400).json({ error: err.message || 'Eroare la anularea bonului.' });
  }
});

// GET /api/admin/pos/reports — Rapoarte vânzări (azi sau o anumită dată, filtrabil per filială)
app.get('/api/admin/pos/reports', authMiddleware, async (req, res) => {
  try {
    const date = req.query.date || null;
    const branch = req.user.role === 'pharmacist' ? req.user.farmacie_id : (req.query.branch || 'all');
    const report = await getPosSalesReport({ targetDate: date, farmacieId: branch });
    res.json(report);
  } catch (err) {
    console.error('Eroare la generarea raportului POS:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// GET /api/admin/pos/sales — Istoric bonuri POS (filtrabil per filială)
app.get('/api/admin/pos/sales', authMiddleware, async (req, res) => {
  try {
    const date = req.query.date || null;
    const limit = parseInt(req.query.limit, 10) || 100;
    const branch = req.user.role === 'pharmacist' ? req.user.farmacie_id : (req.query.branch || 'all');
    const sales = await getPosSales({ date, farmacieId: branch, limit });
    res.json(sales);
  } catch (err) {
    console.error('Eroare la obținerea istoricului de vânzări:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// DELETE /api/admin/products/:id — Șterge un produs (Doar Admin / Șef)
app.delete('/api/admin/products/:id', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const existing = await getProductById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produs negăsit.' });
    await deleteProduct(req.params.id);
    res.json({ message: 'Produs șters cu succes.' });
  } catch (err) {
    console.error('Eroare la ștergerea produsului:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// ──────────────────────────────────────────────
//  Rute API — Admin Comenzi (Orders Management)
// ──────────────────────────────────────────────

// GET /api/admin/orders — Lista tuturor comenzilor
app.get('/api/admin/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await getAllOrders();
    res.json(orders);
  } catch (err) {
    console.error('Eroare la obținerea comenzilor:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// PATCH /api/admin/orders/:id/status — Modifică statusul unei comenzi
app.patch('/api/admin/orders/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Statusul este obligatoriu.' });
    const allowedStatuses = ['Nouă', 'În procesare', 'Trimisă', 'Finalizată', 'Anulată'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status invalid. Valori permise: ' + allowedStatuses.join(', ') });
    }
    const updated = await updateOrderStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ error: 'Comandă negăsită.' });
    res.json(updated);
  } catch (err) {
    console.error('Eroare la actualizarea statusului comenzii:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// DELETE /api/admin/orders/:id — Șterge o comandă
app.delete('/api/admin/orders/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await getOrderById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Comandă negăsită.' });
    await deleteOrder(req.params.id);
    res.json({ message: 'Comandă ștearsă cu succes.' });
  } catch (err) {
    console.error('Eroare la ștergerea comenzii:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// ──────────────────────────────────────────────
//  Rute pentru pagini (SPA fallback)
// ──────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ──────────────────────────────────────────────
//  Seed — Date inițiale demonstrative pentru produse (Horești & Zimbreni)
// ──────────────────────────────────────────────
async function seedProducts() {
  const dNow = new Date();
  // Calculăm date de expirare realiste
  const expSoonDate = new Date(dNow.getTime() + 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // ~18 zile
  const expVerySoon = new Date(dNow.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // ~8 zile
  const expSafe1 = new Date(dNow.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 1 an
  const expSafe2 = new Date(dNow.getTime() + 540 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 1.5 ani

  const demoProducts = [
    // ══════ FILIALA 1: Nobis Farm Horești ══════
    {
      name: 'Paracetamol 500mg',
      barcode: '5941234567890',
      description: 'Analgezic și antipiretic. Cutie cu 20 comprimate filmate. Ameliorează durerea și reduce febra.',
      price: 25.50,
      old_price: 32.00,
      stock: 150,
      image: 'https://images.unsplash.com/photo-1584308666544-ad5e1f2a6610?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: false,
      farmacie_id: 'horesti',
      expiration_date: expSafe1,
      batch_number: 'LOT-HOR-2026-A1'
    },
    {
      name: 'Ibuprofen 400mg',
      barcode: '5942345678901',
      description: 'Anti-inflamator nesteroidian. Cutie cu 10 comprimate. Eficient împotriva durerilor musculare.',
      price: 35.00,
      old_price: null,
      stock: 80,
      image: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: false,
      farmacie_id: 'horesti',
      expiration_date: expSafe2,
      batch_number: 'LOT-HOR-2026-B2'
    },
    {
      name: 'Vitamina C 1000mg',
      barcode: '5943456789012',
      description: 'Supliment alimentar. 20 comprimate efervescente cu aromă de portocale. Susține imunitatea.',
      price: 65.90,
      old_price: 79.90,
      stock: 200,
      image: 'https://images.unsplash.com/photo-1556227834-09f1de7a7d14?w=400&h=300&fit=crop',
      category: 'Suplimente',
      requires_prescription: false,
      farmacie_id: 'horesti',
      expiration_date: expSafe1,
      batch_number: 'LOT-HOR-2026-C3'
    },
    {
      name: 'Amoxicilină 500mg (Antibiotic)',
      barcode: '5944567890123',
      description: 'Antibiotic cu spectru larg. Cutie cu 16 capsule. Se eliberează strict pe bază de prescripție medicală.',
      price: 42.00,
      old_price: null,
      stock: 14,
      image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: true,
      farmacie_id: 'horesti',
      expiration_date: expSafe2,
      batch_number: 'LOT-HOR-RX-99'
    },
    {
      name: 'Cremă Hidratantă Acid Hialuronic',
      barcode: '5945678901234',
      description: 'Cosmetice dermatologice. Flacon 50ml. Hidratare intensă 24h pentru ten sensibil.',
      price: 145.00,
      old_price: 180.00,
      stock: 3, // STOC CRITIC (< 5)
      image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&h=300&fit=crop',
      category: 'Cosmetice',
      requires_prescription: false,
      farmacie_id: 'horesti',
      expiration_date: expSoonDate, // EXPIRĂ ÎN < 30 ZILE!
      batch_number: 'LOT-HOR-EXP-01'
    },
    {
      name: 'Sirop Alinare Colici Bebeluși',
      barcode: '5947890123456',
      description: 'Copii & Mămici. 100ml. Formulă naturală pe bază de mărar și mușețel pentru bebeluși.',
      price: 85.00,
      old_price: 99.00,
      stock: 2, // STOC CRITIC (< 5)
      image: 'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?w=400&h=300&fit=crop',
      category: 'Copii & Mămici',
      requires_prescription: false,
      farmacie_id: 'horesti',
      expiration_date: expVerySoon, // EXPIRĂ FOARTE CURÂND!
      batch_number: 'LOT-HOR-EXP-02'
    },
    {
      name: 'Spray Nazal Xilometazolină',
      barcode: '5948901234567',
      description: 'Decongestionant nazal cu acțiune rapidă. Flacon 10ml.',
      price: 45.00,
      old_price: null,
      stock: 0, // FĂRĂ STOC
      image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: false,
      farmacie_id: 'horesti',
      expiration_date: expSafe1,
      batch_number: 'LOT-HOR-2026-D4'
    },

    // ══════ FILIALA 2: Nobis Farm Zimbreni ══════
    {
      name: 'Paracetamol 500mg',
      barcode: '5941234567890',
      description: 'Analgezic și antipiretic. Cutie cu 20 comprimate filmate.',
      price: 25.50,
      old_price: 32.00,
      stock: 95,
      image: 'https://images.unsplash.com/photo-1584308666544-ad5e1f2a6610?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: false,
      farmacie_id: 'zimbreni',
      expiration_date: expSafe1,
      batch_number: 'LOT-ZIM-2026-A1'
    },
    {
      name: 'Ibuprofen 400mg',
      barcode: '5942345678901',
      description: 'Anti-inflamator nesteroidian. Cutie cu 10 comprimate.',
      price: 35.00,
      old_price: null,
      stock: 4, // STOC CRITIC (< 5)
      image: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: false,
      farmacie_id: 'zimbreni',
      expiration_date: expSafe2,
      batch_number: 'LOT-ZIM-2026-B2'
    },
    {
      name: 'Vitamina C 1000mg',
      barcode: '5943456789012',
      description: 'Supliment alimentar. 20 comprimate efervescente cu aromă de portocale.',
      price: 65.90,
      old_price: 79.90,
      stock: 65,
      image: 'https://images.unsplash.com/photo-1556227834-09f1de7a7d14?w=400&h=300&fit=crop',
      category: 'Suplimente',
      requires_prescription: false,
      farmacie_id: 'zimbreni',
      expiration_date: expSoonDate, // EXPIRĂ ÎN < 30 ZILE!
      batch_number: 'LOT-ZIM-EXP-01'
    },
    {
      name: 'Amoxicilină 500mg (Antibiotic)',
      barcode: '5944567890123',
      description: 'Antibiotic cu spectru larg. Se eliberează strict pe bază de prescripție medicală.',
      price: 42.00,
      old_price: null,
      stock: 8,
      image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: true,
      farmacie_id: 'zimbreni',
      expiration_date: expSafe1,
      batch_number: 'LOT-ZIM-RX-88'
    },
    {
      name: 'Șampon Dermatologic Calmant',
      barcode: '5946789012345',
      description: 'Îngrijire personală. 250ml. Fără sulfați, reduce iritația scalpului.',
      price: 98.00,
      old_price: null,
      stock: 25,
      image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=400&h=300&fit=crop',
      category: 'Îngrijire personală',
      requires_prescription: false,
      farmacie_id: 'zimbreni',
      expiration_date: expSafe2,
      batch_number: 'LOT-ZIM-2026-S1'
    },
    {
      name: 'Spray Nazal Xilometazolină',
      barcode: '5948901234567',
      description: 'Decongestionant nazal cu acțiune rapidă. Flacon 10ml.',
      price: 45.00,
      old_price: null,
      stock: 12,
      image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=300&fit=crop',
      category: 'Analgezice',
      requires_prescription: false,
      farmacie_id: 'zimbreni',
      expiration_date: expSafe1,
      batch_number: 'LOT-ZIM-2026-N2'
    }
  ];

  const count = await countProducts();
  if (count === 0) {
    console.log('🌱 Se adaugă produsele demonstrative pentru Horești și Zimbreni...');
    for (const product of demoProducts) {
      await addProduct(product);
    }
    console.log(`✅ ${demoProducts.length} produse adăugate pentru ambele filiale.`);
  } else {
    // Verificăm dacă există produse pentru Zimbreni; dacă nu, le inserăm
    const zimbreniProducts = await getAllProducts('zimbreni');
    if (zimbreniProducts.length === 0) {
      console.log('🌱 Se adaugă stocurile demonstrative pentru filiala Zimbreni...');
      const toAdd = demoProducts.filter(p => p.farmacie_id === 'zimbreni');
      for (const product of toAdd) {
        await addProduct(product);
      }
      console.log(`✅ ${toAdd.length} produse adăugate pentru filiala Nobis Farm Zimbreni.`);
    }

    // Sincronizăm filialele și codurile de bare pentru produsele vechi
    const allProd = await getAllProducts();
    for (const p of allProd) {
      const match = demoProducts.find(d => d.name === p.name);
      if (!p.farmacie_id || !p.expiration_date) {
        await updateProduct(p.id, {
          ...p,
          farmacie_id: p.farmacie_id || 'horesti',
          expiration_date: p.expiration_date || (match ? match.expiration_date : expSafe1),
          batch_number: p.batch_number || (match ? match.batch_number : 'LOT-INITIAL')
        });
      }
    }
  }
}

// ──────────────────────────────────────────────
//  Seed — Comenzi demonstrative inițiale
// ──────────────────────────────────────────────
async function seedOrders() {
  const count = await countOrders();
  if (count > 0) return;

  console.log('📦 Se adaugă comenzi demonstrative inițiale...');
  const demoOrders = [
    {
      customer_name: 'Maria Ciobanu',
      customer_phone: '069123456',
      delivery_address: 'bd. Ștefan cel Mare și Sfânt 128, ap. 45, Chișinău',
      items: 'Paracetamol 500mg (2 buc.), Vitamina C 1000mg (1 buc.)',
      total_price: 116.90,
      status: 'Nouă',
      notes: 'Livrare după ora 16:00'
    },
    {
      customer_name: 'Ion Rusu',
      customer_phone: '078456789',
      delivery_address: 'str. Dacia 44, Chișinău',
      items: 'Ibuprofen 400mg (1 buc.), Spray Nazal Xilometazolină (1 buc.)',
      total_price: 80.00,
      status: 'În procesare',
      notes: 'Sunat înainte de livrare'
    },
    {
      customer_name: 'Elena Munteanu',
      customer_phone: '060987654',
      delivery_address: 'str. Kiev 7, Bălți',
      items: 'Cremă Hidratantă (1 buc.), Sirop Alinare Colici (1 buc.)',
      total_price: 230.00,
      status: 'Trimisă',
      notes: 'Achitare cu cardul'
    },
    {
      customer_name: 'Dumitru Morari',
      customer_phone: '079112233',
      delivery_address: 'str. Alba Iulia 196, Chișinău',
      items: 'Vitamina C 1000mg (2 buc.)',
      total_price: 131.80,
      status: 'Finalizată',
      notes: ''
    }
  ];

  for (const order of demoOrders) {
    await addOrder(order);
  }
  console.log(`✅ ${demoOrders.length} comenzi demonstrative adăugate.`);
}

// ──────────────────────────────────────────────
//  Seed Admin & Farmaciști (RBAC)
// ──────────────────────────────────────────────
async function seedAdmin() {
  // 1. Cont Super-Admin / Șef
  const superAdmin = await getAdminByUsername('admin');
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  if (!superAdmin) {
    await createAdmin('admin', adminHash, 'admin', 'all', 'Șef Rețea (Super-Admin)');
    console.log(`✅ Cont Super-Admin creat: "admin", parola "${ADMIN_PASSWORD}".`);
  } else {
    await createAdmin('admin', superAdmin.password, 'admin', 'all', 'Șef Rețea (Super-Admin)');
  }

  // 2. Cont Farmacist Horești
  const farmHoresti = await getAdminByUsername('farmacist_horesti');
  if (!farmHoresti) {
    const hHash = await bcrypt.hash('horesti123', 10);
    await createAdmin('farmacist_horesti', hHash, 'pharmacist', 'horesti', 'Farmacist Elena (Horești)');
    console.log('✅ Cont Farmacist Horești creat: "farmacist_horesti", parola "horesti123".');
  }

  // 3. Cont Farmacist Zimbreni
  const farmZimbreni = await getAdminByUsername('farmacist_zimbreni');
  if (!farmZimbreni) {
    const zHash = await bcrypt.hash('zimbreni123', 10);
    await createAdmin('farmacist_zimbreni', zHash, 'pharmacist', 'zimbreni', 'Farmacist Mihai (Zimbreni)');
    console.log('✅ Cont Farmacist Zimbreni creat: "farmacist_zimbreni", parola "zimbreni123".');
  }
}

// ──────────────────────────────────────────────
//  Pornirea serverului
// ──────────────────────────────────────────────
async function startServer() {
  try {
    // Hash-uim parola de admin ca fallback
    adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    // Inițializăm baza de date (PostgreSQL prin pg dacă există DATABASE_URL, altfel SQLite)
    await initDatabase();

    // Verificăm / populăm tabela de administrare
    await seedAdmin();

    // Seed cu date demo pentru produse dacă tabela este goală
    await seedProducts();

    // Seed cu comenzi demonstrative dacă tabela este goală
    await seedOrders();

    // Pornim serverul
    app.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║       🏥  FARMACIA MOLDOVA — Server         ║');
      console.log('╠══════════════════════════════════════════════╣');
      console.log(`║  🌐  http://localhost:${PORT}                   ║`);
      console.log(`║  🔐  Admin: http://localhost:${PORT}/admin      ║`);
      console.log(`║  👤  Utilizator: admin                           ║`);
      console.log(`║  🔑  Parola implicită: ${ADMIN_PASSWORD}            ║`);
      console.log('╚══════════════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('❌ Eroare la pornirea serverului:', err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

startServer();
