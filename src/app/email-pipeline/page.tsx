"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { useIsMobile } from "@/hooks/useIsMobile";
import Header from "@/components/Header";
import EmailTemplatesModalView from "@/components/pipeline/EmailTemplatesModal";
import {
  Plus,
  Upload,
  MapPin,
  Phone,
  Mail,
  User,
  Bot,
  TrendingUp,
  Users,
  MailCheck,
  MailX,
  X,
  Loader2,
  Search,
  FileSpreadsheet,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  CheckSquare,
  Square,
  RotateCcw,
  RefreshCw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Stage =
  | "New Lead"
  | "Contacted"
  | "Qualified"
  | "Interested"
  | "Not Interested"
  | "Callback"
  | "Site Visit Requested"
  | "Proposal Requested"
  | "Meeting Booked"
  | "Won"
  | "Installed";

type ContactMethod = "Call" | "Email" | "Call + Email";
type LeadSource = "Manual" | "Excel Import" | "Google Maps";
type PipelineQuickFilter = "all" | "new" | "called" | "interested";

interface CallLog {
  attempt: number;
  date: string;
  duration: string;
  outcome: string;
  summary: string;
}

interface EmailLog {
  date: string;
  status: "Sent" | "Opened" | "Replied" | "Bounced";
  subject: string;
}

interface Lead {
  id: string;
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  distance: string;
  businessType: string;
  source: LeadSource;
  stage: Stage;
  contactMethod: ContactMethod;
  callLogs: CallLog[];
  emailLogs: EmailLog[];
  addedDate: string;
  lastActivity: string;
  callAttempts?: number;
  vapiCallId?: string;
  callbackDate?: string;
  callbackTime?: string;
  contactTitle?: string;
  employeeCount?: string;
  currentVendingStatus?: string;
  currentVendorName?: string;
  productPreferences?: string;
  painPoints?: string[];
  decisionMakerName?: string;
  decisionMakerPhone?: string;
  decisionMakerEmail?: string;
  visitDate?: string;
  visitTime?: string;
  emailSent?: boolean;
  followUp1Sent?: boolean;
  followUp2Sent?: boolean;
  // Pipeline v2 fields — populated by /api/leads/score, the SLA cron, and
  // disposition automation. All optional so legacy leads still render.
  tier?: "A" | "B" | "C";
  tierScore?: number;
  tierReason?: string;
  owner?: string;
  vertical?: string;
  website?: string;
  apolloMobile?: string;
  apolloTitle?: string;
  footTrafficScore?: number;
  maxCallAttempts?: number;
  nextAction?: string;
  nextActionAt?: string;
  notInterestedReason?: string;
  isCallReady?: boolean;
  lastTouchAt?: string;
}

interface CapturedLeadData {
  contactName?: string;
  contactTitle?: string;
  phone?: string;
  email?: string;
  address?: string;
  businessName?: string;
  businessType?: string;
  employeeCount?: string;
  interestLevel?: string;
  currentVendingStatus?: string;
  currentVendorName?: string;
  productPreferences?: string;
  decisionMakerName?: string;
  decisionMakerPhone?: string;
  decisionMakerEmail?: string;
  siteVisit?: string;
  callback?: string;
  notes?: string;
}

interface SchedulerAvailableSlot {
  start_time: string;
  scheduling_url: string;
  status: string;
  invitees_remaining: number;
}

interface BookingStatusMessage {
  type: "success" | "error" | "info";
  message: string;
  actionUrl?: string;
  actionLabel?: string;
}

interface GoogleCalendarStatus {
  connected: boolean;
  calendarId?: string | null;
  connectedAt?: string | null;
}

interface GoogleMapsLeadCandidate {
  placeId: string;
  business: string;
  contact: string;
  contactTitle?: string;
  phone: string;
  email: string;
  address: string;
  distance: string;
  distanceMiles?: number;
  businessType: string;
  source: LeadSource;
  website?: string;
  googleMapsUri?: string;
  importable: boolean;
  reason?: string;
}

interface ExcelLeadCandidate {
  rowNumber: number;
  business: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  businessType: string;
  source: LeadSource;
  importable: boolean;
  reason?: string;
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const stageConfig: Record<string, { color: string; bg: string; border: string }> = {
  "New Lead":              { color: "#64748b", bg: "#f9fafb", border: "#e5e7eb" },
  "Contacted":             { color: "#7c3aed", bg: "#ede9fe", border: "#ddd6fe" },
  "Qualified":             { color: "#0284c7", bg: "#e0f2fe", border: "#bae6fd" },
  "Interested":            { color: "#059669", bg: "#d1fae5", border: "#a7f3d0" },
  "Callback":              { color: "#d97706", bg: "#fef3c7", border: "#fde68a" },
  "Site Visit Requested":  { color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  "Proposal Requested":    { color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  "Meeting Booked":        { color: "#0d9488", bg: "#ccfbf1", border: "#99f6e4" },
  "Won":                   { color: "#15803d", bg: "#bbf7d0", border: "#86efac" },
  "Installed":             { color: "#166534", bg: "#86efac", border: "#4ade80" },
  "Not Interested":        { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  // Legacy names that might still exist in old data
  "Emailed":               { color: "#7c3aed", bg: "#ede9fe", border: "#ddd6fe" },
  "Replied":               { color: "#2563eb", bg: "#dbeafe", border: "#bfdbfe" },
  "Nurturing":             { color: "#d97706", bg: "#fef3c7", border: "#fde68a" },
  "Opted Out":             { color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  "Unsubscribed":          { color: "#6b7280", bg: "#f3f4f6", border: "#d1d5db" },
};

const fallbackStageStyle = { color: "#64748b", bg: "#f9fafb", border: "#e5e7eb" };

const kanbanStages: Stage[] = [
  "New Lead", "Contacted", "Qualified", "Interested",
  "Site Visit Requested", "Meeting Booked", "Won", "Installed", "Not Interested",
];

const EASTERN_TIMEZONE = "America/New_York";
const LIST_PAGE_SIZE = 15;

function formatEasternDateTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

function normalizeText(value?: string) {
  return (value || "").trim().toLowerCase();
}

function normalizePhoneDigits(value?: string) {
  return (value || "").replace(/\D/g, "");
}

function candidateMatchesExistingLead(candidate: GoogleMapsLeadCandidate, leads: Lead[]) {
  const candidateBusiness = normalizeText(candidate.business);
  const candidatePhone = normalizePhoneDigits(candidate.phone);
  const candidateAddress = normalizeText(candidate.address);

  return leads.some((lead) => {
    const sameBusiness = normalizeText(lead.business) === candidateBusiness;
    const samePhone = candidatePhone && normalizePhoneDigits(lead.phone) === candidatePhone;
    const sameAddress = candidateAddress && normalizeText(lead.address) === candidateAddress;
    return sameBusiness && (samePhone || sameAddress);
  });
}

function excelCandidateMatchesExistingLead(candidate: ExcelLeadCandidate, leads: Lead[]) {
  const candidateBusiness = normalizeText(candidate.business);
  const candidatePhone = normalizePhoneDigits(candidate.phone);
  const candidateAddress = normalizeText(candidate.address);

  return leads.some((lead) => {
    const sameBusiness = normalizeText(lead.business) === candidateBusiness;
    const samePhone = candidatePhone && normalizePhoneDigits(lead.phone) === candidatePhone;
    const sameAddress = candidateAddress && normalizeText(lead.address) === candidateAddress;
    return sameBusiness && (samePhone || sameAddress);
  });
}

const EXCEL_HEADER_ALIASES: Record<keyof ExcelMappedColumns, string[]> = {
  business: ["business", "business name", "company", "company name", "organization", "organisation", "account", "location", "site", "facility"],
  contact: ["contact", "contact name", "person", "person name", "name", "full name", "manager", "owner", "decision maker", "decision maker name"],
  phone: ["phone", "phone number", "mobile", "cell", "telephone", "contact number", "direct line", "business phone"],
  email: ["email", "email address", "mail", "contact email"],
  address: ["address", "street address", "street", "full address", "location address", "business address"],
  businessType: ["type", "business type", "industry", "category", "vertical", "segment"],
};

type ExcelMappedColumns = {
  business?: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  businessType?: string;
};

function normalizeHeader(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function detectExcelColumns(headers: string[]): ExcelMappedColumns {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const matched: ExcelMappedColumns = {};

  (Object.keys(EXCEL_HEADER_ALIASES) as Array<keyof ExcelMappedColumns>).forEach((field) => {
    const aliases = EXCEL_HEADER_ALIASES[field];

    const exactMatch = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    if (exactMatch) {
      matched[field] = exactMatch.original;
      return;
    }

    const looseMatch = normalizedHeaders.find((header) =>
      aliases.some((alias) => header.normalized.includes(alias) || alias.includes(header.normalized))
    );

    if (looseMatch) {
      matched[field] = looseMatch.original;
    }
  });

  return matched;
}

function readCellValue(row: Record<string, unknown>, key?: string) {
  if (!key) return "";
  const value = row[key];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseExcelCandidates(rows: Record<string, unknown>[]): { candidates: ExcelLeadCandidate[]; columns: ExcelMappedColumns } {
  const headers = Array.from(
    new Set(
      rows.flatMap((row) => Object.keys(row).filter(Boolean))
    )
  );

  const columns = detectExcelColumns(headers);

  const candidates = rows
    .map((row, index) => {
      const business = readCellValue(row, columns.business);
      const contact = readCellValue(row, columns.contact) || "Front Desk";
      const phone = readCellValue(row, columns.phone);
      const email = readCellValue(row, columns.email);
      const address = readCellValue(row, columns.address);
      const businessType = readCellValue(row, columns.businessType);

      const importable = Boolean(business && phone);
      let reason = "";
      if (!business && !phone) {
        reason = "Missing business and phone";
      } else if (!business) {
        reason = "Missing business name";
      } else if (!phone) {
        reason = "Missing phone number";
      }

      return {
        rowNumber: index + 2,
        business,
        contact,
        phone,
        email,
        address,
        businessType,
        source: "Excel Import" as LeadSource,
        importable,
        reason: reason || undefined,
      };
    })
    .filter((candidate) =>
      candidate.business ||
      candidate.contact ||
      candidate.phone ||
      candidate.email ||
      candidate.address ||
      candidate.businessType
    );

  return { candidates, columns };
}

function hasLeadInsights(lead: Lead) {
  return Boolean(
    lead.contactTitle ||
      lead.employeeCount ||
      lead.currentVendingStatus ||
      lead.currentVendorName ||
      lead.productPreferences ||
      lead.decisionMakerName ||
      lead.decisionMakerPhone ||
      lead.decisionMakerEmail ||
      lead.visitDate ||
      lead.visitTime ||
      lead.callbackDate ||
      lead.callbackTime ||
      lead.emailSent ||
      (lead.painPoints && lead.painPoints.length > 0)
  );
}

function formatLeadSchedule(date?: string, time?: string) {
  if (!date && !time) return undefined;
  if (date && !time) {
    return formatEasternDateTime(date) || date;
  }
  if (!date && time) {
    return time;
  }

  const combined = `${date} ${time}`.trim();
  return formatEasternDateTime(combined) || combined;
}

function getEmailTrackingLabel(lead: Lead) {
  if (lead.followUp2Sent) return "Follow-up 2 sent";
  if (lead.followUp1Sent) return "Follow-up 1 sent";
  if (lead.emailSent) return "Primary email sent";
  if (lead.emailLogs.length > 0) return `${lead.emailLogs.length} email touchpoint${lead.emailLogs.length === 1 ? "" : "s"}`;
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function EmailPipelinePage() {
  const isMobile = useIsMobile();
  const isTablet = useIsMobile(1024);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGoogleMapsModal, setShowGoogleMapsModal] = useState(false);
  const [showExcelImportModal, setShowExcelImportModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<{ leadId: string; message: string; type: "success" | "error" } | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState(true);
  const [capturedByLead, setCapturedByLead] = useState<Record<string, CapturedLeadData | null>>({});
  const [bookingLeadId, setBookingLeadId] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<Record<string, BookingStatusMessage>>({});
  const [bookingOptions, setBookingOptions] = useState<Record<string, SchedulerAvailableSlot[]>>({});
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<GoogleCalendarStatus | null>(null);
  const [googleCalendarBusy, setGoogleCalendarBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [listPage, setListPage] = useState(1);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkCalling, setBulkCalling] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [activeQuickFilter, setActiveQuickFilter] = useState<PipelineQuickFilter>("all");

  const syncPendingEmails = useCallback(async () => {
    try {
      await fetch("/api/email-agent/check-inbox");
    } catch {
      // Inbox check failed — leads will still refresh
    }
  }, []);

  // Fetch leads from API
  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/leads");
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setPipelineLoading(false);
    }
  }, []);

  const fetchGoogleCalendarStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/google-calendar/status");
      const data = await res.json();
      if (res.ok) {
        setGoogleCalendarStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch Google Calendar status:", error);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    fetchGoogleCalendarStatus();
    // Check inbox once on mount
    syncPendingEmails();
  }, [fetchGoogleCalendarStatus, fetchLeads, syncPendingEmails]);

  useEffect(() => {
    // Refresh leads every 30s (lightweight — just reads DB)
    const leadsInterval = window.setInterval(() => {
      fetchLeads();
    }, 30000);

    // Check inbox every 5 min (heavy — connects IMAP + classifies)
    const inboxInterval = window.setInterval(() => {
      syncPendingEmails();
    }, 5 * 60 * 1000);

    const handleFocus = () => {
      fetchLeads();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(leadsInterval);
      window.clearInterval(inboxInterval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchLeads, syncPendingEmails]);

  const connectGoogleCalendar = () => {
    window.open("/api/google-calendar/connect", "_blank", "noopener,noreferrer");
  };

  const disconnectGoogleCalendar = async () => {
    setGoogleCalendarBusy(true);
    try {
      const res = await fetch("/api/google-calendar/status", {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to disconnect Google Calendar.");
      }

      setGoogleCalendarStatus({
        connected: false,
        calendarId: null,
        connectedAt: null,
      });
      setCallStatus({
        leadId: "calendar",
        message: data.message || "Google Calendar disconnected.",
        type: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to disconnect Google Calendar.";
      setCallStatus({
        leadId: "calendar",
        message,
        type: "error",
      });
    } finally {
      setGoogleCalendarBusy(false);
    }
  };

  useEffect(() => {
    if (!expandedLead || capturedByLead[expandedLead] !== undefined) {
      return;
    }

    const lead = leads.find((item) => item.id === expandedLead);
    if (!lead?.vapiCallId && lead?.emailLogs.length === 0) {
      setCapturedByLead((current) => ({ ...current, [expandedLead]: null }));
      return;
    }

    let isCancelled = false;

    const fetchCapturedLeadData = async () => {
      try {
        const res = await fetch(`/api/leads/${expandedLead}/captured`);
        if (!res.ok) {
          throw new Error("Failed to fetch captured lead data");
        }

        const data = await res.json();
        if (!isCancelled) {
          setCapturedByLead((current) => ({
            ...current,
            [expandedLead]: data.captured || null,
          }));
        }
      } catch (error) {
        console.error("Failed to fetch captured lead data:", error);
        if (!isCancelled) {
          setCapturedByLead((current) => ({ ...current, [expandedLead]: null }));
        }
      }
    };

    fetchCapturedLeadData();

    return () => {
      isCancelled = true;
    };
  }, [capturedByLead, expandedLead, leads]);

  // Send email to a single lead
  const triggerCall = async (leadId: string) => {
    setCallingLeadId(leadId);
    setCallStatus(null);
    try {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead?.email) {
        setCallStatus({ leadId, message: "Lead has no email address", type: "error" });
        return;
      }
      const res = await fetch("/api/email-agent/send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: [{ id: lead.id, email: lead.email, contact: lead.contact, business: lead.business }],
          templateStage: "primary",
        }),
      });
      const data = await res.json();
      if (res.ok && data.sent > 0) {
        setCallStatus({ leadId, message: `Email sent to ${lead.email}!`, type: "success" });
        fetchLeads();
      } else {
        setCallStatus({ leadId, message: data.error || data.results?.[0]?.error || "Failed to send email", type: "error" });
      }
    } catch {
      setCallStatus({ leadId, message: "Network error — could not send email", type: "error" });
    } finally {
      setCallingLeadId(null);
    }
  };

  // Check inbox for new replies
  const [checkingInbox, setCheckingInbox] = useState(false);
  const [lastInboxCheck, setLastInboxCheck] = useState<string | null>(null);
  const checkInbox = async () => {
    setCheckingInbox(true);
    try {
      const res = await fetch("/api/email-agent/check-inbox");
      const data = await res.json();
      if (res.ok) {
        setLastInboxCheck(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET");
        if (data.matched > 0) {
          setCallStatus({ leadId: "inbox", message: `Found ${data.matched} new replies — stages updated automatically`, type: "success" });
          fetchLeads();
        } else if (data.processed > 0) {
          setCallStatus({ leadId: "inbox", message: `Checked ${data.processed} messages — no new lead replies`, type: "success" });
        } else {
          setCallStatus({ leadId: "inbox", message: "No new messages in inbox", type: "success" });
        }
      } else {
        setCallStatus({ leadId: "inbox", message: data.error || "Failed to check inbox", type: "error" });
      }
    } catch {
      setCallStatus({ leadId: "inbox", message: "Could not connect to inbox", type: "error" });
    } finally {
      setCheckingInbox(false);
    }
  };

  // Auto-check inbox every 5 minutes
  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((current) =>
      current.includes(leadId)
        ? current.filter((item) => item !== leadId)
        : [...current, leadId]
    );
  };

  const clearLeadSelection = () => {
    setSelectedLeadIds([]);
  };

  const launchBulkCalls = async () => {
    const selectedLeads = leads.filter((lead) => selectedLeadIds.includes(lead.id));
    const emailableLeads = selectedLeads
      .filter((lead) => Boolean(lead.email))
      .slice(0, 50);

    if (emailableLeads.length === 0) {
      setCallStatus({
        leadId: "bulk-email",
        message: "Select at least one lead with an email address.",
        type: "error",
      });
      return;
    }

    setBulkCalling(true);
    setCallStatus(null);

    try {
      const res = await fetch("/api/email-agent/send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: emailableLeads.map((l) => ({
            id: l.id,
            email: l.email,
            contact: l.contact,
            business: l.business,
          })),
          templateStage: "primary",
        }),
      });
      const data = await res.json();
      const sent = data.sent || 0;
      const failed = data.failed || 0;

      setCallStatus({
        leadId: "bulk-email",
        message: failed > 0
          ? `Sent ${sent} emails, ${failed} failed.`
          : `Sent ${sent} emails successfully!`,
        type: sent > 0 ? "success" : "error",
      });
    } catch {
      setCallStatus({
        leadId: "bulk-email",
        message: "Network error — could not send emails.",
        type: "error",
      });
    }

    setBulkCalling(false);
    setSelectedLeadIds([]);
    fetchLeads();
  };

  const removeLead = async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads?id=${encodeURIComponent(leadId)}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete lead.");
      }

      setLeads((current) => current.filter((lead) => lead.id !== leadId));
      setCapturedByLead((current) => {
        const next = { ...current };
        delete next[leadId];
        return next;
      });
      setBookingStatus((current) => {
        const next = { ...current };
        delete next[leadId];
        return next;
      });
      setBookingOptions((current) => {
        const next = { ...current };
        delete next[leadId];
        return next;
      });
      if (expandedLead === leadId) {
        setExpandedLead(null);
      }
      setCallStatus({ leadId, message: "Lead deleted.", type: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete lead.";
      setCallStatus({ leadId, message, type: "error" });
    }
  };

  const bookCalendlyMeeting = async (leadId: string, startTime?: string) => {
    setBookingLeadId(leadId);
    setBookingStatus((current) => {
      const next = { ...current };
      delete next[leadId];
      return next;
    });

    try {
      const res = await fetch("/api/calendly/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, ...(startTime ? { startTime } : {}) }),
      });
      const data = await res.json();

      if (res.ok && data.booked) {
        setBookingStatus((current) => ({
          ...current,
          [leadId]: {
            type: "success",
            message: data.autoAdjusted
              ? `Requested time was unavailable, so Google Calendar booked the nearest slot: ${formatEasternDateTime(data.booking.startTime)}`
              : `Google Calendar meeting booked for ${formatEasternDateTime(data.booking.startTime)}`,
          },
        }));
        setBookingOptions((current) => ({ ...current, [leadId]: [] }));
        fetchLeads();
        return;
      }

      if (data.unavailable) {
        setBookingStatus((current) => ({
          ...current,
          [leadId]: {
            type: "info",
            message: "Requested time is unavailable in Google Calendar. Pick one of the nearby open slots below.",
          },
        }));
        setBookingOptions((current) => ({ ...current, [leadId]: data.availableSlots || [] }));
        return;
      }

      if (data.schedulingRequired) {
        setBookingStatus((current) => ({
          ...current,
          [leadId]: {
            type: "info",
            message:
              data.error ||
              "Google Calendar is not connected yet. Connect it once to enable booking and invite sending.",
            actionUrl: data.schedulingUrl,
            actionLabel: data.schedulingUrl === "/api/google-calendar/connect" ? "Connect Google Calendar" : "Open Scheduling Link",
          },
        }));
        setBookingOptions((current) => ({ ...current, [leadId]: [] }));
        return;
      }

      setBookingStatus((current) => ({
        ...current,
        [leadId]: {
          type: "error",
          message: data.error || "Failed to book Google Calendar meeting.",
        },
      }));
    } catch {
      setBookingStatus((current) => ({
        ...current,
        [leadId]: {
          type: "error",
          message: "Network error while booking Google Calendar meeting.",
        },
      }));
    } finally {
      setBookingLeadId(null);
    }
  };

  const quickFilteredLeads = useMemo(() => {
    switch (activeQuickFilter) {
      case "new":
        return leads.filter((lead) => lead.stage === "New Lead");
      case "called":
        return leads.filter((lead) => lead.emailLogs.length > 0 || lead.stage === "Contacted");
      case "interested":
        return leads.filter((lead) =>
          ["Interested", "Site Visit Requested"].includes(lead.stage)
        );
      default:
        return leads;
    }
  }, [activeQuickFilter, leads]);

  const filteredLeads = useMemo(() => {
    const query = normalizeText(searchQuery);
    if (!query) return quickFilteredLeads;

    return quickFilteredLeads.filter((lead) => {
      const haystack = [
        lead.business,
        lead.contact,
        lead.phone,
        lead.email,
        lead.address,
        lead.businessType,
        lead.stage,
        lead.source,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [quickFilteredLeads, searchQuery]);

  const totalListPages = Math.max(1, Math.ceil(filteredLeads.length / LIST_PAGE_SIZE));

  useEffect(() => {
    setListPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (listPage > totalListPages) {
      setListPage(totalListPages);
    }
  }, [listPage, totalListPages]);

  useEffect(() => {
    const visibleLeadIds = new Set(filteredLeads.map((lead) => lead.id));
    setSelectedLeadIds((current) => current.filter((leadId) => visibleLeadIds.has(leadId)));
  }, [filteredLeads]);

  const paginatedLeads = useMemo(() => {
    const startIndex = (listPage - 1) * LIST_PAGE_SIZE;
    return filteredLeads.slice(startIndex, startIndex + LIST_PAGE_SIZE);
  }, [filteredLeads, listPage]);

  const selectedVisibleLeads = useMemo(
    () => leads.filter((lead) => selectedLeadIds.includes(lead.id)),
    [leads, selectedLeadIds]
  );

  const callableSelectedLeads = useMemo(
    () => selectedVisibleLeads.filter((lead) => Boolean(lead.email)),
    [selectedVisibleLeads]
  );

  const totalEmails = leads.reduce((s, l) => s + l.emailLogs.length, 0);
  const interested = leads.filter((l) => ["Interested", "Site Visit Requested"].includes(l.stage)).length;

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header title="Email Pipeline" />

      <div className="page-padding" style={{ padding: isMobile ? 16 : "24px 32px" }}>
        {pipelineLoading && (
          <div style={{
            marginBottom: 20,
            background: "#fff",
            border: "1px solid #d5d9e2",
            borderRadius: 14,
            padding: isMobile ? "18px 16px" : "20px 22px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#475569",
            boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          }}>
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Loading pipeline</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                Pulling leads, email history, and activity data.
              </div>
            </div>
          </div>
        )}

        {/* Stat Cards */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatBox
            icon={<Users size={20} color="#16a34a" />}
            iconBg="#dcfce7"
            label="Total Leads"
            value={`${leads.length}`}
            sub={`${leads.filter(l => l.stage === "New Lead").length} pending first email`}
            active={activeQuickFilter === "all" || activeQuickFilter === "new"}
            onClick={() => setActiveQuickFilter((current) => current === "new" ? "all" : "new")}
          />
          <StatBox
            icon={<Mail size={20} color="#7c3aed" />}
            iconBg="#ede9fe"
            label="Emails Sent"
            value={`${totalEmails}`}
            sub={`${leads.filter(l => l.emailLogs.some(e => e.status === "Replied")).length} replies received`}
            active={activeQuickFilter === "called"}
            onClick={() => setActiveQuickFilter((current) => current === "called" ? "all" : "called")}
          />
          <StatBox
            icon={<TrendingUp size={20} color="#059669" />}
            iconBg="#d1fae5"
            label="Interested"
            value={`${interested}`}
            sub={`${leads.filter(l => l.stage === "Site Visit Requested").length} meetings booked`}
            active={activeQuickFilter === "interested"}
            onClick={() => setActiveQuickFilter((current) => current === "interested" ? "all" : "interested")}
          />
          <StatBox
            icon={<MailCheck size={20} color="#d97706" />}
            iconBg="#fef3c7"
            label="Awaiting Reply"
            value={`${leads.filter(l => l.stage === "Contacted").length}`}
            sub="Leads emailed, waiting for response"
            active={false}
            onClick={() => {}}
          />
        </div>

        {/* Toolbar */}
        <div style={{
          display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", marginBottom: 20,
          flexWrap: "wrap", gap: isMobile ? 10 : 12, flexDirection: isMobile ? "column" : "row",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1 }}>
            <div style={{ display: "flex", background: "#fff", borderRadius: 8, border: "1px solid #d5d9e2", overflow: "hidden" }}>
              {(["kanban", "list"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer",
                  background: view === v ? "#16a34a" : "transparent",
                  color: view === v ? "#fff" : "#6b7280",
                  textTransform: "capitalize" as const,
                }}>{v === "kanban" ? "Board" : "List"}</button>
              ))}
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: isMobile ? "100%" : 280,
              flex: isMobile ? undefined : 1,
              maxWidth: isMobile ? "100%" : 360,
              background: "#fff",
              borderRadius: 8,
              border: "1px solid #d5d9e2",
              padding: "0 12px",
            }}>
              <Search size={14} color="#94a3b8" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leads, phone, email, address..."
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 13,
                  color: "#0f172a",
                  padding: "10px 0",
                }}
              />
            </div>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>
              {filteredLeads.length} of {leads.length} leads · {kanbanStages.length} stages
            </span>
            <span style={{ fontSize: 13, color: "#94a3b8", display: "none" }}>
              {leads.length} leads · {kanbanStages.length} stages
            </span>
          </div>

          <div className="pipeline-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={launchBulkCalls}
              disabled={bulkCalling || callableSelectedLeads.length === 0}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
                background: callableSelectedLeads.length === 0 ? "#f8fafc" : "#7c3aed",
                color: callableSelectedLeads.length === 0 ? "#94a3b8" : "#fff",
                border: callableSelectedLeads.length === 0 ? "1px solid #d5d9e2" : "none",
                borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: callableSelectedLeads.length === 0 || bulkCalling ? "not-allowed" : "pointer",
                opacity: bulkCalling ? 0.7 : 1,
              }}
            >
              {bulkCalling ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Sending...</> : <><CheckSquare size={14} /> Email Selected</>}
            </button>
            {selectedLeadIds.length > 0 && (
              <button onClick={clearLeadSelection} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
                background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}><RotateCcw size={14} /> Clear Selection</button>
            )}
            <button
              onClick={checkInbox}
              disabled={checkingInbox}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
                background: "#0369a1", color: "#fff", border: "none", borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: checkingInbox ? "not-allowed" : "pointer",
                opacity: checkingInbox ? 0.7 : 1,
              }}
            >
              {checkingInbox ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Checking...</> : <><RefreshCw size={14} /> Check Inbox</>}
            </button>
            {lastInboxCheck && (
              <span style={{ fontSize: 11, color: "#94a3b8", alignSelf: "center" }}>Last: {lastInboxCheck}</span>
            )}
            <button onClick={() => setShowExcelImportModal(true)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}><FileSpreadsheet size={14} /> Import Excel</button>
            <button style={{
              display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
              background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }} onClick={() => setShowGoogleMapsModal(true)}><MapPin size={14} /> Google Maps</button>
            <button
              onClick={() => setShowTemplateModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 16px",
                background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            ><Settings2 size={14} /> Email Templates</button>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            ><Plus size={16} /> Add Lead</button>
          </div>
        </div>

        <div style={{
          marginBottom: 16,
          padding: isMobile ? "12px 14px" : "14px 16px",
          borderRadius: 12,
          border: "1px solid #d5d9e2",
          background: "#fff",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
              Google Calendar Account
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
              {googleCalendarStatus?.connected
                ? `Connected to ${googleCalendarStatus.calendarId || "primary"}${googleCalendarStatus.connectedAt ? ` · ${formatEasternDateTime(googleCalendarStatus.connectedAt)}` : ""}`
                : "No Google Calendar account connected yet."}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {googleCalendarStatus?.connected ? (
              <>
                <button
                  onClick={disconnectGoogleCalendar}
                  disabled={googleCalendarBusy}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    background: "#fff1f2",
                    color: "#be123c",
                    border: "1px solid #fecdd3",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: googleCalendarBusy ? "not-allowed" : "pointer",
                    opacity: googleCalendarBusy ? 0.7 : 1,
                  }}
                >
                  {googleCalendarBusy ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Disconnecting...</> : "Disconnect Calendar"}
                </button>
                <button
                  onClick={connectGoogleCalendar}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    background: "#fff",
                    color: "#0f172a",
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Connect Different Account
                </button>
              </>
            ) : (
              <button
                onClick={connectGoogleCalendar}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  background: "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Connect Google Calendar
              </button>
            )}
          </div>
        </div>

        {/* Call Status Toast */}
        {callStatus && (
          <div style={{
            marginBottom: 16, padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: callStatus.type === "success" ? "#dcfce7" : "#fef2f2",
            color: callStatus.type === "success" ? "#166534" : "#991b1b",
            border: `1px solid ${callStatus.type === "success" ? "#a7f3d0" : "#fecaca"}`,
          }}>
            <span>{callStatus.message}</span>
            <button onClick={() => setCallStatus(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <X size={14} color={callStatus.type === "success" ? "#166534" : "#991b1b"} />
            </button>
          </div>
        )}

        {/* Empty State */}
        {!pipelineLoading && leads.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 20px", background: "#fff",
            borderRadius: 14, border: "1px solid #d5d9e2",
          }}>
            <Users size={48} color="#d1d5db" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: "#374151", marginBottom: 8 }}>No leads yet</div>
            <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 20 }}>
              Add your first lead manually to get started, then send outreach emails.
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 24px",
                background: "#16a34a", color: "#fff", border: "none", borderRadius: 10,
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            ><Plus size={18} /> Add First Lead</button>
          </div>
        )}

        {!pipelineLoading && leads.length > 0 && filteredLeads.length === 0 && (
          <div style={{
            padding: "32px 24px",
            borderRadius: 14,
            border: "1px solid #d5d9e2",
            background: "#fff",
            textAlign: "center",
            color: "#64748b",
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>No matching leads</div>
            <div style={{ fontSize: 13 }}>
              Try a different search term or clear the search box to see the full pipeline again.
            </div>
          </div>
        )}

        {/* ========== KANBAN VIEW ========== */}
        {!pipelineLoading && filteredLeads.length > 0 && view === "kanban" && (
          <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 240px)" }}>
          <div className="kanban-grid" style={{
            display: "grid",
            gridTemplateColumns: `repeat(${kanbanStages.length}, minmax(200px, 1fr))`,
            gap: 10, overflowX: "auto", paddingBottom: 16, alignItems: "start",
          }}>
            {kanbanStages.map((stage) => {
              const sc = stageConfig[stage] || fallbackStageStyle;
              const stageLeads = filteredLeads.filter((l) => l.stage === stage);
              const visibleStageLeads = stageLeads;
              return (
                <div key={stage} style={{
                  background: sc.bg, borderRadius: 12, border: `1px solid ${sc.border}`,
                  display: "flex", flexDirection: "column", minHeight: 280, maxHeight: "calc(100vh - 260px)",
                }}>
                  <div style={{
                    padding: "12px 14px", borderBottom: `2px solid ${sc.border}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.color }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{stage}</span>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: sc.color,
                      background: "#fff", padding: "2px 7px", borderRadius: 10,
                      border: `1px solid ${sc.border}`,
                    }}>{stageLeads.length}</span>
                  </div>

                  <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, flex: 1, overflowY: "auto" }}>
                    {visibleStageLeads.map((lead) => (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        expanded={expandedLead === lead.id}
                        onToggle={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)}
                        onTriggerCall={() => triggerCall(lead.id)}
                        onDelete={() => removeLead(lead.id)}
                        isCalling={callingLeadId === lead.id}
                        selected={selectedLeadIds.includes(lead.id)}
                        onSelect={() => toggleLeadSelection(lead.id)}
                        onEdit={() => setEditingLead(lead)}
                        onBooked={fetchLeads}
                      />
                    ))}
                    {stageLeads.length === 0 && (
                      <div style={{ padding: "20px 0", textAlign: "center", fontSize: 11, color: "#d1d5db" }}>
                        No leads
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}

        {/* ========== LIST VIEW ========== */}
        {!pipelineLoading && filteredLeads.length > 0 && view === "list" && (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid #d5d9e2",
            boxShadow: "0 2px 6px rgba(0,0,0,0.06)", overflow: "hidden", minWidth: 800,
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.8fr 1fr 90px 100px 130px 110px 90px",
              padding: "14px 22px", borderBottom: "1px solid #e5e7eb", background: "#f1f5f9",
            }}>
              <TH>Business</TH>
              <TH>Contact</TH>
              <TH>Source</TH>
              <TH>Emails</TH>
              <TH>Stage</TH>
              <TH>Last Activity</TH>
              <TH>Action</TH>
            </div>
            {paginatedLeads.map((l) => {
              const sc = stageConfig[l.stage] || fallbackStageStyle;
              return (
                <div key={l.id}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.8fr 1fr 90px 100px 130px 110px 90px",
                      padding: "14px 22px", borderBottom: "1px solid #f3f4f6", alignItems: "center",
                      cursor: "pointer", transition: "background 0.1s",
                      background: expandedLead === l.id ? "#f9fafb" : "transparent",
                    }}
                    onClick={() => setExpandedLead(expandedLead === l.id ? null : l.id)}
                    onMouseEnter={(e) => { if (expandedLead !== l.id) e.currentTarget.style.background = "#fafafa"; }}
                    onMouseLeave={(e) => { if (expandedLead !== l.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{l.business}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <MapPin size={10} /> {l.address} · {l.distance}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: "#374151" }}>{l.contact}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{l.phone}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: "#64748b", background: "#e2e8f0", padding: "3px 8px", borderRadius: 10 }}>
                        {l.source === "Google Maps" ? "Maps" : l.source === "Excel Import" ? "Excel" : "Manual"}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                        {l.emailLogs.length}
                      </span>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {l.emailLogs.filter(e => e.status === "Replied").length > 0
                          ? `${l.emailLogs.filter(e => e.status === "Replied").length} replied`
                          : l.email || "No email"}
                      </div>
                      {getEmailTrackingLabel(l) && (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                          {getEmailTrackingLabel(l)}
                        </div>
                      )}
                    </div>
                    <div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: sc.color, background: sc.bg,
                        padding: "4px 10px", borderRadius: 10, border: `1px solid ${sc.border}`,
                      }}>{l.stage}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {l.lastActivity}
                      {formatLeadSchedule(l.callbackDate, l.callbackTime) && (
                        <div style={{ color: "#b45309", marginTop: 4 }}>
                          Follow-up: {formatLeadSchedule(l.callbackDate, l.callbackTime)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLeadSelection(l.id);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "6px 10px",
                          background: selectedLeadIds.includes(l.id) ? "#f0fdf4" : "#fff",
                          color: selectedLeadIds.includes(l.id) ? "#166534" : "#475569",
                          border: `1px solid ${selectedLeadIds.includes(l.id) ? "#a7f3d0" : "#d5d9e2"}`,
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {selectedLeadIds.includes(l.id) ? <CheckSquare size={12} /> : <Square size={12} />}
                        {selectedLeadIds.includes(l.id) ? "Selected" : "Select"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); triggerCall(l.id); }}
                        disabled={callingLeadId === l.id || !l.email}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
                          background: !l.email ? "#e5e7eb" : "#7c3aed",
                          color: !l.email ? "#94a3b8" : "#fff",
                          border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600,
                          cursor: !l.email ? "not-allowed" : "pointer",
                          opacity: callingLeadId === l.id ? 0.7 : 1,
                        }}
                      >
                        {callingLeadId === l.id ? (
                          <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Sending...</>
                        ) : !l.email ? (
                          "No Email"
                        ) : (
                          <><Mail size={12} /> Email</>
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingLead(l);
                        }}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px",
                          background: "#fff", color: "#475569", border: "1px solid #d5d9e2",
                          borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        <Pencil size={12} /> Edit
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedLead === l.id && (l.emailLogs.length > 0 || hasLeadInsights(l)) && (
                    <div style={{
                      padding: "16px 22px 20px", background: "#f1f5f9",
                      borderBottom: "1px solid #e5e7eb",
                    }}>
                      {hasLeadInsights(l) && (
                        <LeadInsightsPanel lead={l} captured={capturedByLead[l.id]} />
                      )}
                      {(l.stage === "Site Visit Requested" || Boolean(l.visitDate)) && (
                        <CalendlyBookingPanel
                          lead={l}
                          status={bookingStatus[l.id] || null}
                          options={bookingOptions[l.id] || []}
                          isBooking={bookingLeadId === l.id}
                          onBook={() => bookCalendlyMeeting(l.id)}
                          onBookAlternative={(slot) => bookCalendlyMeeting(l.id, slot.start_time)}
                        />
                      )}
                      {/* Email activity summary */}
                      {l.lastActivity && (
                        <div style={{
                          marginBottom: l.emailLogs.length > 0 ? 14 : 0,
                          background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, padding: "12px 14px",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <Bot size={12} color="#7c3aed" />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>AI Agent Summary</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                            {l.lastActivity}
                          </div>
                        </div>
                      )}
                      {l.emailLogs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                            <Mail size={13} /> Email History
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {l.emailLogs.map((em, i) => (
                              <div key={i} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                background: "#fff", border: "1px solid #d5d9e2", borderRadius: 8, padding: "10px 14px",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {em.status === "Replied" ? <MailCheck size={14} color="#059669" /> :
                                   em.status === "Bounced" ? <MailX size={14} color="#dc2626" /> :
                                   <Mail size={14} color="#6b7280" />}
                                  <span style={{ fontSize: 12, color: "#374151" }}>{em.subject}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{
                                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                                    color: em.status === "Replied" ? "#059669" : em.status === "Opened" ? "#16a34a" : em.status === "Bounced" ? "#dc2626" : "#6b7280",
                                    background: em.status === "Replied" ? "#d1fae5" : em.status === "Opened" ? "#dcfce7" : em.status === "Bounced" ? "#fef2f2" : "#e2e8f0",
                                  }}>{em.status}</span>
                                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{em.date}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 22px",
              borderTop: "1px solid #e5e7eb",
              background: "#f8fafc",
              flexWrap: "wrap",
            }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Showing {paginatedLeads.length === 0 ? 0 : (listPage - 1) * LIST_PAGE_SIZE + 1} - {Math.min(listPage * LIST_PAGE_SIZE, filteredLeads.length)} of {filteredLeads.length} filtered leads
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setListPage(1)}
                  disabled={listPage === 1}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #d5d9e2",
                    background: "#fff",
                    color: listPage === 1 ? "#94a3b8" : "#374151",
                    cursor: listPage === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  First
                </button>
                <button
                  onClick={() => setListPage((current) => Math.max(1, current - 1))}
                  disabled={listPage === 1}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #d5d9e2",
                    background: "#fff",
                    color: listPage === 1 ? "#94a3b8" : "#374151",
                    cursor: listPage === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>
                  Page {listPage} of {totalListPages}
                </span>
                <button
                  onClick={() => setListPage((current) => Math.min(totalListPages, current + 1))}
                  disabled={listPage === totalListPages}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #d5d9e2",
                    background: "#fff",
                    color: listPage === totalListPages ? "#94a3b8" : "#374151",
                    cursor: listPage === totalListPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => setListPage(totalListPages)}
                  disabled={listPage === totalListPages}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #d5d9e2",
                    background: "#fff",
                    color: listPage === totalListPages ? "#94a3b8" : "#374151",
                    cursor: listPage === totalListPages ? "not-allowed" : "pointer",
                  }}
                >
                  Last
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Info */}
        <div style={{
          marginTop: 16, padding: "14px 18px", background: "#ede9fe",
          border: "1px solid #ddd6fe", borderRadius: 10, fontSize: 12, color: "#5b21b6",
          lineHeight: 1.6,
        }}>
          <strong>How it works:</strong> Leads are imported via Excel or Google Maps (25mi radius), or added manually.
          Email agent sends outreach and auto-replies using AI — stages update automatically when leads respond.
          Replies are classified as Interested, Callback, Site Visit Requested, or Not Interested.
          The AI salesman auto-replies to interested leads and works toward scheduling site visits.
        </div>
      </div>

      {/* ========== ADD LEAD MODAL ========== */}
      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setShowAddModal(false); fetchLeads(); }}
        />
      )}

      {editingLead && (
        <AddLeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onAdded={() => {
            setEditingLead(null);
            fetchLeads();
          }}
        />
      )}

      {showGoogleMapsModal && (
        <GoogleMapsModal
          existingLeads={leads}
          onClose={() => setShowGoogleMapsModal(false)}
          onImported={(message) => {
            setCallStatus({ leadId: "google-maps", message, type: "success" });
            fetchLeads();
          }}
          onError={(message) => {
            setCallStatus({ leadId: "google-maps", message, type: "error" });
          }}
        />
      )}

      {showExcelImportModal && (
        <ExcelImportModal
          existingLeads={leads}
          onClose={() => setShowExcelImportModal(false)}
          onImported={(message) => {
            setShowExcelImportModal(false);
            setCallStatus({ leadId: "excel-import", message, type: "success" });
            fetchLeads();
          }}
          onError={(message) => {
            setCallStatus({ leadId: "excel-import", message, type: "error" });
          }}
        />
      )}

      {showTemplateModal && (
        <EmailTemplatesModalView
          onClose={() => setShowTemplateModal(false)}
          onSaved={(message) => {
            setShowTemplateModal(false);
            setCallStatus({ leadId: "templates", message, type: "success" });
          }}
          onError={(message) => {
            setCallStatus({ leadId: "templates", message, type: "error" });
          }}
        />
      )}

      {/* Spinner animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Lead Modal                                                     */
/* ------------------------------------------------------------------ */

function AddLeadModal({
  lead,
  onClose,
  onAdded,
}: {
  lead?: Lead;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    business: lead?.business || "",
    contact: lead?.contact || "",
    phone: lead?.phone || "",
    email: lead?.email || "",
    address: lead?.address || "",
    distance: lead?.distance || "",
    businessType: lead?.businessType || "",
    contactMethod: (lead?.contactMethod || "Call") as ContactMethod,
    // v2 fields — populated by Apollo enrich or set manually
    owner: lead?.owner || "",
    vertical: lead?.vertical || "",
    website: lead?.website || "",
    employeeCount: lead?.employeeCount || "",
    footTrafficScore: lead?.footTrafficScore?.toString() || "",
    apolloMobile: lead?.apolloMobile || "",
  });

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.business || !form.contact || !form.phone) {
      setError("Business name, contact name, and phone are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // Coerce numeric v2 fields. Empty strings → undefined so we don't
      // overwrite existing data with blanks.
      const footTraffic = form.footTrafficScore.trim();
      const payload: Record<string, unknown> = {
        ...(lead ? { id: lead.id } : {}),
        ...form,
        footTrafficScore: footTraffic ? Number(footTraffic) : undefined,
        source: lead?.source || "Manual",
      };
      const res = await fetch("/api/leads", {
        method: lead ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        onAdded();
      } else {
        const data = await res.json();
        setError(data.error || `Failed to ${lead ? "update" : "add"} lead`);
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 13, border: "1px solid #d5d9e2",
    borderRadius: 8, outline: "none", background: "#fff", color: "#0f172a",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: "#dcfce7",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Plus size={18} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                {lead ? "Edit Lead" : "Add New Lead"}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                {lead ? "Update the lead details used for calling, email, and follow-up." : "Enter lead details to add to pipeline"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color="#94a3b8" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px" }}>
          {error && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fef2f2", color: "#991b1b", borderRadius: 8, fontSize: 12, border: "1px solid #fecaca" }}>
              {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Business Name *</label>
              <input style={inputStyle} placeholder="e.g., ABC Logistics" value={form.business} onChange={(e) => update("business", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Business Type</label>
              <input style={inputStyle} placeholder="e.g., Warehouse, Office" value={form.businessType} onChange={(e) => update("businessType", e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Contact Name *</label>
              <input style={inputStyle} placeholder="e.g., John Smith" value={form.contact} onChange={(e) => update("contact", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Phone Number *</label>
              <input style={inputStyle} placeholder="e.g., (713) 555-0142" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" placeholder="e.g., john@abclogistics.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Address</label>
              <input style={inputStyle} placeholder="e.g., 2100 N Loop W, Houston" value={form.address} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Distance</label>
              <input style={inputStyle} placeholder="e.g., 8 mi" value={form.distance} onChange={(e) => update("distance", e.target.value)} />
            </div>
          </div>

          {/* ── Pipeline v2 fields ─────────────────────────────────────
              Owner / vertical drive ownership + tier scoring.
              Website lets Apollo enrichment find the company.
              Foot traffic + employee count feed the A/B/C tier engine. */}
          <div style={{
            marginBottom: 14, padding: 10, borderRadius: 8,
            border: "1px solid #e0f2fe", background: "#f0f9ff",
            fontSize: 11, color: "#0369a1", fontWeight: 600,
          }}>
            Qualification data (used by tier scoring)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Owner</label>
              <input style={inputStyle} placeholder="Assign to caller / SDR" value={form.owner} onChange={(e) => update("owner", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Vertical</label>
              <select style={inputStyle} value={form.vertical} onChange={(e) => update("vertical", e.target.value)}>
                <option value="">— Select —</option>
                <option value="Auto Dealership">Auto Dealership</option>
                <option value="Construction Supply">Construction Supply</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Warehousing">Warehousing</option>
                <option value="Office Park">Office Park</option>
                <option value="Call Center">Call Center</option>
                <option value="Gym">Gym</option>
                <option value="Hospital">Hospital</option>
                <option value="Hotel">Hotel</option>
                <option value="School">School</option>
                <option value="Car Wash">Car Wash</option>
                <option value="Apartments">Apartments</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Website</label>
              <input style={inputStyle} placeholder="e.g., abclogistics.com" value={form.website} onChange={(e) => update("website", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Apollo mobile</label>
              <input style={inputStyle} placeholder="DM mobile (vs main line)" value={form.apolloMobile} onChange={(e) => update("apolloMobile", e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Employee count</label>
              <input style={inputStyle} type="number" placeholder="e.g., 75" value={form.employeeCount} onChange={(e) => update("employeeCount", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Foot traffic score (Thomasnet)</label>
              <input style={inputStyle} type="number" placeholder="0-100" value={form.footTrafficScore} onChange={(e) => update("footTrafficScore", e.target.value)} />
            </div>
          </div>

          <div style={{
            marginBottom: 20,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #dcfce7",
            background: "#f0fdf4",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 4 }}>
              Outreach method
            </div>
            <div style={{ fontSize: 12, color: "#15803d", lineHeight: 1.5 }}>
              Manual leads added here will start in the calling workflow. Email follow-up still works automatically later if the call is missed and an email exists on the lead.
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px", fontSize: 13, fontWeight: 500,
                background: "#fff", color: "#374151", border: "1px solid #d5d9e2", borderRadius: 8,
                cursor: "pointer",
              }}
            >Cancel</button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 24px", fontSize: 13, fontWeight: 600,
                background: "#16a34a", color: "#fff", border: "none", borderRadius: 8,
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {saving ? (
                <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Saving...</>
              ) : lead ? (
                <><Pencil size={14} /> Save Changes</>
              ) : (
                <><Plus size={14} /> Add Lead</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* function EmailTemplatesModal({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const isMobile = useIsMobile(768);
  const [activeStage, setActiveStage] = useState<OutreachTemplateStage>("primary");
  const [templates, setTemplates] = useState<OutreachTemplateMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      try {
        const res = await fetch("/api/outreach/templates");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load email templates.");
        }

        if (!cancelled) {
          setTemplates(data.templates as OutreachTemplateMap);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load email templates.";
        if (!cancelled) {
          setError(message);
          onError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [onError]);

  const updateTemplate = (field: "subject" | "body", value: string) => {
    setTemplates((current) => {
      if (!current) return current;
      return {
        ...current,
        [activeStage]: {
          ...current[activeStage],
          [field]: value,
        },
      };
    });
  };

  const saveTemplates = async () => {
    if (!templates) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/outreach/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save email templates.");
      }

      setTemplates(data.templates as OutreachTemplateMap);
      onSaved("Email templates updated. New triggered emails will use the latest version.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Failed to save email templates.";
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  const template = templates?.[activeStage];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
        padding: isMobile ? 12 : 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? "100%" : "min(920px, calc(100vw - 48px))",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #d5d9e2",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div style={{
          padding: isMobile ? "16px" : "18px 22px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Email Templates</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              Change the copy here and every new triggered outreach email will use the latest version.
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color="#94a3b8" />
          </button>
        </div>

        <div style={{ padding: isMobile ? "16px" : "18px 22px" }}>
          {error && (
            <div style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "#fef2f2",
              color: "#991b1b",
              borderRadius: 8,
              fontSize: 12,
              border: "1px solid #fecaca",
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {[
              { key: "primary" as OutreachTemplateStage, label: "Primary" },
              { key: "follow_up_1" as OutreachTemplateStage, label: "Follow-up 1" },
              { key: "follow_up_2" as OutreachTemplateStage, label: "Follow-up 2" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveStage(option.key)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: activeStage === option.key ? "1px solid #16a34a" : "1px solid #d5d9e2",
                  background: activeStage === option.key ? "#dcfce7" : "#fff",
                  color: activeStage === option.key ? "#166534" : "#475569",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {loading || !template ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              Loading templates...
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Subject</label>
                <input
                  value={template.subject}
                  onChange={(e) => updateTemplate("subject", e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 13,
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    outline: "none",
                    background: "#fff",
                    color: "#0f172a",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>Body</label>
                <textarea
                  value={template.body}
                  onChange={(e) => updateTemplate("body", e.target.value)}
                  rows={14}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    fontSize: 13,
                    border: "1px solid #d5d9e2",
                    borderRadius: 10,
                    outline: "none",
                    background: "#fff",
                    color: "#0f172a",
                    boxSizing: "border-box",
                    resize: "vertical",
                    lineHeight: 1.6,
                  }}
                />
              </div>

              <div style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: 12,
                color: "#475569",
                lineHeight: 1.6,
                marginBottom: 16,
              }}>
                <strong>Available variables:</strong> {["{{contactFirstName}}", "{{contactName}}", "{{businessName}}", "{{senderName}}", "{{contactPhone}}", "{{replyToEmail}}"].join(" · ")}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "10px 18px",
                    fontSize: 13,
                    fontWeight: 500,
                    background: "#fff",
                    color: "#374151",
                    border: "1px solid #d5d9e2",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveTemplates}
                  disabled={saving}
                  style={{
                    padding: "10px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Saving..." : "Save Templates"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

*/

function ExcelImportModal({
  existingLeads,
  onClose,
  onImported,
  onError,
}: {
  existingLeads: Lead[];
  onClose: () => void;
  onImported: (message: string) => void;
  onError: (message: string) => void;
}) {
  const isMobile = useIsMobile(768);
  const [fileName, setFileName] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [columns, setColumns] = useState<ExcelMappedColumns>({});
  const [candidates, setCandidates] = useState<ExcelLeadCandidate[]>([]);
  const [extractCount, setExtractCount] = useState("50");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const visibleCandidates = useMemo(() => {
    const parsedCount = Number(extractCount);
    const limit = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : candidates.length;
    return candidates.slice(0, Math.min(limit, candidates.length));
  }, [candidates, extractCount]);

  const importableVisibleCandidates = useMemo(
    () => visibleCandidates.filter((candidate) => candidate.importable && !excelCandidateMatchesExistingLead(candidate, existingLeads)),
    [existingLeads, visibleCandidates]
  );

  useEffect(() => {
    const visibleKeys = new Set(visibleCandidates.map((candidate) => `${candidate.rowNumber}-${candidate.business}-${candidate.phone}`));
    setSelectedIds((current) => current.filter((key) => visibleKeys.has(key)));
  }, [visibleCandidates]);

  const parseFile = async (file: File) => {
    setLoadingFile(true);
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("The file has no sheets to import.");
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });

      if (!rows.length) {
        throw new Error("The selected file is empty.");
      }

      const parsed = parseExcelCandidates(rows);
      setColumns(parsed.columns);
      setCandidates(parsed.candidates);
      setExtractCount(String(Math.min(50, parsed.candidates.length)));
      setSelectedIds(
        parsed.candidates
          .slice(0, Math.min(50, parsed.candidates.length))
          .filter((candidate) => candidate.importable && !excelCandidateMatchesExistingLead(candidate, existingLeads))
          .map((candidate) => `${candidate.rowNumber}-${candidate.business}-${candidate.phone}`)
      );
      setFileName(file.name);
    } catch (fileError) {
      const message = fileError instanceof Error ? fileError.message : "Failed to parse the selected file.";
      setError(message);
      onError(message);
    } finally {
      setLoadingFile(false);
    }
  };

  const toggleSelection = (candidateKey: string) => {
    setSelectedIds((current) =>
      current.includes(candidateKey)
        ? current.filter((item) => item !== candidateKey)
        : [...current, candidateKey]
    );
  };

  const selectAllVisible = () => {
    setSelectedIds(
      importableVisibleCandidates.map((candidate) => `${candidate.rowNumber}-${candidate.business}-${candidate.phone}`)
    );
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const importCandidates = async (triggerCalls: boolean) => {
    const importList = importableVisibleCandidates.filter((candidate) =>
      selectedIds.includes(`${candidate.rowNumber}-${candidate.business}-${candidate.phone}`)
    );

    if (!importList.length) {
      setError("Select at least one importable row first.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads: importList.map((candidate) => ({
            business: candidate.business,
            contact: candidate.contact || "Front Desk",
            phone: candidate.phone,
            email: candidate.email,
            address: candidate.address,
            businessType: candidate.businessType,
            source: "Excel Import",
            contactMethod: "Call",
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import Excel leads.");
      }

      if (!data.importedCount) {
        throw new Error("No new leads were imported. The selected rows may already exist or may be missing required fields.");
      }

      let emailedCount = 0;
      if (triggerCalls && Array.isArray(data.imported)) {
        const importedLeads = data.imported as Array<{ id: string; email?: string; contact?: string; business?: string }>;
        const emailableLeads = importedLeads.filter(l => l.email);
        if (emailableLeads.length > 0) {
          try {
            const emailRes = await fetch("/api/email-agent/send-batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                leads: emailableLeads.map(l => ({ id: l.id, email: l.email, contact: l.contact || "there", business: l.business || "" })),
                templateStage: "primary",
              }),
            });
            if (emailRes.ok) {
              const emailData = await emailRes.json();
              emailedCount = emailData.sent || 0;
            }
          } catch {
            // keep going even if batch email fails
          }
        }
      }

      const message = triggerCalls
        ? `Imported ${data.importedCount} Excel leads and emailed ${emailedCount}${data.skippedCount ? `, skipped ${data.skippedCount}` : ""}.`
        : `Imported ${data.importedCount} Excel leads${data.skippedCount ? `, skipped ${data.skippedCount}` : ""}.`;

      onImported(message);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Failed to import Excel leads.";
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
        padding: isMobile ? 12 : 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? "100%" : "min(1100px, calc(100vw - 48px))",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #d5d9e2",
          boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
        }}
      >
        <div style={{
          padding: isMobile ? "16px" : "18px 22px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Excel Lead Import</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              Upload CSV or XLSX, preview how many rows to extract, then import only the leads you want.
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color="#94a3b8" />
          </button>
        </div>

        <div style={{ padding: isMobile ? "16px" : "18px 22px" }}>
          {error && (
            <div style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "#fef2f2",
              color: "#991b1b",
              borderRadius: 8,
              fontSize: 12,
              border: "1px solid #fecaca",
            }}>
              {error}
            </div>
          )}

          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.6fr 180px",
            gap: 12,
            marginBottom: 18,
            alignItems: "end",
          }}>
            <label style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              minHeight: 108,
              borderRadius: 14,
              border: "1px dashed #94a3b8",
              background: "#f8fafc",
              color: "#334155",
              cursor: "pointer",
              padding: "14px 18px",
              textAlign: "center",
              flexDirection: "column",
            }}>
              <Upload size={20} color="#16a34a" />
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {loadingFile ? "Reading file..." : fileName || "Upload CSV or XLSX"}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                We’ll detect the important columns even if the names differ.
              </div>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    parseFile(file);
                  }
                }}
              />
            </label>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" }}>
                How many rows should we extract?
              </label>
              <input
                value={extractCount}
                onChange={(e) => setExtractCount(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 13,
                  border: "1px solid #d5d9e2",
                  borderRadius: 8,
                  outline: "none",
                  background: "#fff",
                  color: "#0f172a",
                  boxSizing: "border-box",
                }}
                placeholder="e.g., 100"
              />
            </div>
          </div>

          {candidates.length > 0 && (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}>
                {[
                  { label: "Total Rows", value: String(candidates.length) },
                  { label: "Previewing", value: String(visibleCandidates.length) },
                  { label: "Importable", value: String(importableVisibleCandidates.length) },
                  { label: "Selected", value: String(selectedIds.length) },
                ].map((item) => (
                  <div key={item.label} style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 6 }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: 12,
                color: "#475569",
                lineHeight: 1.6,
                marginBottom: 16,
              }}>
                <strong>Detected columns:</strong>{" "}
                Business = <strong>{columns.business || "Not found"}</strong> · Contact = <strong>{columns.contact || "Fallback to Front Desk"}</strong> ·
                Phone = <strong>{columns.phone || "Not found"}</strong> · Email = <strong>{columns.email || "Not found"}</strong> ·
                Address = <strong>{columns.address || "Not found"}</strong> · Type = <strong>{columns.businessType || "Not found"}</strong>
              </div>

              <div style={{
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={selectAllVisible}
                    style={{
                      padding: "7px 10px",
                      background: "#fff",
                      color: "#374151",
                      border: "1px solid #d5d9e2",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Select All Visible
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    style={{
                      padding: "7px 10px",
                      background: "#fff",
                      color: "#374151",
                      border: "1px solid #d5d9e2",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => importCandidates(false)}
                    disabled={saving}
                    style={{
                      padding: "9px 12px",
                      background: "#fff",
                      color: "#374151",
                      border: "1px solid #d5d9e2",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    Add Selected
                  </button>
                  <button
                    type="button"
                    onClick={() => importCandidates(true)}
                    disabled={saving}
                    style={{
                      padding: "9px 12px",
                      background: "#16a34a",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: saving ? "not-allowed" : "pointer",
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    Add + Email Selected
                  </button>
                </div>
              </div>

              <div style={{
                border: "1px solid #d5d9e2",
                borderRadius: 12,
                overflow: "hidden",
              }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "36px 1.3fr 0.9fr 0.9fr 110px" : "36px 1.4fr 1fr 1fr 1.2fr 110px",
                  background: "#f8fafc",
                  borderBottom: "1px solid #e5e7eb",
                }}>
                  {(isMobile ? ["", "Business", "Phone", "Email", "Status"] : ["", "Business", "Contact", "Phone", "Email / Address", "Status"]).map((label) => (
                    <div key={label || "check"} style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {label}
                    </div>
                  ))}
                </div>

                <div style={{ maxHeight: 420, overflow: "auto" }}>
                  {visibleCandidates.map((candidate) => {
                    const candidateKey = `${candidate.rowNumber}-${candidate.business}-${candidate.phone}`;
                    const duplicate = excelCandidateMatchesExistingLead(candidate, existingLeads);
                    const disabled = !candidate.importable || duplicate;
                    const checked = selectedIds.includes(candidateKey);

                    return (
                      <div
                        key={candidateKey}
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "36px 1.3fr 0.9fr 0.9fr 110px" : "36px 1.4fr 1fr 1fr 1.2fr 110px",
                          alignItems: "start",
                          borderBottom: "1px solid #f1f5f9",
                          background: checked ? "#f0fdf4" : "#fff",
                        }}
                      >
                        <div style={{ padding: "14px 10px" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleSelection(candidateKey)}
                          />
                        </div>
                        <div style={{ padding: "14px" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{candidate.business || "No business name"}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                            Row {candidate.rowNumber}{candidate.businessType ? ` · ${candidate.businessType}` : ""}
                          </div>
                        </div>
                        {!isMobile && (
                          <div style={{ padding: "14px", fontSize: 12, color: "#334155" }}>
                            {candidate.contact || "Front Desk"}
                          </div>
                        )}
                        <div style={{ padding: "14px", fontSize: 12, color: candidate.phone ? "#334155" : "#94a3b8" }}>
                          {candidate.phone || "No phone"}
                        </div>
                        <div style={{ padding: "14px", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                          {candidate.email || "No email"}
                          {!isMobile && candidate.address ? <div style={{ marginTop: 4, color: "#94a3b8" }}>{candidate.address}</div> : null}
                        </div>
                        <div style={{ padding: "14px" }}>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "4px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            color: duplicate ? "#92400e" : candidate.importable ? "#166534" : "#991b1b",
                            background: duplicate ? "#fef3c7" : candidate.importable ? "#dcfce7" : "#fef2f2",
                            border: `1px solid ${duplicate ? "#fde68a" : candidate.importable ? "#a7f3d0" : "#fecaca"}`,
                          }}>
                            {duplicate ? "Already imported" : candidate.importable ? "Ready" : candidate.reason || "Missing data"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleMapsModal({
  existingLeads,
  onClose,
  onImported,
  onError,
}: {
  existingLeads: Lead[];
  onClose: () => void;
  onImported: (message: string) => void;
  onError: (message: string) => void;
}) {
  const isMobile = useIsMobile(768);
  const isTablet = useIsMobile(1024);
  const [zipcode, setZipcode] = useState("");
  const [radiusMiles, setRadiusMiles] = useState("25");
  const [category, setCategory] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [results, setResults] = useState<GoogleMapsLeadCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchMeta, setSearchMeta] = useState<{ formattedAddress?: string; mode?: "category" | "all" } | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 13,
    border: "1px solid #d5d9e2",
    borderRadius: 8,
    outline: "none",
    background: "#fff",
    color: "#0f172a",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 4,
    display: "block",
  };

  const secondaryMiniButtonStyle: React.CSSProperties = {
    padding: "7px 10px",
    background: "#fff",
    color: "#374151",
    border: "1px solid #d5d9e2",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };

  const secondaryActionButtonStyle: React.CSSProperties = {
    padding: "9px 12px",
    background: "#fff",
    color: "#374151",
    border: "1px solid #d5d9e2",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.7 : 1,
  };

  const primaryActionButtonStyle: React.CSSProperties = {
    padding: "9px 12px",
    background: "#16a34a",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.7 : 1,
  };

  const eligibleCandidates = results.filter(
    (candidate) => candidate.importable && !candidateMatchesExistingLead(candidate, existingLeads)
  );

  const searchGoogleMaps = async (mode: "category" | "all") => {
    if (!zipcode.trim()) {
      setError("ZIP code is required.");
      return;
    }

    const radius = Number(radiusMiles);
    if (!Number.isFinite(radius) || radius <= 0) {
      setError("Radius must be greater than 0.");
      return;
    }

    if (mode === "category" && !category.trim()) {
      setError("Search text is required.");
      return;
    }

    setSearching(true);
    setError("");
    setSuccessMessage("");

    try {
      const res = await fetch("/api/google-maps/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zipcode: zipcode.trim(),
          radiusMiles: radius,
          category: category.trim(),
          mode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to search Google Maps.");
      }

      const fetchedResults = (data.candidates || []) as GoogleMapsLeadCandidate[];
      setResults(fetchedResults);
      setSearchMeta({
        formattedAddress: data.formattedAddress,
        mode,
      });
      setSelectedIds(
        fetchedResults
          .filter((candidate) => candidate.importable && !candidateMatchesExistingLead(candidate, existingLeads))
          .map((candidate) => candidate.placeId)
      );
    } catch (searchError) {
      const message = searchError instanceof Error ? searchError.message : "Failed to search Google Maps.";
      setResults([]);
      setSelectedIds([]);
      setError(message);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelection = (placeId: string) => {
    setSelectedIds((current) =>
      current.includes(placeId)
        ? current.filter((id) => id !== placeId)
        : [...current, placeId]
    );
  };

  const removeCandidate = (placeId: string) => {
    setResults((current) => current.filter((candidate) => candidate.placeId !== placeId));
    setSelectedIds((current) => current.filter((id) => id !== placeId));
  };

  const selectAllEligible = () => {
    setSelectedIds(eligibleCandidates.map((candidate) => candidate.placeId));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const resetSearchState = () => {
    setZipcode("");
    setRadiusMiles("25");
    setCategory("");
    setResults([]);
    setSelectedIds([]);
    setSearchMeta(null);
    setError("");
  };

  const importCandidates = async (mode: "selected" | "all", triggerCalls: boolean) => {
    const importList =
      mode === "all"
        ? eligibleCandidates
        : eligibleCandidates.filter((candidate) => selectedIds.includes(candidate.placeId));

    if (importList.length === 0) {
      setError("Select at least one importable business first.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccessMessage("");

    let importedCount = 0;
    let calledCount = 0;
    let skippedCount = 0;
    let firstImportError = "";

    try {
      for (const candidate of importList) {
        let enrichedEmail = candidate.email || "";
        let enrichedContact = candidate.contact || "Front Desk";
        let enrichedPhone = candidate.phone || "";
        let enrichedContactTitle = candidate.contactTitle || "";
        // v2 fields — captured from Apollo so the lead lands with tier-relevant data
        let enrichedMobile = "";
        let enrichedEmployeeCount = "";
        let enrichedVertical = "";

        // Emails are now enriched during the Maps SEARCH, so most candidates
        // already carry one. Only call enrichment again when the email is
        // still blank — avoids paying Apollo/Hunter twice for the same lead.
        if (!candidate.email && (candidate.website || candidate.business)) {
          try {
            const enrichRes = await fetch("/api/lead-enrichment/enrich", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                website: candidate.website,
                company: candidate.business,
              }),
            });

            if (enrichRes.ok) {
              const enrichData = await enrichRes.json();
              const enrichment = enrichData.enrichment as {
                provider?: "apollo" | "lusha" | "hunter";
                email?: string;
                phone?: string;
                mobile?: string;
                contactName?: string;
                contactTitle?: string;
                employeeCount?: number;
                industry?: string;
                companyName?: string;
              } | null;

              if (enrichment?.email) enrichedEmail = enrichment.email;
              if (enrichment?.phone) enrichedPhone = enrichment.phone;
              if (enrichment?.contactName) enrichedContact = enrichment.contactName;
              if (enrichment?.contactTitle) enrichedContactTitle = enrichment.contactTitle;
              // Apollo extras — these feed tier scoring on insert
              if (enrichment?.mobile) enrichedMobile = enrichment.mobile;
              if (typeof enrichment?.employeeCount === "number") enrichedEmployeeCount = String(enrichment.employeeCount);
              if (enrichment?.industry) enrichedVertical = enrichment.industry;
            }
          } catch {
            // Continue importing the lead even if enrichment fails.
          }
        }

        const leadRes = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business: candidate.business,
            contact: enrichedContact,
            phone: enrichedPhone || candidate.phone,
            email: enrichedEmail,
            address: candidate.address,
            distance: candidate.distance,
            businessType: candidate.businessType,
            source: "Google Maps",
            contactMethod: "Call",
            contactTitle: enrichedContactTitle,
            decisionMakerName: enrichedContact !== "Front Desk" ? enrichedContact : "",
            decisionMakerPhone: enrichedPhone || "",
            decisionMakerEmail: enrichedEmail || "",
            // Apollo-sourced v2 fields → tier scoring picks these up
            website: candidate.website || "",
            apolloMobile: enrichedMobile,
            employeeCount: enrichedEmployeeCount,
            vertical: enrichedVertical,
          }),
        });

        if (!leadRes.ok) {
          if (!firstImportError) {
            try {
              const errorData = await leadRes.json();
              firstImportError = errorData.error || "Failed to add lead.";
            } catch {
              firstImportError = "Failed to add lead.";
            }
          }
          skippedCount += 1;
          continue;
        }

        const lead = (await leadRes.json()) as Lead;
        importedCount += 1;

        if (triggerCalls && lead.email) {
          try {
            const emailRes = await fetch("/api/email-agent/send-batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                leads: [{ id: lead.id, email: lead.email, contact: lead.contact || "there", business: lead.business || "" }],
                templateStage: "primary",
              }),
            });
            if (emailRes.ok) {
              const emailData = await emailRes.json();
              calledCount += emailData.sent || 0;
            }
          } catch {
            // continue even if email fails
          }
        }
      }

      if (importedCount === 0) {
        throw new Error(firstImportError || "No new leads were imported. The selected businesses may already exist or may be missing phone numbers.");
      }

      const summary = triggerCalls
        ? `Imported ${importedCount} Google Maps lead${importedCount === 1 ? "" : "s"} and emailed ${calledCount}${skippedCount ? `, skipped ${skippedCount}` : ""}.`
        : `Imported ${importedCount} Google Maps lead${importedCount === 1 ? "" : "s"}${skippedCount ? `, skipped ${skippedCount}` : ""}.`;

      setSuccessMessage(summary);
      resetSearchState();
      onImported(summary);
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Failed to import Google Maps leads.";
      setError(message);
      setSuccessMessage("");
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1200,
      padding: isMobile ? 12 : 20,
    }}>
      <div style={{
        width: isMobile ? "100%" : "min(1100px, calc(100vw - 48px))",
        maxHeight: "90vh",
        overflow: "auto",
        background: "#fff",
        borderRadius: 16,
        border: "1px solid #d5d9e2",
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
      }}>
        <div style={{
          padding: isMobile ? "16px" : "18px 22px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Google Maps Lead Finder</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              Search by ZIP code + radius, then type any Google Maps style search text if you want to narrow the results.
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} color="#94a3b8" />
          </button>
        </div>

        <div style={{ padding: isMobile ? "16px" : "18px 22px" }}>
          {error && (
            <div style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "#fef2f2",
              color: "#991b1b",
              borderRadius: 8,
              fontSize: 12,
              border: "1px solid #fecaca",
            }}>
              {error}
            </div>
          )}

          {successMessage && (
            <div style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "#f0fdf4",
              color: "#166534",
              borderRadius: 8,
              fontSize: 12,
              border: "1px solid #a7f3d0",
            }}>
              {successMessage}
            </div>
          )}

          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr auto auto",
            gap: 12,
            alignItems: "end",
            marginBottom: 18,
          }}>
            <div>
              <label style={labelStyle}>ZIP Code</label>
              <input style={inputStyle} value={zipcode} onChange={(e) => setZipcode(e.target.value)} placeholder="e.g., 10001" />
            </div>
            <div>
              <label style={labelStyle}>Radius (miles)</label>
              <input style={inputStyle} value={radiusMiles} onChange={(e) => setRadiusMiles(e.target.value)} placeholder="e.g., 25" />
            </div>
            <div>
              <label style={labelStyle}>Search Text</label>
              <input style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g., hospital, gym, warehouse, dental clinic" />
            </div>
            <button
              onClick={() => searchGoogleMaps("category")}
              disabled={searching}
              style={{
                padding: "10px 14px",
                background: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: searching ? "not-allowed" : "pointer",
                opacity: searching ? 0.7 : 1,
              }}
            >
              {searching ? "Searching..." : "Search"}
            </button>
            <button
              onClick={() => searchGoogleMaps("all")}
              disabled={searching}
              style={{
                padding: "10px 14px",
                background: "#fff",
                color: "#374151",
                border: "1px solid #d5d9e2",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: searching ? "not-allowed" : "pointer",
                opacity: searching ? 0.7 : 1,
              }}
            >
              Search All
            </button>
          </div>

          {searchMeta && (
            <div style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              fontSize: 12,
              color: "#475569",
            }}>
              Search center: <strong>{searchMeta.formattedAddress || zipcode}</strong> · Mode:{" "}
              <strong>{searchMeta.mode === "category" ? `Search (${category || "custom"})` : "All nearby businesses"}</strong> · Results:{" "}
              <strong>{results.length}</strong>
            </div>
          )}

              {results.length > 0 && (
            <>
              <div style={{
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={selectAllEligible} type="button" style={secondaryMiniButtonStyle}>Select All Importable</button>
                  <button onClick={clearSelection} type="button" style={secondaryMiniButtonStyle}>Clear</button>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {selectedIds.length} selected · {eligibleCandidates.length} importable
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => importCandidates("selected", false)} disabled={saving} type="button" style={secondaryActionButtonStyle}>
                    Add Selected
                  </button>
                  <button onClick={() => importCandidates("all", false)} disabled={saving} type="button" style={secondaryActionButtonStyle}>
                    Add All
                  </button>
                  <button onClick={() => importCandidates("selected", true)} disabled={saving} type="button" style={primaryActionButtonStyle}>
                    Add + Email Selected
                  </button>
                  <button onClick={() => importCandidates("all", true)} disabled={saving} type="button" style={primaryActionButtonStyle}>
                    Add + Email All
                  </button>
                </div>
              </div>

              {isMobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflow: "auto" }}>
                  {results.map((candidate) => {
                    const alreadyExists = candidateMatchesExistingLead(candidate, existingLeads);
                    const disabled = !candidate.importable || alreadyExists;
                    const checked = selectedIds.includes(candidate.placeId);

                    return (
                      <div key={candidate.placeId} style={{
                        border: "1px solid #d5d9e2",
                        borderRadius: 12,
                        padding: 12,
                        background: checked ? "#f0fdf4" : "#fff",
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleSelection(candidate.placeId)}
                            style={{ marginTop: 3 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{candidate.business}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                              {candidate.businessType} · {candidate.distance}
                            </div>
                            <div style={{ fontSize: 12, color: "#334155", marginTop: 8 }}>
                              {candidate.phone || "No phone"}
                            </div>
                            <div style={{ fontSize: 12, color: "#475569", marginTop: 6, lineHeight: 1.5 }}>
                              {candidate.address}
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: alreadyExists ? "#92400e" : candidate.importable ? "#166534" : "#991b1b",
                                  background: alreadyExists ? "#fef3c7" : candidate.importable ? "#dcfce7" : "#fef2f2",
                                  border: `1px solid ${alreadyExists ? "#fde68a" : candidate.importable ? "#a7f3d0" : "#fecaca"}`,
                                }}>
                                  {alreadyExists ? "Already in Pipeline" : candidate.importable ? "Ready" : "Missing phone"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeCandidate(candidate.placeId)}
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 8,
                                    border: "1px solid #fecaca",
                                    background: "#fff1f2",
                                    color: "#be123c",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                              {candidate.reason && !alreadyExists && (
                                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, lineHeight: 1.4 }}>
                                  {candidate.reason}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  border: "1px solid #d5d9e2",
                  borderRadius: 12,
                  overflow: "hidden",
                }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "42px 1.5fr 1fr 1fr 100px 110px 90px",
                    gap: 0,
                    background: "#f8fafc",
                    borderBottom: "1px solid #e5e7eb",
                  }}>
                    {["", "Business", "Phone", "Address", "Distance", "Status", "Action"].map((label) => (
                      <div key={label || "select"} style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {label}
                      </div>
                    ))}
                  </div>

                  <div style={{ maxHeight: 420, overflow: "auto" }}>
                    {results.map((candidate) => {
                      const alreadyExists = candidateMatchesExistingLead(candidate, existingLeads);
                      const disabled = !candidate.importable || alreadyExists;
                      const checked = selectedIds.includes(candidate.placeId);

                      return (
                        <div key={candidate.placeId} style={{
                          display: "grid",
                          gridTemplateColumns: "42px 1.5fr 1fr 1fr 100px 110px 90px",
                          borderBottom: "1px solid #f1f5f9",
                          alignItems: "start",
                          background: checked ? "#f0fdf4" : "#fff",
                        }}>
                          <div style={{ padding: "14px 12px" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleSelection(candidate.placeId)}
                            />
                          </div>
                          <div style={{ padding: "14px" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{candidate.business}</div>
                            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                              {candidate.businessType} · Contact: {candidate.contact}
                            </div>
                          </div>
                          <div style={{ padding: "14px", fontSize: 12, color: candidate.phone ? "#334155" : "#94a3b8" }}>
                            {candidate.phone || "No phone"}
                          </div>
                          <div style={{ padding: "14px", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                            {candidate.address}
                          </div>
                          <div style={{ padding: "14px", fontSize: 12, color: "#475569" }}>
                            {candidate.distance}
                          </div>
                          <div style={{ padding: "14px" }}>
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              color: alreadyExists ? "#92400e" : candidate.importable ? "#166534" : "#991b1b",
                              background: alreadyExists ? "#fef3c7" : candidate.importable ? "#dcfce7" : "#fef2f2",
                              border: `1px solid ${alreadyExists ? "#fde68a" : candidate.importable ? "#a7f3d0" : "#fecaca"}`,
                            }}>
                              {alreadyExists ? "Already in Pipeline" : candidate.importable ? "Ready" : "Missing phone"}
                            </span>
                            {candidate.reason && !alreadyExists && (
                              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, lineHeight: 1.4 }}>
                                {candidate.reason}
                              </div>
                            )}
                          </div>
                          <div style={{ padding: "14px" }}>
                            <button
                              type="button"
                              onClick={() => removeCandidate(candidate.placeId)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 8,
                                border: "1px solid #fecaca",
                                background: "#fff1f2",
                                color: "#be123c",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Kanban Card                                                        */
/* ------------------------------------------------------------------ */

function KanbanCard({ lead, expanded, onToggle, onTriggerCall, onDelete, isCalling, selected = false, onSelect, onEdit, onBooked }: {
  lead: Lead; expanded: boolean; onToggle: () => void;
  onTriggerCall: () => void; onDelete: () => void; isCalling: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onBooked?: () => void;
}) {
  const emailTrackingLabel = getEmailTrackingLabel(lead);
  const callbackLabel = formatLeadSchedule(lead.callbackDate, lead.callbackTime);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookDate, setBookDate] = useState("");
  const [bookTime, setBookTime] = useState("10:00");
  const [bookNotes, setBookNotes] = useState("");
  const [bookBusy, setBookBusy] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  async function submitBooking() {
    if (!bookDate || !bookTime) { setBookError("Pick date and time"); return; }
    setBookBusy(true); setBookError(null);
    try {
      const r = await fetch("/api/leads/book-meeting", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, date: bookDate, time: bookTime, notes: bookNotes || undefined }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || "Booking failed");
      setBookingOpen(false);
      setBookDate(""); setBookTime("10:00"); setBookNotes("");
      onBooked?.();
    } catch (e) {
      setBookError(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setBookBusy(false);
    }
  }

  return (
    <div
      onClick={onToggle}
      style={{
        background: "#fff", border: "1px solid #d5d9e2", borderRadius: 10,
        padding: "12px", cursor: "pointer",
        boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0, flex: 1 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
            style={{
              marginTop: 1,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: selected ? "#16a34a" : "#94a3b8",
              flexShrink: 0,
            }}
            aria-label={selected ? "Deselect lead" : "Select lead"}
          >
            {selected ? <CheckSquare size={15} /> : <Square size={15} />}
          </button>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", minWidth: 0, overflowWrap: "anywhere" }}>
            {lead.business}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          style={{
            background: "#fff",
            border: "1px solid #d5d9e2",
            borderRadius: 8,
            width: 28,
            height: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#475569",
            flexShrink: 0,
          }}
          aria-label="Edit lead"
        >
          <Pencil size={12} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {lead.tier && (
          <span style={{
            display: "inline-block", padding: "1px 6px", borderRadius: 4,
            fontSize: 10, fontWeight: 700, color: "#fff",
            background: lead.tier === "A" ? "#16a34a" : lead.tier === "B" ? "#eab308" : "#94a3b8",
            letterSpacing: 0.3,
          }} title={lead.tierReason || ""}>
            {lead.tier}{lead.tierScore !== undefined ? ` · ${lead.tierScore}` : ""}
          </span>
        )}
        {lead.isCallReady && (
          <span style={{
            display: "inline-block", padding: "1px 6px", borderRadius: 4,
            fontSize: 10, fontWeight: 700, color: "#9a3412", background: "#ffedd5",
          }} title="Hot — call ready">HOT</span>
        )}
        <span>{lead.businessType}{lead.vertical && lead.vertical !== lead.businessType ? ` · ${lead.vertical}` : ""} · {lead.distance}</span>
      </div>

      {/* Owner */}
      {lead.owner && (
        <div style={{ fontSize: 11, color: "#475569", marginBottom: 4, fontWeight: 600 }}>
          Owner: {lead.owner}
        </div>
      )}

      {/* Contact */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b", marginBottom: 4 }}>
        <User size={10} /> {lead.contact}{lead.apolloTitle ? ` · ${lead.apolloTitle}` : ""}
      </div>

      {/* Phone — prefer Apollo mobile if we have it (more likely to reach DM) */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b", marginBottom: 4 }}>
        <Phone size={10} />
        {lead.apolloMobile ? (
          <span><strong style={{ color: "#15803d" }}>{lead.apolloMobile}</strong> <span style={{ fontSize: 10, color: "#94a3b8" }}>(mobile)</span></span>
        ) : (
          <span>{lead.phone}</span>
        )}
      </div>

      {/* Next action — what should happen next on this lead */}
      {lead.nextAction && (
        <div style={{
          fontSize: 11, color: "#1e40af", marginBottom: 4,
          background: "#dbeafe", padding: "4px 6px", borderRadius: 4,
        }} title={lead.nextActionAt ? `Scheduled ${new Date(lead.nextActionAt).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET"}` : ""}>
          → {lead.nextAction}
          {lead.nextActionAt && (
            <span style={{ color: "#64748b", marginLeft: 4 }}>
              ({new Date(lead.nextActionAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })})
            </span>
          )}
        </div>
      )}

      {/* Last touch */}
      {lead.lastTouchAt && (
        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
          Last touch: {new Date(lead.lastTouchAt).toLocaleDateString("en-US", { timeZone: "America/New_York" })}
        </div>
      )}

      {/* Not interested reason — visible only on Not Interested stage */}
      {lead.stage === "Not Interested" && lead.notInterestedReason && (
        <div style={{
          fontSize: 10, color: "#991b1b", marginBottom: 4,
          background: "#fee2e2", padding: "3px 6px", borderRadius: 4,
        }}>
          Reason: {lead.notInterestedReason}
        </div>
      )}

      {/* Saved email */}
      {lead.email && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, fontSize: 11, color: "#64748b", marginBottom: 4, minWidth: 0 }}>
          <Mail size={10} style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{
            minWidth: 0,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            lineHeight: 1.45,
          }}>
            {lead.email}
          </span>
        </div>
      )}

      {/* Email count */}
      {lead.emailLogs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b", marginBottom: 4 }}>
          <Mail size={10} /> {lead.emailLogs.length} email{lead.emailLogs.length !== 1 ? "s" : ""} sent
        </div>
      )}

      {/* Email info */}
      {emailTrackingLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#64748b", marginBottom: 4 }}>
          <Mail size={10} /> Email activity: {emailTrackingLabel}
        </div>
      )}

      {callbackLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#b45309", marginBottom: 4 }}>
          <Mail size={10} /> Follow-up scheduled {callbackLabel}
        </div>
      )}

      {/* Max attempts reached — show a clear rule + actionable CTA
          per the brief ("Switch to email / find alternate DM"). Operator
          gets a one-click way to find alternate contacts via Apollo. */}
      {(() => {
        const max = lead.maxCallAttempts ?? 6;
        const attempts = lead.callAttempts ?? 0;
        if (attempts < max) return null;
        return (
          <div style={{
            marginTop: 6, padding: 8, background: "#fef2f2",
            border: "1px solid #fecaca", borderRadius: 6,
            fontSize: 11, color: "#991b1b",
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              Max call attempts ({max}) reached
            </div>
            <div style={{ marginBottom: 4 }}>
              Switch to email or find alternate DM.
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await fetch("/api/leads/enrich-batch", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: [lead.id] }),
                  });
                  onBooked?.();
                }}
                style={{
                  flex: 1, padding: "4px 8px", fontSize: 10, fontWeight: 600,
                  background: "#fff", border: "1px solid #fecaca", borderRadius: 4,
                  color: "#991b1b", cursor: "pointer",
                }}
              >Find alt DM</button>
              <button
                onClick={(e) => { e.stopPropagation(); onTriggerCall(); }}
                disabled={!lead.email}
                style={{
                  flex: 1, padding: "4px 8px", fontSize: 10, fontWeight: 600,
                  background: "#fff", border: "1px solid #fecaca", borderRadius: 4,
                  color: lead.email ? "#991b1b" : "#94a3b8", cursor: lead.email ? "pointer" : "not-allowed",
                }}
              >Switch to email</button>
            </div>
          </div>
        );
      })()}

      {/* Send Email Button */}
      <button
        onClick={(e) => { e.stopPropagation(); onTriggerCall(); }}
        disabled={isCalling || !lead.email}
        style={{
          width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 6, padding: "7px 12px",
          background: !lead.email ? "#f1f5f9" : "#7c3aed",
          color: !lead.email ? "#94a3b8" : "#fff",
          border: !lead.email ? "1px solid #e2e8f0" : "none",
          borderRadius: 8, fontSize: 11, fontWeight: 600,
          cursor: !lead.email ? "not-allowed" : "pointer",
          opacity: isCalling ? 0.7 : 1,
        }}
      >
        {isCalling ? (
          <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Sending...</>
        ) : !lead.email ? (
          "No Email Address"
        ) : (
          <><Mail size={12} /> Send Email</>
        )}
      </button>

      {/* Book Meeting button — handles Sprint 5 calendar handoff. Visible on
          all stages where a meeting makes sense (basically anything that's not
          already booked, won, installed, or not interested). */}
      {!["Meeting Booked", "Won", "Installed", "Not Interested"].includes(lead.stage) && (
        <button
          onClick={(e) => { e.stopPropagation(); setBookingOpen((v) => !v); }}
          style={{
            width: "100%", marginTop: 6, padding: "6px 12px",
            background: bookingOpen ? "#fef3c7" : "#fff",
            color: "#0d9488",
            border: "1px solid #99f6e4",
            borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}
        >
          {bookingOpen ? "Cancel" : "📅 Book Meeting"}
        </button>
      )}

      {bookingOpen && (
        <div onClick={(e) => e.stopPropagation()} style={{
          marginTop: 8, padding: 10, background: "#f0fdfa",
          border: "1px solid #99f6e4", borderRadius: 8,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="date"
              value={bookDate}
              onChange={(e) => setBookDate(e.target.value)}
              style={{ flex: 1, padding: "4px 8px", fontSize: 11, border: "1px solid #cbd5e1", borderRadius: 4 }}
            />
            <input
              type="time"
              value={bookTime}
              onChange={(e) => setBookTime(e.target.value)}
              style={{ flex: 1, padding: "4px 8px", fontSize: 11, border: "1px solid #cbd5e1", borderRadius: 4 }}
            />
          </div>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={bookNotes}
            onChange={(e) => setBookNotes(e.target.value)}
            style={{ flex: 1, padding: "4px 8px", fontSize: 11, border: "1px solid #cbd5e1", borderRadius: 4 }}
          />
          {bookError && (
            <div style={{ fontSize: 11, color: "#991b1b", background: "#fee2e2", padding: 4, borderRadius: 4 }}>
              {bookError}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); void submitBooking(); }}
            disabled={bookBusy}
            style={{
              width: "100%", padding: "6px 12px",
              background: "#0d9488", color: "#fff", border: "none",
              borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >
            {bookBusy ? "Booking…" : "Confirm booking"}
          </button>
        </div>
      )}

      {/* Last activity summary (when expanded) */}
      {expanded && lead.lastActivity && (
        <div style={{
          marginTop: 8, fontSize: 11, color: "#64748b", lineHeight: 1.4,
          background: "#f1f5f9", padding: "8px 10px", borderRadius: 6,
        }}>
          <div style={{ fontWeight: 600, color: "#374151", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <Bot size={10} /> Agent Summary
          </div>
          {lead.lastActivity}
        </div>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          width: "100%",
          marginTop: 8,
          padding: "7px 12px",
          background: "#fff1f2",
          color: "#be123c",
          border: "1px solid #fecdd3",
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Delete Lead
      </button>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>
          {lead.source === "Google Maps" ? "Maps" : lead.source === "Excel Import" ? "Excel" : "Manual"} · {lead.addedDate}
        </span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>
          {lead.lastActivity}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small Components                                                   */
/* ------------------------------------------------------------------ */

function StatBox({ icon, iconBg, label, value, sub, onClick, active = false }: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        background: active ? "#f8fffb" : "#fff",
        borderRadius: 14,
        border: active ? "1px solid #86efac" : "1px solid #d5d9e2",
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: active ? "0 4px 10px rgba(22, 163, 74, 0.08)" : "0 2px 4px rgba(0,0,0,0.06)",
        cursor: onClick ? "pointer" : "default",
        textAlign: "left",
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{sub}</div>
      </div>
    </button>
  );
}

function LeadInsightsPanel({
  lead,
  captured,
  compact = false,
}: {
  lead: Lead;
  captured?: CapturedLeadData | null;
  compact?: boolean;
}) {
  const sections = [
    {
      title: "Contact",
      fields: [
        { label: "Contact Name", value: captured?.contactName },
        { label: "Contact Title", value: captured?.contactTitle },
        { label: "Phone", value: captured?.phone },
        { label: "Email", value: captured?.email },
        { label: "Address", value: captured?.address },
      ],
    },
    {
      title: "Business",
      fields: [
        { label: "Business Name", value: captured?.businessName },
        { label: "Business Type", value: captured?.businessType },
        { label: "Employee Count", value: captured?.employeeCount },
        { label: "Product Preference", value: captured?.productPreferences },
      ],
    },
    {
      title: "Vendor",
      fields: [
        { label: "Vending Status", value: captured?.currentVendingStatus },
        { label: "Current Vendor", value: captured?.currentVendorName },
        { label: "Interest Level", value: captured?.interestLevel },
      ],
    },
    {
      title: "Decision Maker",
      fields: [
        { label: "Decision Maker", value: captured?.decisionMakerName },
        { label: "Decision Maker Phone", value: captured?.decisionMakerPhone },
        { label: "Decision Maker Email", value: captured?.decisionMakerEmail },
      ],
    },
    {
      title: "Scheduling",
      fields: [
        { label: "Site Visit", value: formatEasternDateTime(captured?.siteVisit) || captured?.siteVisit },
        { label: "Follow-up", value: formatEasternDateTime(captured?.callback) || captured?.callback },
        { label: "Email Follow-up", value: lead.emailSent ? "Primary email sent" : undefined },
        { label: "Pipeline Status", value: lead.stage || undefined },
      ],
    },
  ];

  const notCaptured = "Not captured";

  return (
    <div style={{
      marginBottom: compact ? 0 : 14,
      background: compact ? "#f8fafc" : "#fff",
      border: "1px solid #d5d9e2",
      borderRadius: 8,
      padding: compact ? "10px 12px" : "12px 14px",
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: "#374151",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <Bot size={13} /> Captured In App
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sections.map((section) => (
          <div key={section.title}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" as const, color: "#94a3b8", marginBottom: 6 }}>
              {section.title}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 8,
            }}>
              {section.fields.map((detail) => {
                const isCaptured = Boolean(detail.value);
                return (
                  <div key={detail.label} style={{
                    background: compact ? "#fff" : "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" as const, color: "#94a3b8", marginBottom: 4 }}>
                      {detail.label}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: isCaptured ? "#334155" : "#94a3b8",
                      fontStyle: isCaptured ? "normal" : "italic",
                      lineHeight: 1.5,
                    }}>
                      {detail.value || notCaptured}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" as const, color: "#94a3b8", marginBottom: 6 }}>
            Pain Points
          </div>
          {captured?.notes ? (
            <div style={{
              background: compact ? "#fff" : "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 12,
              color: "#334155",
              lineHeight: 1.5,
            }}>
              {captured.notes}
            </div>
          ) : lead.painPoints && lead.painPoints.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {lead.painPoints.map((point) => (
                <span key={point} style={{
                  fontSize: 11,
                  color: "#0f766e",
                  background: "#ccfbf1",
                  border: "1px solid #99f6e4",
                  borderRadius: 999,
                  padding: "4px 8px",
                }}>
                  {point}
                </span>
              ))}
            </div>
          ) : (
            <div style={{
              background: compact ? "#fff" : "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 12,
              color: "#94a3b8",
              fontStyle: "italic",
            }}>
              {notCaptured}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendlyBookingPanel({
  lead,
  status,
  options,
  isBooking,
  onBook,
  onBookAlternative,
}: {
  lead: Lead;
  status: BookingStatusMessage | null;
  options: SchedulerAvailableSlot[];
  isBooking: boolean;
  onBook: () => void;
  onBookAlternative: (slot: SchedulerAvailableSlot) => void;
}) {
  return (
    <div style={{
      marginBottom: 14,
      background: "#fff",
      border: "1px solid #d5d9e2",
      borderRadius: 8,
      padding: "12px 14px",
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: "#374151",
        marginBottom: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span>Google Calendar Appointment</span>
        <button
          onClick={onBook}
          disabled={isBooking}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            background: "#16a34a",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: isBooking ? "not-allowed" : "pointer",
            opacity: isBooking ? 0.7 : 1,
          }}
        >
          {isBooking ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Booking...</> : "Book In Google Calendar"}
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
        Preferred site visit time: {formatEasternDateTime(lead.visitDate) || lead.visitDate || "Not captured"}
      </div>

      {lead.lastActivity.includes("nearest slot") && (
        <div style={{
          marginBottom: 8,
          padding: "8px 10px",
          borderRadius: 8,
          fontSize: 12,
          color: "#92400e",
          background: "#fef3c7",
          border: "1px solid #fde68a",
        }}>
          Google Calendar auto-booked the nearest available slot for this visit.
        </div>
      )}

      {status && (
        <div style={{
          marginBottom: options.length > 0 ? 10 : 0,
          padding: "10px 12px",
          borderRadius: 8,
          fontSize: 12,
          color: status.type === "success" ? "#166534" : status.type === "error" ? "#991b1b" : "#92400e",
          background: status.type === "success" ? "#dcfce7" : status.type === "error" ? "#fef2f2" : "#fef3c7",
          border: `1px solid ${status.type === "success" ? "#a7f3d0" : status.type === "error" ? "#fecaca" : "#fde68a"}`,
        }}>
          {status.message}
          {status.actionUrl && (
            <div style={{ marginTop: 8 }}>
              <a
                href={status.actionUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: status.type === "success" ? "#166534" : status.type === "error" ? "#991b1b" : "#92400e",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                {status.actionLabel || "Open link"}
              </a>
            </div>
          )}
        </div>
      )}

      {options.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {options.map((slot) => (
            <button
              key={slot.start_time}
              onClick={() => onBookAlternative(slot)}
              disabled={isBooking}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d5d9e2",
                background: "#f8fafc",
                color: "#334155",
                fontSize: 12,
                cursor: isBooking ? "not-allowed" : "pointer",
              }}
            >
              {formatEasternDateTime(slot.start_time) || slot.start_time}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TH({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "#94a3b8",
      textTransform: "uppercase" as const, letterSpacing: 0.5,
    }}>{children}</div>
  );
}
