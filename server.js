/**
 * Farmacia Moldova — Server Principal
 * Node.js + Express | SQLite / PostgreSQL
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const {
  initDatabase,
  getAllProducts,
  getProductById,
  addProduct,
  updateProduct,
  updateStock,
  deleteProduct,
  countProducts,
  countAdmins,
  getAdminByUsername,
  createAdmin,
  updateAdminPassword
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'farmacia_moldova_secret_key_change_me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Hash-ul parolei de admin (se calculează la pornire)
let adminPasswordHash;

// ──────────────────────────────────────────────
//  Middleware
// ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
//  Middleware de autentificare JWT
// ──────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acces neautorizat. Token lipsă.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid sau expirat.' });
  }
}

// ──────────────────────────────────────────────
//  Rute API — Publice
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

// ──────────────────────────────────────────────
//  Rute API — Autentificare Admin
// ──────────────────────────────────────────────

// POST /api/login — Autentificare administrator
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
      // Sincronizare automată dacă parola s-a schimbat în variabilele de mediu
      if (!valid && ADMIN_PASSWORD && password === ADMIN_PASSWORD) {
        const newHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
        await updateAdminPassword(username, newHash);
        valid = true;
      }
    } else {
      // Fallback la parola din mediu dacă contul nu există încă
      const expectedHash = adminPasswordHash || await bcrypt.hash(ADMIN_PASSWORD, 10);
      valid = await bcrypt.compare(password, expectedHash);
      if (valid) {
        await createAdmin(username, expectedHash);
      }
    }

    if (!valid) {
      return res.status(401).json({ error: 'Parolă incorectă.' });
    }

    const token = jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, message: 'Autentificare reușită!' });
  } catch (err) {
    console.error('Eroare la autentificare:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// GET /api/admin/verify — Verifică dacă token-ul este valid
app.get('/api/admin/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, message: 'Token valid.' });
});

// ──────────────────────────────────────────────
//  Rute API — Admin (protejate)
// ──────────────────────────────────────────────

// POST /api/admin/products — Adaugă un produs nou
app.post('/api/admin/products', authMiddleware, async (req, res) => {
  try {
    const { name, description, price, stock, image, category } = req.body;
    if (!name || price === undefined || stock === undefined) {
      return res.status(400).json({ error: 'Numele, prețul și stocul sunt obligatorii.' });
    }
    const product = await addProduct({ name, description, price: parseFloat(price), stock: parseInt(stock), image, category });
    res.status(201).json(product);
  } catch (err) {
    console.error('Eroare la adăugarea produsului:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// PUT /api/admin/products/:id — Actualizează un produs
app.put('/api/admin/products/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await getProductById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produs negăsit.' });

    const { name, description, price, stock, image, category } = req.body;
    const updated = await updateProduct(req.params.id, {
      name: name || existing.name,
      description: description !== undefined ? description : existing.description,
      price: price !== undefined ? parseFloat(price) : existing.price,
      stock: stock !== undefined ? parseInt(stock) : existing.stock,
      image: image !== undefined ? image : existing.image,
      category: category || existing.category
    });
    res.json(updated);
  } catch (err) {
    console.error('Eroare la actualizarea produsului:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// PATCH /api/admin/products/:id/stock — Actualizează doar stocul
app.patch('/api/admin/products/:id/stock', authMiddleware, async (req, res) => {
  try {
    const { stock } = req.body;
    if (stock === undefined) return res.status(400).json({ error: 'Stocul este obligatoriu.' });
    const updated = await updateStock(req.params.id, parseInt(stock));
    if (!updated) return res.status(404).json({ error: 'Produs negăsit.' });
    res.json(updated);
  } catch (err) {
    console.error('Eroare la actualizarea stocului:', err);
    res.status(500).json({ error: 'Eroare internă a serverului.' });
  }
});

// DELETE /api/admin/products/:id — Șterge un produs
app.delete('/api/admin/products/:id', authMiddleware, async (req, res) => {
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
//  Rute pentru pagini (SPA fallback)
// ──────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ──────────────────────────────────────────────
//  Seed — Date inițiale demonstrative
// ──────────────────────────────────────────────
async function seedProducts() {
  const count = await countProducts();
  if (count > 0) return;

  console.log('🌱 Se adaugă produsele demonstrative...');

  const demoProducts = [
    {
      name: 'Paracetamol 500mg',
      description: 'Analgezic și antipiretic. Cutie cu 20 comprimate filmate. Ameliorează durerea și reduce febra.',
      price: 25.50,
      stock: 150,
      image: 'https://images.unsplash.com/photo-1584308666544-ad5e1f2a6610?w=400&h=300&fit=crop',
      category: 'Analgezice'
    },
    {
      name: 'Ibuprofen 400mg',
      description: 'Anti-inflamator nesteroidian. Cutie cu 10 comprimate. Eficient împotriva durerilor musculare și articulare.',
      price: 35.00,
      stock: 80,
      image: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400&h=300&fit=crop',
      category: 'Anti-inflamatoare'
    },
    {
      name: 'Vitamina C 1000mg',
      description: 'Supliment alimentar. 20 comprimate efervescente cu aromă de portocale. Susține imunitatea.',
      price: 65.90,
      stock: 200,
      image: 'https://images.unsplash.com/photo-1556227834-09f1de7a7d14?w=400&h=300&fit=crop',
      category: 'Vitamine'
    },
    {
      name: 'Amoxicilină 500mg',
      description: 'Antibiotic cu spectru larg. Cutie cu 16 capsule. Se eliberează doar pe bază de rețetă.',
      price: 42.00,
      stock: 0,
      image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=300&fit=crop',
      category: 'Antibiotice'
    },
    {
      name: 'Cetirizină 10mg',
      description: 'Antihistaminic. Cutie cu 20 comprimate filmate. Tratamentul rinitei alergice și urticariei.',
      price: 29.90,
      stock: 120,
      image: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&h=300&fit=crop',
      category: 'Antialergice'
    },
    {
      name: 'Omeprazol 20mg',
      description: 'Inhibitor al pompei de protoni. 28 capsule gastrorezistente. Tratamentul refluxului gastroesofagian.',
      price: 55.00,
      stock: 45,
      image: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&h=300&fit=crop',
      category: 'Gastro-intestinale'
    },
    {
      name: 'Loratadină 10mg',
      description: 'Antihistaminic nesedativ. 10 comprimate. Nu provoacă somnolență, ideal pentru alergii sezoniere.',
      price: 19.90,
      stock: 95,
      image: 'https://images.unsplash.com/photo-1576602976047-174e57a47881?w=400&h=300&fit=crop',
      category: 'Antialergice'
    },
    {
      name: 'Aspirina 100mg',
      description: 'Acid acetilsalicilic. 30 comprimate gastrorezistente. Profilaxia trombozei.',
      price: 15.50,
      stock: 300,
      image: 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=400&h=300&fit=crop',
      category: 'Analgezice'
    },
    {
      name: 'Multivitamine Complex',
      description: 'Complex de vitamine și minerale. 30 capsule. Conține vitaminele A, B, C, D, E, zinc și seleniu.',
      price: 89.90,
      stock: 60,
      image: 'https://images.unsplash.com/photo-1559757175-7cb057fba93c?w=400&h=300&fit=crop',
      category: 'Vitamine'
    },
    {
      name: 'Spray Nazal Xilometazolină',
      description: 'Decongestionant nazal. Flacon 10ml. Acțiune rapidă pentru ameliorarea congestiei nazale.',
      price: 45.00,
      stock: 0,
      image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=300&fit=crop',
      category: 'ORL'
    },
    {
      name: 'Vitamina D3 2000UI',
      description: 'Supliment alimentar esențial. 60 capsule moi. Susține sănătatea oaselor și imunitatea.',
      price: 75.00,
      stock: 110,
      image: 'https://images.unsplash.com/photo-1612824988342-a1f4ae865cd1?w=400&h=300&fit=crop',
      category: 'Vitamine'
    },
    {
      name: 'Sirop de Tuse cu Miere',
      description: 'Sirop antitusiv natural. Flacon 150ml. Cu extract de cimbru și miere de albine.',
      price: 52.50,
      stock: 35,
      image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=300&fit=crop',
      category: 'ORL'
    }
  ];

  for (const product of demoProducts) {
    await addProduct(product);
  }

  console.log(`✅ ${demoProducts.length} produse demonstrative adăugate.`);
}

// ──────────────────────────────────────────────
//  Seed Admin — Verificare și inițializare cont admin
// ──────────────────────────────────────────────
async function seedAdmin() {
  const count = await countAdmins();
  if (count === 0) {
    console.log('👤 Se inițializează contul implicit de administrator...');
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await createAdmin('admin', hash);
    console.log('✅ Cont administrator creat în tabela admins.');
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

    // Pornim serverul
    app.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║       🏥  FARMACIA MOLDOVA — Server         ║');
      console.log('╠══════════════════════════════════════════════╣');
      console.log(`║  🌐  http://localhost:${PORT}                   ║`);
      console.log(`║  🔐  Admin: http://localhost:${PORT}/admin      ║`);
      console.log(`║  📦  Parola admin: ${ADMIN_PASSWORD.substring(0, 4)}...                  ║`);
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
