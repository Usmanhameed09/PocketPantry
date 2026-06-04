# 11 — Reports

**What it's for:** The deepest analytical view. Custom date ranges, machine drill-downs, top SKUs, payment methods. The source of truth when you need exact numbers.

## How to get there

Sidebar → **Reports**.

## Top controls

| Control | What it does |
|---|---|
| **Date range dropdown** | Last 7 Days / Last 30 Days / Last 90 Days / Last Month / Custom |
| **Custom range** | Date pickers + **Apply** button (only fetches when you click Apply, not while typing) |
| **Machine filter** | All Machines / pick one specific machine |
| **Export CSV** | Downloads the current data as CSV |
| **Backfill Nayax 365d** | One-time button to pull 12 months of history from Nayax + HAHA (see below) |

## Stat tiles (top row)

For the selected date range + machine filter:

- **Total Revenue** — dollar amount + per-day average
- **Total Orders** — paid transactions
- **Total Units** — items sold
- **Active Machines** — machines that had any sales in the window

## Data quality banner

If you see an orange banner: **"X products with suspicious cost data"** — those products have negative or extreme margins because the unit_cost field is wrong (often case price stored as unit price). The banner lists a few examples.

**What to do:** Go to **Inventory → Products** OR **Pricing** and fix the unit cost for those products. Their margin numbers in Reports will then be accurate.

## Four content tabs

### Overview tab

- **Revenue Trend chart** — daily revenue line chart for the selected window
- **Top Performing SKUs** — top products by units sold for the window
- **Revenue by Day** table — day-by-day breakdown

### Machines tab

Per-machine breakdown for the selected window:
- Machine name + platform (HAHA/Nayax)
- Revenue + orders + units
- % of fleet total
- Top SKU on that machine

**Use this for:** Comparing machine performance, identifying underperformers, planning route changes.

### SKUs tab

**SKU Revenue Breakdown** — horizontal bar chart of top 20 products by revenue in the window.

**Top Performing SKUs** table — same data in table form with revenue + units + margin.

**Use this for:** Product mix decisions. The longest bars = your real revenue drivers.

### Payments tab

Payment method split for the window:
- Credit Card / Cash / Monyx Balance / Prepaid breakdown
- Visa / Mastercard / Discover / Amex breakdown
- Per-machine split (which machines lean cash vs card)

**Use this for:** Negotiating processor fees, deciding which machines need cash boxes.

## Common workflows

### "How was last month?"

1. Date range → **Last Month**
2. Overview tab → check the trend chart for any unusual days
3. Machines tab → which machine led / lagged
4. SKUs tab → top sellers + any surprises
5. Optionally **Export CSV** for the team

### Compare two specific date ranges

Currently no built-in compare. To do this:

1. Set range A → screenshot the stats
2. Change to range B → compare manually

(If you need this regularly, ask support — it's on the roadmap.)

### One-machine deep dive

1. **Machine filter** → pick the machine
2. All tabs now scoped to that machine only
3. Check Revenue Trend, top SKUs, payment split for just that machine

### Find why a day spiked

1. Overview → notice an unusually high day on the chart
2. Hover the chart → see the exact revenue for that day
3. Machine filter → cycle through each machine on that date
4. SKUs → see which products drove the spike

## Backfill Nayax 365d button

When you first sign up (or when changing platforms), historical data is limited to whatever the regular sync window covers (~30 days). To get the full year of history:

1. Click **Backfill Nayax 365d** (top right, teal button)
2. Confirm the dialog (warns it takes 2-5 minutes)
3. Watch the progress chunks: "Chunk 1/4: days 1-90 ago…", "Chunk 2/4…"
4. Done banner shows total rows written + earliest date covered

After backfill:
- 90-day reports show real 90 days of data (was capped at 30 before)
- Custom ranges going back a year work meaningfully
- Reports numbers will jump up across the board (that's the missing months filling in)

The button is idempotent — safe to re-run any time. It pulls from BOTH Nayax and HAHA.

## Common questions

**Q: Reports 30d and 90d show the same numbers. Why?**
A: Your `daily_sales` table doesn't have data older than ~30-38 days yet. The 90-day window includes the same data because nothing older exists. **Fix:** click **Backfill Nayax 365d** to pull historical data.

**Q: My custom range with dates from 2 years ago shows nothing.**
A: Same issue — historical data limited until you backfill.

**Q: Numbers differ between Reports and the Machines page total.**
A: They should agree now. If they don't:
- Reports for "All time" via Custom range should match Machines total
- Reports for "Last 7 days" obviously won't match Machines total
Make sure you're comparing the same window.

**Q: How is "transaction count" defined?**
A: Each unique row in daily_sales (one product, one machine, one day) counts as one transaction. So a day with 5 different items sold = 5 transactions, even if the customer bought 2 of one item.

**Q: Why is payment split missing for one machine?**
A: HAHA machines don't report payment method (yet). Nayax machines do. The split only includes Nayax data.

**Q: Can I schedule a weekly email of these reports?**
A: Not yet — Schedule Report button is greyed out as "Coming soon". For now: export CSV manually and email it, or open the dashboard at the same time each week.
