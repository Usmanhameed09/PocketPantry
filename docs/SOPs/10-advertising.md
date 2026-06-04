# 10 — Advertising

**What it's for:** Track ad campaigns running on your vending machines. Manage clients, ad creatives, machines, billing, and impression tracking.

## How to get there

Sidebar → **Advertising**.

## What you see

### Three sub-tabs

| Tab | What it covers |
|---|---|
| **Campaigns** | Every ad campaign (active, scheduled, completed, paused) |
| **Machines** | Which machines are running ads + slot utilization |
| **Reports** | Performance — impressions, scans, revenue per campaign |

## Campaigns tab

### Top stat tiles

- **Active campaigns** — currently running today
- **Total revenue this month** — ad revenue MTD
- **Scheduled** — campaigns starting soon
- **Paused** — temporarily off

### Campaign list

Each row shows:
- Client name + contact (email)
- Ad name (creative title)
- Status badge: Active / Scheduled / Completed / Paused
- Machines the ad runs on
- Start → End date
- Daily rate ($) charged to the client
- Total revenue (daily rate × days run)

### Campaign actions

- **+ New Campaign** — create one (form opens)
- **Edit** on any row — update dates, daily rate, machines, status
- **Pause / Resume** — quick toggle
- **Download invoice** — generates an invoice PDF for the client

## Machines tab

Shows each machine's ad capacity. Each row:
- Machine name + ID
- **Total slots** — how many ad slots the machine has (typically 4)
- **Used slots** — how many are currently filled by active campaigns
- **Avg daily transactions** — for impression estimating
- Active campaigns running on this machine

**Use this for:** Selling ad space. See which machines have empty slots → pitch to clients.

## Reports tab

Per-campaign performance:
- **Impressions** — estimated views (based on machine's daily transactions × days running)
- **QR scans** — actual scans of the ad's QR code (if it has one)
- **Revenue** — what you've billed the client
- **Daily breakdown** chart — impressions per day

## Common workflows

### Create a new campaign

1. Click **+ New Campaign**
2. Fill in:
   - Client name + contact email
   - Ad name (e.g., "Summer Promo")
   - Start + end dates
   - Daily rate ($)
   - Machine(s) to run on (multi-select)
3. Save → status = Scheduled if start date is future, Active if it's today

### Pause a campaign (e.g., client requests)

1. Find the campaign
2. Click **Pause**
3. The campaign stops running until you Resume

### End a campaign early

1. Edit the campaign
2. Change the end date to today
3. Status flips to Completed
4. Total revenue calculated for actual days run

### Bill a client

1. Find the campaign
2. Click **Download invoice** → PDF generates
3. Send to the client

### Track QR code scans

If your ad creative has a unique QR code:

1. The QR code URL includes a campaign ID
2. Every scan is logged
3. View total + daily breakdown in the Reports tab

## How impressions are calculated

Impressions ≈ machine's average daily transactions × days the ad ran.

So a campaign on a machine doing 50 transactions/day for 14 days = ~700 impressions.

Real impression count would require ad-display logging from the machine itself; we estimate from sales data as a proxy.

## Common questions

**Q: Can I have multiple ads on the same machine?**
A: Yes, up to the machine's slot count (typically 4). The system rotates them.

**Q: What if a machine goes offline during a campaign?**
A: Impressions stop accruing while offline. Daily revenue still bills (because you committed to the dates) unless you pause the campaign.

**Q: Can I run different ads on different machines under the same campaign?**
A: One campaign = one creative. To run multiple creatives, create multiple campaigns.

**Q: How do I bill a client weekly vs end-of-campaign?**
A: Generate an invoice anytime — it covers the period from campaign start through the invoice date. Send those weekly if you bill weekly.

> **Note:** This menu is a lighter-weight section of the app. If you need to deeply customize ad management (e.g., creative approval workflows, multiple ad networks), let support know.
