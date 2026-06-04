# 05 — Pricing

**What it's for:** Set the price each product sells for at the machine. See suggested prices, current margins, and approve price changes.

## How to get there

Sidebar → **Pricing**.

## What you see

A list of products with:

| Column | Meaning |
|---|---|
| **Product name** + platform badge (HAHA/Nayax) | Which product, on which machine type |
| **Supplier source** | Where the cost came from (e.g., "via Sam's Club · $12.40 / 36pk") |
| **Your cost** | Cost per unit (input field — editable) |
| **Selling** | Current selling price (input field — editable, with revert) |
| **Suggested** | AI-suggested vending price (based on category margin rules) |
| **Margin** | Current margin % (color-coded — green good, orange marginal, red bad) |
| **Status** | "Healthy" / "Needs Review" — flags products with weak margin or stale cost |
| **Apply** | One-tap button to accept the suggested price |

## Common workflows

### Approve a suggested price change

The most common action.

1. Find a row with **Needs Review** (orange) status
2. Look at: current selling price vs suggested price (+/- change shown)
3. If happy with the suggestion → click **Apply**
4. Done — new price is recorded

### Fix a wrong cost

If a product shows weird margin (like -100%), the cost is probably wrong (case price stored as unit price).

1. Find the row
2. Click the **cost field** (the input box)
3. Enter the correct **per-unit** cost
4. Tap the save icon → margin recalculates instantly

### Edit a selling price manually

If you want a price different from the suggestion:

1. Click the **Selling** input
2. Type the new amount (e.g., `2.50`)
3. Border turns green when value changes from saved
4. Press **Enter** or click the green ✓ to save
5. Margin recalculates

### Revert a clerical error

Made a typo and saved? One-step undo is available:

1. After saving, a small **↺ $X.XX** button appears next to the price (showing the old value)
2. Click it → price reverts to the previous value
3. Note: only 1-step undo. If you make a second mistake, only the second is reversible.

The undo survives page refresh — closing and reopening the page keeps your undo option until you save a fresh value or use the revert.

### Reject a suggestion

If you don't want to apply a suggested price:

1. Click the small **✕** next to the Apply button
2. The suggestion is dismissed — current price stays

## Understanding the suggested price

The AI suggests based on:

1. **Your category margin rules** (e.g., Snacks = 45% margin, Drinks = 50%)
2. **Current cost** of the product
3. **Rounding rules** (rounded to nearest $0.25 by default)

You can change these defaults in **Pricing → Settings** (margin rules per category).

## Data quality banner

If you see an orange banner at the top mentioning **"X products with suspicious cost data"**, those rows have margins that look impossible (negative or extreme).

**What to do:** click through to those rows and fix the unit cost. Common cause: case price stored as unit cost.

## Common questions

**Q: Why does one product have a different suggested price than another in the same category?**
A: Costs differ. Same margin rule applied to different costs = different prices.

**Q: I changed the selling price but the machine still charges the old price.**
A: The price in this app is what *we track* — your actual machine pricing is set in the Nayax/HAHA portal. You still have to update the machine itself. Use this app to plan + record what the price should be.

**Q: The "First fill" amount shown — what does that mean?**
A: That's the cost when this product was first received (e.g., $12.40 for a 36-pack means $0.34/unit). It's there as a reference so you know what you paid recently.

**Q: Can I bulk-apply suggestions?**
A: Not currently. Each Apply is one tap, but for many products you do them one at a time. Useful safety against bulk mistakes.
