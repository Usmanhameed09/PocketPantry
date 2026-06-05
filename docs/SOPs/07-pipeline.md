# 07 — Pipeline (Cold-Calling Kanban)

> SOP for working the cold-calling pipeline — adding leads, logging
> call outcomes, booking meetings.

> **Heads up:** there are three views of the same lead list:
> - **Pipeline** (this page) — kanban, for calling workflows
> - **Email Pipeline** — kanban, for email outreach
> - **Lead Dashboard** — table view + bulk actions + analytics
>
> All three operate on the same leads.

## How to open it

Click **Pipeline** in the left sidebar.

---

# Tasks

## Task 1 — Log a call outcome

**When to do it:** Immediately after every call.
**Why it matters:** The system uses the outcome to auto-schedule the next action (retry, follow-up, mark not interested). Skipping this means leads go stale.

1. Click **Pipeline** in the sidebar.
2. Click the lead's card to open the detail view.
3. Click the **Log Call** button.
4. Pick the outcome:
   - **Voicemail** — auto-schedules retry next business day.
   - **No Answer** — same as voicemail.
   - **Gatekeeper** — auto-schedules email today + retry.
   - **Interested** — moves to Interested stage, schedules tomorrow follow-up.
   - **Wrong Number** — triggers Apollo re-search for alternate DM.
   - **Not Interested** — opens reason-code picker (see Task 5).

✅ **What you should see:** The card moves to the correct column automatically. The **Next action** field updates with the new scheduled date.

---

## Task 2 — Add a single lead manually

**When to do it:** When you find a lead from a non-bulk source (referral, walk-in, business card).

1. Click **Pipeline** in the sidebar.
2. Click the green **+ Add Lead** button (top of the board).
3. A form opens.
4. Fill in:
   - **Business name** (required).
   - **Contact name + phone** (required).
   - **Email + address** (recommended).
   - **Qualification fields**: Owner, Vertical, Website, Apollo mobile, Employee count, Foot traffic score.
5. Click **Save**.

✅ **What you should see:** The lead appears as a card in the **New Lead** column with a tier badge auto-assigned (A/B/C based on the data you provided).

💡 **Tip:** The more qualification data you fill in, the better the tier score. Vertical + employee count + mobile number = much higher tier.

---

## Task 3 — Import a batch of leads from Excel

**When to do it:** When you have a CSV/Excel list from a purchased database, conference attendee list, etc.

1. Click **Pipeline** in the sidebar.
2. Click the **Excel Import** button.
3. Upload your CSV/Excel file.
4. Review the preview — duplicates are flagged.
5. Click **Confirm import**.

✅ **What you should see:** Leads added in bulk to the **New Lead** column.

---

## Task 4 — Prospect a batch of leads via Google Maps

**When to do it:** Cold-prospecting at scale (e.g. all auto dealers in your metro).
**Why it matters:** Maps + Apollo auto-enrichment is the fastest way to build a high-quality list — DM name, title, email, and mobile come pre-filled.

1. Click **Pipeline** in the sidebar.
2. Click the **Google Maps Import** button.
3. Type a search (e.g. "auto dealers near Houston").
4. Click **Search**.
5. Maps returns candidates. Each one auto-enriches via Apollo in the background.
6. Untick any candidates you don't want.
7. Click **Import N leads** to bring them into your pipeline.

✅ **What you should see:** Each candidate becomes a card in the **New Lead** column with Apollo-enriched data (DM, title, mobile, etc.) already attached.

---

## Task 5 — Mark a lead as Not Interested with a reason

**When to do it:** When a call confirms the lead is a no-go.

1. From the Pipeline page, click the lead card.
2. Click the **Log Call** button.
3. Pick **Not Interested**.
4. A reason-code dropdown appears. Pick one:
   - price / space / already vendor / corporate policy / not DM / bad timing / undeliverable / other.
5. Click **Confirm**.

✅ **What you should see:** The card moves to the **Not Interested** column. All open call tasks for the lead are cancelled. The reason is saved for analytics.

---

## Task 6 — Book a meeting

**When to do it:** When a call results in an agreed meeting date.

1. From the Pipeline page, click the lead card.
2. Click the **📅 Book Meeting** button.
3. Pick a date and time.
4. Add notes (location, what to discuss).
5. Click **Confirm**.

✅ **What you should see:**
- The card moves to **Meeting Booked**.
- All open call tasks for this lead are cancelled (stop-rule).
- A 24h-post-meeting follow-up task is created automatically.

---

## Task 7 — Send an email from the call workflow

**When to do it:** When the call workflow needs an email follow-up (e.g. after gatekeeper, or to send pricing).

1. From the Pipeline page, click the lead card.
2. Click the **Send Email** button.
3. Pick a template (or write custom).
4. Click **Send**.

✅ **What you should see:** The email is sent and logged in the lead's history.

---

## Task 8 — Move a card to a different stage (drag and drop)

**When to do it:** When you want to manually update a stage without going through Log Call.

1. Click and hold on a lead card.
2. Drag it to the column you want.
3. Release.

✅ **What you should see:** The stage updates immediately.

⚠️ **Use sparingly:** dragging skips the auto-scheduled next action. Prefer **Log Call** which moves the card AND schedules the follow-up.

---

## Task 9 — Handle a "Max call attempts reached" banner

**When to do it:** When a card shows a red banner after the lead has hit the max attempts (default 6).

1. Click the lead card to open detail.
2. Read the banner — it explains the situation.
3. Pick a path:
   - Click **Find alt DM** → Apollo searches for a different contact at the same company.
   - Click **Switch to email** → drops call cadence and runs email-only follow-up.

✅ **What you should see:** Either a new contact loaded (Find alt DM) or the lead transitions to email-only mode (Switch to email).

---

# Reference (what each part of the page shows)

## Stage columns

The board has columns for each lifecycle stage. Drag cards between columns to update stage:

| Stage | What it means |
|---|---|
| **New Lead** | Just added, not yet contacted |
| **Contacted** | Called once or twice, no decision |
| **Qualified** | Decision maker confirmed |
| **Interested** | Showed interest, working toward yes |
| **Callback** | Asked us to call back at a specific time |
| **Site Visit Requested** | Scheduled a visit to the location |
| **Proposal Requested** | They want a proposal |
| **Meeting Booked** | Calendar event booked |
| **Won** | Signed contract |
| **Installed** | Machine installed and live |
| **Not Interested** | Ruled out — with reason code |

## Card fields

Each card shows: business name + contact + phone (Apollo mobile in green) + tier badge + HOT chip (if SLA-flagged) + owner + next-action chip + last touch + stage-specific data (call attempts, callback time).

## Top controls

| Button | What it does |
|---|---|
| **+ Add Lead** | Manually add a lead via form |
| **Excel Import** | Bulk-upload a CSV/Excel of leads |
| **Google Maps Import** | Search Maps and pick businesses to add |
| **Templates** | View/edit email templates used by the system |

## How the call automation works (under the hood)

After Log Call:

| Outcome | What gets scheduled |
|---|---|
| Voicemail / No Answer | Retry next business day, priority 50 |
| Gatekeeper | Email follow-up today, priority 60 |
| Callback at specific time | Exact-time call task, priority 90 |
| Interested | Follow-up tomorrow, priority 95 |
| Wrong Number | Apollo re-search task |
| Not Interested | No follow-up (lead stops being active) |

Calls stop at **max attempts** (default 6). After that, the card shows a red **Max call attempts reached** banner.

---

# Common questions

**Q: A card moved to the wrong stage. Can I drag it back?**
A: Yes. Click and drag any card. The stage updates immediately. Note: this skips the auto-scheduled next action — prefer Log Call.

**Q: I logged "Not Interested" — what happens?**
A: The card moves to Not Interested column, all open tasks are dropped, next-action cleared. The reason code is saved so reports can analyze drop-out reasons.

**Q: What's the difference between Pipeline and Email Pipeline?**
A: Same data, different layout. Pipeline is for call workflows (Log Call prominent). Email Pipeline puts Send Email front and center.

**Q: Where do I see the call history for a lead?**
A: Click the card — the detail view shows all logged calls and emails.

**Q: What's the HOT chip mean?**
A: Either the lead replied positively to an email (auto-flagged within 1h) OR the SLA cron flagged them as a hot Tier A lead going cold. Call them today.
