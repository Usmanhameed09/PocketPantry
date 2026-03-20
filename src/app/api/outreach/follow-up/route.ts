import { NextRequest, NextResponse } from "next/server";
import { getAllLeads, updateLead, addEmailLog } from "@/lib/leads-store";
import { getFollowUp1Email, getFollowUp2Email } from "@/lib/email-templates";

/**
 * POST /api/outreach/follow-up
 *
 * Doc 3 Workflow: Automated follow-up emails
 * - Finds leads that need follow-up emails
 * - Sends follow-up #1 to leads with primary email sent but no response
 * - Sends follow-up #2 to leads with follow-up #1 sent but no response
 *
 * Can be called manually or via a cron job (e.g., Vercel Cron).
 */

export async function POST(request: NextRequest) {
  try {
    const leads = await getAllLeads();
    const results = { followUp1Sent: 0, followUp2Sent: 0, errors: 0 };

    for (const lead of leads) {
      // Skip leads that are already resolved
      if (["Interested", "Site Visit Requested", "Proposal Requested", "Not Interested"].includes(lead.stage)) {
        continue;
      }

      // Skip leads without email
      if (!lead.email) continue;

      // Send follow-up #1: primary email was sent, but no follow-up #1 yet
      if (lead.emailSent && !lead.followUp1Sent) {
        try {
          const template = getFollowUp1Email({
            contactName: lead.contact,
            businessName: lead.business,
          });

          await addEmailLog(lead.id, template.subject, "Sent");
          await updateLead(lead.id, { followUp1Sent: true });

          if (process.env.RESEND_API_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "Ryan <ryan@pvpantry.com>",
                to: [lead.email],
                subject: template.subject,
                html: template.html,
              }),
            });
          }

          results.followUp1Sent++;
          console.log(`[Follow-up] #1 sent to ${lead.business} (${lead.email})`);
        } catch {
          results.errors++;
        }
      }

      // Send follow-up #2: follow-up #1 was sent, but no follow-up #2 yet
      if (lead.followUp1Sent && !lead.followUp2Sent) {
        try {
          const template = getFollowUp2Email({
            contactName: lead.contact,
            businessName: lead.business,
          });

          await addEmailLog(lead.id, template.subject, "Sent");
          await updateLead(lead.id, { followUp2Sent: true });

          if (process.env.RESEND_API_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "Ryan <ryan@pvpantry.com>",
                to: [lead.email],
                subject: template.subject,
                html: template.html,
              }),
            });
          }

          results.followUp2Sent++;
          console.log(`[Follow-up] #2 sent to ${lead.business} (${lead.email})`);
        } catch {
          results.errors++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      ...results,
      message: `Follow-ups sent: ${results.followUp1Sent} first, ${results.followUp2Sent} second`,
    });
  } catch (error) {
    console.error("[Follow-up] Error:", error);
    return NextResponse.json({ error: "Follow-up processing failed" }, { status: 500 });
  }
}
