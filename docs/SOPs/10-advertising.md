# 10 — Advertising

> SOP for tracking ad campaigns running on your vending machines —
> managing clients, ad creatives, billing, and impression tracking.

## How to open it

Click **Advertising** in the left sidebar.

The page has 3 tabs at the top.

---

# Tasks

## Task 1 — Create a new ad campaign

**When to do it:** When you've signed a new advertiser.

1. Click **Advertising** in the sidebar.
2. Click the **Campaigns** tab.
3. Click the green **+ New Campaign** button.
4. A form opens. Fill in:
   - **Client name** + contact email.
   - **Ad name** (e.g. "Summer Promo").
   - **Start date** + **end date**.
   - **Daily rate** ($) — what you're charging the client per day.
   - **Machine(s)** — multi-select the machines the ad will run on.
5. Click **Save**.

✅ **What you should see:** The campaign appears in the Campaigns list with status:
- **Scheduled** if the start date is in the future.
- **Active** if the start date is today.

---

## Task 2 — Pause a running campaign

**When to do it:** When the client asks to pause temporarily.

1. Click **Advertising** in the sidebar.
2. Click the **Campaigns** tab.
3. Find the campaign in the list.
4. Click the **Pause** button on the row.

✅ **What you should see:** Status badge flips from Active to Paused. The ad stops running.

▶ **To resume:** Click **Resume** on the same row.

---

## Task 3 — End a campaign early

**When to do it:** When a campaign needs to wrap up before the original end date.

1. Click **Advertising** in the sidebar.
2. Click the **Campaigns** tab.
3. Find the campaign row.
4. Click **Edit**.
5. Change the **end date** to today.
6. Click **Save**.

✅ **What you should see:** Status flips to **Completed**. Total revenue is recalculated for the actual number of days run.

---

## Task 4 — Generate an invoice for a client

**When to do it:** Weekly or monthly, when billing each advertiser.

1. Click **Advertising** in the sidebar.
2. Click the **Campaigns** tab.
3. Find the campaign.
4. Click the **Download invoice** button.
5. A PDF is generated.

✅ **What you should see:** A PDF in your downloads folder, ready to email to the client.

💡 **Note:** The invoice covers the period from campaign start through the day you download it. For weekly billing, download every Friday.

---

## Task 5 — Find empty ad slots to sell

**When to do it:** When you're pitching new advertisers.

1. Click **Advertising** in the sidebar.
2. Click the **Machines** tab.
3. Look at the **Used slots** column — anything less than the Total slots = available slot.
4. Note the **Avg daily transactions** column for those machines — high transactions = more attractive ad inventory.
5. Use these numbers in your pitch.

✅ **What you should see:** A clear list of machines with open slots + the daily traffic for each.

---

## Task 6 — Track QR scans on an ad campaign

**When to do it:** When you've added a unique QR code to an ad creative and want to see how it's performing.

1. Click **Advertising** in the sidebar.
2. Click the **Reports** tab.
3. Find the campaign in the list.
4. Look at:
   - **QR scans** column — total scans of the campaign's QR code.
   - **Daily breakdown** chart — scans per day.

✅ **What you should see:** Real engagement numbers you can show the client.

---

# Reference (what each tab shows)

## Tab 1 — Campaigns

### Top stat tiles
- **Active campaigns** — currently running today.
- **Total revenue this month** — ad revenue MTD.
- **Scheduled** — campaigns starting soon.
- **Paused** — temporarily off.

### Campaign list columns
- Client name + contact email
- Ad name (creative title)
- Status badge: Active / Scheduled / Completed / Paused
- Machines the ad runs on
- Start → End date
- Daily rate ($) charged to the client
- Total revenue (daily rate × days run)

### Available actions per row
- **Edit** — update dates, daily rate, machines, status.
- **Pause / Resume** — quick toggle.
- **Download invoice** — generates an invoice PDF.

## Tab 2 — Machines

Each machine's ad capacity.

| Column | What it shows |
|---|---|
| Machine name + ID | Identifies the machine |
| **Total slots** | How many ad slots the machine has (typically 4) |
| **Used slots** | How many are filled by active campaigns |
| **Avg daily transactions** | For impression estimating |
| Active campaigns | What's running on this machine |

## Tab 3 — Reports

Per-campaign performance:
- **Impressions** — estimated views (machine's daily transactions × days running).
- **QR scans** — actual scans of the ad's QR code (if it has one).
- **Revenue** — what you've billed the client.
- **Daily breakdown** chart — impressions per day.

## How impressions are calculated

Impressions ≈ machine's average daily transactions × days the ad ran.

Example: a campaign on a machine doing 50 transactions/day for 14 days ≈ 700 impressions.

True impression count would require ad-display logging from the machine itself; we estimate from sales activity as a proxy.

---

# Common questions

**Q: Can I run multiple ads on the same machine?**
A: Yes, up to the machine's slot count (typically 4). The system rotates them.

**Q: What if a machine goes offline during a campaign?**
A: Impressions stop accruing while offline. Daily revenue still bills (you committed to the dates) unless you pause the campaign.

**Q: Can I run different ads on different machines under the same campaign?**
A: No — one campaign = one creative. For multiple creatives, create multiple campaigns.

**Q: How do I bill a client weekly vs end-of-campaign?**
A: Generate an invoice anytime — it covers from campaign start through the invoice date. Send those weekly if you bill weekly.

> **Note:** This menu is a lighter section of the app. If you need deeper customization (creative approval workflows, multiple ad networks), let support know.
