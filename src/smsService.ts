// src/smsService.ts
import twilio from "twilio";
import dotenv from "dotenv";
import { sendErrorAlert } from "./emailService";

dotenv.config();

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const client = twilio(getEnv("TWILIO_ACCOUNT_SID"), getEnv("TWILIO_AUTH_TOKEN"));
const fromNumber = getEnv("TWILIO_PHONE_NUMBER");

export async function sendSms(phone: string, message: string): Promise<void> {
  try {
    await client.messages.create({
      body: message,
      from: fromNumber,
      to: phone,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await sendErrorAlert(
      `Twilio SMS failed — ${phone}`,
      `Failed to send SMS to ${phone}.\n\nError: ${detail}\n\nMessage body:\n${message}`
    );
    throw err;
  }
}
