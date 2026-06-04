# 03 — Machines

**What it's for:** See every machine in your fleet, their status, and their sales activity. Drill into any machine to see its recent orders.

## How to get there

Sidebar → **Machines**.

## What you see

### Top status

Two badges show platform connectivity:
- **HAHA Machines · Connected** — Chinese platform (the dragonfruit/snack machines)
- **Nayax · Connected** — Nayax platform (most of your machines)

If either says "Disconnected", contact support — the data may be stale.

### Stat tiles

| Tile | Meaning |
|---|---|
| **Total Revenue** | Cumulative all-time across the fleet. Updates as new sales come in. Shows "synced N min ago" — fresh data on every page load. |
| **Paid Orders** | Total transaction count. |
| **Machines** | Total machine count, with healthy / offline breakdown. |
| **Avg / Machine** | Revenue divided by machine count. |

### Tab buttons

- **All** — every machine
- **Healthy** — machines syncing normally
- **Offline** — machines that haven't reported sales in 3+ days

### Machine list

Each row shows:
- **Status badge** — Healthy (green) or Offline (red)
- **Machine name + ID + last activity time**
- **Revenue** — that machine's lifetime revenue + this week's revenue
- **Orders** — paid orders + total items sold
- **Platform** — HAHA or Nayax
- **Top SKU** — the best-selling product on that machine
- **View button** — drill into machine's recent orders

## Common workflows

### "Is everything running?" (30 seconds)

1. Open Machines
2. Click the **Offline** tab — should be 0 or very few
3. If something is offline, check the "Last activity" time. > 3 days = needs in-person attention

### Looking up a specific machine's recent sales

1. Click **View** on the machine row
2. Modal opens showing the last 50 orders (live from Nayax/HAHA)
3. Shows order #, amount, status (Paid/Refunded), pay time, items sold

### Adding a new machine

1. Click **+ Add Machine** (top right)
2. Modal opens to enter the machine details
3. Save — it'll start syncing on the next refresh

### Searching for a machine

Type in the search box at the top — filters by name OR ID.

## How the revenue tile updates

The big **Total Revenue** number works in two layers:

1. **First display** — shows the last synced number from our database (instant)
2. **Background sync** — fires automatically ~1.5 seconds after the page loads, pulling fresh data from Nayax/HAHA
3. **Refresh button** — manually triggers a sync if you want to force-update

This is why you'll sometimes see "synced just now" (fresh) vs "synced 30 min ago" (waiting for next sync).

## Common questions

**Q: A machine shows "Offline" but I know it's working. Why?**
A: "Offline" means no sales reported to Nayax/HAHA in 3+ days. If you have a slow machine that genuinely hasn't sold anything in 3 days, this is correct. If you know it sold yesterday, the machine may have lost its data connection — check the cellular signal.

**Q: Revenue here doesn't match Today's Revenue tile. Why?**
A: Machines page Total Revenue is **all-time cumulative**. Today's Revenue is **today only**. They measure different windows.

**Q: HAHA machines aren't showing here?**
A: They should appear with HAHA in the Platform column. If missing, the HAHA sync may have failed — try clicking Refresh.

**Q: Why does the "Last activity" show different times for different machines?**
A: Each machine reports independently. A busy machine syncs every few minutes; a slow one might sync once a day. As long as it's < 3 days, the machine is healthy.

**Q: Can I delete a machine?**
A: Not from this page. Decommissioned machines should stay listed for historical reports. Contact support to fully remove.

## Per-machine deep dive

Click **View** on any machine → modal with:
- Order count + revenue summary for the modal window
- Order-by-order list with timestamps, amounts, items
- Useful for spot-checking suspected refund disputes or verifying a specific transaction
