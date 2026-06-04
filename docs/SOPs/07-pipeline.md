# 07 — Pipeline (Call-focused kanban)

**What it's for:** The cold-calling pipeline. Visual kanban board showing every lead by stage. Best for caller-driven workflows.

> **Heads up:** there are three views of the same lead list:
> - **Pipeline** (this page) — kanban, optimized for calling
> - **Email Pipeline** — kanban, optimized for email outreach
> - **Lead Dashboard** — table view with bulk actions + tier scoring
>
> All three operate on the same leads — actions in one show up in the others.

## How to get there

Sidebar → **Pipeline**.

## What you see

### Kanban columns (stages)

The board has columns for each stage a lead can be in. Drag cards between columns to update stage:

| Stage | Meaning |
|---|---|
| **New Lead** | Just added, not yet contacted |
| **Contacted** | Called once or twice, no decision yet |
| **Qualified** | Decision maker confirmed (DM) |
| **Interested** | Showed interest, working toward a yes |
| **Callback** | Asked us to call back at a specific time |
| **Site Visit Requested** | Scheduled a visit to the location |
| **Proposal Requested** | They want a proposal |
| **Meeting Booked** | Calendar event booked |
| **Won** | Signed contract |
| **Installed** | Machine installed and live |
| **Not Interested** | Ruled out — with reason code |

### Lead cards

Each card shows:
- Business name
- Contact + phone (Apollo mobile highlighted in green when available)
- Tier badge (A green / B yellow / C grey)
- HOT chip (if flagged as call-ready by SLA scan)
- Owner (who's working it)
- **Next action** chip + scheduled date
- **Last touch** date
- Stage-specific data (call attempts, callback time, etc.)

### Top controls

- **+ Add Lead** — manually add a lead (form opens)
- **Excel Import** — bulk-upload a CSV/Excel of leads
- **Google Maps Import** — search Maps and pick businesses to add
- **Templates** — view/edit email templates used by the system

## Common workflows

### Add a single lead manually

1. Click **+ Add Lead**
2. Fill in:
   - Business name (required)
   - Contact name + phone (required)
   - Email + address (recommended)
   - **Qualification fields** (new): Owner, Vertical, Website, Apollo mobile, Employee count, Foot traffic score
3. Save → lead appears in New Lead column, auto-tier-scored if data is present

### Excel import

1. Click **Excel Import**
2. Upload your file
3. Review the preview — duplicates flagged
4. Confirm import → leads added in bulk to New Lead

### Google Maps import (best for prospecting)

1. Click **Google Maps Import**
2. Type a search ("auto dealers near Houston")
3. Review the candidates that match
4. Each candidate auto-enriches via Apollo (gets DM name, email, mobile)
5. Tick the ones to import → Add to pipeline

### Log a call outcome

1. Click the lead's card to open the detail view
2. Click **Log Call**
3. Pick the outcome:
   - **Voicemail** → auto-schedules retry next business day
   - **No Answer** → same as voicemail
   - **Gatekeeper** → auto-schedules email + retry
   - **Interested** → moves to Interested, schedules follow-up
   - **Wrong Number** → triggers Apollo re-search for alternate DM
   - **Not Interested** → with reason code (price / space / already vendor / etc.)
4. The card moves to the right column automatically + next-action field updates

### Book a meeting

1. Click the lead card
2. Click **📅 Book Meeting**
3. Pick date + time + notes
4. Confirm → all open call tasks for this lead are cancelled (stop-rule), 24h-post-meeting follow-up task created automatically

### Send an email

1. Click the lead card
2. Click **Send Email**
3. Pick a template (or write custom)
4. Send → logged in the lead's history

### Bulk-select leads

1. Click checkboxes on multiple cards
2. Bulk action bar appears at top with options
3. Pick action (assign owner, mark not interested, etc.)
4. Confirm

## How the automation works behind the scenes

Once a call is logged:

- **Voicemail / no answer** → retry task scheduled for next business day (priority 50)
- **Gatekeeper** → email follow-up task today (priority 60)
- **Callback at specific time** → exact-time call task (priority 90)
- **Interested** → follow-up task tomorrow (priority 95)
- **Not Interested / Wrong number** → no follow-up (lead stops being active)

The system stops calling at the **max attempts** (default 6). At that point the card shows a red **"Max call attempts reached"** banner with two CTAs:
- **Find alt DM** — Apollo re-searches for a different contact
- **Switch to email** — switch outreach mode

## Common questions

**Q: A card moved to the wrong stage. Can I drag it back?**
A: Yes. Click and drag any card to a different column. The stage updates immediately.

**Q: I log a "Not Interested" — what happens?**
A: The card moves to Not Interested column, all open tasks are dropped, and the next-action is cleared. The reason code is saved so reports can analyze why leads drop out.

**Q: What's the difference between this Pipeline and Email Pipeline?**
A: Same data, different optimized view. Pipeline is for calling workflows (logging call outcomes). Email Pipeline shows the same leads but is laid out for email-driven work (template send buttons more prominent).

**Q: Where do I see the call history for a lead?**
A: Click the card → it opens a detail view with all logged calls + emails.
