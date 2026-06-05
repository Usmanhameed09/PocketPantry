# 12 — Exception Queue

> SOP for cleaning up data-quality problems across the app. One inbox,
> one-click fixes per row.

## How to open it

Click **Exception Queue** in the left sidebar.

---

# Tasks

## Task 1 — Weekly "inbox zero" cleanup

**When to do it:** Once a week (e.g. Friday afternoon). Also after a big inventory event (new Sam's Club delivery, new machine install).
**Why it matters:** Bad data here = wrong margins on Reports, wrong restock recommendations, wrong alerts. Fixing one cost can correct hundreds of downstream numbers.

1. Click **Exception Queue** in the sidebar.
2. Look at the **High** severity tile (top-left). Start there.
3. Work down each row, fixing the highest severity first.
4. As you fix each row, it disappears from the list.
5. When the page shows "Inbox zero" (or close to it), you're done for the week.

✅ **What you should see:** The Total tile count drops as you fix each row.

---

## Task 2 — Fix a "Missing cost" exception

**When to do it:** Whenever the **Missing cost** section has rows. These directly distort your margin numbers.

1. Click **Exception Queue** in the sidebar.
2. Scroll to the **Missing cost** section.
3. For each row, look up the cost on your most recent invoice. Example:
   - You bought a 36-pack of Coke for $12.40.
   - Unit cost = $12.40 ÷ 36 = **$0.34** per unit.
4. Type **0.34** into the input field on the row.
5. Click the green **Save** button on that row.

✅ **What you should see:** The row disappears. Margins on Reports update within 60 seconds.

---

## Task 3 — Fix a "Suspicious cost" exception (most common data bug)

**When to do it:** Whenever the **Suspicious cost** section has rows. This catches the classic case-price-stored-as-unit-cost mistake.

1. Click **Exception Queue** in the sidebar.
2. Scroll to the **Suspicious cost** section.
3. Each row shows: stored cost vs. average selling price. Example:
   - Stored cost: $24.99
   - Avg selling price: $1.50
   - That stored cost is probably the WHOLE CASE price, not unit.
4. Find the case size for the product (check **Inventory → Products** tab if unsure).
5. Calculate the real unit cost: stored cost ÷ case size.
6. Type the corrected unit cost into the input on the row.
7. Click the green **Save** button on that row.

✅ **What you should see:** The row disappears. The product's margin on Reports flips from a wild negative to a sensible positive.

---

## Task 4 — Fix a "Missing price" exception

**When to do it:** Whenever the **Missing price** section has rows. Without a vend price, the pricing engine has nothing to suggest from.

1. Click **Exception Queue** in the sidebar.
2. Scroll to the **Missing price** section.
3. For each row, decide the vending price. Common starting point: 3× the unit cost.
4. Type the price into the input on the row.
5. Click the green **Save** button on that row.

✅ **What you should see:** The row disappears. The product becomes eligible for the Pricing page's suggestions.

---

## Task 5 — Fix a "Negative stock" exception

**When to do it:** Whenever the **Negative stock** section has rows. Usually means a refill wasn't logged, or Nayax reported more sales than we knew were loaded.

1. Click **Exception Queue** in the sidebar.
2. Scroll to the **Negative stock** section.
3. Each row shows the product + machine + the negative number.
4. Click the **Reset to 0 + log adjustment** button on the row.
5. The system:
   - Sets the machine's estimated_remaining to 0.
   - Records a `count_correction` movement in the ledger.

✅ **What you should see:** The row disappears.

📅 **Next time you're on-site:** Do a real count on that machine and use **Inventory → Log Refill** to set the true baseline.

---

## Task 6 — Fill in an "Incomplete product" exception

**When to do it:** Whenever you have spare time. These won't break anything but improve buy lists + barcode scanning.

1. Click **Exception Queue** in the sidebar.
2. Scroll to the **Incomplete product** section.
3. Click **Open product to fill in** on a row.
4. You jump to the product editor.
5. Fill in what you can:
   - **Vendor** — most important for Buy List grouping.
   - **Case size** — second most important for Buy List math.
   - **Barcode** — only matters if you use the Scan page.
6. Click **Save product**.
7. Go back to Exception Queue — the row is gone.

✅ **What you should see:** Buy List grouping improves; barcode scans match next time.

💡 **Note:** You don't have to fill everything in. Add what you know and leave the rest.

---

## Task 7 — Mark a "Stale machine" as offline

**When to do it:** When a machine hasn't reported sales in 7+ days and you've confirmed it's genuinely down (not a sync glitch).

1. **Before clicking anything in the queue**, verify in person or with the location contact that the machine isn't actually working.
2. Click **Exception Queue** in the sidebar.
3. Scroll to the **Stale machine** section.
4. Click the **Mark offline** button on the row.
5. The machine's status flips to Offline in the Machines page.

✅ **What you should see:** The row disappears. The Machines page Offline tab count goes up by 1.

❌ **If it's just a network glitch:** Don't mark offline. Leave it, and once it syncs again the stale flag clears automatically.

---

## Task 8 — Re-scan the queue after fixing several issues

**When to do it:** Right after you fix a batch of issues to see your progress reflected.

1. Click the **Re-scan** button (top-right of the Exception Queue page).
2. The page reloads with fresh exception detection.

✅ **What you should see:** Cleared rows are gone; any new exceptions appear.

---

# Reference (what each part of the page shows)

## Summary tiles

| Tile | What it shows |
|---|---|
| **Total** | All open exceptions across the system |
| **High** | Critical issues that block accurate reporting (missing/wrong cost, suspicious data) |
| **Medium** | Issues that distort numbers but don't block work (negative stock, stale machines, missing price) |
| **Low** | Minor metadata gaps (auto-created products with incomplete vendor / case size) |

## Issue types

| Section | What it means | Fix action |
|---|---|---|
| **Missing cost** | Active product has no unit_cost set, but it's in a machine or sold recently | Enter the per-unit cost → **Save** |
| **Missing price** | Active product has no default_vend_price, but it's in a machine | Enter the vending price → **Save** |
| **Suspicious cost** | Stored cost is > 1.2× the avg selling price (likely a case price stored as unit) | Enter the correct unit cost → **Save** |
| **Negative stock** | A machine's estimated_remaining is below zero | Click **Reset to 0 + log adjustment** |
| **Incomplete product** | Auto-created from sync, missing vendor / case size / barcode | Click **Open product to fill in** |
| **Stale machine** | Healthy machine hasn't reported sales in 3+ days | Click **Mark offline** |

## How issues are detected

| Type | Detection rule |
|---|---|
| missing_cost | `unit_cost = 0 or null` AND product is in a machine OR sold in last 30 days |
| missing_price | `default_vend_price = 0 or null` AND product is in a machine AND cost is already set |
| suspicious_cost | `unit_cost > 1.2 × avg revenue per unit` (last 30 days) |
| negative_stock | `machine_inventory.estimated_remaining < 0` |
| unmapped_product | In a machine AND no vendor AND no case_size > 1 AND no barcode |
| stale_machine | Status ≠ Offline AND no last_sync_at in last 3 days |

---

# Common questions

**Q: I fixed a cost but Reports still shows the old margin.**
A: Reports caches for ~60 seconds. Refresh the page or wait a minute.

**Q: Why is the "Negative stock" count zero even though I see a discrepancy?**
A: Only `estimated_remaining < 0` is flagged here. If the count is positive but wrong (e.g., shows 50 but you know it's 5), that's a count mismatch — not flagged. Use **Inventory → Warehouse → Adjust** to correct it manually.

**Q: A product is on the "Incomplete" list but I don't have a case price.**
A: Vendor and case size matter most for the Buy List. Barcode only matters if you use the Scan feature. Add what you can; leave the rest blank.

**Q: Can I mark an exception as "won't fix"?**
A: Not currently — every exception expects to be resolved. If you want to permanently dismiss one, fix the underlying data (e.g., set vendor to "Unknown" if you truly don't know it).

**Q: How often should I run through this?**
A: Weekly is sensible. Also after a big inventory event (new Sam's Club delivery, new machine install) for a spot-check.
