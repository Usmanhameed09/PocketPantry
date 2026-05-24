-- Daily sales history: one row per (product, machine, day) with unit count.
-- Source: Nayax lastSales transactions, bucketed by day per sync.
-- Idempotent via UNIQUE constraint — re-syncing the same date overwrites.

CREATE TABLE IF NOT EXISTS daily_sales (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  sale_date date NOT NULL,
  units_sold int NOT NULL DEFAULT 0,
  revenue numeric(10,2) DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, machine_id, sale_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_date ON daily_sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_sales_product_date ON daily_sales(product_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_sales_machine_date ON daily_sales(machine_id, sale_date DESC);
