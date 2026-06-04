# 02 — AI Assistant

**What it's for:** Ask questions about your business in plain English. The AI reads the same data the rest of the app shows, so its answers stay grounded in reality.

## How to get there

Two ways:

1. **Floating chat bubble** — green circle, bottom-right corner of every page. Tap it.
2. **Sidebar** → **AI Assistant** — opens the full-page chat experience.

The bubble is best for quick questions while you work. The full page is best for longer conversations.

## What you can ask

### Sales & revenue
- "What's today's revenue?"
- "How does this week compare to last week?"
- "Which day this month had the most sales?"
- "Is today above or below average?"

### Products
- "What are my top 5 sellers?"
- "What's selling poorly right now?"
- "Show me the candy breakdown."
- "Which products have low margin?"

### Machines
- "What sells best on Hartman 16300?"
- "Which machines are offline?"
- "Which machine needs refilling most urgently?"

### Inventory & buying
- "What's in this week's buy list?"
- "Total warehouse value?"
- "What POs are open right now?"

### Predictions
- "How many units will I sell next month?"
- "What's the expected restock cost?"
- "When does Coke peak seasonally?"

### Leads (new)
- "How many Tier A leads do I have?"
- "Who's in Meeting Booked stage?"
- "Which leads haven't been touched in 3 days?"
- "What was the last reply from a lead?"

### Alerts & operations
- "Anything urgent right now?"
- "What needs a price change?"
- "Top refill priorities?"

## What it can't answer

The AI is honest about its limits. If a question is outside its data, it will say so. Examples:

- **Specific lead by ID** — it sees the top 15 leads. For "tell me about L-042" specifically, open **Lead Dashboard**.
- **Custom date ranges** — it sees today + rolling 30 days. For "show me April 2025", use **Reports → Custom Range**.
- **Specific call history** — it sees recent replies but not full call transcripts.
- **Hypotheticals** — it won't predict what's not in the data.

## How it stays accurate

The AI follows strict rules to avoid making things up:

- **Every number it shows is real** — copied from your actual data, not invented
- **Flags stale data** — if a machine is offline > 3 days, it'll mention numbers may be outdated
- **Flags suspect data** — if margin shows -100%, it'll say "looks like a cost-data bug" not "you're losing money"
- **Says "I don't know" when unsure** — better than guessing
- **Recommends pages** — when it can't answer, it tells you which page can

## Common workflows

### Morning check-in (1 minute)

1. Open the bubble
2. Ask "How did yesterday go?"
3. Ask "Anything urgent today?"

### Pre-route planning

1. Ask "Which machines need refilling?"
2. Ask "What should I bring for [machine name]?"
3. Ask "Buy list summary?"

### End-of-day recap

1. "What was today's revenue vs last week?"
2. "Anything that needs my attention before tomorrow?"

## Tips for better answers

- **Be specific** — "What's the top seller on Baker Nissan Sales?" beats "what sells well?"
- **Name the machine** if you're asking about a specific one
- **Ask follow-ups** — the AI remembers the conversation

## When the AI gives a strange answer

1. **Refresh the page** — sometimes the data snapshot is briefly stale
2. **Ask "What page should I check for this?"** — it'll point you somewhere
3. **Verify the number** by opening the relevant page (Reports, Lead Dashboard, etc.)

## What's NOT a bug

- The AI sees a *snapshot* of the data at the moment you ask. If you ask the same question 1 minute later after new sales come in, the answer can change slightly.
- The AI doesn't have access to information older than ~30 days for most queries (point to Reports for historical).
- It can't take actions — only describe data. To actually book a meeting, mark not interested, etc., use the buttons in the relevant page.
