-- PocketPantry Inventory Migration
-- Run this in Supabase Dashboard > SQL Editor
-- URL: https://supabase.com/dashboard/project/oxagphaksvrasbtsbfhf/sql

-- Enums (skip if already exist)
DO $$ BEGIN CREATE TYPE machine_status AS ENUM ('healthy', 'low_stock', 'offline'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Locations
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'US',
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Machines
CREATE TABLE IF NOT EXISTS machines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  status machine_status NOT NULL DEFAULT 'healthy',
  serial_number text,
  nayax_device_id text,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_machines_nayax_id ON machines(nayax_device_id);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  contact_email text,
  lead_time_days int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text NOT NULL,
  category text NOT NULL DEFAULT 'Snacks',
  default_supplier_id uuid REFERENCES suppliers(id),
  unit_size text,
  unit_cost numeric(10,2) DEFAULT 0,
  lead_time_days int DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, sku)
);

-- Warehouse Inventory
CREATE TABLE IF NOT EXISTS warehouse_inventory (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  on_hand int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, product_id)
);

-- Machine Inventory
CREATE TABLE IF NOT EXISTS machine_inventory (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  last_loaded_qty int NOT NULL DEFAULT 0,
  estimated_remaining int NOT NULL DEFAULT 0,
  daily_sales_rate numeric(6,2) DEFAULT 0,
  last_refill_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(machine_id, product_id)
);

-- Inventory Batches
CREATE TABLE IF NOT EXISTS inventory_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity int NOT NULL,
  received_at date NOT NULL,
  expiry_date date,
  location text DEFAULT 'warehouse',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Product Prices
CREATE TABLE IF NOT EXISTS product_prices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id uuid REFERENCES machines(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  current_price numeric(10,2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(machine_id, product_id)
);

-- Seed default company
INSERT INTO companies (id, name, timezone)
VALUES ('00000000-0000-0000-0000-000000000001', 'PocketPantry', 'America/New_York')
ON CONFLICT (id) DO NOTHING;
