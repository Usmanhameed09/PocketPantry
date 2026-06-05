# 08 — Email Pipeline (Email-Outreach Kanban)

> SOP for the email outreach pipeline — sending templates, tracking
> replies, managing the email sequence.

> **Heads up:** there are three views of the same lead list:
> - **Pipeline** — kanban, for calling workflows
> - **Email Pipeline** (this page) — kanban, for email outreach
> - **Lead Dashboard** — table view + bulk actions + analytics

## How to open it

Click **Email Pipeline** in the left sidebar.

---

# Tasks

## Task 1 — Send an email to a lead

**When to do it:** First-touch outreach or any time you want to send a follow-up.

1. Click **Email Pipeline** in the sidebar.
2. Find the lead card.
3. Click the purple **Send Email** button on the card.
4. A template picker appears.
5. Pick a template (Primary outreach / Follow-up 1 / Follow-up 2 / etc.) OR click **Custom** to write your own.
6. Review the email content. Edit if needed.
7. Click **Send**.

✅ **What you should see:**
- The email is sent and logged on the lead.
- The lead's "X emails sent" counter goes up.
- The card's stage may auto-update to **Contacted** if this was the first email.

---

## Task 2 — Book a meeting inline (no page change)

**When to do it:** When a lead replies "yes, let's meet" — book it without leaving Email Pipeline.

1. Click **Email Pipeline** in the sidebar.
2. Find the lead card.
3. Click the teal **📅 Book Meeting** button.
4. A small inline form appears with: date picker, time picker, notes field.
5. Fill in the date, time, and any notes (location, agenda).
6. Click **Confirm booking**.

✅ **What you should see:**
- The card moves to the **Meeting Booked** column.
- A 24h post-meeting follow-up task is scheduled automatically.
- All other open tasks for this lead are cancelled.

---

## Task 3 — Add a lead with full qualification data

**When to do it:** When you want a high-quality manual addition that scores well on day one.

1. Click **Email Pipeline** in the sidebar.
2. Click the green **+ Add Lead** button (top of board).
3. Fill in the required fields:
   - Business name.
   - Contact name + phone.
4. In the **Qualification Data** section (this feeds tier scoring — fill out as much as possible):
   - **Owner** — who'll work this lead.
   - **Vertical** — dropdown of 12 verticals (Auto Dealership, Construction, Manufacturing, etc.).
   - **Website** — Apollo uses this to enrich automatically.
   - **Apollo mobile** — direct cell of the DM if known.
   - **Employee count** — feeds scoring (>50 = +20 pts, etc.).
   - **Foot traffic score** — manual 0-100 (Thomasnet style if you have it).
5. Click **Save**.

✅ **What you should see:** The lead appears in **New Lead** column, auto-scored A/B/C based on the data you provided.

💡 **Tip:** The more fields you fill, the better the tier. Vertical + employee count + mobile = high tier.

---

## Task 4 — Bulk-import via Google Maps (cold prospecting at scale)

**When to do it:** Building a fresh prospect list (e.g. all construction supply houses in your metro).

1. Click **Email Pipeline** in the sidebar.
2. Click the **Google Maps Import** button.
3. Search by category + location (e.g. "construction supply Houston").
4. Click **Search** — Maps returns candidates.
5. **Apollo auto-enrichment runs**: for each candidate, Apollo finds the DM (name, title, email, mobile). Wait for it to finish.
6. Review the candidates. Untick any you don't want.
7. Click **Import N leads**.

✅ **What you should see:** Each imported candidate becomes a card in **New Lead** with enriched contact data already attached.

---

## Task 5 — See the email log for a lead

**When to do it:** When you want to see what's been sent and what was replied/opened/bounced.

1. Click **Email Pipeline** in the sidebar.
2. Click the lead card to expand it.
3. Scroll down to see the email history list.

✅ **What you should see:** A chronological list of every email: date, subject, status (Sent / Opened / Replied / Bounced).

---

## Task 6 — React to a HOT chip

**When to do it:** When a card shows the orange **HOT** chip.
**Why it matters:** Either the lead replied positively to your email, or the SLA cron flagged them as a hot lead going cold. They're ready to convert NOW.

1. Click the HOT card immediately.
2. Read the most recent activity (reply summary or SLA flag reason).
3. Pick the right action:
   - Reply received → click **Send Email** to follow up with a meeting-booking template.
   - SLA flag → call them today AND send a re-engagement email.

✅ **What you should see:** Logged email/call updates the card; HOT chip clears once you act.

---

## Task 7 — Handle a "Max call attempts reached" banner

**When to do it:** When a card shows a red banner — the lead has hit max attempts (default 6) without a decision.

1. Click the lead card to open detail.
2. Pick a path:
   - Click **Find alt DM** → Apollo searches for a different contact at the same company.
   - Click **Switch to email** → drops the call cadence and runs email-only follow-up.

✅ **What you should see:** Either a new contact loaded OR the lead transitions to email-only mode.

---

## Task 8 — Manage email templates

**When to do it:** When you want to edit the templates the system uses, or add a new one.

1. Click **Email Pipeline** in the sidebar.
2. Click the **Templates** button at the top.
3. The template editor opens.
4. Pick a template to edit, OR click **+ New template**.
5. Edit the subject, body, and variables (like `{{contact_name}}`, `{{business_name}}`).
6. Click **Save**.

✅ **What you should see:** Updated template is available immediately in the Send Email picker.

---

# Reference (what each part of the page shows)

## Stage columns

Same stages as Pipeline (call kanban):

New Lead → Contacted → Qualified → Interested → Site Visit Requested → Meeting Booked → Won → Installed → Not Interested.

## Card fields

Each card shows:

- Tier badge (A green / B yellow / C grey)
- HOT chip (when SLA or reply-flagged)
- Business name + business type
- Owner (if assigned)
- Contact name + Apollo title
- Phone (Apollo mobile in green when available)
- Email
- Email log count ("3 emails sent")
- **Next action chip** + scheduled date
- **Last touch** date
- **Send Email** button (purple — primary action)
- **📅 Book Meeting** button (teal — inline date/time/notes)
- Last activity summary
- **Delete Lead** button (bottom of card)

## Top controls

| Button | What it does |
|---|---|
| **+ Add Lead** | Manual entry |
| **Excel Import** | Bulk upload from CSV/Excel |
| **Google Maps Import** | Search Maps + Apollo auto-enrichment |
| **Templates** | Manage email templates |

## What's automatic vs manual

**Automatic:**

- Email send → logged on the lead.
- Reply received → lead flagged HOT + call task created within 1h.
- Open/click tracked when the email service supports it.
- 3-touch sequence: Primary → Follow-up 1 → Follow-up 2.

**Manual:**

- Pick which template to send.
- Move leads between stages by drag (or action buttons).
- Mark as Not Interested with a reason code.

---

# Common questions

**Q: Why are the stage columns different from the older email pipeline?**
A: The new pipeline includes **Qualified, Meeting Booked, Won, Installed** — added to match how real deals progress. Older boards only had 5 columns.

**Q: How does Apollo mobile get populated?**
A: When the lead has a website, Apollo's People Enrich endpoint is called automatically (during import or via manual enrich). If Apollo has a mobile number for the matched person, it lands in the apollo_mobile field. Some leads won't have one — that's normal.

**Q: A card shows HOT — what does that mean?**
A: Either:
- The lead replied positively to an email (auto-flagged within 1 hour), OR
- The SLA cron flagged them as a hot Tier A lead going cold.

When you see HOT, call/email them today.

**Q: What's the difference between Owner and Contact?**
A: Owner = team member (you, an SDR) working the lead. Contact = the person AT the lead business (decision maker or front desk).

**Q: Where do I see who's replied to my emails?**
A: Either:
- Email Pipeline → cards with the HOT chip.
- Today page → "New Location Reply" panel.
- Lead Dashboard → Today's call queue (replies surface there).
