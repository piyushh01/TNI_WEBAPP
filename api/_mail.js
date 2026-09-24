import nodemailer from "nodemailer";

// App notification emails (training assigned, …) go out over SMTP directly —
// Supabase's SMTP setting only covers auth emails (invite / reset).
// Configure with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, optional
// SMTP_FROM ("Skillgo <no-reply@…>"). Same values as Supabase → Emails → SMTP.

let _transport;
export function mailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}
function transport() {
  if (!_transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return _transport;
}

export async function sendMail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || `Skillgo <${process.env.SMTP_USER}>`;
  await transport().sendMail({ from, to, subject, html, text });
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Branded, email-client-safe layout (tables + inline styles).
export function emailLayout({ heading, intro, bodyHtml, ctaUrl, ctaLabel }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#e7ebe8;font-family:Montserrat,Segoe UI,Arial,sans-serif;color:#142019">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7ebe8;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e0e5e1;border-radius:14px">
<tr><td style="background:#234532;border-radius:14px 14px 0 0;padding:18px 28px;color:#ffffff;font-size:16px;font-weight:700">Skillgo <span style="color:#a9c59b;font-weight:500;font-size:12px">· o2h technology</span></td></tr>
<tr><td style="padding:28px">
<div style="font-size:19px;font-weight:700;margin:0 0 8px">${esc(heading)}</div>
<div style="font-size:14px;line-height:1.6;color:#344139;margin:0 0 18px">${esc(intro)}</div>
${bodyHtml}
${ctaUrl ? `<div style="margin-top:24px"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#557c3f;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px">${esc(ctaLabel)}</a></div>` : ""}
</td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #e0e5e1;font-size:11px;color:#77827b">You're receiving this because you use Skillgo at o2h.</td></tr>
</table></td></tr></table></body></html>`;
}
export { esc };
