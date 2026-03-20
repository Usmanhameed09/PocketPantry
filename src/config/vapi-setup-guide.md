# VAPI Assistant Setup Guide — PocketPantry Cold Call Agent

## Prerequisites
1. VAPI account at https://dashboard.vapi.ai
2. VAPI API key (from Dashboard → Settings → API Keys)
3. ElevenLabs API key (for voice — or use VAPI's built-in voices)
4. A phone number purchased through VAPI

---

## Option A: Manual Setup via VAPI Dashboard

### Step 1: Create the Assistant
1. Go to https://dashboard.vapi.ai → **Assistants** → **Create Assistant**
2. Name: `PocketPantry Cold Call Agent - Ryan`

### Step 2: Configure the Model
- **Provider**: OpenAI (or Anthropic)
- **Model**: gpt-4o (recommended) or claude-3.5-sonnet
- **Temperature**: 0.7
- **Max Tokens**: 300
- **System Prompt**: Copy the entire system prompt from `vapi-assistant.ts` → `VAPI_SYSTEM_PROMPT`

### Step 3: Set the First Message
- **First Message**: `Hi, this is Ryan with PocketPantry. I'm calling to upgrade your vending solution. Are you the person I'd speak to about that?`

### Step 4: Configure Voice
- **Provider**: ElevenLabs
- **Voice**: Adam (professional male) or any natural-sounding male voice
- **Stability**: 0.6
- **Similarity Boost**: 0.8
- **Speed**: 1.0

### Step 5: Configure Transcriber
- **Provider**: Deepgram
- **Model**: Nova-2
- **Language**: English

### Step 6: Call Settings
- **Silence Timeout**: 30 seconds
- **Max Duration**: 600 seconds (10 minutes)
- **Background Sound**: Office
- **Response Delay**: 0.5 seconds
- **Interruptions**: Enabled
- **End Call Message**: "Thank you for your time. Have a great rest of your day!"

### Step 7: Add Tools (Functions)
Add 3 tools in the Assistant's Tools section:

**Tool 1: collect_lead_info**
- Triggers when: AI gathers business/contact information
- See `VAPI_TOOLS[0]` in vapi-assistant.ts for schema

**Tool 2: schedule_site_visit**
- Triggers when: Prospect agrees to Arthur's visit
- See `VAPI_TOOLS[1]` in vapi-assistant.ts for schema

**Tool 3: log_call_outcome**
- Triggers when: Call is ending
- See `VAPI_TOOLS[2]` in vapi-assistant.ts for schema

### Step 8: Buy a Phone Number
1. Go to **Phone Numbers** → **Buy Number**
2. Choose a local number (Houston area: 713, 832, or 281)
3. Assign the assistant to this number

---

## Option B: Programmatic Setup via VAPI API

Use the helper function in `vapi-assistant.ts`:

```typescript
import { buildVapiAssistantPayload } from '@/config/vapi-assistant';

const payload = buildVapiAssistantPayload();

const response = await fetch('https://api.vapi.ai/assistant', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const assistant = await response.json();
console.log('Assistant created:', assistant.id);
```

---

## Testing in VAPI Dashboard

### Quick Test (No phone needed)
1. Go to your assistant in the VAPI Dashboard
2. Click the **"Test"** button (phone icon)
3. Speak into your microphone — the AI will respond as Ryan
4. Test these scenarios:
   - You ARE the decision maker → should proceed to hook
   - You are NOT the decision maker → should ask for referral
   - You have a vendor → should use pain point pivot
   - You DON'T have a vendor → should use grab-and-go pitch
   - Say "not interested" → should use objection handler
   - Say "we don't have space" → should use space rebuttal
   - Say "sounds expensive" → should use revenue share rebuttal
   - Show interest → should try to collect info and schedule visit

### Phone Test
1. After assigning a phone number, call the number
2. The AI will answer and begin the cold call script
3. Test the full flow through to scheduling

---

## Key Test Scenarios Checklist

- [ ] Opening with gatekeeper — requests transfer or callback info
- [ ] Opening with manager — delivers hook pitch
- [ ] Prospect has vendor — pain point pivot works
- [ ] Prospect has no vendor — grab-and-go pitch works
- [ ] "Not interested" objection — AI inventory tracking rebuttal
- [ ] "Already have vendor" objection — flexibility/trial rebuttal
- [ ] "No space" objection — modular setup rebuttal
- [ ] "Too much work" objection — hands-off rebuttal
- [ ] "No budget" objection — revenue share/5% profit rebuttal
- [ ] "Employees won't use it" — commission + digital screen rebuttal
- [ ] "Why not big vendor?" — partnership rebuttal
- [ ] Interested prospect — collects all lead form fields
- [ ] Scheduling — books site visit with Arthur
- [ ] Voicemail — leaves proper voicemail message
- [ ] Call outcome — correctly classified at end

---

## Next Steps (Step 2)
Once the assistant is tested and working in VAPI:
1. Set up webhook URL (serverUrl) pointing to our backend
2. Build API routes to handle VAPI webhooks
3. Connect lead data to our pipeline/database
4. Add manual call trigger from the Pipeline UI
