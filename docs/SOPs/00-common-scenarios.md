# 00 — Common Scenarios (Cross-Menu Workflows)

> SOP playbook for real-world tasks that touch multiple menus. Use this
> as a cheat-sheet for training new assistants.

Each scenario walks you through the menus in order, with concrete click-by-click instructions.

---

## Scenario 1 — Set up a brand-new machine just installed

**Goal:** Get a new vending machine fully tracked in the system from day one.

1. **Add the machine.**
   - Click **Machines** in the sidebar.
   - Click the green **+ Add Machine** button.
   - Fill in name, Nayax/HAHA device ID, location.
   - Click **Save**.
2. **Make sure the products you loaded into it exist in your catalog.**
   - Click **Inventory** in the sidebar.
   - Click the **Products** tab.
   - For each product in the machine, check it's in the list. If missing, click **+ Add product** to create it.
3. **Log the initial fill so the system knows what's in the machine.**
   - From the Inventory page, click the green **+ Log Refill** button.
   - Pick the new machine from the dropdown.
   - Enter what you loaded for each product.
   - Click **Log Refill** at the bottom of the pop-up.

✅ **What you should see:**
- The machine appears in **Machines** with status Healthy.
- The product table on **Inventory → Overview** shows the new machine in the "In Machines" counts.
- Sales start syncing from Nayax/HAHA on the next cron (within 24 hours).

📅 **Give it 24-48 hours** before checking **Predictions** for this machine — the forecasting model needs data to make predictions.

---

## Scenario 2 — A supplier delivery just arrived (Sam's Club, Costco)

**Goal:** Get everything from the delivery into warehouse stock fast.

1. **Open the Scan page on your phone.**
   - On your phone, log in to the dashboard.
   - Click **Inventory** in the sidebar.
   - Click the **Scan** tab.
2. **Start the camera.**
   - Click the green **Start camera** button.
   - Allow camera permission when prompted.
3. **For each box from the delivery:**
   - Hold the barcode 4–8 inches from the camera.
   - When it reads, one of three pop-ups appears:
     - **Known barcode** → click **Add 1 case** (or a custom quantity).
     - **Match found** → click **Use this product** to attach barcode + add 1 case.
     - **Unknown** → fill in product info → click **Register + Add 1 case**.
4. **Repeat until everything is scanned.**
5. **Verify the warehouse stock.**
   - Click the **Warehouse** tab.
   - Confirm the new quantities are there.

✅ **What you should see:** Warehouse stock for each scanned product goes up by its case size.

---

## Scenario 3 — Plan + execute a refill route

**Goal:** Hit your day's machines efficiently and log everything so stock stays in sync.

### Before leaving the office

1. **Check today's priority list.**
   - Click **Today** in the sidebar.
   - Scroll to **Today's Refill Stops** — list is already sorted by urgency.
2. **Get the per-machine plan for each stop.**
   - Click **Predictions** in the sidebar.
   - Click the **Machine Plan** tab.
   - For each machine on your route, click its chip → screenshot the Smart Actions + Full Template.
3. **Verify warehouse stock.**
   - Click **Inventory** in the sidebar.
   - Click the **Warehouse** tab.
   - Confirm you have enough of everything you'll need.

### At each machine

4. **Restock** per the Full Template plan from step 2.
5. **Log the refill.**
   - On your phone, open the dashboard.
   - Click **Inventory** in the sidebar.
   - Click the green **+ Log Refill** button.
   - Pick the machine.
   - Enter quantities per product.
   - Click **Log Refill**.

✅ **What you should see (immediately):**
- Warehouse stock auto-deducts.
- Machine on-hand updates.
- Any open low-stock alerts for those products on that machine clear.

### Back at the office

6. **Confirm alerts cleared.**
   - Click **Today** in the sidebar.
   - Check the **Open Alerts** tile count dropped.
7. **Check anything still open.**
   - Click **Inventory → Alerts** tab.
   - Resolve or acknowledge anything remaining.

---

## Scenario 4 — Produce a quarterly performance review

**Goal:** Polished sales summary for a client or your team.

1. **Open Reports.**
   - Click **Reports** in the sidebar.
2. **Set the date range.**
   - Click the date range dropdown.
   - Pick **Custom Range**.
   - Pick the 3-month start and end dates.
   - Click **Apply**.
3. **Capture the key views.**
   - Click the **Overview** tab → screenshot the trend chart.
   - Click the **Machines** tab → screenshot the per-machine breakdown.
   - Click the **SKUs** tab → screenshot the top products bar chart.
   - Click the **Payments** tab → note the card vs cash split.
4. **Export the data.**
   - Click **Export CSV** at the top.
5. **Optional: get an AI summary.**
   - Click the green AI chat bubble (bottom-right of any page).
   - Type: `Summarize the last 90 days in 2 sentences.`
   - Copy the answer into your email.

✅ **What you should produce:** 4 screenshots + 1 CSV + 1 AI summary = full quarterly packet.

---

## Scenario 5 — A high-value lead just replied "interested" — book the meeting fast

**Goal:** Get from inbox to a booked calendar event in under 2 minutes.

1. **Spot the reply on Today.**
   - Click **Today** in the sidebar.
   - Find the **New Location Reply** tile.
   - Click through it.
2. **Or find them in Email Pipeline.**
   - Click **Email Pipeline** in the sidebar.
   - Look for a card with the orange **HOT** chip.
3. **Open the lead's card.**
4. **Verify Apollo data is filled in** (contact name, title, mobile).
5. **Book the meeting inline.**
   - Click the teal **📅 Book Meeting** button on the card.
   - Pick date + time.
   - Add notes (location, agenda).
   - Click **Confirm booking**.

✅ **What you should see:**
- Card moves to **Meeting Booked** column.
- A 24h post-meeting follow-up task is auto-created.
- All other open tasks for this lead are cancelled.

---

## Scenario 6 — Caller's morning routine (work the call queue)

**Goal:** Daily call queue work, top to bottom.

1. **Open the call queue.**
   - Click **Lead Dashboard** in the sidebar.
   - Look at the **Today's call queue** panel (left side, biggest).
2. **For each row (sorted by priority):**
   - Read the **Reason** column ("Hot reply", "Retry after voicemail", etc.).
   - Click the **Open** button on the row → jumps to the lead in Email Pipeline.
3. **Make the call.**
4. **Log the disposition.**
   - On the lead card, click **Log Call**.
   - Pick the outcome (Voicemail / Interested / Wrong Number / etc.).
5. **The system auto-moves the card + schedules next action.**
6. **Click back to Lead Dashboard.**
7. **Pick up the next row.** Repeat.

✅ **What you should see:** Queue rows disappear as you log outcomes. Empty queue = done.

---

## Scenario 7 — Bulk lead import + cleanup

**Goal:** Add 200 leads from Google Maps, verify their emails, enrich them, then start working them.

1. **Import via Maps.**
   - Click **Email Pipeline** in the sidebar.
   - Click **Google Maps Import**.
   - Search by category + location.
   - Apollo runs automatically on import (contact + email + mobile + employees).
   - Click **Import N leads**.
2. **Verify emails on the freshly-imported batch.**
   - Click **Lead Dashboard** in the sidebar.
   - Filter the table by recently-added (sort by created_at).
   - Tick the master checkbox to select all visible.
   - From the yellow bulk-action bar, click **Verify emails**.
   - Wait for the result banner.
3. **Undeliverables auto-flag as Not Interested** (no action needed from you).
4. **Re-score everyone with fresh enrichment data.**
   - Still in Lead Dashboard, click the **Re-score all leads** button in the top header.
   - Wait for the banner.
5. **Start working the queue.**
   - Scroll up to the **Today's call queue** panel — your new high-tier leads will surface there for calling.

✅ **What you should see:** Clean call queue with newly enriched, high-tier leads at the top.

---

## Scenario 8 — Decide whether to replace an underperforming product

**Goal:** Data-backed decision on a slow-mover.

1. **Find the product.**
   - Click **Predictions** in the sidebar.
   - Click the **Product Health** tab.
   - Sort by recommendation = **Remove**.
2. **Verify the numbers cross-tool.**
   - Note trend, daily revenue, lifetime revenue from the row.
   - Click **Reports** in the sidebar.
   - Click the **SKUs** tab → search for the product → confirm the numbers.
3. **Check if a replacement is already underway.**
   - Click **Inventory** in the sidebar.
   - Click the **Replacements** tab → look for this product.
4. **Decide:**
   - **Keep** → go back to Predictions → click the **✕** on the Product Health row to dismiss.
   - **Discontinue** → click **Inventory → Products** → find the product → set status to **PhaseOut**.
   - **Replace** → click **Inventory → Underperformers** → find the row → click **Replace** → pick a new product → click **Start replacement**.

✅ **What you should see:** Either Product Health row dismissed, product status set to PhaseOut, OR a new Replacement Plan in the Replacements tab.

---

## Scenario 9 — Today's revenue tile looks wrong, diagnose it

**Goal:** Confirm if there's really a problem or just a sync delay.

1. **Note the current state.**
   - Click **Today** in the sidebar.
   - Note Today's Revenue + the last sync time under the tile.
2. **Force a sync.**
   - Click **Machines** in the sidebar.
   - Click the **Refresh** button at the top.
   - Wait 30–60 seconds.
3. **Re-check Today.**
   - Click **Today** in the sidebar.
   - Has revenue updated?
4. **Cross-check on Reports.**
   - Click **Reports** in the sidebar.
   - Set range = **Last 7 Days** → Apply.
   - Look at today's bar on the trend chart.
5. **Ask the AI.**
   - Click the chat bubble (bottom-right).
   - Type: `Is today's revenue consistent with sales activity?`

If still off:
- Click **Machines → Offline tab** — is a high-volume machine offline?
- The cron sync may have stalled — Refresh on Machines forces it.
- Worst case: contact support.

---

## Scenario 10 — Negotiate processor fees with your card processor

**Goal:** Show concrete card volume numbers to ask for a lower rate.

1. **Pull the 90-day report.**
   - Click **Reports** in the sidebar.
   - Date range = **Last 90 Days** → Apply.
2. **Get the payment split.**
   - Click the **Payments** tab.
   - Screenshot the credit card revenue total.
   - Note the Visa / Mastercard / Discover / Amex breakdown.
3. **Use those numbers in your call** with the processor.

✅ **What you should have:** A clear "we did $X in card volume over 90 days, here's the brand mix" pitch.

---

## Scenario 11 — A barcode just won't scan

**Goal:** Get the product registered anyway.

1. **Try the camera.**
   - Click **Inventory → Scan** tab.
   - Click **Start camera**.
2. **If it fails to read:**
   - Click the **flashlight button** (bottom-right of the camera).
   - **Tap the screen** on the barcode to refocus.
   - **Use the zoom slider** (bottom-left, when supported).
3. **If still nothing:**
   - Type the barcode digits manually in the input box below the camera.
   - Click **Look up**.
4. **If truly stuck:**
   - Click **Inventory → Products** tab.
   - Click **+ Add product**.
   - Manually create the product without a barcode (you can link a barcode later).

✅ **What you should see:** The product registered in your catalog, ready for inventory tracking.

---

## Scenario 12 — Apollo / AI not finding a lead's decision maker

**Goal:** Get DM contact info another way.

1. **Open the lead.**
   - Click **Email Pipeline** in the sidebar.
   - Click the lead card.
2. **Check if Apollo data is missing.**
   - Is **apollo_mobile** empty? Apollo didn't have it.
3. **Try one of these recovery paths:**

   **A) Add a website and re-enrich:**
   - In the lead's edit form, fill in the website.
   - Click **Lead Dashboard** in the sidebar.
   - Select the lead via checkbox.
   - From the yellow bar, click **Enrich missing**.

   **B) Manual research:**
   - Look up the lead on LinkedIn.
   - In the lead edit form, fill in the contact name + title manually.

   **C) Trigger Apollo re-search via "wrong number" disposition:**
   - When you call and reach the wrong person, log the call.
   - Pick **Wrong Number** as the outcome.
   - The system auto-calls Apollo to find an alternate DM.

   **D) Last resort:**
   - Call the front desk of the business directly.
   - Ask "who handles vending purchasing here?".
   - Update the lead manually with the name they give you.

✅ **What you should produce:** A populated contact (name, title, ideally email + mobile) ready to outreach.
