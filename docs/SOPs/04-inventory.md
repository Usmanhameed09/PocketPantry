# 04 — Inventory

> SOP for managing stock, refills, purchases, and the catalog.
> Read the **Tasks** section to learn how to actually do something. The
> **Reference** section at the bottom explains what each part of the
> page is showing you.

## How to open it

Click **Inventory** in the left sidebar.

You land on the **Overview** tab. The other tabs (Warehouse, Scan, Products, etc.) appear in a row at the top — click one to switch.

---

# Tasks

## Task 1 — Log a refill after visiting a machine

**When to do it:** Every time you finish refilling a machine on your route.
**Why it matters:** This is what tells the system that stock moved from your warehouse into the machine. Without it, warehouse counts go wrong AND low-stock alerts don't clear.

1. Click **Inventory** in the sidebar.
2. Click the green **+ Log Refill** button (top-right of the page).
3. A pop-up appears titled **Log Machine Refill**.
4. In the **Machine** dropdown, pick the machine you just refilled.
5. In the product rows, pick a product from the dropdown and type how many units you loaded.
6. To add more products, click **+ Add Product** at the bottom.
7. When all rows are filled, click the green **Log Refill** button at the bottom-right of the pop-up.

✅ **What you should see:** The pop-up closes and the products list refreshes. The product's "In Machines" column goes up. The warehouse "On Hand" goes down by the same amount.

❌ **If it fails:**
- "Select a machine" → you forgot step 4. Pick a machine.
- "Add at least one product with quantity > 0" → at least one row needs a product AND a quantity.

---

## Task 2 — Scan stock arriving from a supplier (Sam's Club, Costco delivery)

**When to do it:** When a delivery shows up at your warehouse.
**Why it matters:** Scanning is the fastest way to record incoming stock. Each scan adds 1 case to the warehouse.

1. Click **Inventory** in the sidebar.
2. Click the **Scan** tab at the top.
3. Click the green **Start camera** button.
4. The browser asks for camera permission → click **Allow**.
5. Hold a barcode 4–8 inches from the camera, well-lit. The phone may need a second to focus.
6. When the scanner reads the barcode, one of three things happens:

   **A) Product already in catalog with that barcode → "Add to warehouse" pop-up appears**
   - Click **Add 1 case** (or use a custom quantity).
   - The product's warehouse stock goes up by the case size.

   **B) Product matches an existing item by name → "Match found" pop-up appears**
   - Click **Use this product** to attach the barcode and add 1 case.
   - Or click **No, register as new** if it's actually a different SKU.

   **C) Brand new product → "Register barcode" pop-up appears**
   - Fill in: name, category, vendor, case size, unit cost.
   - Click **Register + Add 1 case**.

✅ **What you should see:** A green flash at the top with "+N [product name]" each time you scan. The scan history below the camera grows.

💡 **Tips:**
- Low light → click the flashlight button (bottom-right of the camera).
- Curved or small barcode → use the zoom slider (bottom-left of the camera).
- Tap the live image to refocus the camera.
- Can't read it → type the barcode manually in the box below the camera, then click **Look up**.

---

## Task 3 — Add a product to the catalog manually

**When to do it:** A product without a barcode, OR when prepping the catalog before a delivery.

1. Click **Inventory** in the sidebar.
2. Click the **Products** tab at the top.
3. Click the green **+ Add product** button (top-right).
4. A pop-up appears titled **Add product**.
5. Fill in the fields:
   - **Name** (required) — full product name as printed on the package.
   - **Category** — Snacks / Candy / Drinks / Meals.
   - **Status** — leave as Active.
   - **Vendor** — who you buy it from (e.g. Sam's Club).
   - **Barcode** — optional; you can scan it later.
   - **Unit cost ($)** — what one unit costs you.
   - **Default vend price ($)** — what you sell one unit for.
   - **Case size** — units per box (e.g. 12).
   - **Lead time (days)** — how many days from order to delivery.
6. Click **Save product**.

✅ **What you should see:** The pop-up closes and the new product appears in the table.

---

## Task 4 — Generate this week's buy list

**When to do it:** Weekly (e.g. every Monday morning) before placing orders.

1. Click **Inventory** in the sidebar.
2. Click the **Buy List** tab at the top.
3. Click the green **Generate buy list** button.
4. Wait a few seconds. The list appears, grouped by vendor.
5. Review each line — the **Why** column explains why each item was suggested.
6. To change a quantity, edit the cell directly (some lines support inline editing).
7. When the list looks right, click **Convert to PO drafts** (top-right of the totals card).

✅ **What you should see:** A green message: "Created 1 purchase order draft." The list clears and a new PO appears in the **Purchase Orders** tab.

💡 **Note:** All lines get rolled into ONE purchase order — the scraped vendor names (Walmart, Sam's Club) aren't your real suppliers, so the PO is now one consolidated document you can hand off as a single document.

❌ **If the list is empty:** Your warehouse + machine stock + open POs already cover the next 12 days of demand. No order needed. Check back next week.

---

## Task 5 — Approve and receive a purchase order

**When to do it:** Each step of the PO lifecycle as orders move through your process.

### Step A — Approve a draft PO

1. Click **Inventory** in the sidebar.
2. Click the **Purchase Orders** tab at the top.
3. Click the **Draft** filter button at the top.
4. Click anywhere on a row to open the PO detail page.
5. Click the green **Approve** button (top-right).

✅ The status badge changes to **Approved**.

### Step B — Mark a PO as purchased (after you place the actual order with the supplier)

1. From the PO detail page (with status Approved), click the green **Mark purchased** button.

✅ The status badge changes to **Purchased**.

### Step C — Receive a PO (when the delivery arrives at your warehouse)

1. From the PO detail page, find the "Receive now" column on each line.
2. Type how many units of that line you actually received.
3. Click the green **Submit receipt** button at the bottom-right.

✅ Each line's "Received" column updates. When every line is fully received, the PO status auto-changes to **Received** and your warehouse stock goes up.

### Step D (Optional) — Distribute received stock straight to machines

1. After the PO shows **Received**, click the green **Distribute to machines** button.
2. A grid pops up: one row per product, one column per machine.
3. Type how many units you're loading into each machine.
4. Click the green **Distribute** button.

✅ A refill event is recorded for each machine. Warehouse stock goes down, machine "in machines" count goes up.

### Step E (If needed) — Delete a PO

1. From the PO detail page, click the red **Delete** button.
2. Confirm in the pop-up.

✅ The PO and all its lines are removed. You're returned to the PO list.

---

## Task 6 — Adjust warehouse stock manually (damage, spoilage, count correction)

**When to do it:** When you find broken products, expired items, or when a physical count doesn't match the system.

1. Click **Inventory** in the sidebar.
2. Click the **Warehouse** tab at the top.
3. Find the product in the table (use the search bar if needed).
4. Click the **Adjust** button on the product's row.
5. A pop-up appears.
6. Pick a reason: **Spoilage** / **Damage** / **Count Correction**.
7. Enter the quantity:
   - **Negative** number to REMOVE units (e.g. `-5` for 5 spoiled units).
   - **Positive** number to ADD units (e.g. `+3` if you found 3 you didn't know about).
8. Click **Save**.

✅ The product's "On Hand" updates. The change is recorded in the inventory ledger for audit.

---

## Task 7 — Change projection settings (velocity, safety stock, horizon)

**When to do it:** Usually never — defaults work well. Change these only when the Buy List is consistently over-ordering or under-ordering.

1. Click **Inventory** in the sidebar.
2. Click the **Projections** tab at the top.
3. Click the **Settings** button (gear icon, top-right of the page).
4. A pop-up appears titled **Projection settings**.
5. Adjust the three knobs:

| Knob | What changes if you raise it | What changes if you lower it |
|---|---|---|
| **Velocity window (weeks)** — default 6 | Forecast becomes smoother, slower to react to new trends. Good for steady, mature catalogs. | Forecast reacts faster to recent spikes. Good for new products or shifting tastes. |
| **Safety stock (days)** — default 5 | Buy List orders more — bigger buffer against stockouts. Higher carrying cost. | Buy List orders less — leaner stock. Higher stockout risk. |
| **Buy-list horizon (days)** — default 7 | Each order covers more days. Order less often, in larger quantities. | Each order covers fewer days. Order more often, in smaller quantities. |

6. Click the green **Save** button.

✅ The next time you generate the Buy List, the new settings take effect immediately.

💡 **Common situations:**
- Just had a stockout? Bump **safety stock** to 7–10 days for a couple of weeks.
- Going on vacation? Raise **buy-list horizon** to 14 so one order covers two weeks.
- New product just launched? Lower **velocity window** to 2 weeks so it catches the trend quickly.

---

## Task 8 — Approve a Trending product suggestion

**When to do it:** Weekly review of AI-suggested new products to add to your assortment.

1. Click **Inventory** in the sidebar.
2. Click the **Trending** tab at the top.
3. Click the purple **Find trending now** button to fetch fresh AI suggestions.
4. Each suggestion appears as a card with:
   - Product name + category badge
   - Suggested initial quantity
   - Suggested price range
   - Locations where it would do well
   - AI reasoning (purple highlight box at the bottom)
5. For each card:
   - Click green **Approve** to add it to your catalog as Active.
   - Click gray **Reject** to dismiss it.

✅ When you Approve, the product appears in **Inventory → Products** with status Active immediately. It's then eligible to appear in future buy lists and seasonal plans.

---

## Task 9 — Handle an underperformer (drop or replace)

**When to do it:** Monthly review to clean up slow-moving SKUs.

1. Click **Inventory** in the sidebar.
2. Click the **Underperformers** tab at the top.
3. Each row is a product the system thinks isn't pulling its weight. The **Reason** column explains why.
4. For each row:
   - Click the yellow **Replace** button if you want to phase it out and bring in a substitute.
   - In the pop-up, pick the replacement product from the dropdown.
   - Click **Start replacement**.

✅ The old product moves to **PhaseOut** status (still sellable on existing machines but no longer in Buy Lists). The new product becomes active. You can track progress on the **Replacements** tab.

💡 Products selling 10+ units/week are exempt from this list automatically — high-volume movers aren't flagged regardless of margin.

---

# Reference (what each part of the page shows)

## The tab row at the top

| Tab | What it does |
|---|---|
| **Overview** | Summary dashboard with totals + product list |
| **Ask AI** | AI chat scoped to inventory questions |
| **Warehouse** | Adjust warehouse stock manually |
| **Scan** | Barcode scanner — quickly add received stock |
| **Products** | Full product catalog (add/edit) |
| **Projections** | Per-product 30-day demand forecast |
| **Buy List** | Weekly purchase recommendation |
| **Purchase Orders** | Track POs from draft → received |
| **Alerts** | Low-stock + machine-offline alerts |
| **Trending** | AI-suggested new products to add |
| **Underperformers** | Slow-moving products to consider dropping |
| **Replacements** | Active replacement plans (phase out X, replace with Y) |

## The Overview tiles

| Tile | What it shows |
|---|---|
| **Total Products** | Number of SKUs in your catalog + total tracked units |
| **Low Stock** | How many products are running low |
| **Last Sync** | Status of the daily Nayax sync (sales pull) |
| **In Machines** | Estimated total units sitting in vending machines fleet-wide |

## The product table columns

| Column | Meaning |
|---|---|
| **Product** | Name + SKU |
| **On Hand** | Units sitting in your warehouse |
| **In Machines** | Estimated units loaded across all machines |
| **Daily Sales** | Average units sold per day fleet-wide |
| **Days Left** | (On Hand + In Machines) ÷ Daily Sales — runway estimate |
| **Lead Time** | How long from order to delivery (in days) |
| **Restock** | OK / Low / Critical / Out / NoData status badge |

## How stock flow works

```
Supplier → Warehouse → Machine → Customer
  (PO)     (delivery)   (refill)    (sale)
```

- **PO received** → Warehouse goes UP
- **Refill logged** → Warehouse goes DOWN, Machine goes UP
- **Customer buys** → Machine goes DOWN (via Nayax sync)

Every change is recorded as a `stock_movement` in the ledger. The system never silently transfers — you always know who/when/why.

---

# Common questions

**Q: What's the difference between warehouse stock and machine stock?**
A: Warehouse = physical stockpile at your office/garage. Machine stock = what's inside each vending machine. They're tracked separately.

**Q: I scanned a product but no quantity was added.**
A: After scanning, you have to click **Add 1 case** (or similar) in the pop-up. The scan itself just identifies the product — adding stock is a separate confirm step.

**Q: The alert says low stock but I just refilled. Why is it still there?**
A: Alerts auto-clear when a refill is logged. If it didn't, the refill quantity wasn't enough to push the "days remaining" above your threshold. Either add more, or dismiss the alert manually.

**Q: My Buy List is empty.**
A: Your warehouse + in-machines + open POs already cover the next 12 days of projected demand. No order needed. Try again in a few days.

**Q: My Buy List has way more than I expected.**
A: One or more products probably have stale Nayax velocity data (high estimate because of an early one-off sale). Check the **Why** column on each row — if you see a velocity that doesn't match reality, file a manual override on the **Projections** tab.

**Q: A product is "In Machines: 0 units" even though I know it's loaded.**
A: The system only knows what was loaded if you logged it via **Log Refill**. Until then, "in machines" stays 0 even if Nayax is reporting sales. Going forward, every refill you log builds the baseline.
