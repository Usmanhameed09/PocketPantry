import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * One-time migration: creates inventory tables + seeds default company.
 * Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT).
 * DELETE THIS FILE after migration is confirmed.
 */
export async function POST() {
  const supabase = createServerClient();
  const results: string[] = [];

  // We can't run raw SQL via PostgREST, so we use individual table operations.
  // First, check if tables exist by trying to query them.

  // Step 1: Check if 'companies' table exists
  const { error: companiesCheck } = await supabase.from("companies").select("id").limit(1);
  if (companiesCheck && companiesCheck.code === "42P01") {
    // Table doesn't exist — we need to create via SQL
    // Since we can't run DDL via PostgREST, return the SQL for the user to run
    return NextResponse.json({
      success: false,
      error: "Tables don't exist yet. Run the SQL below in Supabase Dashboard > SQL Editor.",
      sql: MIGRATION_SQL,
    });
  }

  // If companies table exists, seed default company
  const COMPANY_ID = "00000000-0000-0000-0000-000000000001";
  const { error: companyErr } = await supabase.from("companies").upsert({
    id: COMPANY_ID,
    name: "PocketPantry",
    timezone: "America/New_York",
  }, { onConflict: "id" });

  if (companyErr) {
    results.push(`Company seed error: ${companyErr.message}`);
  } else {
    results.push("Default company seeded");
  }

  // Check remaining tables
  for (const table of ["products", "machines", "suppliers", "warehouse_inventory", "machine_inventory", "inventory_batches"]) {
    const { error } = await supabase.from(table).select("id").limit(1);
    if (error && error.code === "42P01") {
      results.push(`Table '${table}' missing — run migration SQL`);
    } else if (error) {
      results.push(`Table '${table}': ${error.message}`);
    } else {
      results.push(`Table '${table}' exists`);
    }
  }

  return NextResponse.json({ success: true, results });
}

const MIGRATION_SQL = `
-- PocketPantry Inventory Migration
-- Run this in Supabase Dashboard > SQL Editor

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

-- Seed default company
INSERT INTO companies (id, name, timezone)
VALUES ('00000000-0000-0000-0000-000000000001', 'PocketPantry', 'America/New_York')
ON CONFLICT (id) DO NOTHING;
`;
