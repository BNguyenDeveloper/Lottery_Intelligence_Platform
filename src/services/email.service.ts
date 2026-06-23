import nodemailer from 'nodemailer';

export interface EmailMessage {
  subject: string;
  text: string;
  html?: string;
}

export interface EmailConfigStatus {
  configured: boolean;
  missing: string[];
}

const REQUIRED_EMAIL_ENV_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_TO'] as const;

export function getEmailConfigStatus(): EmailConfigStatus {
  const missing = REQUIRED_EMAIL_ENV_KEYS.filter((key) => !process.env[key]);
  return {
    configured: missing.length === 0,
    missing,
  };
}

export function isEmailConfigured(): boolean {
  return getEmailConfigStatus().configured;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!isEmailConfigured()) {
    return;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to: process.env.EMAIL_TO,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
