/**
 * Modul de abstractizare a bazei de date.
 * Suportă SQLite (dezvoltare locală) și PostgreSQL (Supabase / Render.com).
 */

require('dotenv').config({ override: false });
const path = require('path');
const { Pool } = require('pg');

let pool;
let sqliteDb;

// Verificăm și curățăm variabila DATABASE_URL (fără spații sau ghilimele exterioare)
const rawDatabaseUrl = process.env.DATABASE_URL;
const cleanDatabaseUrl = rawDatabaseUrl ? rawDatabaseUrl.trim().replace(/^["']|["']$/g, '') : undefined;

if (cleanDatabaseUrl) {
  // Instanță globală unică Pool PostgreSQL (Supabase / Render)
  pool = new Pool({
    connectionString: cleanDatabaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  pool.on('error', (err) => {
    console.error('❌ Eroare neașteptată pe clientul PostgreSQL idle:', err.message || err);
  });

  console.log('Conectat la PostgreSQL (Supabase)');
} else {
  // Conexiune SQLite pentru dezvoltare locală
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'farmacia.db');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');

  // Wrapper compatibil pool.query(...) pentru mediul SQLite
  pool = {
    query: async (sql, params = []) => {
      const sqliteSql = sql.replace(/\$(\d+)/g, '?');
      const trimmed = sqliteSql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT')) {
        const rows = sqliteDb.prepare(sqliteSql).all(...params);
        return { rows, rowCount: rows.length };
      } else {
        const info = sqliteDb.prepare(sqliteSql).run(...params);
        return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
      }
    },
    prepare: (sql) => sqliteDb.prepare(sql),
    exec: (sql) => sqliteDb.exec(sql)
  };

  console.log('Conectat la SQLite (local)');
}

/**
 * Formatează produsul pentru a asigura tipuri numerice și booleene consistente
 */
function formatProduct(row) {
  if (!row) return null;
  return {
    ...row,
    id: parseInt(row.id, 10),
    barcode: row.barcode ? String(row.barcode).trim() : '',
    price: parseFloat(row.price),
    old_price: row.old_price !== null && row.old_price !== undefined && row.old_price !== '' ? parseFloat(row.old_price) : null,
    stock: parseInt(row.stock, 10),
    requires_prescription: Boolean(row.requires_prescription === true || row.requires_prescription === 1 || row.requires_prescription === 'true')
  };
}

/**
 * Formatează comanda pentru a asigura tipuri numerice consistente
 */
function formatOrder(row) {
  if (!row) return null;
  return {
    ...row,
    id: parseInt(row.id, 10),
    total_price: parseFloat(row.total_price),
    status: row.status || 'Nouă'
  };
}

/**
 * Formatează tranzacția POS (bonul fiscal/vânzarea)
 */
function formatSale(row) {
  if (!row) return null;
  let items = [];
  try {
    items = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []);
  } catch (e) {
    items = [];
  }
  return {
    ...row,
    id: parseInt(row.id, 10),
    receipt_number: row.receipt_number || `BON-${row.id}`,
    items,
    total_amount: parseFloat(row.total_amount),
    total_items: parseInt(row.total_items, 10) || items.reduce((acc, it) => acc + (parseInt(it.quantity, 10) || 1), 0),
    payment_method: row.payment_method || 'Numerar',
    created_at: row.created_at
  };
}

/**
 * Inițializează tabelele necesare la pornirea serverului.
 */
async function initDatabase() {
  if (cleanDatabaseUrl) {
    try {
      // 1. Tabela products cu coloanele barcode, old_price și requires_prescription
      await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          barcode VARCHAR(100) DEFAULT '',
          description TEXT DEFAULT '',
          price NUMERIC(10,2) NOT NULL,
          old_price NUMERIC(10,2) DEFAULT NULL,
          stock INTEGER NOT NULL DEFAULT 0,
          image VARCHAR(500) DEFAULT '',
          category VARCHAR(100) DEFAULT 'General',
          requires_prescription BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Migrări automate dacă tabela exista deja din versiuni anterioare
      await pool.query(`
        ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price NUMERIC(10,2) DEFAULT NULL;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_prescription BOOLEAN DEFAULT FALSE;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(100) DEFAULT '';
      `);

      // 2. Tabela admins pentru administrare
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL DEFAULT 'admin',
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. Tabela orders pentru gestionarea comenzilor
      await pool.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          customer_name VARCHAR(255) NOT NULL,
          customer_phone VARCHAR(50) NOT NULL,
          delivery_address TEXT NOT NULL,
          items TEXT NOT NULL,
          total_price NUMERIC(10,2) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'Nouă',
          notes TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 4. Tabela pos_sales pentru casa de marcat (POS)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pos_sales (
          id SERIAL PRIMARY KEY,
          receipt_number VARCHAR(100) NOT NULL,
          items TEXT NOT NULL,
          total_amount NUMERIC(10,2) NOT NULL,
          total_items INTEGER NOT NULL DEFAULT 1,
          payment_method VARCHAR(50) DEFAULT 'Numerar',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('✅ Tabelele PostgreSQL ("products", "admins", "orders", "pos_sales") sunt pregătite.');
    } catch (err) {
      if (err.code === '28P01') {
        console.error('❌ Eroare PostgreSQL (28P01): Autentificarea a eșuat pentru utilizatorul "postgres".');
        console.error('👉 Verifică parola din DATABASE_URL setată în panoul Render.');
      } else {
        console.error('❌ Eroare la inițializarea bazei de date PostgreSQL:', err.message || err);
      }
      throw err;
    }
  } else {
    // Creare tabele SQLite
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        barcode TEXT DEFAULT '',
        description TEXT DEFAULT '',
        price REAL NOT NULL,
        old_price REAL DEFAULT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        image TEXT DEFAULT '',
        category TEXT DEFAULT 'General',
        requires_prescription INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL DEFAULT 'admin',
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        delivery_address TEXT NOT NULL,
        items TEXT NOT NULL,
        total_price REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'Nouă',
        notes TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pos_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT NOT NULL,
        items TEXT NOT NULL,
        total_amount REAL NOT NULL,
        total_items INTEGER NOT NULL DEFAULT 1,
        payment_method TEXT DEFAULT 'Numerar',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrări SQLite tolerante la erori dacă există coloane lipsă
    try { sqliteDb.exec('ALTER TABLE products ADD COLUMN old_price REAL DEFAULT NULL;'); } catch (e) {}
    try { sqliteDb.exec('ALTER TABLE products ADD COLUMN requires_prescription INTEGER DEFAULT 0;'); } catch (e) {}
    try { sqliteDb.exec("ALTER TABLE products ADD COLUMN barcode TEXT DEFAULT '';"); } catch (e) {}

    console.log('✅ Tabelele SQLite ("products", "admins", "orders", "pos_sales") sunt pregătite.');
  }
}

// ──────────────────────────────────────────────
//  Operațiuni pentru Tabela Products
// ──────────────────────────────────────────────

/**
 * Obține toate produsele.
 */
async function getAllProducts() {
  if (cleanDatabaseUrl) {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    return result.rows.map(formatProduct);
  } else {
    return sqliteDb.prepare('SELECT * FROM products ORDER BY created_at DESC').all().map(formatProduct);
  }
}

/**
 * Obține un produs după ID.
 */
async function getProductById(id) {
  if (cleanDatabaseUrl) {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return formatProduct(result.rows[0]);
  } else {
    return formatProduct(sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }
}

/**
 * Adaugă un produs nou cu toate câmpurile cerute (inclusiv cod de bare).
 */
async function addProduct({ name, barcode, description, price, old_price, stock, image, category, requires_prescription }) {
  const parsedOldPrice = old_price !== undefined && old_price !== null && old_price !== '' ? parseFloat(old_price) : null;
  const parsedStock = parseInt(stock, 10) || 0;
  const parsedPrice = parseFloat(price) || 0;
  const parsedBarcode = barcode ? String(barcode).trim() : '';
  const hasPrescription = Boolean(requires_prescription === true || requires_prescription === 1 || requires_prescription === 'true');

  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'INSERT INTO products (name, barcode, description, price, old_price, stock, image, category, requires_prescription) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [name, parsedBarcode, description || '', parsedPrice, parsedOldPrice, parsedStock, image || '', category || 'General', hasPrescription]
    );
    return formatProduct(result.rows[0]);
  } else {
    const stmt = sqliteDb.prepare(
      'INSERT INTO products (name, barcode, description, price, old_price, stock, image, category, requires_prescription) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(name, parsedBarcode, description || '', parsedPrice, parsedOldPrice, parsedStock, image || '', category || 'General', hasPrescription ? 1 : 0);
    return formatProduct(sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
  }
}

/**
 * Actualizează un produs complet (inclusiv cod de bare).
 */
async function updateProduct(id, { name, barcode, description, price, old_price, stock, image, category, requires_prescription }) {
  const parsedOldPrice = old_price !== undefined && old_price !== null && old_price !== '' ? parseFloat(old_price) : null;
  const parsedStock = parseInt(stock, 10) || 0;
  const parsedPrice = parseFloat(price) || 0;
  const parsedBarcode = barcode !== undefined ? String(barcode).trim() : '';
  const hasPrescription = Boolean(requires_prescription === true || requires_prescription === 1 || requires_prescription === 'true');

  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'UPDATE products SET name=$1, barcode=$2, description=$3, price=$4, old_price=$5, stock=$6, image=$7, category=$8, requires_prescription=$9 WHERE id=$10 RETURNING *',
      [name, parsedBarcode, description, parsedPrice, parsedOldPrice, parsedStock, image, category, hasPrescription, id]
    );
    return formatProduct(result.rows[0]);
  } else {
    sqliteDb.prepare(
      'UPDATE products SET name=?, barcode=?, description=?, price=?, old_price=?, stock=?, image=?, category=?, requires_prescription=? WHERE id=?'
    ).run(name, parsedBarcode, description, parsedPrice, parsedOldPrice, parsedStock, image, category, hasPrescription ? 1 : 0, id);
    return formatProduct(sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }
}

/**
 * Actualizează stocul unui produs.
 */
async function updateStock(id, stock) {
  const parsedStock = parseInt(stock, 10) || 0;
  if (cleanDatabaseUrl) {
    const result = await pool.query('UPDATE products SET stock=$1 WHERE id=$2 RETURNING *', [parsedStock, id]);
    return formatProduct(result.rows[0]);
  } else {
    sqliteDb.prepare('UPDATE products SET stock=? WHERE id=?').run(parsedStock, id);
    return formatProduct(sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }
}

/**
 * Comută stocul unui produs între În Stoc (10 buc) și Fără Stoc (0 buc).
 */
async function toggleStock(id) {
  const current = await getProductById(id);
  if (!current) return null;
  const newStock = current.stock > 0 ? 0 : 15;
  return updateStock(id, newStock);
}

/**
 * Vânzare rapidă la POS (-1 Vândut).
 * Scade stocul atomic cu 1, fără să permită valori negative.
 */
async function sellProduct(id) {
  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'UPDATE products SET stock = GREATEST(0, stock - 1) WHERE id = $1 RETURNING *',
      [id]
    );
    return formatProduct(result.rows[0]);
  } else {
    sqliteDb.prepare('UPDATE products SET stock = MAX(0, stock - 1) WHERE id = ?').run(id);
    return formatProduct(sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }
}

/**
 * Reaprovizionare marfă nouă (+N bucăți).
 * Crește stocul atomic cu cantitatea specificată.
 */
async function restockProduct(id, quantity) {
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Cantitatea de reaprovizionare trebuie să fie un număr pozitiv.');
  }

  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'UPDATE products SET stock = stock + $1 WHERE id = $2 RETURNING *',
      [qty, id]
    );
    return formatProduct(result.rows[0]);
  } else {
    sqliteDb.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(qty, id);
    return formatProduct(sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }
}

/**
 * Șterge un produs.
 */
async function deleteProduct(id) {
  if (cleanDatabaseUrl) {
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
  } else {
    sqliteDb.prepare('DELETE FROM products WHERE id = ?').run(id);
  }
  return true;
}

/**
 * Numără produsele.
 */
async function countProducts() {
  if (cleanDatabaseUrl) {
    const result = await pool.query('SELECT COUNT(*) as count FROM products');
    return parseInt(result.rows[0].count, 10);
  } else {
    return sqliteDb.prepare('SELECT COUNT(*) as count FROM products').get().count;
  }
}

// ──────────────────────────────────────────────
//  Operațiuni pentru Tabela Admins
// ──────────────────────────────────────────────

/**
 * Numără administratorii din baza de date.
 */
async function countAdmins() {
  if (cleanDatabaseUrl) {
    const result = await pool.query('SELECT COUNT(*) as count FROM admins');
    return parseInt(result.rows[0].count, 10);
  } else {
    return sqliteDb.prepare('SELECT COUNT(*) as count FROM admins').get().count;
  }
}

/**
 * Găsește administratorul după username.
 */
async function getAdminByUsername(username = 'admin') {
  if (cleanDatabaseUrl) {
    const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    return result.rows[0] || null;
  } else {
    return sqliteDb.prepare('SELECT * FROM admins WHERE username = ?').get(username) || null;
  }
}

/**
 * Creează sau actualizează contul de administrator.
 */
async function createAdmin(username, passwordHash) {
  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'INSERT INTO admins (username, password) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password RETURNING *',
      [username, passwordHash]
    );
    return result.rows[0];
  } else {
    sqliteDb.prepare(
      'INSERT INTO admins (username, password) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET password = excluded.password'
    ).run(username, passwordHash);
    return sqliteDb.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  }
}

/**
 * Actualizează parola administratorului.
 */
async function updateAdminPassword(username, passwordHash) {
  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'UPDATE admins SET password = $1 WHERE username = $2 RETURNING *',
      [passwordHash, username]
    );
    return result.rows[0];
  } else {
    sqliteDb.prepare('UPDATE admins SET password = ? WHERE username = ?').run(passwordHash, username);
    return sqliteDb.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  }
}

// ──────────────────────────────────────────────
//  Operațiuni pentru Tabela Orders (Comenzi)
// ──────────────────────────────────────────────

/**
 * Obține toate comenzile sortate descrescător după dată.
 */
async function getAllOrders() {
  if (cleanDatabaseUrl) {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    return result.rows.map(formatOrder);
  } else {
    return sqliteDb.prepare('SELECT * FROM orders ORDER BY created_at DESC').all().map(formatOrder);
  }
}

/**
 * Obține o comandă după ID.
 */
async function getOrderById(id) {
  if (cleanDatabaseUrl) {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    return formatOrder(result.rows[0]);
  } else {
    return formatOrder(sqliteDb.prepare('SELECT * FROM orders WHERE id = ?').get(id));
  }
}

/**
 * Adaugă o comandă nouă.
 */
async function addOrder({ customer_name, customer_phone, delivery_address, items, total_price, status, notes }) {
  const orderStatus = status || 'Nouă';
  const orderItems = typeof items === 'string' ? items : JSON.stringify(items);
  const parsedTotal = parseFloat(total_price) || 0;

  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'INSERT INTO orders (customer_name, customer_phone, delivery_address, items, total_price, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [customer_name, customer_phone, delivery_address, orderItems, parsedTotal, orderStatus, notes || '']
    );
    return formatOrder(result.rows[0]);
  } else {
    const stmt = sqliteDb.prepare(
      'INSERT INTO orders (customer_name, customer_phone, delivery_address, items, total_price, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(customer_name, customer_phone, delivery_address, orderItems, parsedTotal, orderStatus, notes || '');
    return formatOrder(sqliteDb.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid));
  }
}

/**
 * Actualizează statusul unei comenzi.
 */
async function updateOrderStatus(id, status) {
  if (cleanDatabaseUrl) {
    const result = await pool.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, id]);
    return formatOrder(result.rows[0]);
  } else {
    sqliteDb.prepare('UPDATE orders SET status=? WHERE id=?').run(status, id);
    return formatOrder(sqliteDb.prepare('SELECT * FROM orders WHERE id = ?').get(id));
  }
}

/**
 * Șterge o comandă.
 */
async function deleteOrder(id) {
  if (cleanDatabaseUrl) {
    await pool.query('DELETE FROM orders WHERE id = $1', [id]);
  } else {
    sqliteDb.prepare('DELETE FROM orders WHERE id = ?').run(id);
  }
  return true;
}

/**
 * Numără comenzile (opțional filtrate după status, ex: 'Nouă').
 */
async function countOrders(status = null) {
  if (cleanDatabaseUrl) {
    if (status) {
      const result = await pool.query('SELECT COUNT(*) as count FROM orders WHERE status = $1', [status]);
      return parseInt(result.rows[0].count, 10);
    } else {
      const result = await pool.query('SELECT COUNT(*) as count FROM orders');
      return parseInt(result.rows[0].count, 10);
    }
  } else {
    if (status) {
      return sqliteDb.prepare('SELECT COUNT(*) as count FROM orders WHERE status = ?').get(status).count;
    } else {
      return sqliteDb.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    }
  }
}

/**
 * Obține statisticile complete pentru Dashboard.
 */
async function getDashboardStats() {
  let totalProducts = 0;
  let newOrders = 0;
  let criticalStock = 0;
  let outOfStock = 0;

  if (cleanDatabaseUrl) {
    const pCount = await pool.query('SELECT COUNT(*) as count FROM products');
    totalProducts = parseInt(pCount.rows[0].count, 10);

    const oCount = await pool.query("SELECT COUNT(*) as count FROM orders WHERE status = 'Nouă'");
    newOrders = parseInt(oCount.rows[0].count, 10);

    const critCount = await pool.query('SELECT COUNT(*) as count FROM products WHERE stock > 0 AND stock < 5');
    criticalStock = parseInt(critCount.rows[0].count, 10);

    const outCount = await pool.query('SELECT COUNT(*) as count FROM products WHERE stock = 0');
    outOfStock = parseInt(outCount.rows[0].count, 10);
  } else {
    totalProducts = sqliteDb.prepare('SELECT COUNT(*) as count FROM products').get().count;
    newOrders = sqliteDb.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'Nouă'").get().count;
    criticalStock = sqliteDb.prepare('SELECT COUNT(*) as count FROM products WHERE stock > 0 AND stock < 5').get().count;
    outOfStock = sqliteDb.prepare('SELECT COUNT(*) as count FROM products WHERE stock = 0').get().count;
  }

  return {
    totalProducts,
    newOrders,
    criticalStock,
    outOfStock
  };
}

// ──────────────────────────────────────────────
//  Operațiuni pentru Casa de Marcat (POS Sales)
// ──────────────────────────────────────────────

/**
 * Înregistrează o vânzare completă de la POS (Bon fiscal).
 * Scade atomic stocurile produselor vândute și salvează tranzacția.
 */
async function recordPosSale({ items, total_amount, total_items, payment_method, receipt_number }) {
  const parsedItems = typeof items === 'string' ? JSON.parse(items) : (items || []);
  if (!parsedItems.length) {
    throw new Error('Bonul trebuie să conțină cel puțin un produs.');
  }

  const receiptNum = receipt_number || `BON-${Date.now().toString().slice(-6)}`;
  const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
  const parsedTotal = parseFloat(total_amount) || 0;
  const countItems = parseInt(total_items, 10) || parsedItems.reduce((acc, it) => acc + (parseInt(it.quantity, 10) || 1), 0);
  const payment = payment_method || 'Numerar';

  const updatedProducts = [];

  // Scădem stocul fiecărui produs din bon
  for (const item of parsedItems) {
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    const prodId = parseInt(item.id, 10);
    if (!prodId) continue;

    if (cleanDatabaseUrl) {
      const pRes = await pool.query(
        'UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2 RETURNING *',
        [qty, prodId]
      );
      if (pRes.rows && pRes.rows[0]) {
        updatedProducts.push(formatProduct(pRes.rows[0]));
      }
    } else {
      sqliteDb.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(qty, prodId);
      const row = sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
      if (row) {
        updatedProducts.push(formatProduct(row));
      }
    }
  }

  // Salvăm bonul fiscal în tabela pos_sales
  let saleRow;
  if (cleanDatabaseUrl) {
    const sRes = await pool.query(
      'INSERT INTO pos_sales (receipt_number, items, total_amount, total_items, payment_method) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [receiptNum, itemsJson, parsedTotal, countItems, payment]
    );
    saleRow = sRes.rows[0];
  } else {
    const info = sqliteDb.prepare(
      'INSERT INTO pos_sales (receipt_number, items, total_amount, total_items, payment_method) VALUES (?, ?, ?, ?, ?)'
    ).run(receiptNum, itemsJson, parsedTotal, countItems, payment);
    saleRow = sqliteDb.prepare('SELECT * FROM pos_sales WHERE id = ?').get(info.lastInsertRowid);
  }

  return {
    sale: formatSale(saleRow),
    updatedProducts
  };
}

/**
 * Obține istoricul bonurilor POS.
 */
async function getPosSales({ date, limit = 100 } = {}) {
  if (cleanDatabaseUrl) {
    let query = 'SELECT * FROM pos_sales';
    const params = [];
    if (date) {
      query += ' WHERE DATE(created_at) = $1';
      params.push(date);
    }
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    const result = await pool.query(query, params);
    return result.rows.map(formatSale);
  } else {
    let query = 'SELECT * FROM pos_sales';
    const params = [];
    if (date) {
      query += " WHERE date(created_at) = ?";
      params.push(date);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return sqliteDb.prepare(query).all(...params).map(formatSale);
  }
}

/**
 * Raport vânzări POS pentru o anumită zi (sau azi).
 */
async function getPosSalesReport(targetDate = null) {
  const dateStr = targetDate || new Date().toISOString().split('T')[0];
  let sales = [];

  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'SELECT * FROM pos_sales WHERE DATE(created_at) = $1 ORDER BY created_at DESC',
      [dateStr]
    );
    sales = result.rows.map(formatSale);
  } else {
    sales = sqliteDb.prepare(
      "SELECT * FROM pos_sales WHERE date(created_at) = ? ORDER BY created_at DESC"
    ).all(dateStr).map(formatSale);
  }

  const totalRevenue = sales.reduce((acc, s) => acc + (parseFloat(s.total_amount) || 0), 0);
  const totalItemsSold = sales.reduce((acc, s) => acc + (parseInt(s.total_items, 10) || 0), 0);
  const totalReceipts = sales.length;
  const avgReceipt = totalReceipts > 0 ? totalRevenue / totalReceipts : 0;

  return {
    date: dateStr,
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalItemsSold,
    totalReceipts,
    avgReceipt: parseFloat(avgReceipt.toFixed(2)),
    sales
  };
}

module.exports = {
  pool,
  db: pool,
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
  getPosSales,
  getPosSalesReport
};
