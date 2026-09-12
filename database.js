/**
 * Modul de abstractizare a bazei de date.
 * Suportă SQLite (dezvoltare locală) și PostgreSQL (Supabase / Render.com).
 */

const path = require('path');

let db;
let dbType;

/**
 * Formatează produsul pentru a asigura tipuri numerice consistente
 */
function formatProduct(row) {
  if (!row) return null;
  return {
    ...row,
    price: parseFloat(row.price),
    stock: parseInt(row.stock, 10)
  };
}

/**
 * Inițializează conexiunea la baza de date și creează tabelele necesare.
 */
async function initDatabase() {
  // Dacă există process.env.DATABASE_URL sau DB_TYPE este 'postgres', folosim pachetul pg
  dbType = process.env.DATABASE_URL || process.env.DB_TYPE === 'postgres' ? 'postgres' : (process.env.DB_TYPE || 'sqlite');

  if (dbType === 'postgres') {
    const { Pool } = require('pg');
    
    // Configurare SSL pentru baze de date cloud (Supabase, Neon, Render etc.)
    const isLocalhost = process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1'));
    const ssl = isLocalhost ? false : { rejectUnauthorized: false };

    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl
    });

    // Testăm conexiunea
    try {
      const client = await db.connect();
      client.release();
    } catch (connErr) {
      console.error('❌ Eroare la conectarea la PostgreSQL (Supabase / Render):', connErr.message);
      throw connErr;
    }

    // Creăm tabela pentru produse dacă nu există
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        price NUMERIC(10,2) NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        image VARCHAR(500) DEFAULT '',
        category VARCHAR(100) DEFAULT 'General',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Creăm tabela pentru administrare dacă nu există
    await db.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL DEFAULT 'admin',
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Conectat la PostgreSQL cu succes (folosind pachetul pg)');
    console.log('✅ Tabelele "products" și "admins" au fost verificate/create automat.');
  } else {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'farmacia.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Creăm tabela pentru produse în SQLite
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        price REAL NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        image TEXT DEFAULT '',
        category TEXT DEFAULT 'General',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL DEFAULT 'admin',
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Conectat la SQLite (local)');
    console.log('✅ Tabelele "products" și "admins" au fost verificate/create automat.');
  }
}

/**
 * Obține toate produsele.
 */
async function getAllProducts() {
  if (dbType === 'postgres') {
    const result = await db.query('SELECT * FROM products ORDER BY created_at DESC');
    return result.rows.map(formatProduct);
  } else {
    return db.prepare('SELECT * FROM products ORDER BY created_at DESC').all().map(formatProduct);
  }
}

/**
 * Obține un produs după ID.
 */
async function getProductById(id) {
  if (dbType === 'postgres') {
    const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    return formatProduct(result.rows[0]);
  } else {
    return formatProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }
}

/**
 * Adaugă un produs nou.
 */
async function addProduct({ name, description, price, stock, image, category }) {
  if (dbType === 'postgres') {
    const result = await db.query(
      'INSERT INTO products (name, description, price, stock, image, category) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description || '', price, stock, image || '', category || 'General']
    );
    return formatProduct(result.rows[0]);
  } else {
    const stmt = db.prepare(
      'INSERT INTO products (name, description, price, stock, image, category) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(name, description || '', price, stock, image || '', category || 'General');
    return formatProduct({ id: info.lastInsertRowid, name, description, price, stock, image, category });
  }
}

/**
 * Actualizează un produs.
 */
async function updateProduct(id, { name, description, price, stock, image, category }) {
  if (dbType === 'postgres') {
    const result = await db.query(
      'UPDATE products SET name=$1, description=$2, price=$3, stock=$4, image=$5, category=$6 WHERE id=$7 RETURNING *',
      [name, description, price, stock, image, category, id]
    );
    return formatProduct(result.rows[0]);
  } else {
    db.prepare(
      'UPDATE products SET name=?, description=?, price=?, stock=?, image=?, category=? WHERE id=?'
    ).run(name, description, price, stock, image, category, id);
    return formatProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }
}

/**
 * Actualizează doar stocul unui produs.
 */
async function updateStock(id, stock) {
  if (dbType === 'postgres') {
    const result = await db.query('UPDATE products SET stock=$1 WHERE id=$2 RETURNING *', [stock, id]);
    return formatProduct(result.rows[0]);
  } else {
    db.prepare('UPDATE products SET stock=? WHERE id=?').run(stock, id);
    return formatProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }
}

/**
 * Șterge un produs.
 */
async function deleteProduct(id) {
  if (dbType === 'postgres') {
    await db.query('DELETE FROM products WHERE id = $1', [id]);
  } else {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
  }
  return true;
}

/**
 * Numără produsele (pentru seed check).
 */
async function countProducts() {
  if (dbType === 'postgres') {
    const result = await db.query('SELECT COUNT(*) as count FROM products');
    return parseInt(result.rows[0].count, 10);
  } else {
    return db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  }
}

// ──────────────────────────────────────────────
//  Operațiuni pentru Tabela Admins
// ──────────────────────────────────────────────

/**
 * Numără administratorii din baza de date.
 */
async function countAdmins() {
  if (dbType === 'postgres') {
    const result = await db.query('SELECT COUNT(*) as count FROM admins');
    return parseInt(result.rows[0].count, 10);
  } else {
    return db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
  }
}

/**
 * Găsește administratorul după username.
 */
async function getAdminByUsername(username = 'admin') {
  if (dbType === 'postgres') {
    const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    return result.rows[0] || null;
  } else {
    return db.prepare('SELECT * FROM admins WHERE username = ?').get(username) || null;
  }
}

/**
 * Creează sau actualizează contul de administrator.
 */
async function createAdmin(username, passwordHash) {
  if (dbType === 'postgres') {
    const result = await db.query(
      'INSERT INTO admins (username, password) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password RETURNING *',
      [username, passwordHash]
    );
    return result.rows[0];
  } else {
    db.prepare(
      'INSERT INTO admins (username, password) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET password = excluded.password'
    ).run(username, passwordHash);
    return db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  }
}

/**
 * Actualizează parola administratorului.
 */
async function updateAdminPassword(username, passwordHash) {
  if (dbType === 'postgres') {
    const result = await db.query(
      'UPDATE admins SET password = $1 WHERE username = $2 RETURNING *',
      [passwordHash, username]
    );
    return result.rows[0];
  } else {
    db.prepare('UPDATE admins SET password = ? WHERE username = ?').run(passwordHash, username);
    return db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  }
}

module.exports = {
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
};
