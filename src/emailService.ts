import sgMail from "@sendgrid/mail";
import crypto from "crypto";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

sgMail.setApiKey(getEnv("SENDGRID_API_KEY"));

const FROM_EMAIL = getEnv("SENDGRID_FROM_EMAIL");
const APP_BASE_URL = process.env.APP_BASE_URL || "https://milwaukeegarbagealert.com";
const VERIFICATION_TEMPLATE_ID = "d-8d9c237cb4364cba9172da261d86a8e3";
const PICKUP_REMINDER_TEMPLATE_ID = "d-a5def9730bac4f7391a2fab5af28e44c";

export function generateUnsubscribeToken(userId: string): string {
  const secret = getEnv("EMAIL_UNSUBSCRIBE_SECRET");
  return crypto.createHmac("sha256", secret).update(userId).digest("hex");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = generateUnsubscribeToken(userId);
  return crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
}

function buildUnsubscribeUrl(userId: string): string {
  const token = generateUnsubscribeToken(userId);
  return `${APP_BASE_URL}/unsubscribe-email?uid=${userId}&token=${token}`;
}

export async function sendPickupAlertEmail(
  to: string,
  userId: string,
  address: string,
  services: string[],
  pickupDay: string,
  altNote?: string
): Promise<void> {
  try {
    await sgMail.send({
      to,
      from: FROM_EMAIL,
      templateId: PICKUP_REMINDER_TEMPLATE_ID,
      dynamicTemplateData: {
        address,
        services: services.join(" & "),
        pickup_day: pickupDay,
        alt_note: altNote || "",
        unsubscribe_url: buildUnsubscribeUrl(userId),
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await sendErrorAlert(
      `SendGrid pickup email failed — ${to}`,
      `Failed to send pickup alert email to ${to}.\n\nError: ${detail}`
    );
    throw err;
  }
}

export async function sendErrorAlert(subject: string, body: string): Promise<void> {
  try {
    await sgMail.send({
      to: FROM_EMAIL,
      from: FROM_EMAIL,
      subject: `[MKE Garbage Alert] ${subject}`,
      text: body,
    });
  } catch (err) {
    // Log only — don't recurse
    console.error("[sendErrorAlert] Failed to send error alert email:", err);
  }
}

export async function sendVerificationEmail(to: string, userId: string, token: string): Promise<void> {
  const verifyUrl = `${APP_BASE_URL}/verify-email?token=${token}`;

  try {
    await sgMail.send({
      to,
      from: FROM_EMAIL,
      templateId: VERIFICATION_TEMPLATE_ID,
      dynamicTemplateData: {
        verify_url: verifyUrl,
        unsubscribe_url: buildUnsubscribeUrl(userId),
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await sendErrorAlert(
      `SendGrid verification email failed — ${to}`,
      `Failed to send verification email to ${to}.\n\nError: ${detail}`
    );
    throw err;
  }
}
