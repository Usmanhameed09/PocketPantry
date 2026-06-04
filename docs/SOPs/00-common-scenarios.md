# 00 — Common Scenarios (cross-menu workflows)

Real-world tasks that touch multiple menus. Use this as a cheat-sheet for training new assistants.

---

## Scenario: New machine just got installed

**Goal:** Get a new vending machine fully set up in the system.

1. **Machines** → click **+ Add Machine**
2. Enter machine details (name, Nayax/HAHA device ID, location)
3. **Inventory → Products** → make sure every product loaded in the machine exists in the catalog (add new ones if needed)
4. **Inventory → Log Refill** → pick the new machine, enter what you loaded
5. Done. The machine starts syncing sales automatically. Give it 24-48 hours before checking Predictions for this machine (model needs data).

---

## Scenario: Sam's Club delivery just arrived

**Goal:** Add everything from a delivery to warehouse stock.

1. **Inventory → Scan**
2. Start the camera
3. For each box: scan the barcode
4. First-time barcode → fill in product info → Save
5. Known barcode → enter quantity (e.g., 12 for a case of 12) → Confirm
6. Continue until everything is scanned
7. Verify: **Inventory → Warehouse** → confirm the new quantities

---

## Scenario: Going on a refill route

**Goal:** Prepare for and complete a refill run.

**Before leaving:**

1. **Today** → check **Today's Refill Stops** for the priority list
2. **Predictions → Machine Plan** → for each machine on your route, screenshot the Smart Actions + Full Template
3. **Inventory → Warehouse** → verify you have enough of everything you'll need

**At each machine:**

4. Restock per the Full Template plan
5. **Inventory → Log Refill** on your phone → pick the machine → enter qtys
6. Stock auto-deducts from warehouse, machine on-hand updates, alerts clear

**Back at the office:**

7. **Today** → confirm alert count dropped
8. **Inventory → Alerts** → anything still open?

---

## Scenario: Client asks for a quarterly performance review

**Goal:** Produce a polished sales summary.

1. **Reports** → date range = **Custom Range** → pick the 3-month window → **Apply**
2. **Overview tab** → screenshot the trend chart
3. **Machines tab** → screenshot the per-machine breakdown
4. **SKUs tab** → screenshot the top products bar chart
5. **Payments tab** → note the card vs cash split
6. **Export CSV** → attach to email
7. Optional: ask **AI Assistant** for a 2-sentence summary ("summarize the last 90 days in 2 sentences")

---

## Scenario: A high-value lead just replied "interested"

**Goal:** Get from inbox to booked meeting fast.

1. **Today** → see the "New Location Reply" tile → click through
2. (Or: **Email Pipeline** → find the lead — they'll have a HOT badge)
3. Click the lead card
4. Verify Apollo data is filled in (contact name, title, mobile)
5. Click **📅 Book Meeting** → pick date + time → Confirm
6. Lead auto-moves to Meeting Booked column
7. 24h post-meeting follow-up task is created automatically

---

## Scenario: Working through the call queue

**Goal:** Caller's morning routine.

1. **Lead Dashboard** → check the **Call queue** panel (left side)
2. Sorted by priority — work top-down
3. Click **Open** on a row → jumps to that lead in Email Pipeline
4. Make the call
5. In the lead card → click the call disposition button (Voicemail / Interested / Wrong Number / etc.)
6. The system auto-schedules the next task and moves the card if needed
7. Repeat for the next row

---

## Scenario: Bulk lead import + cleanup

**Goal:** Add 200 leads from Google Maps, then verify their emails and enrich.

1. **Email Pipeline** → **Google Maps Import** → search + select candidates → Import
2. Apollo runs automatically on import (contact + email + mobile + employees)
3. **Lead Dashboard** → filter by recently added → **Select All** visible
4. Click **Verify emails** → wait for the result banner
5. Undeliverables auto-flag as Not Interested
6. For the remaining → re-tier with **Re-score all leads** in top header
7. Now your Call queue is clean — work it

---

## Scenario: Product is underperforming, decide whether to replace

**Goal:** Make a data-backed decision about a slow-mover.

1. **Predictions → Product Health** → find the product (sort by status = Remove)
2. Note: trend, daily revenue, lifetime revenue
3. **Reports → SKUs** → search for the product → verify the numbers
4. Cross-check with **Inventory → Replacements** → is anyone already replacing this?
5. Decision:
   - **Keep** → click ✕ on the Product Health card to dismiss
   - **Discontinue** → **Inventory → Products** → set status to PhaseOut
   - **Replace** → **Inventory → Replacements** → start a Replacement Plan with a different product

---

## Scenario: Today's revenue tile looks wrong

**Goal:** Diagnose if there's actually a problem.

1. **Today** → note Today's Revenue + last sync time
2. **Machines** → click **Refresh** to force a sync from Nayax/HAHA
3. Wait 30-60 seconds → check if Today updates
4. **Reports** → set range to **Last 7 Days** → look at today's bar on the chart
5. **AI Assistant** → ask "is today's revenue consistent with sales activity?"

If still off:
- Check if a major machine is offline (Machines page → Offline tab)
- The cron sync may have stalled — Refresh button on Machines forces it
- Worst case: contact support

---

## Scenario: Negotiating processor fees

**Goal:** Show the processor your card volume to ask for a lower rate.

1. **Reports** → range = **Last 90 Days** → **Apply**
2. **Payments tab** → screenshot the credit-card revenue total
3. Note the Visa/Mastercard split
4. Use those numbers in your call to the processor

---

## Scenario: A barcode won't scan

**Goal:** Get the product registered anyway.

1. **Inventory → Scan** → try the camera scan
2. **Use the flashlight button** (bottom-right) — low light is the most common cause
3. **Tap the screen** on the barcode to refocus
4. **Use the zoom slider** (bottom-left, when supported)
5. **Still no luck** → type the barcode digits manually in the input below the camera → click Look up
6. **Truly stuck** → manually add the product in **Inventory → Products** without a barcode (you can always link a barcode later)

---

## Scenario: Apollo / AI not finding a lead's decision maker

**Goal:** Get DM contact info another way.

1. **Email Pipeline** → open the lead card
2. If apollo_mobile is empty: Apollo didn't have the data
3. **Options:**
   - Add a website (if missing) and trigger re-enrich: select the lead in **Lead Dashboard** → **Enrich missing**
   - Manually research on LinkedIn → enter the contact name + title in the lead's edit form
   - **Wrong number** disposition on a call → auto-triggers Apollo re-search for alternate DM
4. Worst case: call the front desk and ask for the right person, then update the lead manually
