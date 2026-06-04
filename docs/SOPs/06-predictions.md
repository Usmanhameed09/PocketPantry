# 06 — Predictions

**What it's for:** Forward-looking views. What's selling in 30 days? What's the right product mix for each machine? Which products to drop?

## How to get there

Sidebar → **Predictions**.

## The four sub-tabs

| Tab | What it shows |
|---|---|
| **Machine Forecast** | Per-machine sales prediction for next 7 days |
| **Machine Plan** | Smart Actions + Full Template per machine |
| **Product Health** | Every product graded by velocity + trend |
| **Seasonal Trends** | Monthly seasonal index per product (heatmap) |

## Machine Forecast

Shows each machine's expected revenue next week vs current week.

| Column | Meaning |
|---|---|
| **Machine** | Machine name |
| **Current weekly** | Sales last 7 days |
| **Predicted weekly** | Next 7 days expected |
| **Change %** | Direction (+ growing / − slowing) |
| **Confidence %** | How reliable the prediction is (higher = more data) |
| **Top product** | Highest seller on that machine |
| **Weak product** | Lowest seller on that machine |
| **Refill due** | Predicted next refill date |

**Use this for:** Route planning. Hit the machines with the highest predicted volume first.

## Machine Plan

Pick a machine → see TWO panels side by side:

### Left: Smart Actions

Urgent stock changes for *this machine specifically*. Examples:

- **REMOVE** — slow seller, free up the slot
- **ADD** — new product recommended for this machine
- **INCREASE** — add a 2nd facing (popular item)
- **DECREASE** — reduce facing count (over-stocked)

Each card shows the reason + estimated impact ("Free up 1 slot worth $14/week").

### Right: Full Template

The **target planogram** for this machine — what the inventory SHOULD look like at full strength. Each category lists products with status:

- **KEEP** — already there, doing fine
- **WATCH** — there but declining
- **ADD** — should be added (not currently in the machine)
- **REMOVE** — slow seller, drop it

Numbers on the right show the trend (+ percent / - percent) and the velocity (units/day).

### Machine chip selector (top)

Switch between machines via the chips. Each chip shows the action count and slot fill (e.g., "5 actions · 23/23 slots").

**Use this for:** Going to a machine with a clear plan of what to add, remove, or change in one visit.

## Product Health

Every product graded. Each row shows:

- Product name + total lifetime revenue
- Daily revenue bar (visual)
- Trend chip (+ up / − down)
- Recommendation card (Keep / Watch / Add / Remove with a one-line reason)
- **✕ button** to dismiss a row (operator already took the action)

### Dismissing items

Click ✕ on any row → that product is hidden from the list. Dismissed items persist across page refreshes (stored in your browser).

**Restore all hidden:** scroll to the top → click "Restore N hidden" in the banner.

**Use this for:** Quarterly product review. Sort through Remove suggestions → discontinue obvious losers.

## Seasonal Trends

Heatmap-style table. Each row is a product; columns are months Jan-Dec.

| Color | Meaning |
|---|---|
| Dark green | Peak (>30% above average for this product) |
| Light green | Hot (+10-30% above) |
| Beige | Average |
| Light blue | Cool (-20-40% below) |
| Dark blue | Cold (-40%+ below) |
| Grey | No data |

Each cell shows the dollar value sold that month + the percentage swing.

The **Product column stays frozen** when you scroll left/right — so you can always see which product you're looking at.

**Use this for:** Planning what to stock heavier in upcoming months. Drinks peak in summer, hot snacks peak in winter — verify what the data says vs your gut.

## Common workflows

### Quarterly product review

1. Open **Product Health** tab
2. Sort or scan for **Remove** recommendations
3. For each: decide Keep / Replace / Discontinue
4. ✕ to dismiss handled items

### Route prep for one machine

1. Open **Machine Plan**
2. Click the machine you're visiting in the chip row
3. Left panel = the actions to take in person (REMOVE X, ADD Y)
4. Right panel = the target end-state
5. Print or screenshot before heading out

### Stocking decisions for next month

1. Open **Seasonal Trends**
2. Find the upcoming month's column
3. Products in dark green = stock more
4. Products in dark blue = stock less

## Common questions

**Q: A Smart Action says REMOVE for a product that isn't even in the machine. Why?**
A: That's been fixed — the dashboard now filters Smart Actions against the machine's actual planogram. If you still see this, refresh the page or contact support.

**Q: My machines don't have Forecast/Plan data yet.**
A: The model needs at least a few weeks of sales data per machine to make predictions. Newer machines won't show up until they have enough history.

**Q: How is the seasonal index calculated?**
A: Looks at this product's monthly sales across all years of data. Compares each month vs the product's overall average. 1.0 = at average, 1.3 = 30% above, 0.7 = 30% below.
