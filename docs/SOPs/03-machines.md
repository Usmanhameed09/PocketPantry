# 03 — Machines

> SOP for monitoring the fleet, drilling into specific machines, and
> reacting to offline equipment.

## How to open it

Click **Machines** in the left sidebar.

---

# Tasks

## Task 1 — Daily "is everything running?" check (30 seconds)

**When to do it:** Every morning, right after the Today routine.
**Why it matters:** Offline machines = lost revenue. The sooner you spot them, the sooner you can fix them.

1. Click **Machines** in the sidebar.
2. Click the **Offline** tab at the top.
3. Look at the count:
   - **0 machines** → everything's healthy, move on.
   - **1 or more** → for each offline machine, check the "Last activity" timestamp on the row.
4. If "Last activity" > 3 days, schedule an in-person visit.
5. If "Last activity" < 3 days, the data may still be syncing — try again in 1 hour.

✅ **What you should see:** Either an empty Offline tab, or a clear list of which machines need attention.

---

## Task 2 — Look up a specific machine's recent sales

**When to do it:** When you need to spot-check a transaction, verify a refund dispute, or see what's been moving on one machine.

1. Click **Machines** in the sidebar.
2. Type the machine name in the search box at the top.
3. Click the **View** button on the machine's row.
4. A pop-up opens showing the last 50 orders for that machine.
5. Scan the columns: order #, amount, status (Paid/Refunded), pay time, items sold.

✅ **What you should see:** A live, scrollable list of recent transactions from Nayax/HAHA.

💡 **Use this for:** Spot-checking suspected refund disputes, verifying a specific transaction, or seeing today's sales on one machine.

---

## Task 3 — Add a new machine to the fleet

**When to do it:** Whenever you install a machine at a new location.

1. Click **Machines** in the sidebar.
2. Click the green **+ Add Machine** button (top-right).
3. A pop-up appears.
4. Fill in the machine details:
   - **Name** — short, recognizable name (e.g. "Baker Nissan Sales").
   - **Location / Address** — physical address.
   - **Platform** — Nayax or HAHA.
   - **Device ID / Serial** — get this from the machine sticker or the Nayax/HAHA portal.
5. Click **Save**.

✅ **What you should see:** The new machine appears in the **All** tab. It starts syncing on the next refresh cycle (~24 hours).

❌ **If sales don't appear after 24 hours:** Re-check the Device ID — a typo there is the #1 reason sync fails.

---

## Task 4 — Force a fleet-wide sync (refresh)

**When to do it:** When you suspect data is stale and don't want to wait for the next automatic sync.

1. Click **Machines** in the sidebar.
2. Click the **Refresh** button at the top.
3. Wait 5–15 seconds while the system pulls fresh data from Nayax and HAHA.
4. The page reloads with updated revenue and timestamps.

✅ **What you should see:** "Synced just now" appears under the Total Revenue tile. Every machine row's "Last activity" updates.

---

## Task 5 — Search for a machine by name or ID

1. Click **Machines** in the sidebar.
2. Type any part of the name or ID in the search box at the top.
3. The list filters in real time.

✅ **What you should see:** Only matching machines remain visible.

---

# Reference (what each part of the page shows)

## Platform status badges (top of page)

| Badge | Meaning |
|---|---|
| **HAHA Machines · Connected** | Chinese platform (dragonfruit/snack machines) — data syncing |
| **Nayax · Connected** | Nayax platform (most machines) — data syncing |
| **Disconnected** | Sync failed — data may be stale. Contact support. |

## The stat tiles (top of page)

| Tile | What it shows |
|---|---|
| **Total Revenue** | Cumulative all-time across the fleet. Updates as new sales arrive. "Synced N min ago" shows freshness. |
| **Paid Orders** | Total transaction count across the fleet. |
| **Machines** | Total machine count, with healthy / offline breakdown. |
| **Avg / Machine** | Total revenue divided by machine count. |

## The tab buttons

| Tab | What it shows |
|---|---|
| **All** | Every machine in the fleet |
| **Healthy** | Machines syncing normally |
| **Offline** | Machines that haven't reported sales in 3+ days |

## The machine list columns

| Column | What it shows |
|---|---|
| Status badge | Healthy (green) or Offline (red) |
| Machine name + ID | Name + Nayax/HAHA device ID + "Last activity" timestamp |
| **Revenue** | Lifetime revenue + this week's revenue |
| **Orders** | Total paid orders + total items sold |
| **Platform** | HAHA or Nayax |
| **Top SKU** | Best-selling product on that machine |
| **View** | Open the order drill-down |

## How the revenue tile updates

The big **Total Revenue** number works in two layers:

1. **First display** — shows the last synced number from the database (instant).
2. **Background sync** — fires ~1.5 seconds after the page loads, pulling fresh data from Nayax/HAHA.
3. **Refresh button** — manually triggers a sync if you want to force-update.

This is why you'll sometimes see "synced just now" (fresh) vs "synced 30 min ago" (waiting for the next sync).

---

# Common questions

**Q: A machine shows "Offline" but I know it's working.**
A: Offline = no sales reported to Nayax/HAHA in 3+ days. If you have a slow machine that genuinely hasn't sold anything in 3 days, this is correct. If you know it sold yesterday, the machine may have lost its data connection — check the cellular signal.

**Q: Revenue here doesn't match the Today page.**
A: Machines page Total Revenue is **all-time cumulative**. Today's Revenue is **today only**. They measure different windows.

**Q: HAHA machines aren't showing.**
A: They should appear with HAHA in the Platform column. If missing, the HAHA sync may have failed — try clicking **Refresh**.

**Q: Why does "Last activity" show different times for different machines?**
A: Each machine reports independently. A busy machine syncs every few minutes; a slow one might sync once a day. As long as it's < 3 days, the machine is healthy.

**Q: Can I delete a machine?**
A: Not from this page. Decommissioned machines should stay listed so historical reports stay accurate. Contact support to fully remove.
