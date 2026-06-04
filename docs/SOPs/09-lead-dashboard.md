# 09 — Lead Dashboard

**What it's for:** The analytical view of the lead pipeline. Tier scoring, conversion stats, call queue, calendar, and a full filterable lead table with bulk actions.

> **Heads up:** there are three views of the same lead list:
> - **Pipeline** — kanban for calling
> - **Email Pipeline** — kanban for email
> - **Lead Dashboard** (this page) — table view + analytics + bulk actions

## How to get there

Sidebar → **Lead Dashboard**.

## Top section — KPI tiles

| Tile | Meaning |
|---|---|
| **Tier A** | Count of Tier A leads + how many "won" + conversion % |
| **Tier B** | Same for B tier |
| **Tier C** | Same for C tier (lowest fit) |
| **Today** | Call queue ready + tasks due today + leads with no next action |
| **SLA flags** | Open ops_tasks of type pipeline_sla (leads needing attention) |

## Funnel section

Horizontal chips, one per pipeline stage, showing the count of leads in each stage. Quick visual of where leads are stuck.

## Three side-by-side panels

### Today's call queue (left, biggest)

Up to 12 tasks due today (sorted by priority). Each row shows:
- Business name + tier badge
- Phone number (Apollo mobile when available)
- Reason ("Hot reply", "Retry after voicemail", etc.)
- Priority number (P50, P95, etc.)
- **Open** button → jumps to the lead in Email Pipeline

**Use this for:** The caller's daily call list.

### Owners (middle)

Leaderboard of leads-per-owner with conversion %. Shows who's working the most + winning at what rate.

### Calendar (right)

- **Next 5 meetings** — upcoming Meeting Booked leads with date/time
- **Open slots** — suggested available time slots over the next ~7 business days (10am, 2pm, 4pm windows)

**Use this for:** Scheduling new meetings or seeing today's calendar.

## Leads table (bottom — main view)

Full filterable + sortable table of all leads. Columns:

- Checkbox (for bulk-select)
- Business (with vertical underneath)
- Tier (badge with score)
- Stage
- Owner
- Next action (with scheduled time)
- Last touch
- Phone

### Top of table

- **Tier filter** — All / Tier A / Tier B / Tier C
- **Owner filter** — All / Unassigned / [each named owner]

### Highlighted rows

- **Yellow row** — selected (you ticked the checkbox)
- **Orange row** — `isCallReady = true` (hot lead flagged by SLA scan)

## Bulk actions

When you select ≥1 lead, a yellow bar appears with options:

| Button | What it does |
|---|---|
| **Assign owner** | Type a name → bulk-assigns to that owner |
| **Verify emails** | Runs Hunter email verification on selected leads' emails. Flags undeliverable as Not Interested with reason "undeliverable email" |
| **Enrich missing** | Calls Apollo (or Hunter fallback) for selected leads with a website. Persists mobile, employee count, vertical, title. Auto-re-scores after. |
| **Mark not interested** | Opens a reason-code dropdown (price / space / already vendor / corporate policy / not DM / bad timing / undeliverable / other). All selected leads move to Not Interested with that reason. |
| **Clear** | Deselect everything |

## Top header buttons

- **← Email pipeline** — jump to Email Pipeline kanban
- **Scoring config** — change tier weights + thresholds (advanced — usually one-time setup)
- **Re-score all leads** — bulk-runs scoring on every lead with current weights. Useful after editing the config.

## Common workflows

### Daily call queue (caller's morning)

1. Open Lead Dashboard
2. Look at the **Call queue** panel
3. Work through the rows top to bottom (top = highest priority)
4. Click **Open** on each → jumps to Email Pipeline where you can log the call

### Quarterly enrichment sweep

Every quarter or after a big Maps import:

1. Filter by tier "C" (the under-enriched ones)
2. Tick **Select all visible**
3. Click **Enrich missing** → Apollo runs for each
4. Watch the result banner — should show "Enriched X / N"
5. Some Cs may become Bs or As after enrichment

### Bulk-clean undeliverable emails

After a batch import:

1. Select 50-100 recently-added leads
2. Click **Verify emails**
3. Result banner shows deliverable / risky / undeliverable counts
4. Undeliverables auto-marked Not Interested with reason

### Tuning scoring weights

If too many leads are getting A tier (too easy) or too few:

1. Click **Scoring config** in top header
2. Adjust:
   - Vertical weights (which industries are best fit)
   - Employee count tiers (≥25 / ≥50 / ≥100 / ≥250 points)
   - Data completeness bonuses (has mobile / has email / etc.)
   - Tier thresholds (default: A ≥ 70, B ≥ 40)
3. Tick **Re-score every lead** if you want to apply to existing leads
4. Save → all leads re-scored with new weights

## How tier scoring works

A lead is graded on:

1. **Vertical fit** (highest weight) — Auto Dealership = 30 pts, Construction Supply = 28, Manufacturing = 28, Warehousing = 26, Office Park = 24, others lower
2. **Employee count** — ≥250 = 35 pts, ≥100 = 30, ≥50 = 20, ≥25 = 10
3. **Data completeness** — Has mobile = 15 pts, has email = 10, has DM title = 8, has address = 5

Total score → tier:
- **A** if ≥ 70 points
- **B** if ≥ 40 points
- **C** otherwise

So a 100-employee construction supply with a known DM = 28 + 30 + 15 + 10 + 8 = 91 → Tier A.

## Common questions

**Q: Why is a lead I just added showing as Tier C?**
A: Tier requires data. If you only entered business + phone, the score is low. Add vertical, employee count, mobile, and email → score climbs.

**Q: I clicked Mark Not Interested but it didn't move.**
A: You need to pick a reason from the dropdown FIRST, then click Confirm. The reason is required.

**Q: The "verify emails" button takes forever.**
A: Each email = 1 Hunter API call (~1 sec). 50 selected ≈ 50 seconds. Wait for the banner.

**Q: Can I see the call queue from earlier today (already-completed tasks)?**
A: This panel shows OPEN tasks only. For completed tasks, open the lead's detail in Email Pipeline.
