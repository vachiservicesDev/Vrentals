import nodemailer from 'nodemailer';

/**
 * Rentals' own invite and password-reset emails, sent through the SMTP account in env (a Gmail
 * account with an App Password works) instead of Supabase's mailer. Links point straight at this
 * app's /auth/confirm with a token hash, so they never depend on Supabase's Site URL setting.
 */

export type AuthLinkType = 'invite' | 'recovery';

export function smtpConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** /auth/confirm turns token_hash + type into a session, then moves on to /set-password. */
export function confirmUrl(appUrl: string, hashedToken: string, type: AuthLinkType): string {
  const params = new URLSearchParams({ token_hash: hashedToken, type, next: '/set-password' });
  return `${appUrl.replace(/\/+$/, '')}/auth/confirm?${params}`;
}

const BRAND = '#215a42';
const INK = '#1f1b16';
const MUTED = '#6e655b';

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(heading: string, paragraphs: string[], button: { label: string; url: string }, footnote: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${INK}">${p}</p>`).join('');
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#faf7f2;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e2d9;border-radius:8px">
<tr><td style="padding:24px 32px;border-bottom:3px solid ${BRAND}">
<span style="font-size:20px;font-weight:bold;color:${BRAND}">Rentals</span>
</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 20px;font-size:24px;line-height:32px;color:${INK}">${heading}</h1>
${body}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:6px;background:${BRAND}">
<a href="${escape(button.url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none">${button.label}</a>
</td></tr></table>
<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${MUTED}">${footnote}</p>
<p style="margin:0;font-size:13px;line-height:20px;color:${MUTED};word-break:break-all">If the button doesn't work, paste this into your browser:<br><a href="${escape(button.url)}" style="color:${BRAND}">${escape(button.url)}</a></p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e8e2d9;font-size:12px;line-height:18px;color:${MUTED}">
Sent by Rentals. If you weren&#39;t expecting this email, you can ignore it.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function resetEmail(firstName: string, url: string) {
  const name = firstName.trim().split(/\s+/)[0] || 'there';
  const subject = 'Reset your Rentals password';
  const html = layout(
    `Hi ${escape(name)},`,
    ['We got a request to reset the password for your Rentals account. Use the button below to choose a new one.'],
    { label: 'Choose a new password', url },
    "This link works once and expires in an hour. If you didn't ask for a reset, you can ignore this email and your password stays the same.",
  );
  const text = `Hi ${name},

We got a request to reset the password for your Rentals account. Choose a new one here:
${url}

This link works once and expires in an hour. If you didn't ask for a reset, you can ignore this email and your password stays the same.`;
  return { subject, html, text };
}

export function tenantWelcomeEmail(name: string, homeName: string, url: string) {
  const first = name.trim().split(/\s+/)[0] || 'there';
  const subject = `Your Rentals account for ${homeName}`;
  const intro = `Your landlord uses Rentals for ${homeName}. You can see your rent and payment history, report anything that needs fixing and pick a time for the repair, and message your landlord, all in one place.`;
  const html = layout(
    `Hi ${escape(first)},`,
    [escape(intro), 'To get started, choose a password for your account. It takes less than a minute.'],
    { label: 'Set up my account', url },
    'For your security, this link works once and expires in 24 hours. If it has expired, ask your landlord to send a new one.',
  );
  const text = `Hi ${first},

${intro}

To get started, choose a password for your account:
${url}

For your security, this link works once and expires in 24 hours. If it has expired, ask your landlord to send a new one.`;
  return { subject, html, text };
}

/** Sends one email from the app's SMTP account. Throws when SMTP is missing or the send fails. */
export async function sendMail(to: string, mail: { subject: string; html: string; text: string }): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('SMTP_USER and SMTP_PASS are not set');
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  await transporter.sendMail({ from: `"Rentals" <${user}>`, to, ...mail });
}
