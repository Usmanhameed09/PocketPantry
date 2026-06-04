# 04 — Inventory

**What it's for:** The center of stock management. Track every product, every refill, every purchase order. Daily-use menu for warehouse and route work.

## How to get there

Sidebar → **Inventory**. The main page opens with the Overview tab. Sub-pages live in the row of tab buttons at the top.

## The tab row (overview of every section)

| Tab | What it does |
|---|---|
| **Overview** | Summary dashboard |
| **Ask AI** | Same as the AI Assistant, scoped to inventory questions |
| **Warehouse** | Adjust warehouse stock manually |
| **Scan** | Barcode scanner — quickly add received stock |
| **Products** | Full product catalog (add/edit) |
| **Projections** | Per-product 30-day demand forecast |
| **Buy List** | Weekly purchase recommendation |
| **Purchase Orders** | Track POs from draft → received |
| **Alerts** | Low-stock + machine-offline alerts |
| **Proposals** | AI-suggested new products to add |
| **Underperformers** | Slow-moving products to consider dropping |
| **Replacements** | Active replacement plans (phase out X, replace with Y) |

## Common workflows

### Log a refill (after visiting a machine)

The most common daily action. Two ways:

**Quick way (button on Inventory main page):**
1. Open **Inventory** (main page)
2. Click the green **+ Log Refill** button
3. Pick the machine you just visited
4. Enter how many of each product you loaded
5. Save

The save will:
- Subtract that quantity from **warehouse stock**
- Add it to the **machine's on-hand count**
- Clear any low-stock alert for that product on that machine

### Scan stock into the warehouse

When a Sam's Club / supplier delivery arrives:

1. **Inventory → Scan** tab
2. Click **Start camera** (allow camera permission)
3. Point at each box's barcode
4. **First-time barcode** — fill in product name, case size, unit cost → Save
5. **Known barcode** — confirms how many to add → tap Confirm

Tips:
- Use the **flashlight button** (bottom-right) in low light
- **Tap the screen** to refocus on a specific barcode
- **Zoom slider** (bottom-left when supported) for small/curved barcodes
- If a barcode won't read, type it manually in the input below the camera

### Add a new product manually

1. **Inventory → Products** tab
2. Click **+ Add Product**
3. Fill in: name, category, vendor, case size, unit cost, default vending price
4. Save

The new product appears in the catalog immediately. Refills, sales, and alerts will start working for it as soon as it sells.

### Generate this week's buy list

1. **Inventory → Buy List**
2. Click **Generate this week's buy list** at the top
3. The system pulls projected demand for the next 7 days + your safety stock and produces a list, grouped by vendor
4. Edit quantities inline if needed
5. Click **Convert to POs** — creates draft purchase orders, one per vendor

### Receive a purchase order

1. **Inventory → Purchase Orders**
2. Find the PO that arrived
3. Click into it
4. Mark each line as received (partial receive is supported)
5. Save — the received quantity flows into warehouse stock

### Adjust warehouse manually

For damage, spoilage, or correcting a counting error:

1. **Inventory → Warehouse**
2. Find the product
3. Click **Adjust**
4. Pick a reason (Spoilage / Damage / Count Correction)
5. Enter the quantity (negative for removed, positive for added)
6. Save

### Review proposals (new product ideas)

1. **Inventory → Proposals**
2. Each card shows a suggested new product with AI-generated reasoning
3. **Approve** → product becomes active in the catalog
4. **Reject** → dismissed

### Handle underperformers

1. **Inventory → Underperformers**
2. List of products selling poorly (low volume OR low margin)
3. Each row shows the reason ("only 0.2 units/week" or "12% margin")
4. Options per row:
   - **Discontinue** — sets product to inactive
   - **Replace** — start a Replacement Plan with a different product
   - **Keep** — dismiss the flag

## How warehouse and machines stay in sync

Important to understand the flow:

```
Supplier → Warehouse stock → Machine refill → Customer
   (PO)       (deliveries)     (you load it)     (sale)
```

Every "movement" is tracked. So:

- When a PO is **received** → warehouse goes UP
- When a machine is **refilled** → warehouse goes DOWN, machine goes UP
- When a product **sells** → machine goes DOWN

You never have to manually subtract or transfer. The "Log Refill" action does it all in one step.

## Common questions

**Q: What's the difference between warehouse stock and machine stock?**
A: Warehouse = your physical stockpile (what's on shelves at your office/garage). Machine stock = what's inside each vending machine.

**Q: I scanned a product but no quantity was added. Why?**
A: After scanning, you have to enter the quantity and tap Confirm. The scanner just identifies the product — it doesn't auto-add anything.

**Q: The alert says low stock but I just refilled. Why is it still there?**
A: Alerts auto-clear when the refill is logged. If it didn't clear, the refill quantity wasn't enough to push the days-remaining above the threshold. Either add more or click the manual "dismiss" button on the alert.

**Q: My Buy List looks too small.**
A: Buy List is based on **projected demand for the next horizon (default 7 days)** PLUS safety stock (default 5 days). If you want more conservative buying, change the horizon/safety stock in **Inventory → Settings** (not yet exposed in UI — ask support).
