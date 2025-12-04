// src/sendAlert.ts
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

interface PickupDay {
  date: string; // "YYYY-MM-DD"
  garbage?: boolean;
  recycling?: boolean;
}

// ---- Helper to safely read env vars ----

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// ---- Load schedule ----

const schedulePath = path.join(__dirname, "..", "schedule.json");
const rawSchedule = fs.readFileSync(schedulePath, "utf8");
const schedule: PickupDay[] = JSON.parse(rawSchedule);

// ---- Zapier webhook ----

const zapierWebhookUrl = getEnv("ZAPIER_WEBHOOK_URL");

// ---- Logic ----

function getTomorrowDate(): string {
  // Uses the machine's local timezone (set it to Central / Milwaukee)
  return dayjs().add(1, "day").format("YYYY-MM-DD");
}

async function postToZapier(message: string): Promise<void> {
  // axios works in Node 14/16/18, no ESM drama
  await axios.post(zapierWebhookUrl, { message });
}

export async function sendPickupAlert(): Promise<void> {
  const tomorrow = getTomorrowDate();

  const pickup = schedule.find((entry) => entry.date === tomorrow);

  if (!pickup) {
    console.log(`No pickup scheduled for ${tomorrow}`);
    return;
  }

  const services: string[] = [];
  if (pickup.garbage) services.push("garbage");
  if (pickup.recycling) services.push("recycling");

  if (services.length === 0) {
    console.log(`Entry found for ${tomorrow} but no services set.`);
    return;
  }

  const niceDate = dayjs(tomorrow).format("dddd, MMM D");
  const body = `Reminder: ${services.join(
    " & "
  )} pickup tomorrow (${niceDate}). Put carts out tonight.`;

  console.log("Sending to Zapier:", body);

  await postToZapier(body);

  console.log("Sent to Zapier OK.");
}

// Allow running this file directly as a one-off
if (require.main === module) {
  sendPickupAlert().catch((err) => {
    console.error("Error sending pickup alert:", err);
    process.exit(1);
  });
}
