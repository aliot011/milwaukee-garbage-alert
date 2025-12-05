// src/smsService.ts
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const zapierWebhookUrl = getEnv("ZAPIER_WEBHOOK_URL");

/**
 * For now: always send SMS via Zapier. Later: replace this with Twilio.
 */
export async function sendSms(phone: string, message: string): Promise<void> {
  // Zapier SMS is tied to your phone number, so `phone` is unused for now.
  await axios.post(zapierWebhookUrl, { message });
}
