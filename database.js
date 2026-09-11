/**
 * Modul de abstractizare a bazei de date.
 * Suportă SQLite (dezvoltare locală) și PostgreSQL (Render.com / producție).
 */

const path = require('path');

let db;
let dbType;

/**
 * Inițializează conexiunea la baza de date.
 */
async function initDatabase() {
  dbType = process.env.DB_TYPE || (process.env.DATABASE_URL ? 'postgres' : 'sqlite');

  if (dbType === 'postgres') {
    const { Pool } = require('pg');
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

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

    console.log('✅ Conectat la PostgreSQL');
  } else {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'farmacia.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

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
      )
    `);

    console.log('✅ Conectat la SQLite (local)');
  }
}

/**
 * Obține toate produsele.
 */
async function getAllProducts() {
  if (dbType === 'postgres') {
    const result = await db.query('SELECT * FROM products ORDER BY created_at DESC');
    return result.rows;
  } else {
    return db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  }
}

/**
 * Obține un produs după ID.
 */
async function getProductById(id) {
  if (dbType === 'postgres') {
    const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    return result.rows[0];
  } else {
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
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
    return result.rows[0];
  } else {
    const stmt = db.prepare(
      'INSERT INTO products (name, description, price, stock, image, category) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const info = stmt.run(name, description || '', price, stock, image || '', category || 'General');
    return { id: info.lastInsertRowid, name, description, price, stock, image, category };
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
    return result.rows[0];
  } else {
    db.prepare(
      'UPDATE products SET name=?, description=?, price=?, stock=?, image=?, category=? WHERE id=?'
    ).run(name, description, price, stock, image, category, id);
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  }
}

/**
 * Actualizează doar stocul unui produs.
 */
async function updateStock(id, stock) {
  if (dbType === 'postgres') {
    const result = await db.query('UPDATE products SET stock=$1 WHERE id=$2 RETURNING *', [stock, id]);
    return result.rows[0];
  } else {
    db.prepare('UPDATE products SET stock=? WHERE id=?').run(stock, id);
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
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
    return parseInt(result.rows[0].count);
  } else {
    return db.prepare('SELECT COUNT(*) as count FROM products').get().count;
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
  countProducts
};
