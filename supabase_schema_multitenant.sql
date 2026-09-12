-- ════════════════════════════════════════════════════════════════════════════
--  FARMACIA MOLDOVA / NOBIS FARM — SCHEMA MULTI-TENANT & RLS SUPABASE
--  Rețea: "Nobis Farm Horești" ('horesti') & "Nobis Farm Zimbreni" ('zimbreni')
-- ════════════════════════════════════════════════════════════════════════════

-- 1. TABELA FILIALE (PHARMACY BRANCHES)
CREATE TABLE IF NOT EXISTS pharmacy_branches (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(50) DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Inserare date filiale
INSERT INTO pharmacy_branches (id, name, address, phone)
VALUES 
  ('horesti', 'Nobis Farm Horești', 's. Horești, r-nul Ialoveni', '+373 22 987 111'),
  ('zimbreni', 'Nobis Farm Zimbreni', 's. Zimbreni, r-nul Ialoveni', '+373 22 987 222')
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  address = EXCLUDED.address,
  phone = EXCLUDED.phone;

-- 2. TABELA PRODUSE & STOCURI PER FILIALĂ
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
  farmacie_id VARCHAR(50) NOT NULL REFERENCES pharmacy_branches(id) DEFAULT 'horesti',
  expiration_date DATE DEFAULT NULL,
  batch_number VARCHAR(100) DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexuri pentru căutare rapidă și scanare cod de bare per filială
CREATE INDEX IF NOT EXISTS idx_products_farmacie ON products(farmacie_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_exp_date ON products(expiration_date);

-- 3. TABELA UTILIZATORI / FARMACIȘTI / ADMIN (RBAC)
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'pharmacist', -- 'admin' (Super-Admin / Șef) sau 'pharmacist' (Operator POS)
  farmacie_id VARCHAR(50) NOT NULL DEFAULT 'horesti', -- 'all' pentru admin, 'horesti' sau 'zimbreni' pentru farmacist
  full_name VARCHAR(100) DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. TABELA VÂNZĂRI POS (TRANZACȚII CASĂ DE MARCAT)
CREATE TABLE IF NOT EXISTS pos_sales (
  id SERIAL PRIMARY KEY,
  receipt_number VARCHAR(100) NOT NULL UNIQUE,
  items JSONB NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  total_items INTEGER NOT NULL DEFAULT 1,
  payment_method VARCHAR(50) DEFAULT 'Numerar',
  farmacie_id VARCHAR(50) NOT NULL REFERENCES pharmacy_branches(id) DEFAULT 'horesti',
  status VARCHAR(50) NOT NULL DEFAULT 'completed', -- 'completed' sau 'refunded' (retur/anulare)
  operator_name VARCHAR(100) DEFAULT 'Farmacist',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pos_sales_farmacie ON pos_sales(farmacie_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_date ON pos_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_sales_receipt ON pos_sales(receipt_number);

-- 5. TABELA COMENZI ONLINE
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  delivery_address TEXT NOT NULL,
  items TEXT NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Nouă',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ════════════════════════════════════════════════════════════════════════════
--  CONFIGURARE ROW LEVEL SECURITY (RLS) MULTI-TENANT
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Funcții ajutătoare pentru identificarea utilizatorului și a filialei din token JWT
CREATE OR REPLACE FUNCTION current_user_role() 
RETURNS TEXT AS $$
  SELECT COALESCE(auth.jwt() ->> 'role', 'anon');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_user_farmacie_id() 
RETURNS TEXT AS $$
  SELECT COALESCE(auth.jwt() ->> 'farmacie_id', '');
$$ LANGUAGE sql STABLE;

-- Politici RLS pentru Tabela PRODUCTS:
-- Super-Admin ('admin') vede toate produsele din toate filialele.
-- Farmacistul ('pharmacist') vede exclusiv stocurile filialei sale ('horesti' sau 'zimbreni').
DROP POLICY IF EXISTS products_tenant_isolation ON products;
CREATE POLICY products_tenant_isolation ON products
  FOR ALL
  TO authenticated
  USING (
    current_user_role() = 'admin' 
    OR farmacie_id = current_user_farmacie_id()
  )
  WITH CHECK (
    current_user_role() = 'admin' 
    OR (current_user_role() = 'pharmacist' AND farmacie_id = current_user_farmacie_id())
  );

-- Politici RLS pentru Tabela POS_SALES:
-- Fiecare farmacist vede și emite bonuri doar pentru filiala sa.
-- Șeful / Super-Admin vede vânzările din ambele filiale.
DROP POLICY IF EXISTS pos_sales_tenant_isolation ON pos_sales;
CREATE POLICY pos_sales_tenant_isolation ON pos_sales
  FOR ALL
  TO authenticated
  USING (
    current_user_role() = 'admin' 
    OR farmacie_id = current_user_farmacie_id()
  )
  WITH CHECK (
    current_user_role() = 'admin' 
    OR (current_user_role() = 'pharmacist' AND farmacie_id = current_user_farmacie_id())
  );
