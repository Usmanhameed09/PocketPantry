# 01 — Today

> SOP for the morning dashboard — what to check first thing each day and
> how to react to what you see.

## How to open it

Click **Today** in the left sidebar (or just log in — it opens by default).

---

# Tasks

## Task 1 — Morning routine (2 minutes, every weekday)

**When to do it:** First thing in the morning, before doing anything else.
**Why it matters:** Catches problems early — offline machines, urgent alerts, missed sales — while you still have time to act on them.

1. Click **Today** in the sidebar (or just log in).
2. Look at the **Today's Revenue · LIVE** tile (top-left).
   - Read the "vs yesterday" number. If it's negative and big (-30% or worse), something is probably wrong.
3. Look at the **Machines Active** tile (second tile).
   - The format is `7 / 8` (healthy / total). If any machines are offline, note which ones.
4. Look at the **Open Alerts** tile (third tile).
   - The number under "High severity" is what matters today. Anything > 0 should be addressed before you leave.
5. Scroll down to **Today's Refill Stops**.
   - This is your refill route in priority order. The top machine has the most low items.

✅ **What you should see:** A clear picture of overnight sales, machine health, urgent alerts, and the refill plan in under 2 minutes.

❌ **If revenue says $0.00 at 10am:** Probably a sync delay. Go to **Machines** and click **Refresh** to force a sync. Re-check Today.

---

## Task 2 — Investigate a "numbers look off" situation

**When to do it:** When Today's revenue seems unusually low or hasn't moved in a while.

1. Wait 30–60 seconds. The page auto-syncs in the background after every load.
2. If still off, click **Machines** in the sidebar.
3. Click the **Refresh** button (top-right of the Machines page).
4. Wait for it to finish (~5 seconds).
5. Click **Today** in the sidebar again to come back.
6. Compare **Today's Revenue** to the per-machine revenue on the Machines page. They should match.

✅ **What you should see:** Revenue updates to the latest figure.

❌ **If a specific machine is contributing $0 today and you know it should be selling:** Open **Machines** → **Offline** tab. If the machine appears there, the cellular link is down — check in person.

---

## Task 3 — Act on urgent alerts

**When to do it:** Whenever the **Open Alerts** tile shows high severity > 0.

1. From the Today page, click anywhere on the **Open Alerts** tile.
2. You land on the **Alerts** page (under Inventory).
3. Sort or filter by severity if not already.
4. For each High-severity alert:
   - **Low stock alerts** → open **Inventory → Buy List** to generate an order for the affected products.
   - **Machine offline alerts** → schedule an in-person visit to the machine.
   - **Spike alerts** → check the product's velocity; you may need to load more next time.
5. Click the **Acknowledge** (✓) button on each alert as you act on it, or **Dismiss** (X) if it's not real.

✅ **What you should see:** The alert count on the Today page drops as you work through them.

---

## Task 4 — Plan today's refill route

**When to do it:** Before leaving for the day's machine visits.

1. From the Today page, scroll to **Today's Refill Stops**.
2. The list is already sorted by urgency — top machine first.
3. Note the count of low items per machine — heavier first stops save trips.
4. Note any red dots (urgent attention needed).
5. Cross-check the **Warehouse Restock** card to make sure you have stock for each top product.
6. If warehouse is short, click through to **Inventory → Buy List** before leaving.

✅ **What you should see:** A clear route plan with stock on hand to back it up.

---

# Reference (what each part of the page shows)

## The top tiles (left to right)

| Tile | What it shows |
|---|---|
| **Today's Revenue · LIVE** | Total revenue across all machines so far today. Updates as new sales come in. "vs yesterday" shows the day-over-day change. |
| **Machines Active** | Healthy vs total. Format: `7 / 8` means 7 healthy, 1 offline. |
| **Open Alerts** | Active alerts (low stock, machine offline, price changes needed). Sub-count `14 high severity` = 14 critical ones. |
| **Warehouse Value** | Total dollar value of stock sitting in your warehouse + count of items low. |

## Today's Refill Stops section

Machines that need refilling, sorted by urgency. Each row: machine name + low-item count. Red dot = needs attention soon.

## Warehouse Restock section

Total restock cost + how many products are below threshold. Click through to **Inventory → Buy List** to act on it.

## Price Change Review section

Top 3 products with pending price changes. Shows current cost vs suggested vending price. Click through to **Pricing** to approve or reject each suggestion.

## New Location Reply section (if shown)

Latest reply from a lead (via email). Shows their intent (interested, not interested, etc.). Click through to **Email Pipeline** or **Lead Dashboard** to act on it.

---

# Common questions

**Q: Today's Revenue and the Machines page Total Revenue are different.**
A: Today's Revenue shows only today. Machines page Total Revenue is **all-time cumulative**. They measure different windows on purpose.

**Q: A machine is offline but I know it's working.**
A: "Offline" means no data from Nayax/HAHA in the last 3 days. The machine may have lost its cellular connection — check it in person. If sales resume, status flips back to Healthy automatically.

**Q: Can I rearrange the Today page or hide tiles?**
A: Not currently. The layout is fixed but the data updates live.

**Q: The page hasn't refreshed and I want fresh numbers right now.**
A: Click anywhere on the **Machines** sidebar link and back to **Today** — that triggers a fresh fetch. Or click **Refresh** on the Machines page first, then come back.
