# 06 — Predictions

> SOP for forward-looking views — next week's machine forecasts,
> machine planograms, product health grades, seasonal patterns.

## How to open it

Click **Predictions** in the left sidebar.

The page has 4 tabs at the top — switch between them by clicking.

---

# Tasks

## Task 1 — Plan your route by predicted volume (next 7 days)

**When to do it:** Weekly, when planning the next week's refill schedule.

1. Click **Predictions** in the sidebar.
2. Click the **Machine Forecast** tab.
3. Look at the **Predicted weekly** column — sorted high to low.
4. Note the **Refill due** column for each — those are predicted refill dates.
5. Build your route by hitting highest-volume + earliest-refill-due machines first.

✅ **What you should see:** A clear priority list for the week's machine visits.

---

## Task 2 — Get a one-machine action plan before a visit

**When to do it:** Right before you head out to visit a specific machine.
**Why it matters:** The Machine Plan tab gives you Smart Actions (what to change) + the Full Template (what the machine should look like at end-state).

1. Click **Predictions** in the sidebar.
2. Click the **Machine Plan** tab.
3. Find your machine in the chip row at the top. Each chip shows "N actions · X/Y slots".
4. Click the chip for your target machine.
5. Look at the **Left panel — Smart Actions**:
   - **REMOVE** rows = take out of the machine.
   - **ADD** rows = bring with you to add.
   - **INCREASE** rows = add a second facing.
   - **DECREASE** rows = reduce facing count.
6. Look at the **Right panel — Full Template** for the target end-state. Each product shows KEEP / WATCH / ADD / REMOVE.
7. Screenshot both panels OR print them, then head out.

✅ **What you should see:** Concrete in-machine actions plus the target planogram.

---

## Task 3 — Quarterly product review (Product Health)

**When to do it:** Once per quarter to sort through your assortment.

1. Click **Predictions** in the sidebar.
2. Click the **Product Health** tab.
3. Scroll or sort for products with the **Remove** recommendation.
4. For each Remove product, decide:
   - **Keep** — click the **✕** button on the row to dismiss the suggestion. The product stays.
   - **Discontinue** — go to **Inventory → Products** and set the status to PhaseOut.
   - **Replace** — go to **Inventory → Replacements** and start a Replacement Plan with a different product.
5. Continue down the list until you've cleared the Remove section.

✅ **What you should see:** A shorter Product Health list as you take action on each.

💡 **Restoring dismissed items:** scroll back to the top. If you dismissed anything earlier, a "Restore N hidden" banner appears — click it to bring them back.

---

## Task 4 — Plan next month's stocking from seasonal patterns

**When to do it:** Last week of each month, to prep for the next.

1. Click **Predictions** in the sidebar.
2. Click the **Seasonal Trends** tab.
3. Find the upcoming month's column (e.g., if today is June 30, look at July).
4. Scan vertically down that column:
   - **Dark green cells** = peak month for that product (stock more).
   - **Dark blue cells** = cold month for that product (stock less).
5. Note the products you should adjust.
6. Go to **Inventory → Projections** and either:
   - Bump the **buy-list horizon** for the upcoming month, OR
   - Set a **manual override** on specific products to lift them temporarily.

✅ **What you should see:** A short list of products to stock heavier or lighter next month, based on real patterns from your sales history.

---

## Task 5 — Retrain the prediction model with new data

**When to do it:** Rarely — only when you have a new month's data archive to feed in.

1. Click **Predictions** in the sidebar.
2. Look for the **Retrain** button (top of page).
3. To upload new monthly archives:
   - Click **Choose files**.
   - Select one or more `.zip` files (monthly sales archives).
   - The selection bar shows what's queued.
4. Click **Retrain**.
5. Wait while the model retrains (can take a few minutes).

✅ **What you should see:** "Uploaded N new monthly zips and retrained the model." After this, all four tabs reflect the updated predictions.

❌ **If you upload anything other than .zip:** the page rejects it with a message ("Only monthly .zip archives can be uploaded").

---

# Reference (what each tab shows)

## Tab 1 — Machine Forecast

Per-machine next-7-day forecast.

| Column | What it shows |
|---|---|
| **Machine** | Machine name |
| **Current weekly** | Sales in the last 7 days |
| **Predicted weekly** | Expected sales in next 7 days |
| **Change %** | Direction (+ growing / − slowing) |
| **Confidence %** | Reliability (higher = more data) |
| **Top product** | Highest seller on that machine |
| **Weak product** | Lowest seller on that machine |
| **Refill due** | Predicted next refill date |

## Tab 2 — Machine Plan

Pick a machine → two side-by-side panels.

### Left: Smart Actions
Urgent stock changes for *this machine specifically*.

| Action | Meaning |
|---|---|
| **REMOVE** | Slow seller — free up the slot |
| **ADD** | New product recommended for this machine |
| **INCREASE** | Add a 2nd facing of a popular item |
| **DECREASE** | Reduce facing count of an over-stocked item |

Each card shows the reason + estimated impact ("Free up 1 slot worth $14/week").

### Right: Full Template
The target planogram — what the inventory SHOULD look like at full strength.

| Status | Meaning |
|---|---|
| **KEEP** | Already there, doing fine |
| **WATCH** | There but declining |
| **ADD** | Should be added (not currently in the machine) |
| **REMOVE** | Slow seller, drop it |

## Tab 3 — Product Health

Every product graded. Each row shows:
- Product name + lifetime revenue
- Daily revenue bar (visual)
- Trend chip (+ up / − down)
- Recommendation card (Keep / Watch / Add / Remove)
- **✕ button** to dismiss the row

Dismissed items persist across page refreshes (stored in your browser).

## Tab 4 — Seasonal Trends

Heatmap. Rows = products, columns = months (Jan–Dec).

| Color | Meaning |
|---|---|
| Dark green | Peak (>30% above this product's average) |
| Light green | Hot (+10–30% above) |
| Beige | Average |
| Light blue | Cool (−20 to −40% below) |
| Dark blue | Cold (−40%+ below) |
| Grey | No data |

Each cell shows the dollar value sold that month + the % swing.

The **Product column stays frozen** when you scroll left/right so you can always see which product you're looking at.

---

# Common questions

**Q: A Smart Action says REMOVE for a product that isn't even in the machine.**
A: Should be fixed — Smart Actions filter against the machine's actual planogram. If you still see this, refresh the page or contact support.

**Q: My new machines don't have Forecast/Plan data.**
A: The model needs at least a few weeks of sales per machine to make predictions. Newer machines won't show predictions until they have enough history.

**Q: How is the seasonal index calculated?**
A: Looks at the product's monthly sales across all years of data, compares each month vs. the product's overall average. 1.0 = at average, 1.3 = 30% above, 0.7 = 30% below.

**Q: Why are some machines missing from the Machine Plan chip row?**
A: Same as above — not enough sales data to build a useful planogram yet.

**Q: I dismissed a Product Health row by accident.**
A: Scroll to the top → click the **Restore N hidden** banner. All dismissed rows come back.
