// Email sender with two providers. Priority:
//   1. SMTP (e.g. Gmail app password) if SMTP_HOST/SMTP_USER/SMTP_PASS are set
//   2. Resend HTTP API if RESEND_API_KEY is set
// If neither is configured it logs to the server console and reports notSent, so
// the flow still works in dev — the caller surfaces the link to a trusted admin.
import nodemailer from 'nodemailer';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// From-address: explicit EMAIL_FROM, else fall back to the SMTP user.
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.SMTP_USER;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);

function smtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

export function emailConfigured() {
  return Boolean((smtpConfigured() || RESEND_API_KEY) && EMAIL_FROM);
}

// Reuse one transporter across invocations (cached on globalThis for hot-reload).
function getTransport() {
  if (!smtpConfigured()) return null;
  const g = globalThis;
  if (!g.__mailTransport) {
    g.__mailTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return g.__mailTransport;
}

// Returns { sent: boolean, error?: string }.
export async function sendEmail({ to, subject, html, text }) {
  // 1. SMTP (Gmail etc.)
  const transport = getTransport();
  if (transport) {
    try {
      await transport.sendMail({ from: EMAIL_FROM, to, subject, html, text });
      return { sent: true };
    } catch (e) {
      console.error('[email] SMTP send error:', e.message);
      return { sent: false, error: e.message };
    }
  }

  // 2. Resend
  if (RESEND_API_KEY && EMAIL_FROM) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[email] Resend failed (${res.status}): ${body}`);
        return { sent: false, error: `Resend ${res.status}` };
      }
      return { sent: true };
    } catch (e) {
      console.error('[email] Resend error:', e.message);
      return { sent: false, error: e.message };
    }
  }

  // 3. No provider configured — log and report not sent.
  console.log(`\n[email:disabled] would send to ${to}\n  subject: ${subject}\n  ${text || ''}\n`);
  return { sent: false };
}

// Credentials email: the user's login id and a (temporary) password. `idLabel`
// is "Roll number" for students / "Teacher ID" for teachers. `firstTime` tweaks
// the wording between account creation and a re-issue/reset.
export async function sendCredentialsEmail({ to, name, idLabel, loginId, password, loginUrl, firstTime = true }) {
  const subject = firstTime ? 'Your AttendNet account is ready' : 'Your new AttendNet password';
  const lead = firstTime
    ? `An administrator created an AttendNet account for you. Here are your sign-in details.`
    : `Here are your new AttendNet sign-in details (any previous password no longer works).`;
  const signIn = loginUrl ? `\n\nSign in: ${loginUrl}` : '';
  const text =
    `Hi ${name || ''},\n\n${lead}\n\n` +
    `${idLabel}: ${loginId}\nPassword: ${password}${signIn}\n\n` +
    `For your security, change this password from your dashboard after you sign in.\n` +
    `If you didn't expect this, contact your administrator.`;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:auto">
      <h2 style="margin:0 0 8px">AttendNet</h2>
      <p>Hi ${name || ''},</p>
      <p>${lead}</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:6px 14px 6px 0;color:#555">${idLabel}</td>
            <td style="font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:16px">${loginId}</td></tr>
        <tr><td style="padding:6px 14px 6px 0;color:#555">Password</td>
            <td style="font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:16px">${password}</td></tr>
      </table>
      ${loginUrl ? `<p><a href="${loginUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Sign in</a></p>` : ''}
      <p style="color:#666;font-size:13px">For your security, change this password from your dashboard after signing in.</p>
      <p style="color:#999;font-size:12px">If you didn't expect this, contact your administrator.</p>
    </div>`;
  return sendEmail({ to, subject, html, text });
}
