/**
 * Email Templates for PocketPantry Outreach
 *
 * Per Doc 3 (Outreach Workflow):
 * - Primary email: sent after voicemail or no answer
 * - Follow-up #1: sent if no response to primary email
 * - Follow-up #2: sent if no response to follow-up #1
 */

interface EmailContext {
  contactName: string;
  businessName: string;
  contactTitle?: string;
}

export function getPrimaryEmail(ctx: EmailContext) {
  return {
    subject: `AI-Powered Vending Solution for ${ctx.businessName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <p>Hi ${ctx.contactName},</p>

        <p>I just tried calling — I'm Ryan from <strong>PocketPantry</strong>, and I wanted to reach out about upgrading your breakroom with our <strong>AI-powered smart vending solution</strong>.</p>

        <p>Here's what makes us different from traditional vending:</p>

        <ul>
          <li><strong>No cost, no contract</strong> — we offer a free 3-month trial</li>
          <li><strong>AI-powered inventory</strong> — we track what sells in real-time and stock what your team actually wants</li>
          <li><strong>5% profit sharing</strong> — you earn a commission on every sale</li>
          <li><strong>100% hands-off</strong> — we handle all stocking, maintenance, and tech</li>
          <li><strong>Local operator</strong> — we're just 10 minutes away, not a faceless corporation</li>
        </ul>

        <p>I'd love to have our local owner-operator, <strong>Arthur</strong>, stop by for just 10 minutes to see your space and show you what we can set up for your team.</p>

        <p>Would you be open to a quick visit? Just reply to this email or call me at <strong>(470) 912-3759</strong>.</p>

        <p>Looking forward to hearing from you!</p>

        <p>
          Best,<br>
          <strong>Ryan</strong><br>
          PocketPantry<br>
          (470) 912-3759 | info@pvpantry.com
        </p>
      </div>
    `,
  };
}

export function getFollowUp1Email(ctx: EmailContext) {
  return {
    subject: `Quick follow-up — Vending for ${ctx.businessName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <p>Hi ${ctx.contactName},</p>

        <p>Just following up on my earlier message about PocketPantry's smart vending machines. I know you're busy, so I'll keep this short.</p>

        <p>We're currently offering a <strong>no-risk 3-month trial</strong> — if your team doesn't love it, we'll remove the machines, no questions asked.</p>

        <p>A few quick highlights:</p>

        <ul>
          <li>Customizable menus — salads, energy drinks, snacks, whatever your team wants</li>
          <li>Remote monitoring means we refill before you even notice a row is empty</li>
          <li>Free advertising on our digital screens at other locations</li>
          <li>5% profit sharing on every sale</li>
        </ul>

        <p>Would a 10-minute visit from our local operator work for you this week? Just reply with a day and time that's convenient.</p>

        <p>
          Best,<br>
          <strong>Ryan</strong><br>
          PocketPantry<br>
          (470) 912-3759 | info@pvpantry.com
        </p>
      </div>
    `,
  };
}

export function getFollowUp2Email(ctx: EmailContext) {
  return {
    subject: `Last check-in — Free vending trial for ${ctx.businessName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <p>Hi ${ctx.contactName},</p>

        <p>I wanted to reach out one last time. I understand if the timing isn't right, but I didn't want you to miss out on what we're offering.</p>

        <p><strong>Here's the quick version:</strong> We place AI-powered vending machines in your breakroom at zero cost. No contract. You earn 5% on every sale. We handle everything.</p>

        <p>If you're interested, just reply "yes" and I'll have Arthur reach out to schedule a quick 10-minute visit.</p>

        <p>If now isn't the right time, no worries at all — we'll be here when you're ready.</p>

        <p>
          Best,<br>
          <strong>Ryan</strong><br>
          PocketPantry<br>
          (470) 912-3759 | info@pvpantry.com
        </p>
      </div>
    `,
  };
}
