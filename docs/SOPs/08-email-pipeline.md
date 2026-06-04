# 08 — Email Pipeline

**What it's for:** Same leads as Pipeline, but laid out for email outreach. Bulk send templates, track replies, manage the email sequence.

> **Heads up:** there are three views of the same lead list:
> - **Pipeline** — kanban, optimized for calling
> - **Email Pipeline** (this page) — kanban, optimized for email outreach
> - **Lead Dashboard** — table view with bulk actions + scoring
>
> Actions taken on one view show up on the others.

## How to get there

Sidebar → **Email Pipeline**.

## What you see

### Kanban columns

Same stages as Pipeline:
- New Lead → Contacted → Qualified → Interested → Site Visit Requested → Meeting Booked → Won → Installed → Not Interested

### Lead cards

Each card shows:
- Tier badge (A/B/C colored)
- HOT chip if call-ready
- Business name + business type
- Owner (if assigned)
- Contact name + Apollo title
- Phone (Apollo mobile in green when available)
- Email
- Email log count ("3 emails sent")
- **Next action chip** + scheduled date
- **Last touch** date
- **Send Email** button (purple — primary action)
- **📅 Book Meeting** button (teal — opens inline date/time/notes)
- Last activity summary
- **Delete Lead** button (bottom)

### Top controls

- **+ Add Lead** — manual entry
- **Excel Import** — bulk upload
- **Google Maps Import** — search + import from Maps
- **Templates** — manage email templates

## Common workflows

### Send an email to a lead

1. Click **Send Email** on the lead card
2. Pick a template (Primary outreach, Follow-up 1, Follow-up 2, etc.) OR write custom
3. Email is sent and logged on the lead
4. Lead's stage may auto-update to Contacted

### Book a meeting from a card

Inline — no need to leave the page:

1. Click **📅 Book Meeting** on the card
2. A small form appears with: date picker, time picker, notes field
3. Click **Confirm booking**
4. Lead moves to "Meeting Booked" column
5. 24h post-meeting follow-up task is scheduled automatically
6. All other open tasks for this lead are cancelled (stop-rule)

### Add a lead with full qualification data

Best for high-quality manual additions:

1. Click **+ Add Lead**
2. Required: business name, contact, phone
3. **Qualification Data section** (feeds tier scoring):
   - **Owner** — who'll work this lead
   - **Vertical** — dropdown of 12 verticals (Auto Dealership, Construction Supply, Manufacturing, etc.)
   - **Website** — Apollo uses this to enrich
   - **Apollo mobile** — direct cell of the DM (if known)
   - **Employee count** — feeds scoring (>50 = +20 points, etc.)
   - **Foot traffic score** — manual 0-100 (Thomasnet if you have it)
4. Save → lead auto-scored A/B/C based on inputs

### See the email log for a lead

1. Click the card to expand
2. Scroll to see the email history list (date, subject, status: Sent/Opened/Replied/Bounced)

### Bulk-import via Google Maps

Best for cold-prospecting at scale:

1. Click **Google Maps Import**
2. Search by category + location ("construction supply houston")
3. Maps returns candidates
4. **Auto-enrichment runs**: for each candidate, Apollo finds the DM (name, title, email, mobile)
5. Tick the ones you want, untick the rest
6. Click **Import N leads**
7. Each becomes a new card in New Lead column

## What's automatic vs manual

**Automatic:**
- Email send → logged on the lead
- Reply received → lead flagged "Hot" + call task created within 1h
- Open/click tracked when the email service supports it
- Sequence: 3-touch email cadence (Primary → Follow-up 1 → Follow-up 2)

**Manual:**
- Pick which template to send
- Move leads between stages by drag (or via action buttons)
- Mark as Not Interested with a reason code

## Max-attempts banner

If a lead's call_attempts hits the max (default 6) with no decision:

- Red banner on the card
- Two CTA buttons:
  - **Find alt DM** — calls Apollo to find another contact at the same company
  - **Switch to email** — drops the call cadence and runs email-only

## Common questions

**Q: Why are the stage columns different from the older email pipeline?**
A: The new pipeline includes **Qualified, Meeting Booked, Won, Installed** — added to match how real deals progress. Older boards only had 5 columns.

**Q: How does "Apollo mobile" get populated?**
A: When the lead has a website, Apollo's People Enrich endpoint is called automatically (during import or via a manual enrich button). If Apollo has a mobile number for the matched person, it lands in the apollo_mobile field. Some leads won't have one — that's normal.

**Q: A card shows HOT — what does that mean?**
A: Either:
- The lead replied positively to an email (auto-flagged within 1 hour)
- OR the SLA cron flagged them as a hot Tier A lead going cold

When you see HOT, call them today.

**Q: What's the difference between "Owner" and "Contact"?**
A: Owner = the team member (you, an SDR) working the lead. Contact = the person AT the lead business (the decision maker or front desk).
