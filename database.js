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
    farmacie_id: row.farmacie_id || 'horesti',
    expiration_date: row.expiration_date ? String(row.expiration_date).split('T')[0] : null,
    batch_number: row.batch_number ? String(row.batch_number).trim() : '',
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
    farmacie_id: row.farmacie_id || 'horesti',
    status: row.status || 'completed',
    operator_name: row.operator_name || 'Farmacist',
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
        ALTER TABLE products ADD COLUMN IF NOT EXISTS farmacie_id VARCHAR(50) DEFAULT 'horesti';
        ALTER TABLE products ADD COLUMN IF NOT EXISTS expiration_date DATE DEFAULT NULL;
        ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100) DEFAULT '';

        ALTER TABLE admins ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'admin';
        ALTER TABLE admins ADD COLUMN IF NOT EXISTS farmacie_id VARCHAR(50) DEFAULT 'all';
        ALTER TABLE admins ADD COLUMN IF NOT EXISTS full_name VARCHAR(100) DEFAULT '';

        ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS farmacie_id VARCHAR(50) DEFAULT 'horesti';
        ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'completed';
        ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS operator_name VARCHAR(100) DEFAULT 'Farmacist';
      `);

      // 2. Tabela admins pentru administrare și operatori POS
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL DEFAULT 'admin',
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'admin',
          farmacie_id VARCHAR(50) DEFAULT 'all',
          full_name VARCHAR(100) DEFAULT '',
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
          farmacie_id VARCHAR(50) DEFAULT 'horesti',
          status VARCHAR(50) DEFAULT 'completed',
          operator_name VARCHAR(100) DEFAULT 'Farmacist',
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
        farmacie_id TEXT DEFAULT 'horesti',
        expiration_date TEXT DEFAULT NULL,
        batch_number TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL DEFAULT 'admin',
        password TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        farmacie_id TEXT DEFAULT 'all',
        full_name TEXT DEFAULT '',
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
        farmacie_id TEXT DEFAULT 'horesti',
        status TEXT DEFAULT 'completed',
        operator_name TEXT DEFAULT 'Farmacist',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrări SQLite tolerante la erori dacă există coloane lipsă
    try { sqliteDb.exec('ALTER TABLE products ADD COLUMN old_price REAL DEFAULT NULL;'); } catch (e) {}
    try { sqliteDb.exec('ALTER TABLE products ADD COLUMN requires_prescription INTEGER DEFAULT 0;'); } catch (e) {}
    try { sqliteDb.exec("ALTER TABLE products ADD COLUMN barcode TEXT DEFAULT '';"); } catch (e) {}
    try { sqliteDb.exec("ALTER TABLE products ADD COLUMN farmacie_id TEXT DEFAULT 'horesti';"); } catch (e) {}
    try { sqliteDb.exec("ALTER TABLE products ADD COLUMN expiration_date TEXT DEFAULT NULL;"); } catch (e) {}
    try { sqliteDb.exec("ALTER TABLE products ADD COLUMN batch_number TEXT DEFAULT '';"); } catch (e) {}

    try { sqliteDb.exec("ALTER TABLE admins ADD COLUMN role TEXT DEFAULT 'admin';"); } catch (e) {}
    try { sqliteDb.exec("ALTER TABLE admins ADD COLUMN farmacie_id TEXT DEFAULT 'all';"); } catch (e) {}
    try { sqliteDb.exec("ALTER TABLE admins ADD COLUMN full_name TEXT DEFAULT '';"); } catch (e) {}

    try { sqliteDb.exec("ALTER TABLE pos_sales ADD COLUMN farmacie_id TEXT DEFAULT 'horesti';"); } catch (e) {}
    try { sqliteDb.exec("ALTER TABLE pos_sales ADD COLUMN status TEXT DEFAULT 'completed';"); } catch (e) {}
    try { sqliteDb.exec("ALTER TABLE pos_sales ADD COLUMN operator_name TEXT DEFAULT 'Farmacist';"); } catch (e) {}

    console.log('✅ Tabelele SQLite ("products", "admins", "orders", "pos_sales") sunt pregătite.');
  }
}

// ──────────────────────────────────────────────
//  Operațiuni pentru Tabela Products
// ──────────────────────────────────────────────

/**
 * Obține produsele (opțional filtrate după filiala respectivă).
 */
async function getAllProducts(farmacieId = null) {
  const hasFilter = farmacieId && farmacieId !== 'all';
  if (cleanDatabaseUrl) {
    let sql = 'SELECT * FROM products';
    const params = [];
    if (hasFilter) {
      sql += ' WHERE farmacie_id = $1';
      params.push(farmacieId);
    }
    sql += ' ORDER BY created_at DESC';
    const result = await pool.query(sql, params);
    return result.rows.map(formatProduct);
  } else {
    let sql = 'SELECT * FROM products';
    const params = [];
    if (hasFilter) {
      sql += ' WHERE farmacie_id = ?';
      params.push(farmacieId);
    }
    sql += ' ORDER BY created_at DESC';
    return sqliteDb.prepare(sql).all(...params).map(formatProduct);
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
 * Adaugă un produs nou cu toate câmpurile cerute (inclusiv filială, dată de expirare și lot).
 */
async function addProduct({ name, barcode, description, price, old_price, stock, image, category, requires_prescription, farmacie_id, expiration_date, batch_number }) {
  const parsedOldPrice = old_price !== undefined && old_price !== null && old_price !== '' ? parseFloat(old_price) : null;
  const parsedStock = parseInt(stock, 10) || 0;
  const parsedPrice = parseFloat(price) || 0;
  const parsedBarcode = barcode ? String(barcode).trim() : '';
  const hasPrescription = Boolean(requires_prescription === true || requires_prescription === 1 || requires_prescription === 'true');
  const branchId = farmacie_id || 'horesti';
  const expDate = expiration_date || null;
  const batchNum = batch_number ? String(batch_number).trim() : '';

  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'INSERT INTO products (name, barcode, description, price, old_price, stock, image, category, requires_prescription, farmacie_id, expiration_date, batch_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
      [name, parsedBarcode, description || '', parsedPrice, parsedOldPrice, parsedStock, image || '', category || 'General', hasPrescription, branchId, expDate, batchNum]
    );
    return formatProduct(result.rows[0]);
  } else {
    const stmt = sqliteDb.prepare(
      'INSERT INTO products (name, barcode, description, price, old_price, stock, image, category, requires_prescription, farmacie_id, expiration_date, batch_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(name, parsedBarcode, description || '', parsedPrice, parsedOldPrice, parsedStock, image || '', category || 'General', hasPrescription ? 1 : 0, branchId, expDate, batchNum);
    return formatProduct(sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
  }
}

/**
 * Actualizează un produs complet (inclusiv filială, dată de expirare și lot).
 */
async function updateProduct(id, { name, barcode, description, price, old_price, stock, image, category, requires_prescription, farmacie_id, expiration_date, batch_number }) {
  const existing = await getProductById(id);
  const parsedOldPrice = old_price !== undefined ? (old_price !== null && old_price !== '' ? parseFloat(old_price) : null) : (existing ? existing.old_price : null);
  const parsedStock = stock !== undefined ? (parseInt(stock, 10) || 0) : (existing ? existing.stock : 0);
  const parsedPrice = price !== undefined ? (parseFloat(price) || 0) : (existing ? existing.price : 0);
  const parsedBarcode = barcode !== undefined ? String(barcode).trim() : (existing ? existing.barcode : '');
  const hasPrescription = requires_prescription !== undefined
    ? Boolean(requires_prescription === true || requires_prescription === 1 || requires_prescription === 'true')
    : (existing ? existing.requires_prescription : false);
  const branchId = farmacie_id !== undefined ? farmacie_id : (existing ? existing.farmacie_id : 'horesti');
  const expDate = expiration_date !== undefined ? (expiration_date || null) : (existing ? existing.expiration_date : null);
  const batchNum = batch_number !== undefined ? String(batch_number).trim() : (existing ? existing.batch_number : '');
  const prodName = name !== undefined ? name : (existing ? existing.name : '');
  const prodDesc = description !== undefined ? description : (existing ? existing.description : '');
  const prodImg = image !== undefined ? image : (existing ? existing.image : '');
  const prodCat = category !== undefined ? category : (existing ? existing.category : 'General');

  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'UPDATE products SET name=$1, barcode=$2, description=$3, price=$4, old_price=$5, stock=$6, image=$7, category=$8, requires_prescription=$9, farmacie_id=$10, expiration_date=$11, batch_number=$12 WHERE id=$13 RETURNING *',
      [prodName, parsedBarcode, prodDesc, parsedPrice, parsedOldPrice, parsedStock, prodImg, prodCat, hasPrescription, branchId, expDate, batchNum, id]
    );
    return formatProduct(result.rows[0]);
  } else {
    sqliteDb.prepare(
      'UPDATE products SET name=?, barcode=?, description=?, price=?, old_price=?, stock=?, image=?, category=?, requires_prescription=?, farmacie_id=?, expiration_date=?, batch_number=? WHERE id=?'
    ).run(prodName, parsedBarcode, prodDesc, parsedPrice, parsedOldPrice, parsedStock, prodImg, prodCat, hasPrescription ? 1 : 0, branchId, expDate, batchNum, id);
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
 * Creează sau actualizează contul de utilizator/administrator/farmacist.
 */
async function createAdmin(username, passwordHash, role = 'admin', farmacie_id = 'all', full_name = '') {
  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'INSERT INTO admins (username, password, role, farmacie_id, full_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role, farmacie_id = EXCLUDED.farmacie_id, full_name = EXCLUDED.full_name RETURNING *',
      [username, passwordHash, role, farmacie_id, full_name]
    );
    return result.rows[0];
  } else {
    sqliteDb.prepare(
      'INSERT INTO admins (username, password, role, farmacie_id, full_name) VALUES (?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET password = excluded.password, role = excluded.role, farmacie_id = excluded.farmacie_id, full_name = excluded.full_name'
    ).run(username, passwordHash, role, farmacie_id, full_name);
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
 * Obține statisticile complete pentru Dashboard (opțional filtrate după filială).
 */
async function getDashboardStats(farmacieId = null) {
  let totalProducts = 0;
  let newOrders = 0;
  let criticalStock = 0;
  let outOfStock = 0;
  const hasBranch = farmacieId && farmacieId !== 'all';

  if (cleanDatabaseUrl) {
    const pSql = hasBranch ? 'SELECT COUNT(*) as count FROM products WHERE farmacie_id = $1' : 'SELECT COUNT(*) as count FROM products';
    const pParams = hasBranch ? [farmacieId] : [];
    const pCount = await pool.query(pSql, pParams);
    totalProducts = parseInt(pCount.rows[0].count, 10);

    const oCount = await pool.query("SELECT COUNT(*) as count FROM orders WHERE status = 'Nouă'");
    newOrders = parseInt(oCount.rows[0].count, 10);

    const critSql = hasBranch
      ? 'SELECT COUNT(*) as count FROM products WHERE farmacie_id = $1 AND stock > 0 AND stock < 5'
      : 'SELECT COUNT(*) as count FROM products WHERE stock > 0 AND stock < 5';
    const critCount = await pool.query(critSql, pParams);
    criticalStock = parseInt(critCount.rows[0].count, 10);

    const outSql = hasBranch
      ? 'SELECT COUNT(*) as count FROM products WHERE farmacie_id = $1 AND stock = 0'
      : 'SELECT COUNT(*) as count FROM products WHERE stock = 0';
    const outCount = await pool.query(outSql, pParams);
    outOfStock = parseInt(outCount.rows[0].count, 10);
  } else {
    if (hasBranch) {
      totalProducts = sqliteDb.prepare('SELECT COUNT(*) as count FROM products WHERE farmacie_id = ?').get(farmacieId).count;
      criticalStock = sqliteDb.prepare('SELECT COUNT(*) as count FROM products WHERE farmacie_id = ? AND stock > 0 AND stock < 5').get(farmacieId).count;
      outOfStock = sqliteDb.prepare('SELECT COUNT(*) as count FROM products WHERE farmacie_id = ? AND stock = 0').get(farmacieId).count;
    } else {
      totalProducts = sqliteDb.prepare('SELECT COUNT(*) as count FROM products').get().count;
      criticalStock = sqliteDb.prepare('SELECT COUNT(*) as count FROM products WHERE stock > 0 AND stock < 5').get().count;
      outOfStock = sqliteDb.prepare('SELECT COUNT(*) as count FROM products WHERE stock = 0').get().count;
    }
    newOrders = sqliteDb.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'Nouă'").get().count;
  }

  return {
    totalProducts,
    newOrders,
    criticalStock,
    outOfStock
  };
}

// ──────────────────────────────────────────────
//  Operațiuni pentru Casa de Marcat (POS Sales) & Retururi
// ──────────────────────────────────────────────

/**
 * Înregistrează o vânzare completă de la POS (Bon fiscal).
 * Scade atomic stocurile produselor vândute din filiala respectivă și salvează tranzacția.
 */
async function recordPosSale({ items, total_amount, total_items, payment_method, receipt_number, farmacie_id, operator_name }) {
  const parsedItems = typeof items === 'string' ? JSON.parse(items) : (items || []);
  if (!parsedItems.length) {
    throw new Error('Bonul trebuie să conțină cel puțin un produs.');
  }

  const receiptNum = receipt_number || `BON-${Date.now().toString().slice(-6)}`;
  const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
  const parsedTotal = parseFloat(total_amount) || 0;
  const countItems = parseInt(total_items, 10) || parsedItems.reduce((acc, it) => acc + (parseInt(it.quantity, 10) || 1), 0);
  const payment = payment_method || 'Numerar';
  const branchId = farmacie_id || 'horesti';
  const operator = operator_name || 'Farmacist';

  const updatedProducts = [];

  // Scădem stocul fiecărui produs din bon în filiala respectivă
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
      'INSERT INTO pos_sales (receipt_number, items, total_amount, total_items, payment_method, farmacie_id, status, operator_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [receiptNum, itemsJson, parsedTotal, countItems, payment, branchId, 'completed', operator]
    );
    saleRow = sRes.rows[0];
  } else {
    const info = sqliteDb.prepare(
      'INSERT INTO pos_sales (receipt_number, items, total_amount, total_items, payment_method, farmacie_id, status, operator_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(receiptNum, itemsJson, parsedTotal, countItems, payment, branchId, 'completed', operator);
    saleRow = sqliteDb.prepare('SELECT * FROM pos_sales WHERE id = ?').get(info.lastInsertRowid);
  }

  return {
    sale: formatSale(saleRow),
    updatedProducts
  };
}

/**
 * Anulare / Retur Bon POS:
 * Marchează bonul ca 'refunded' și reîntregește automat stocurile produselor (+cantitate).
 */
async function refundPosSale(saleIdOrReceipt, operatorName = '') {
  let saleRow;
  const isNumeric = !isNaN(Number(saleIdOrReceipt)) && String(saleIdOrReceipt).trim() !== '';

  if (cleanDatabaseUrl) {
    const q = isNumeric
      ? 'SELECT * FROM pos_sales WHERE id = $1 OR receipt_number = $2'
      : 'SELECT * FROM pos_sales WHERE receipt_number = $1';
    const params = isNumeric ? [Number(saleIdOrReceipt), String(saleIdOrReceipt)] : [String(saleIdOrReceipt)];
    const res = await pool.query(q, params);
    saleRow = res.rows[0];
  } else {
    const q = isNumeric
      ? 'SELECT * FROM pos_sales WHERE id = ? OR receipt_number = ?'
      : 'SELECT * FROM pos_sales WHERE receipt_number = ?';
    const params = isNumeric ? [Number(saleIdOrReceipt), String(saleIdOrReceipt)] : [String(saleIdOrReceipt)];
    saleRow = sqliteDb.prepare(q).get(...params);
  }

  if (!saleRow) {
    throw new Error('Bonul / vânzarea nu a fost găsită.');
  }

  if (saleRow.status === 'refunded') {
    throw new Error('Acest bon a fost deja anulat / returnat anterior.');
  }

  let items = [];
  try {
    items = typeof saleRow.items === 'string' ? JSON.parse(saleRow.items) : (saleRow.items || []);
  } catch (e) {
    items = [];
  }

  const restoredProducts = [];

  // Restabilim stocul fiecărui produs din bon (+cantitate vândută)
  for (const it of items) {
    const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
    const prodId = parseInt(it.id, 10);
    if (!prodId) continue;

    if (cleanDatabaseUrl) {
      const pRes = await pool.query(
        'UPDATE products SET stock = stock + $1 WHERE id = $2 RETURNING *',
        [qty, prodId]
      );
      if (pRes.rows && pRes.rows[0]) {
        restoredProducts.push(formatProduct(pRes.rows[0]));
      }
    } else {
      sqliteDb.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(qty, prodId);
      const row = sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
      if (row) {
        restoredProducts.push(formatProduct(row));
      }
    }
  }

  const refundOp = operatorName || saleRow.operator_name || 'Farmacist';
  let updatedSaleRow;

  if (cleanDatabaseUrl) {
    const updRes = await pool.query(
      'UPDATE pos_sales SET status = $1, operator_name = $2 WHERE id = $3 RETURNING *',
      ['refunded', refundOp, saleRow.id]
    );
    updatedSaleRow = updRes.rows[0];
  } else {
    sqliteDb.prepare('UPDATE pos_sales SET status = ?, operator_name = ? WHERE id = ?').run('refunded', refundOp, saleRow.id);
    updatedSaleRow = sqliteDb.prepare('SELECT * FROM pos_sales WHERE id = ?').get(saleRow.id);
  }

  return {
    sale: formatSale(updatedSaleRow),
    restoredProducts
  };
}

/**
 * Obține istoricul bonurilor POS (filtrabil după dată și filială).
 */
async function getPosSales({ date, farmacieId = null, limit = 100 } = {}) {
  const hasBranch = farmacieId && farmacieId !== 'all';
  if (cleanDatabaseUrl) {
    let query = 'SELECT * FROM pos_sales';
    const where = [];
    const params = [];

    if (date) {
      params.push(date);
      where.push(`DATE(created_at) = $${params.length}`);
    }
    if (hasBranch) {
      params.push(farmacieId);
      where.push(`farmacie_id = $${params.length}`);
    }

    if (where.length) {
      query += ' WHERE ' + where.join(' AND ');
    }

    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    return result.rows.map(formatSale);
  } else {
    let query = 'SELECT * FROM pos_sales';
    const where = [];
    const params = [];

    if (date) {
      params.push(date);
      where.push("date(created_at) = ?");
    }
    if (hasBranch) {
      params.push(farmacieId);
      where.push("farmacie_id = ?");
    }

    if (where.length) {
      query += ' WHERE ' + where.join(' AND ');
    }

    params.push(limit);
    query += ' ORDER BY created_at DESC LIMIT ?';

    return sqliteDb.prepare(query).all(...params).map(formatSale);
  }
}

/**
 * Raport vânzări POS pentru o anumită zi (sau azi), filtrabil după filială.
 */
async function getPosSalesReport({ targetDate = null, farmacieId = null } = {}) {
  const dateStr = targetDate || new Date().toISOString().split('T')[0];
  const hasBranch = farmacieId && farmacieId !== 'all';
  let sales = [];

  if (cleanDatabaseUrl) {
    let query = 'SELECT * FROM pos_sales WHERE DATE(created_at) = $1';
    const params = [dateStr];
    if (hasBranch) {
      params.push(farmacieId);
      query += ' AND farmacie_id = $2';
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    sales = result.rows.map(formatSale);
  } else {
    let query = "SELECT * FROM pos_sales WHERE date(created_at) = ?";
    const params = [dateStr];
    if (hasBranch) {
      params.push(farmacieId);
      query += " AND farmacie_id = ?";
    }
    query += ' ORDER BY created_at DESC';
    sales = sqliteDb.prepare(query).all(...params).map(formatSale);
  }

  // Calculăm încasările doar pentru bonurile active (non-refunded)
  const activeSales = sales.filter(s => s.status !== 'refunded');
  const refundedSales = sales.filter(s => s.status === 'refunded');

  const totalRevenue = activeSales.reduce((acc, s) => acc + (parseFloat(s.total_amount) || 0), 0);
  const totalItemsSold = activeSales.reduce((acc, s) => acc + (parseInt(s.total_items, 10) || 0), 0);
  const totalReceipts = activeSales.length;
  const avgReceipt = totalReceipts > 0 ? totalRevenue / totalReceipts : 0;

  return {
    date: dateStr,
    farmacieId: farmacieId || 'all',
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalItemsSold,
    totalReceipts,
    refundedCount: refundedSales.length,
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
  refundPosSale,
  getPosSales,
  getPosSalesReport
};
