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
 * Inițializează tabelele necesare la pornirea serverului.
 */
async function initDatabase() {
  if (cleanDatabaseUrl) {
    try {
      // Creare tabele cu sintaxă de PostgreSQL
      await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT DEFAULT '',
          price NUMERIC(10,2) NOT NULL,
          stock INTEGER NOT NULL DEFAULT 0,
          image VARCHAR(500) DEFAULT '',
          category VARCHAR(100) DEFAULT 'General',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS admins (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL DEFAULT 'admin',
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS produse (
          id SERIAL PRIMARY KEY,
          nume TEXT,
          pret NUMERIC,
          stoc INT
        );
      `);

      console.log('✅ Tabelele PostgreSQL ("products", "admins", "produse") au fost create/verificate la pornire.');
    } catch (err) {
      if (err.code === '28P01') {
        console.error('❌ Eroare PostgreSQL (28P01): Autentificarea a eșuat pentru utilizatorul "postgres".');
        console.error('👉 Verifică parola din DATABASE_URL setată în panoul Render (Environment Variables).');
        console.error('👉 Dacă parola conține caractere speciale (ex. #, @, :, /, ?), acestea trebuie URL-encodate (ex. %23 pentru #).');
        console.error('👉 Verifică dacă parola din Supabase a fost resetată recent și actualizeaz-o pe Render.');
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

      CREATE TABLE IF NOT EXISTS produse (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nume TEXT,
        pret REAL,
        stoc INT
      );
    `);

    console.log('✅ Tabelele SQLite ("products", "admins", "produse") au fost create/verificate la pornire.');
  }
}

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
 * Adaugă un produs nou.
 */
async function addProduct({ name, description, price, stock, image, category }) {
  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'INSERT INTO products (name, description, price, stock, image, category) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, description || '', price, stock, image || '', category || 'General']
    );
    return formatProduct(result.rows[0]);
  } else {
    const stmt = sqliteDb.prepare(
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
  if (cleanDatabaseUrl) {
    const result = await pool.query(
      'UPDATE products SET name=$1, description=$2, price=$3, stock=$4, image=$5, category=$6 WHERE id=$7 RETURNING *',
      [name, description, price, stock, image, category, id]
    );
    return formatProduct(result.rows[0]);
  } else {
    sqliteDb.prepare(
      'UPDATE products SET name=?, description=?, price=?, stock=?, image=?, category=? WHERE id=?'
    ).run(name, description, price, stock, image, category, id);
    return formatProduct(sqliteDb.prepare('SELECT * FROM products WHERE id = ?').get(id));
  }
}

/**
 * Actualizează doar stocul unui produs.
 */
async function updateStock(id, stock) {
  if (cleanDatabaseUrl) {
    const result = await pool.query('UPDATE products SET stock=$1 WHERE id=$2 RETURNING *', [stock, id]);
    return formatProduct(result.rows[0]);
  } else {
    sqliteDb.prepare('UPDATE products SET stock=? WHERE id=?').run(stock, id);
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
 * Numără produsele (pentru seed check).
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

module.exports = {
  pool,
  db: pool,
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
