import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import type { Alert } from "@/lib/alerts-engine";

export const dynamic = "force-dynamic";

function buildDigestHtml(alerts: Alert[]): string {
  const rows = alerts
    .map(
      (a) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.severity.toUpperCase()}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.productName || a.machineName || "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.message}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.daysRemaining ?? "—"}d</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${a.recommendedQty ?? ""}</td>
        </tr>`
    )
    .join("");
  return `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:720px;">
      <h2 style="margin-bottom:4px;">Inventory Alerts — ${new Date().toLocaleDateString()}</h2>
      <p style="color:#666;margin-top:0;">${alerts.length} open alert${alerts.length === 1 ? "" : "s"} require attention.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr style="background:#f7f7f7;text-align:left;">
            <th style="padding:6px 10px;">Severity</th>
            <th style="padding:6px 10px;">Item</th>
            <th style="padding:6px 10px;">Message</th>
            <th style="padding:6px 10px;">Days Left</th>
            <th style="padding:6px 10px;">Buy Qty</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const alerts = (body.alerts || []) as Alert[];
    if (alerts.length === 0) return NextResponse.json({ success: true, sent: false });

    const to = process.env.EMAIL_AGENT_DIGEST_TO;
    if (!to) return NextResponse.json({ success: true, sent: false, reason: "EMAIL_AGENT_DIGEST_TO unset" });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.resend.com",
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER || "resend",
        pass: process.env.SMTP_PASS || process.env.RESEND_API_KEY || "",
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || "alerts@pocketpantry.app",
      to,
      subject: `PocketPantry — ${alerts.length} inventory alert${alerts.length === 1 ? "" : "s"}`,
      html: buildDigestHtml(alerts),
    });
    return NextResponse.json({ success: true, sent: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
