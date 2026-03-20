/**
 * Temporary In-Memory Leads Store
 *
 * This is a simple in-memory store for development/testing.
 * In production, replace with PostgreSQL using the schema in schema.sql.
 *
 * Data persists only while the Next.js server is running.
 */

export interface Lead {
  id: string;
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  distance: string;
  businessType: string;
  source: "Manual" | "Excel Import" | "Google Maps";
  stage: "New Lead" | "Contacted" | "Interested" | "Not Interested" | "Site Visit Requested" | "Proposal Requested" | "Callback";
  contactMethod: "Call" | "Email" | "Call + Email";
  callLogs: CallLog[];
  emailLogs: EmailLog[];
  addedDate: string;
  lastActivity: string;
  // VAPI-specific fields
  vapiCallId?: string;
  callAttempts: number;
  callbackDate?: string;
  callbackTime?: string;
}

export interface CallLog {
  attempt: number;
  date: string;
  duration: string;
  outcome: string;
  summary: string;
  vapiCallId?: string;
}

export interface EmailLog {
  date: string;
  status: "Sent" | "Opened" | "Replied" | "Bounced";
  subject: string;
}

// In-memory store
const leads: Map<string, Lead> = new Map();
let nextId = 1;

/**
 * Generate a lead ID
 */
function generateId(): string {
  const id = `L-${String(nextId).padStart(3, "0")}`;
  nextId++;
  return id;
}

/**
 * Add a new lead
 */
export function addLead(data: Omit<Lead, "id" | "callLogs" | "emailLogs" | "addedDate" | "lastActivity" | "callAttempts">): Lead {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const lead: Lead = {
    ...data,
    id: generateId(),
    callLogs: [],
    emailLogs: [],
    addedDate: dateStr,
    lastActivity: `Added ${dateStr}`,
    callAttempts: 0,
  };

  leads.set(lead.id, lead);
  return lead;
}

/**
 * Get a lead by ID
 */
export function getLead(id: string): Lead | undefined {
  return leads.get(id);
}

/**
 * Get all leads
 */
export function getAllLeads(): Lead[] {
  return Array.from(leads.values());
}

/**
 * Update a lead
 */
export function updateLead(id: string, updates: Partial<Lead>): Lead | undefined {
  const lead = leads.get(id);
  if (!lead) return undefined;

  const updated = { ...lead, ...updates };
  leads.set(id, updated);
  return updated;
}

/**
 * Add a call log to a lead
 */
export function addCallLog(leadId: string, log: CallLog): Lead | undefined {
  const lead = leads.get(leadId);
  if (!lead) return undefined;

  lead.callLogs.push(log);
  lead.callAttempts = lead.callLogs.length;
  lead.lastActivity = `Call ${log.outcome} - ${log.date}`;
  leads.set(leadId, lead);
  return lead;
}

/**
 * Update lead stage based on call outcome
 */
export function updateLeadFromCallOutcome(leadId: string, outcome: string, callLog: CallLog): Lead | undefined {
  const lead = leads.get(leadId);
  if (!lead) return undefined;

  // Add the call log
  lead.callLogs.push(callLog);
  lead.callAttempts = lead.callLogs.length;
  lead.lastActivity = `Call ${outcome} - ${callLog.date}`;

  // Map VAPI outcome to pipeline stage
  switch (outcome) {
    case "interested":
      lead.stage = "Interested";
      break;
    case "not_interested":
      lead.stage = "Not Interested";
      break;
    case "callback":
      lead.stage = "Callback";
      break;
    case "voicemail":
    case "gatekeeper":
    case "no_answer":
      lead.stage = "Contacted";
      break;
    case "wrong_number":
      lead.stage = "Not Interested";
      break;
    default:
      lead.stage = "Contacted";
  }

  leads.set(leadId, lead);
  return lead;
}

/**
 * Delete a lead
 */
export function deleteLead(id: string): boolean {
  return leads.delete(id);
}
