# 02 — AI Assistant

> SOP for asking the AI questions about your business in plain English.

## How to open it

Two ways:

1. **Floating chat bubble** — the green circle in the bottom-right corner of every page. Click it.
2. **Sidebar → AI Assistant** — opens the full-page chat.

Use the bubble for quick questions while you work. Use the full page for longer conversations.

---

# Tasks

## Task 1 — Morning check-in (1 minute)

**When to do it:** First thing in the morning, as part of your daily routine.

1. Click the green chat bubble (bottom-right corner) or click **AI Assistant** in the sidebar.
2. Type: `How did yesterday go?`
3. Press **Enter** or click the send button.
4. Wait for the response (1–3 seconds).
5. Read the reply, then ask a follow-up: `Anything urgent today?`

✅ **What you should see:** A summary of yesterday's revenue + any urgent alerts to address.

💡 **Tip:** The AI remembers the conversation. Follow-up questions like "and what about Tuesday?" work without repeating context.

---

## Task 2 — Pre-route planning

**When to do it:** Before leaving for your refill route.

1. Open the chat bubble or AI Assistant page.
2. Type: `Which machines need refilling most urgently?`
3. Read the response.
4. Type a follow-up: `What should I bring for [machine name]?`
5. Type: `Buy list summary?`

✅ **What you should see:** A priority list of machines + the products each needs.

---

## Task 3 — Ask about a specific machine, product, or lead

**When to do it:** Whenever you need details on one specific entity.

1. Open the chat.
2. Type a specific question. Examples:
   - `What sells best on Hartman 16300?`
   - `Tell me about Monster White`
   - `Who is the lead at SkyDry?`
   - `When does Coke 12oz peak seasonally?`

✅ **What you should see:** A focused answer with numbers from the snapshot.

💡 **Be specific** — "What's the top seller on Baker Nissan Sales?" beats "what sells well?". Naming the machine/product saves the AI a guess.

---

## Task 4 — Get a quick revenue / trend snapshot

**When to do it:** Any time you want a quick read on performance.

1. Open the chat.
2. Type one of:
   - `What's today's revenue?`
   - `How does this week compare to last week?`
   - `Which day this month had the most sales?`
   - `Is today above or below average?`

✅ **What you should see:** A concise answer with the actual numbers + a comparison.

---

## Task 5 — End-of-day recap

**When to do it:** Before closing out for the day.

1. Open the chat.
2. Type: `What was today's revenue vs last week?`
3. Follow-up: `Anything that needs my attention before tomorrow?`

✅ **What you should see:** Today's summary + a list of follow-ups.

---

## Task 6 — Toggle Agent mode (v2) vs Snapshot mode (v1)

**When to do it:** When the assistant misses a question and you want to try the other mode.

1. Open the AI Assistant page (sidebar — full page, NOT the bubble).
2. Look at the green chip near the header titled "Agent mode (v2)" or "Snapshot mode (v1)".
3. Click the chip to toggle.
4. Try your question again.

✅ **What you should see:** The mode label flips. Same question may produce a different response shape.

💡 **When to use which:**
- **Agent mode (v2)** — default. Cheaper, can drill into any specific entity. Best for "tell me about X".
- **Snapshot mode (v1)** — fallback. Loads more upfront context. Best for broad cross-cutting questions ("how does my whole business look?").

---

## Task 7 — Verify a number the AI gave you

**When to do it:** When a number seems wrong or surprising.

1. Ask the AI: `What page should I check for this?`
2. The AI will name the relevant page (Reports, Lead Dashboard, etc.).
3. Open that page in a new tab.
4. Compare the AI's number to what the page shows.

✅ **What you should see:** Numbers match. If they don't, the AI's snapshot was briefly stale — refresh the chat page and re-ask.

---

# Reference (what you can and can't ask)

## What it can answer

### Sales & revenue
- "What's today's revenue?"
- "How does this week compare to last week?"
- "Which day this month had the most sales?"

### Products
- "What are my top 5 sellers?"
- "What's selling poorly right now?"
- "Show me the candy breakdown."

### Machines
- "What sells best on [machine name]?"
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

### Leads
- "How many Tier A leads do I have?"
- "Who's in Meeting Booked stage?"
- "What was the last reply from a lead?"

### Alerts & operations
- "Anything urgent right now?"
- "What needs a price change?"
- "Top refill priorities?"

## What it can't answer

- **Specific lead by ID** — it sees top 15 leads. For "tell me about L-042" specifically, open **Lead Dashboard**.
- **Custom date ranges far back** — it sees today + rolling 30 days. For older windows, use **Reports → Custom Range**.
- **Full call transcripts** — it sees recent replies but not entire conversation history.
- **Hypotheticals** — it won't predict outcomes that aren't in the data.

## How it stays accurate

The AI follows strict rules to avoid making things up:

- **Every number is real** — copied from your actual data, never invented.
- **Flags stale data** — if a machine is offline > 3 days, it mentions numbers may be outdated.
- **Flags suspect data** — if margin shows -100%, it says "looks like a cost-data bug" not "you're losing money".
- **Says "I don't know" when unsure** — better than guessing.
- **Recommends pages** — when it can't answer, it tells you which page can.

---

# Common questions

**Q: The AI gave a strange answer. Is it broken?**
A: Usually no. Try:
1. Refresh the page — the data snapshot can be briefly stale.
2. Ask "What page should I check for this?" — it'll point you somewhere.
3. Verify by opening the relevant page directly.

**Q: Why does the same question give slightly different answers if I ask twice?**
A: The AI reads a snapshot of your data at the moment you ask. New sales between two questions = slightly different totals. This is expected.

**Q: Can the AI take actions for me (book a meeting, mark not interested)?**
A: No — it can only describe data. Use the buttons on the relevant pages to take actions.

**Q: Why doesn't it know about something older than 30 days?**
A: For most queries, the snapshot rolls 30 days. For older windows, the AI will point you to **Reports → Custom Range** which can go back as far as you've backfilled Nayax data.

**Q: Can I copy the AI's answer to share with someone?**
A: Yes — click and drag to select the text, then copy normally. The chat history persists for the session.
