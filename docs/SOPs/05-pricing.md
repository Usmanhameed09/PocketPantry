# 05 — Pricing

> SOP for setting the price each product sells for at the machine —
> approving AI suggestions, fixing wrong costs, reverting typos.

## How to open it

Click **Pricing** in the left sidebar.

---

# Tasks

## Task 1 — Approve a suggested price change

**When to do it:** When the row shows **Needs Review** (orange) status.
**Why it matters:** The system has calculated a better price based on cost + category margin rules. Applying it improves your margin.

1. Click **Pricing** in the sidebar.
2. Scroll the list to find a row with the **Needs Review** badge (orange).
3. Read the row: current selling price vs. suggested price (the change is shown as +/- next to the suggestion).
4. If the suggestion looks reasonable, click the **Apply** button on the row.
5. The new price is saved.

✅ **What you should see:** The row's status flips from **Needs Review** to **Healthy**. The Selling column updates to the new price.

❌ **If you don't agree with the suggestion:** click the **✕** next to the Apply button to dismiss it.

⚠️ **Reminder:** Applying here updates only what *we* track. You still need to update the actual price on the machine in the Nayax/HAHA portal so customers are charged the new amount.

---

## Task 2 — Fix a wrong cost (the data-quality fix)

**When to do it:** Whenever you see a weird margin (e.g. -100%, +1500%). Almost always the case price got stored as the unit cost.

1. Click **Pricing** in the sidebar.
2. Find the row with the bad margin.
3. Click directly in the **Your cost** input field on the row.
4. Type the correct **per-unit** cost.
   - Example: if a case of 36 cost you $12.40, the unit cost is **0.34**.
5. Press **Enter** OR click the green save icon.

✅ **What you should see:** The margin column recalculates instantly. The status badge flips from Needs Review to Healthy if the margin is now in the right range.

💡 **Tip:** If many rows have bad costs, also use **Exception Queue** — it has a one-screen view of all suspicious costs to fix in a batch.

---

## Task 3 — Edit a selling price manually (override the suggestion)

**When to do it:** When you want a price different from what the system suggests (e.g. price-match a competitor).

1. Click **Pricing** in the sidebar.
2. Find the product row.
3. Click directly in the **Selling** input field.
4. Type the new amount (e.g. `2.50`).
5. The input border turns green to confirm the value changed.
6. Press **Enter** OR click the green ✓ icon to save.

✅ **What you should see:** The margin column recalculates. The row shows your new selling price.

---

## Task 4 — Revert a typo or clerical error

**When to do it:** Right after you saved a wrong value and noticed immediately.

1. Look at the row you just saved.
2. A small **↺ $X.XX** button appears next to the price, showing the OLD value.
3. Click it.
4. The price reverts to the previous value.

✅ **What you should see:** The price reverts; the margin recalculates back.

💡 **Important:** Only 1-step undo. If you make a second mistake before undoing, only the second is reversible. The undo button survives a page refresh until you save a new value.

---

## Task 5 — Reject a suggestion (without applying)

**When to do it:** When you don't want the suggested price applied and want to keep the current one.

1. Click **Pricing** in the sidebar.
2. Find the row with the suggestion.
3. Click the small **✕** button next to the Apply button.

✅ **What you should see:** The suggestion is dismissed. The row's current price stays unchanged.

---

## Task 6 — Handle the "suspicious cost data" banner

**When to do it:** Whenever the orange banner appears at the top of the page mentioning "X products with suspicious cost data".

1. Click anywhere on the banner — it expands to show the problem rows.
2. For each row in the list:
   - Open **Inventory → Products** OR fix directly from the Pricing list using Task 2 steps.
3. Once all the bad costs are corrected, the banner goes away.

✅ **What you should see:** The banner disappears once no costs are flagged as suspicious.

💡 **Alternative path:** Open **Exception Queue → Suspicious cost** section — it groups all the bad-cost rows in one inbox with a Save input on each. Often faster than going row by row in Pricing.

---

# Reference (what each part of the page shows)

## The product table columns

| Column | What it shows |
|---|---|
| **Product name** + platform badge (HAHA/Nayax) | Which product, on which machine type |
| **Supplier source** | Where the cost came from (e.g. "via Sam's Club · $12.40 / 36pk") |
| **Your cost** | Cost per unit — editable input field |
| **Selling** | Current selling price — editable input field |
| **Suggested** | AI-suggested vending price (based on category margin rules) |
| **Margin** | Current margin % (green = good, orange = marginal, red = bad) |
| **Status** | Healthy / Needs Review — flags products with weak margin or stale cost |
| **Apply** | One-tap button to accept the suggested price |

## How the suggested price is calculated

The system suggests a price based on:

1. **Your category margin rules** (e.g. Snacks = 45% margin, Drinks = 50%).
2. **Current unit cost** of the product.
3. **Rounding rules** (rounded to the nearest $0.25 by default).

You can change defaults in **Pricing → Settings** (margin rules per category).

## What "First fill" means

If the row shows a "First fill" amount, that's the cost at first receipt (e.g. $12.40 for a 36-pack means $0.34/unit). It's a reference so you know what you paid recently.

---

# Common questions

**Q: Why does one product have a different suggested price than another in the same category?**
A: Costs differ. Same margin rule applied to different costs = different prices.

**Q: I changed the selling price here but the machine still charges the old price.**
A: The price in this app is what *we track*. Your actual machine charging is set in the Nayax/HAHA portal. You still have to update the machine itself. Use this app to plan + record what the price should be.

**Q: Can I bulk-apply suggestions?**
A: Not currently. Each Apply is one tap, but for many products you do them one at a time. This is a deliberate safety against bulk mistakes.

**Q: A margin shows red even though I'm pricing it fine.**
A: Either your category margin rule has the threshold too high, OR the unit cost is wrong. Check both: cost first, then **Pricing → Settings** if cost is right.
