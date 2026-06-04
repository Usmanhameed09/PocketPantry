# 12 — Exception Queue

**What it's for:** One inbox for data-quality issues across the whole app. Instead of discovering each problem on a different page, every fixable issue lives here with a one-click action.

## How to get there

Sidebar → **Exception Queue**.

## What you see

### Summary tiles

| Tile | Meaning |
|---|---|
| **Total** | All open exceptions across the system |
| **High** | Critical issues that block accurate reporting (missing/wrong cost, suspicious data) |
| **Medium** | Issues that distort numbers but don't block work (negative stock, stale machines, missing price) |
| **Low** | Minor metadata gaps (auto-created products with incomplete vendor / case size) |

### Issue list, grouped by type

Each section shows one type of issue with all the affected rows below it.

| Section | What it means | Fix action |
|---|---|---|
| **Missing cost** | Active product has no unit_cost set, but it's in a machine or sold recently | Enter the per-unit cost → **Save** |
| **Missing price** | Active product has no default_vend_price, but it's in a machine | Enter the vending price → **Save** |
| **Suspicious cost** | Stored cost is > 1.2× the average selling price (likely a case price stored as unit) | Enter the **correct** unit cost → **Save** |
| **Negative stock** | A machine's estimated_remaining is below zero | Click **Reset to 0 + log adjustment** → resets and logs a count_correction movement |
| **Incomplete product** | Auto-created from sync, missing vendor / case size / barcode | Click **Open product to fill in** → jumps to the product editor |
| **Stale machine** | Healthy machine hasn't reported sales in 7+ days | Click **Mark offline** → status moves to Offline |

## Common workflows

### "Inbox zero" cleanup (weekly)

1. Open **Exception Queue**
2. Start at the top — **High** severity first
3. Work down: enter the requested value or click the action button
4. Each row disappears as you fix it
5. When the page shows **Inbox zero**, you're done

### Fixing missing costs (most common)

1. Find the **Missing cost** section
2. For each product:
   - Look up the unit cost on your last invoice (Sam's Club, etc.)
   - If you bought a 36-pack for $12.40 → unit cost = $0.34
   - Type that into the input → **Save**
3. The row clears; margins on the Reports page get accurate immediately

### Fixing suspicious cost

This catches the classic mistake: case price ($24.99) stored as unit cost on a $1.50 vending price → margin shows -1500%.

1. Find the **Suspicious cost** section
2. Each row shows: stored cost vs average selling price
3. The selling price is the truth; calculate the right unit cost
4. Type it in → **Save**

### Negative stock

Usually means a refill wasn't logged, or the machine sold more than we recorded.

1. Find the **Negative stock** section
2. Each row shows the product + machine + the negative number
3. Click **Reset to 0 + log adjustment** → the system:
   - Sets estimated_remaining to 0
   - Inserts a `count_correction` stock movement
   - The audit trail shows what was changed
4. Re-count the physical machine when you're next on-site to set a true value

### Incomplete products

These won't break anything but are worth cleaning up over time.

1. Find the **Incomplete product** section
2. Click **Open product to fill in** → jumps to the product page
3. Add: vendor, case size, barcode (if you can scan it)
4. Save → product no longer flagged

### Stale machine

If a machine hasn't reported in a week but isn't yet marked offline:

1. Verify in person that it's really not working (might be a network issue, not a power issue)
2. If genuinely offline → click **Mark offline** in the queue
3. If working → leave it; the sync may pick it back up

## Re-scanning

The queue is computed live every time you open the page. After fixing several issues, click **Re-scan** (top right) to refresh the list.

## How issues are detected

| Type | Logic |
|---|---|
| missing_cost | `unit_cost = 0 or null` AND product is in a machine OR sold in last 30 days |
| missing_price | `default_vend_price = 0 or null` AND product is in a machine AND cost is already set |
| suspicious_cost | `unit_cost > 1.2 × avg revenue per unit` (last 30 days) |
| negative_stock | `machine_inventory.estimated_remaining < 0` |
| unmapped_product | In a machine AND no vendor AND no case_size > 1 AND no barcode |
| stale_machine | Status ≠ Offline AND no updated_at in last 7 days |

## Common questions

**Q: I fixed a cost but the Reports page still shows the old margin.**
A: Reports caches for ~60 seconds. Refresh the page or wait a minute.

**Q: Why is the "Negative stock" count zero even though I see a discrepancy?**
A: Only `estimated_remaining < 0` is flagged. If the count is positive but wrong (e.g., shows 50 but you know it's 5), that's a count mismatch — not flagged here. Use **Inventory → Warehouse → Adjust** to correct it manually.

**Q: A product is on the "Incomplete" list but I don't have a case price.**
A: Vendor and case size matter most for the Buy List. Barcode only matters if you use the Scan feature. Add what you can; leave the rest.

**Q: Can I mark an exception as "won't fix"?**
A: Not currently — every exception expects to be resolved. If you want to permanently dismiss one, fix the underlying data (e.g., set vendor to "Unknown" if you truly don't know it).

**Q: How often should I run through this?**
A: Weekly is sensible. After a big inventory event (new Sam's Club delivery, new machine install) is also a good time to spot-check.
