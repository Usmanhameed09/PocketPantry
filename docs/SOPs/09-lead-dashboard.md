# 09 — Lead Dashboard

> SOP for the analytical view of the lead pipeline — tier scoring,
> conversion stats, call queue, bulk actions.

> **Heads up:** there are three views of the same lead list:
> - **Pipeline** — kanban for cold calling
> - **Email Pipeline** — kanban for email outreach
> - **Lead Dashboard** (this page) — table view + analytics + bulk actions

## How to open it

Click **Lead Dashboard** in the left sidebar.

---

# Tasks

## Task 1 — Work the daily call queue (caller's morning)

**When to do it:** First thing in the morning if you're the one making calls.
**Why it matters:** The queue is pre-sorted by priority — the system tells you who to call first.

1. Click **Lead Dashboard** in the sidebar.
2. Look at the **Today's call queue** panel (left side, biggest panel).
3. Work the rows top to bottom — top = highest priority.
4. For each row:
   - Read the **Reason** column ("Hot reply", "Retry after voicemail", etc.) — it tells you why this lead is queued.
   - Click the **Open** button on the row.
   - You jump to that lead in Email Pipeline.
5. Place the call. After the call, log the outcome (see Email Pipeline SOP for logging steps).
6. Come back to Lead Dashboard for the next row.

✅ **What you should see:** Rows disappear from the queue as you log outcomes. Empty queue = done for the day.

---

## Task 2 — Bulk-enrich a batch of new leads

**When to do it:** After importing a new batch (CSV upload, Google Maps scrape, etc.) or quarterly to refresh older leads.

1. Click **Lead Dashboard** in the sidebar.
2. Scroll down to the **Leads table** (bottom of the page).
3. Use the **Tier filter** at the top of the table — pick **Tier C** (under-enriched ones).
4. Tick the master checkbox in the table header to select all visible.
5. A yellow bar appears at the top with bulk-action buttons.
6. Click the **Enrich missing** button.
7. Confirm when prompted.
8. Wait while Apollo (or Hunter as fallback) runs for each selected lead.

✅ **What you should see:** A result banner: "Enriched X / N". Some leads may auto-promote from C to B or A after enrichment.

❌ **If "Enriched 0 / N":** Apollo couldn't find any of the websites. Double-check that the leads have `website` filled in.

---

## Task 3 — Bulk-verify a batch of email addresses

**When to do it:** After importing a batch where you're not sure all the emails are real.

1. Click **Lead Dashboard** in the sidebar.
2. Scroll to the **Leads table**.
3. Filter or sort to find the leads you want to verify (e.g. by date added).
4. Tick the checkbox on each lead (or use master checkbox to grab the visible batch).
5. From the yellow bulk-action bar, click **Verify emails**.
6. Wait while Hunter runs (about 1 second per email — be patient on 50+).

✅ **What you should see:** A result banner: "deliverable: X, risky: Y, undeliverable: Z". Undeliverable leads are auto-marked Not Interested with reason "undeliverable email".

---

## Task 4 — Bulk-assign an owner to a batch

**When to do it:** When dividing up a new batch among multiple callers.

1. Click **Lead Dashboard** in the sidebar.
2. Scroll to the **Leads table**.
3. Select the rows you want to assign (checkbox).
4. From the yellow bar, click **Assign owner**.
5. Type the owner's name in the input.
6. Click **Confirm**.

✅ **What you should see:** All selected rows now show the owner in the Owner column.

---

## Task 5 — Bulk-mark leads as Not Interested

**When to do it:** Cleaning up a list of disqualifies (wrong industry, out of business, etc.).

1. Click **Lead Dashboard** in the sidebar.
2. Scroll to the **Leads table**.
3. Select the rows (checkbox).
4. From the yellow bar, click **Mark not interested**.
5. A dropdown appears — pick a reason:
   - price / space / already vendor / corporate policy / not DM / bad timing / undeliverable / other.
6. Click **Confirm**.

✅ **What you should see:** All selected rows move to the **Not Interested** stage with the reason attached.

❌ **If nothing happens:** You forgot to pick a reason. The dropdown is required.

---

## Task 6 — Tune the tier scoring weights

**When to do it:** Only when too many leads are getting A tier (or too few) — usually a one-time setup.

1. Click **Lead Dashboard** in the sidebar.
2. Click the **Scoring config** button (top-right header).
3. A pop-up opens with the scoring weights.
4. Adjust:
   - **Vertical weights** — which industries score highest (Auto Dealership = 30, Construction = 28, etc.)
   - **Employee count tiers** — ≥25 / ≥50 / ≥100 / ≥250 point breakpoints.
   - **Data completeness bonuses** — points for having mobile, email, DM title, address.
   - **Tier thresholds** — default A ≥ 70, B ≥ 40.
5. Tick **Re-score every lead** if you want to apply changes to existing leads (recommended).
6. Click **Save**.

✅ **What you should see:** A banner: "Re-scored N leads." The Tier A/B/C tile counts at the top of the page update.

---

## Task 7 — Re-score all leads (after editing weights or doing big enrichment)

**When to do it:** After a tuning session or after a big enrichment batch.

1. Click **Lead Dashboard** in the sidebar.
2. Click the **Re-score all leads** button (top-right header).
3. Wait — this can take a minute on large pipelines.

✅ **What you should see:** A banner: "Re-scored N leads." Tier counts update.

---

# Reference (what each part of the page shows)

## KPI tiles (top)

| Tile | What it shows |
|---|---|
| **Tier A** | Count of Tier A leads + how many "won" + conversion % |
| **Tier B** | Same for B tier |
| **Tier C** | Same for C tier (lowest fit) |
| **Today** | Call queue ready + tasks due today + leads with no next action |
| **SLA flags** | Open ops_tasks of type pipeline_sla (leads needing attention) |

## Funnel section

Horizontal chips, one per pipeline stage, showing the count of leads in each stage. Quick visual of where leads are stuck.

## The three side-by-side panels

### Today's call queue (left, biggest)

Up to 12 tasks due today (sorted by priority). Each row: business name + tier + phone + reason + priority + Open button.

### Owners (middle)

Leaderboard of leads-per-owner with conversion %. Shows who's working the most + winning at what rate.

### Calendar (right)

- **Next 5 meetings** — upcoming Meeting Booked leads with date/time.
- **Open slots** — suggested available time slots over the next ~7 business days.

## Leads table (bottom — main view)

Full filterable + sortable table of all leads.

### Columns
Checkbox · Business (+ vertical) · Tier (+ score) · Stage · Owner · Next action · Last touch · Phone

### Filters
- **Tier filter** — All / Tier A / Tier B / Tier C
- **Owner filter** — All / Unassigned / [each owner]

### Row colors
- **Yellow row** — you ticked the checkbox.
- **Orange row** — `isCallReady = true` (hot lead flagged by SLA scan).

## Top header buttons

- **← Email pipeline** — jump to Email Pipeline kanban.
- **Scoring config** — change tier weights + thresholds.
- **Re-score all leads** — bulk-runs scoring on every lead with current weights.

## How tier scoring works

A lead is graded on:

1. **Vertical fit** (highest weight) — Auto Dealership = 30 pts, Construction Supply = 28, Manufacturing = 28, Warehousing = 26, Office Park = 24, others lower.
2. **Employee count** — ≥250 = 35 pts, ≥100 = 30, ≥50 = 20, ≥25 = 10.
3. **Data completeness** — Has mobile = 15 pts, has email = 10, has DM title = 8, has address = 5.

Total score → tier:
- **A** if ≥ 70 points
- **B** if ≥ 40 points
- **C** otherwise

Example: 100-employee construction supply with a known DM = 28 + 30 + 15 + 10 + 8 = 91 → Tier A.

---

# Common questions

**Q: A lead I just added shows as Tier C.**
A: Tier requires data. If you only entered business + phone, the score is low. Add vertical, employee count, mobile, and email → score climbs.

**Q: I clicked Mark Not Interested but it didn't move.**
A: You need to pick a reason from the dropdown FIRST, then click Confirm. The reason is required.

**Q: Verify emails is taking forever.**
A: Each email = 1 Hunter API call (~1 second). 50 selected ≈ 50 seconds. Wait for the banner.

**Q: Can I see the call queue from earlier today (completed tasks)?**
A: The queue panel shows OPEN tasks only. For completed tasks, open the lead's detail in Email Pipeline.

**Q: Why are some rows orange?**
A: `isCallReady = true` — the daily SLA scan flagged that lead as ready for an immediate call (e.g. they replied to email, or the next-action time arrived).
