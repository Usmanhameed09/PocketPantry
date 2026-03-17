-- PocketPantry Complete PostgreSQL Schema
-- Generated 2026-03-17

create extension if not exists "uuid-ossp";

-- =======================
-- Enums
-- =======================
create type user_role as enum ('operator', 'viewer', 'admin');
create type machine_status as enum ('healthy', 'low_stock', 'offline');
create type campaign_status as enum ('active', 'scheduled', 'completed', 'paused');
create type lead_source as enum ('excel_import', 'google_maps');
create type contact_method as enum ('call', 'email', 'call_email');
create type email_status as enum ('sent', 'opened', 'replied', 'bounced');
create type pricing_status as enum ('cost_margin', 'pending_approval', 'seasonal_price', 'approved');
create type rec_action as enum ('add', 'remove', 'increase', 'decrease');
create type season as enum ('spring', 'summer', 'fall', 'winter');

-- =======================
-- Core / Auth
-- =======================
create table companies (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  password_hash text not null,
  role user_role not null default 'operator',
  phone text,
  location text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_notification_prefs (
  user_id uuid primary key references users(id) on delete cascade,
  machine_alerts boolean not null default true,
  low_inventory boolean not null default true,
  daily_report boolean not null default true,
  price_changes boolean not null default true,
  pipeline_updates boolean not null default false,
  weekly_digest boolean not null default true,
  updated_at timestamptz not null default now()
);

-- =======================
-- Locations & Machines
-- =======================
create table locations (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  address text not null,
  city text,
  state text,
  postal_code text,
  country text default 'US',
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);

create table machines (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  name text not null,
  status machine_status not null default 'healthy',
  serial_number text,
  nayax_device_id text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_machines_company on machines(company_id);
create index idx_machines_location on machines(location_id);

-- =======================
-- Products & Inventory
-- =======================
create table suppliers (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  lead_time_days int not null default 1,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  sku text not null,
  category text not null,
  default_supplier_id uuid references suppliers(id),
  unit_size text,
  created_at timestamptz not null default now(),
  unique(company_id, sku)
);

create table warehouse_inventory (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  on_hand int not null default 0,
  updated_at timestamptz not null default now(),
  unique(company_id, product_id)
);

create table machine_inventory (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid not null references machines(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  last_loaded_qty int not null default 0,
  estimated_remaining int not null default 0,
  last_refill_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(machine_id, product_id)
);

create table inventory_batches (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity int not null,
  received_at date not null,
  expiry_date date,
  location text default 'warehouse',
  created_at timestamptz not null default now()
);

-- =======================
-- Transactions / Payments (Nayax)
-- =======================
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid not null references machines(id) on delete cascade,
  product_id uuid references products(id),
  transaction_time timestamptz not null,
  quantity int not null default 1,
  price numeric(10,2) not null,
  payment_method text not null,
  external_id text,
  created_at timestamptz not null default now()
);

create index idx_tx_machine_time on transactions(machine_id, transaction_time);
create index idx_tx_product_time on transactions(product_id, transaction_time);

-- =======================
-- Pricing
-- =======================
create table supplier_costs (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  cost numeric(10,2) not null,
  effective_date date not null,
  created_at timestamptz not null default now(),
  unique(supplier_id, product_id, effective_date)
);

create table pricing_rules (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  min_margin_pct numeric(5,2) not null default 40.0,
  rounding_increment numeric(5,2) not null default 0.25,
  seasonal_boost_pct numeric(5,2) default 0,
  max_increase_pct numeric(5,2) default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_prices (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid references machines(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  current_price numeric(10,2) not null,
  updated_at timestamptz not null default now(),
  unique(machine_id, product_id)
);

create table price_suggestions (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  machine_id uuid references machines(id) on delete cascade,
  supplier_id uuid references suppliers(id),
  prev_cost numeric(10,2),
  new_cost numeric(10,2),
  current_price numeric(10,2) not null,
  suggested_price numeric(10,2) not null,
  margin_pct numeric(5,2) not null,
  status pricing_status not null default 'pending_approval',
  trigger text not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table supplier_call_logs (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  call_time timestamptz not null,
  attempt int not null,
  outcome text not null,
  transcript text,
  summary text,
  created_at timestamptz not null default now()
);

create table supplier_price_quotes (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quoted_cost numeric(10,2) not null,
  quote_date date not null,
  source text default 'ai_call',
  created_at timestamptz not null default now()
);

-- =======================
-- Purchase Orders
-- =======================
create table purchase_orders (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table purchase_order_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity int not null,
  unit_cost numeric(10,2) not null
);

-- =======================
-- Pipeline / Leads
-- =======================
create table pipeline_stages (
  id serial primary key,
  key text unique not null,
  label text not null,
  sort_order int not null
);

insert into pipeline_stages (key, label, sort_order) values
('prospect', 'Prospect', 1),
('contacted', 'Contacted', 2),
('follow_up', 'Follow-Up', 3),
('site_visit', 'Site Visit', 4),
('proposal', 'Proposal', 5),
('signed', 'Signed', 6),
('installed', 'Installed', 7)
;

create table leads (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  business text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  distance_miles numeric(6,2),
  business_type text,
  source lead_source not null,
  stage_id int references pipeline_stages(id),
  contact_method contact_method not null,
  added_date date not null default current_date,
  last_activity_at timestamptz,
  created_at timestamptz not null default now()
);

create table call_logs (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  attempt int not null,
  call_time timestamptz not null,
  duration_seconds int,
  outcome text not null,
  summary text,
  created_at timestamptz not null default now()
);

create table email_logs (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  email_time timestamptz not null,
  status email_status not null,
  subject text not null,
  created_at timestamptz not null default now()
);

create table outreach_sequences (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table outreach_steps (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references outreach_sequences(id) on delete cascade,
  step_order int not null,
  channel text not null,
  wait_days int not null default 0,
  template_id text,
  created_at timestamptz not null default now()
);

create table lead_outreach_log (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  sequence_id uuid references outreach_sequences(id),
  step_id uuid references outreach_steps(id),
  sent_at timestamptz,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);

-- =======================
-- Advertising
-- =======================
create table ad_campaigns (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  client_name text not null,
  contact_name text,
  contact_email text,
  ad_name text not null,
  start_date date not null,
  end_date date not null,
  daily_rate numeric(10,2) not null,
  status campaign_status not null,
  tracking_url text,
  created_at timestamptz not null default now()
);

create table ad_campaign_machines (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  total_slots int not null default 4,
  used_slots int not null default 1,
  avg_daily_transactions int,
  created_at timestamptz not null default now(),
  unique(campaign_id, machine_id)
);

create table ad_impressions (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  impression_date date not null,
  impressions int not null,
  created_at timestamptz not null default now(),
  unique(campaign_id, machine_id, impression_date)
);

create table ad_scans (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  scan_time timestamptz not null,
  created_at timestamptz not null default now()
);

create table ad_assets (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  asset_url text not null,
  asset_type text not null,
  created_at timestamptz not null default now()
);

create table ad_invoices (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  invoice_date date not null,
  amount numeric(10,2) not null,
  status text not null default 'unpaid',
  due_date date,
  created_at timestamptz not null default now()
);

-- =======================
-- Predictions
-- =======================
create table prediction_models (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  last_trained_at timestamptz,
  accuracy_pct numeric(5,2),
  data_points int,
  created_at timestamptz not null default now()
);

create table machine_forecasts (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references prediction_models(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  forecast_start date not null,
  forecast_end date not null,
  current_weekly numeric(10,2) not null,
  predicted_weekly numeric(10,2) not null,
  change_pct numeric(6,2) not null,
  confidence_pct numeric(5,2) not null,
  top_product_id uuid references products(id),
  weak_product_id uuid references products(id),
  predicted_refill_date date,
  created_at timestamptz not null default now()
);

create table product_performance_predictions (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references prediction_models(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  avg_daily_sales numeric(10,2),
  predicted_daily_sales numeric(10,2),
  trend text,
  trend_pct numeric(6,2),
  revenue_share_pct numeric(6,2),
  recommendation rec_action,
  reason text,
  created_at timestamptz not null default now()
);

create table seasonal_trends (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references prediction_models(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  current_season season not null,
  seasonal_change_pct numeric(6,2),
  peak_month text,
  low_month text,
  insight text,
  created_at timestamptz not null default now()
);

create table product_mix_recommendations (
  id uuid primary key default uuid_generate_v4(),
  model_id uuid not null references prediction_models(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  action rec_action not null,
  reason text,
  estimated_impact text,
  confidence_pct numeric(5,2),
  created_at timestamptz not null default now()
);

-- =======================
-- Today Ops / Anomalies
-- =======================
create table ops_tasks (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  task_type text not null,
  priority text not null default 'medium',
  title text not null,
  description text,
  related_entity_type text,
  related_entity_id uuid,
  status text not null default 'open',
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table anomalies (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  machine_id uuid references machines(id) on delete cascade,
  type text not null,
  severity text not null,
  detected_at timestamptz not null,
  summary text,
  resolution text,
  resolved_at timestamptz
);

-- =======================
-- Refill Routes
-- =======================
create table refill_routes (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  route_date date not null,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

create table refill_route_stops (
  id uuid primary key default uuid_generate_v4(),
  route_id uuid not null references refill_routes(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  stop_order int not null,
  items_count int,
  notes text
);
