import nodemailer from 'nodemailer';

const {
  MAIL_HOST,
  MAIL_PORT,
  MAIL_USERNAME,
  MAIL_PASSWORD,
  MAIL_ENCRYPTION,
  MAIL_FROM_ADDRESS,
  MAIL_FROM_NAME,
} = process.env;

function getTransport() {
  if (!MAIL_HOST || !MAIL_USERNAME || !MAIL_PASSWORD) {
    throw new Error('Mail is not configured. Set MAIL_HOST, MAIL_USERNAME, and MAIL_PASSWORD in backend/.env');
  }

  const port = Number(MAIL_PORT || 587);
  const secure = MAIL_ENCRYPTION === 'ssl' || port === 465;

  return nodemailer.createTransport({
    host: MAIL_HOST,
    port,
    secure,
    auth: {
      user: MAIL_USERNAME,
      pass: MAIL_PASSWORD,
    },
  });
}

export async function sendPasswordResetCode(email: string, code: string, role: 'student' | 'parent') {
  const transport = getTransport();
  const fromName = MAIL_FROM_NAME || 'SmartPOS';
  const fromAddress = MAIL_FROM_ADDRESS || MAIL_USERNAME;

  const roleLabel = role === 'student' ? 'Student' : 'Parent';

  await transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: email,
    subject: `${fromName} - Password reset code`,
    text: [
      `Your ${roleLabel} portal password reset code is: ${code}`,
      '',
      'This code expires in 5 minutes.',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#0A1F44;margin:0 0 12px">${fromName}</h2>
        <p>Your <strong>${roleLabel}</strong> portal password reset code is:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#0A1F44;margin:24px 0">${code}</p>
        <p style="color:#666;font-size:14px">This code expires in <strong>5 minutes</strong>.</p>
        <p style="color:#999;font-size:12px">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}

export function isMailConfigured(): boolean {
  return Boolean(MAIL_HOST && MAIL_USERNAME && MAIL_PASSWORD);
}
