import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

const FROM_EMAIL = "PSL Labs Website <support@psllabs.org>";
const SUPPORT_EMAIL = "support@psllabs.org";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 150;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 5000;

type ContactRequestBody = {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: ContactRequestBody;
  try {
    body = (await request.json()) as ContactRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request format." },
      { status: 400 }
    );
  }

  // Honeypot — silently accept without sending.
  if (asString(body.website)) {
    return NextResponse.json({ success: true });
  }

  const name = asString(body.name);
  const email = asString(body.email);
  const subject = asString(body.subject);
  const message = asString(body.message);

  if (!name) return validationError("Name is required.");
  if (name.length > MAX_NAME_LENGTH) {
    return validationError(
      `Name must be ${MAX_NAME_LENGTH} characters or fewer.`
    );
  }

  if (!email) return validationError("Email is required.");
  if (email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
    return validationError("A valid email address is required.");
  }

  if (!subject) return validationError("Subject is required.");
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return validationError(
      `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`
    );
  }

  if (!message) return validationError("Message is required.");
  if (message.length < MIN_MESSAGE_LENGTH) {
    return validationError(
      `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`
    );
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return validationError(
      `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`
    );
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const toEmail = process.env.CONTACT_TO_EMAIL ?? SUPPORT_EMAIL;
  const bccEmail = process.env.CONTACT_BCC_EMAIL || undefined;

  if (!host || !user || !password) {
    console.error("[contact] SMTP is not configured");
    return NextResponse.json(
      { error: "Email service is not configured." },
      { status: 500 }
    );
  }

  const submittedAt = new Date().toUTCString();

  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    "",
    "Message:",
    message,
    "",
    `Submitted: ${submittedAt}`,
    "Source: PSL Labs Contact Form",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0b1220; line-height: 1.6;">
      <h2 style="margin: 0 0 16px;">New PSL Labs contact message</h2>
      <p style="margin: 0 0 4px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p style="margin: 0 0 4px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p style="margin: 0 0 4px;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <p style="margin: 16px 0 4px;"><strong>Message:</strong></p>
      <p style="margin: 0 0 16px; white-space: pre-wrap;">${escapeHtml(message)}</p>
      <hr style="border: none; border-top: 1px solid #dce7f3; margin: 16px 0;" />
      <p style="margin: 0 0 4px; color: #64748b; font-size: 13px;"><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
      <p style="margin: 0; color: #64748b; font-size: 13px;"><strong>Source:</strong> PSL Labs Contact Form</p>
    </div>
  `;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      requireTLS: true,
      auth: {
        user,
        pass: password,
      },
    });

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: toEmail,
      bcc: bccEmail,
      replyTo: email,
      subject: `[PSL Labs Contact] ${subject}`,
      text,
      html,
    });

    return NextResponse.json({ success: true });
  } catch {
    console.error("[contact] Failed to send message");
    return NextResponse.json(
      { error: "Failed to send your message. Please try again." },
      { status: 502 }
    );
  }
}
