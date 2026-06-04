# PocketPantry — Standard Operating Procedures

A guide to every menu in the PocketPantry app. Each SOP covers what the menu is for, the day-to-day workflows, and what to do when something looks wrong.

These are written for **operators and assistants** — not developers. No coding knowledge needed.

## Quick reference

| Menu | Use this when you want to… | SOP |
|---|---|---|
| **Cross-menu scenarios** | "How do I do X?" — real workflows that touch multiple pages | [00-common-scenarios.md](00-common-scenarios.md) |
| Today | See what's happening RIGHT NOW (revenue, refill stops, alerts) | [01-today.md](01-today.md) |
| AI Assistant | Ask questions in plain English ("what's selling?") | [02-ai-assistant.md](02-ai-assistant.md) |
| Machines | Check status of every machine, see per-machine sales | [03-machines.md](03-machines.md) |
| Inventory | Manage products, warehouse stock, log refills, scan items | [04-inventory.md](04-inventory.md) |
| Pricing | Set vending prices, see suggested markups, review margins | [05-pricing.md](05-pricing.md) |
| Predictions | Forecasts, machine planograms, product health, seasonal trends | [06-predictions.md](06-predictions.md) |
| Pipeline | Cold-call sales pipeline (kanban view) | [07-pipeline.md](07-pipeline.md) |
| Email Pipeline | Email-based outreach pipeline (kanban view) | [08-email-pipeline.md](08-email-pipeline.md) |
| Lead Dashboard | Tiered lead scoring, call queue, conversion stats | [09-lead-dashboard.md](09-lead-dashboard.md) |
| Advertising | Ad campaign management | [10-advertising.md](10-advertising.md) |
| Reports | Custom date ranges, payment splits, CSV export | [11-reports.md](11-reports.md) |
| Exception Queue | Single list of fixable data issues with one-click actions | [12-exception-queue.md](12-exception-queue.md) |

## Daily workflow (typical day)

1. **Morning** — open **Today** to see overnight sales + what needs refilling
2. **Mid-morning** — open **Lead Dashboard** to work the call queue (or **Email Pipeline** if doing outreach)
3. **Pre-route planning** — check **Inventory → Buy List** for the week's stocking
4. **At the warehouse** — use **Inventory → Scan** to register incoming stock
5. **At each machine** — **Inventory → Log Refill** as you fill each machine
6. **End of day** — **Reports** for a recap, or just ask the **AI Assistant** "how did today go?"

## Where things connect

- **Today** shows summary tiles from every other menu
- **AI Assistant** can answer questions about data from any menu
- **Machines + Inventory + Reports** all share the same underlying sales data, so numbers stay consistent
- **Lead Dashboard + Email Pipeline + Pipeline** are three views of the same lead list (table view, email kanban, call kanban)

## When numbers disagree

If two pages show different numbers for the same thing:

1. **Trust Reports first** for historical / cumulative totals
2. **Trust Today** for real-time today-only numbers
3. **Trust per-machine numbers on Machines** for live machine activity

If you're still seeing a mismatch, the AI Assistant can usually tell you why (mention which two numbers disagree — it'll explain).

## Getting help

- For app questions: ask the **AI Assistant** (chat bubble at the bottom-right of every page)
- For lead-specific questions: check **Lead Dashboard** for the lead, then drill in
- For sales questions: **Reports** with a custom date range gives the deepest detail
