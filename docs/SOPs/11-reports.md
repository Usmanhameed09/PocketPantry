# 11 — Reports

> SOP for analytical drill-downs — custom date ranges, per-machine
> breakdowns, top SKUs, payment splits. The source of truth when you
> need exact numbers.

## How to open it

Click **Reports** in the left sidebar.

---

# Tasks

## Task 1 — "How was last month?" review (5 minutes)

**When to do it:** Once a month, on the first of the month for the prior month.

1. Click **Reports** in the sidebar.
2. Click the **Date range** dropdown at the top.
3. Pick **Last Month**.
4. Look at the four stat tiles (Total Revenue, Total Orders, Total Units, Active Machines). Note the per-day average — that's your daily run-rate.
5. Click the **Overview** tab.
   - Read the revenue trend chart. Are any days unusually high or low?
   - Check Top Performing SKUs — any surprises?
6. Click the **Machines** tab.
   - Identify which machine led and which lagged.
   - Note the % of fleet total for each.
7. Click the **SKUs** tab.
   - Top revenue drivers (longest bars on the chart).
8. (Optional) Click **Export CSV** to share the data with your team.

✅ **What you should see:** A clear month-in-review you can summarize in 3 sentences.

---

## Task 2 — Drill into one specific machine

**When to do it:** When you suspect a machine is underperforming or want to evaluate a recent route change.

1. Click **Reports** in the sidebar.
2. Click the **Machine filter** dropdown at the top.
3. Pick the specific machine.
4. The four stat tiles + all four tabs now show only that machine.
5. Cycle through:
   - **Overview** — daily trend for the machine.
   - **SKUs** — what's selling on that machine specifically.
   - **Payments** — credit vs cash split for that machine.

✅ **What you should see:** Numbers scoped to just that machine, no fleet contamination.

❌ **To return to fleet-wide:** Click the machine filter and pick **All Machines**.

---

## Task 3 — Find the cause of a revenue spike

**When to do it:** When the Overview chart shows an unusually high day.

1. Click **Reports** in the sidebar.
2. Set the date range to include the spike day.
3. Click the **Overview** tab.
4. Hover the chart over the spike day — see the exact revenue.
5. Click the **Machine filter** at the top.
6. Cycle through each machine — which one's revenue jumped that day?
7. Once you identify the machine, click the **SKUs** tab — which product drove the spike?

✅ **What you should see:** A clear answer for "what happened on day X".

---

## Task 4 — Pull a payment method split (for processor negotiations)

**When to do it:** Annual review with your card processor, or when comparing cash vs card economics.

1. Click **Reports** in the sidebar.
2. Set **Date range** to **Last 90 Days** (or Custom for a year).
3. Click the **Payments** tab.
4. Review the splits:
   - Credit Card / Cash / Monyx Balance / Prepaid breakdown.
   - Visa / Mastercard / Discover / Amex breakdown.
   - Per-machine: which machines lean cash vs card.

✅ **What you should see:** Concrete % numbers you can show your processor.

---

## Task 5 — Export the current view to CSV

**When to do it:** When you want to share data with someone outside the app or do further analysis in Excel.

1. Click **Reports** in the sidebar.
2. Set up the date range + machine filter + tab you want.
3. Click the **Export CSV** button at the top.
4. The browser downloads a CSV with the data currently displayed.

✅ **What you should see:** A CSV file in your downloads folder, ready to open in Excel.

---

## Task 6 — Pull the full 365 days of historical Nayax data (one-time setup)

**When to do it:** Right after signing up, OR after switching platforms. Don't repeat unnecessarily — it's fine to re-run but takes 2–5 minutes.

1. Click **Reports** in the sidebar.
2. Click the teal **Backfill Nayax 365d** button (top-right).
3. Confirm the warning dialog (it'll take 2–5 minutes).
4. Watch the progress: "Chunk 1/4: days 1–90 ago…", "Chunk 2/4…" etc.
5. Wait for the "Done" banner showing total rows written + earliest date covered.

✅ **What you should see:** 90-day reports now show real 90 days of data (was capped at ~30 before). Custom ranges going back a year work properly.

💡 **Note:** The button is idempotent — safe to re-run any time. It pulls from BOTH Nayax and HAHA.

---

# Reference (what each part of the page shows)

## Top controls

| Control | What it does |
|---|---|
| **Date range dropdown** | Last 7 Days / Last 30 Days / Last 90 Days / Last Month / Custom |
| **Custom range** | Date pickers + **Apply** button (only fetches when you click Apply) |
| **Machine filter** | All Machines / pick one specific machine |
| **Export CSV** | Downloads the current data as CSV |
| **Backfill Nayax 365d** | One-time button to pull 12 months of history from Nayax + HAHA |

## Stat tiles (top row)

For the selected date range + machine filter:

- **Total Revenue** — dollar amount + per-day average
- **Total Orders** — paid transactions
- **Total Units** — items sold
- **Active Machines** — machines with any sales in the window

## Four content tabs

### Overview tab
- **Revenue Trend chart** — daily revenue line for the selected window.
- **Top Performing SKUs** — top products by units in the window.
- **Revenue by Day** table — day-by-day breakdown.

### Machines tab
Per-machine breakdown: name + platform + revenue + orders + units + % of fleet + top SKU. Use for comparing machine performance.

### SKUs tab
- **SKU Revenue Breakdown** — horizontal bar chart of top 20 products by revenue.
- **Top Performing SKUs** table — same data with revenue, units, and margin columns.

### Payments tab
Payment method split: Credit Card / Cash / Monyx / Prepaid + Visa/Mastercard/Discover/Amex + per-machine breakdown.

## The orange "suspicious cost data" banner

If you see this banner, some products have negative or extreme margins because their unit_cost is wrong (often case price stored as unit). Click through to fix in **Inventory → Products** OR **Exception Queue → Suspicious cost**. Margins update on the next reload.

---

# Common questions

**Q: Reports 30d and 90d show the same numbers.**
A: Your `daily_sales` table doesn't have data older than ~30 days yet. The 90-day window includes the same data because nothing older exists. **Fix:** click **Backfill Nayax 365d** to pull historical data.

**Q: My custom range with dates from 2 years ago shows nothing.**
A: Same as above — historical data is limited until you backfill.

**Q: Numbers differ between Reports and the Machines page total.**
A: Reports for "All time" via Custom range should match Machines total. Reports for "Last 7 days" obviously won't. Match the window to compare.

**Q: How is "transaction count" defined?**
A: Each unique row in daily_sales (one product, one machine, one day) counts as one. So a day with 5 different items sold = 5 transactions, even if the customer bought 2 of one item.

**Q: Why is the payment split missing for one machine?**
A: HAHA machines don't report payment method (yet). Nayax machines do. The split only includes Nayax data.

**Q: Can I schedule a weekly email of these reports?**
A: Not yet — the Schedule Report button is greyed out as "Coming soon". For now: export CSV manually and email it, or open the dashboard at the same time each week.
