import nodemailer from 'nodemailer';

export interface EmailMessage {
  subject: string;
  text: string;
  html?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_TO);
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
