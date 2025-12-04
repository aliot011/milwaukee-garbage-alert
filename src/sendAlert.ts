// src/sendAlert.ts
import dayjs from "dayjs";
import dotenv from "dotenv";
import axios from "axios";
import { AddressParams, CityPickup, fetchCityResponse } from "./cityClient";

dotenv.config();

// ---- env helper ----

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const zapierWebhookUrl = getEnv("ZAPIER_WEBHOOK_URL");

// ---- date helpers ----

function parseCityDate(raw: string): dayjs.Dayjs | null {
  if (!raw) return null;
  // Remove leading weekday (e.g. "THURSDAY ")
  const withoutWeekday = raw.replace(/^[A-Z]+\s+/, "").trim();
  const jsDate = new Date(withoutWeekday);
  if (Number.isNaN(jsDate.getTime())) {
    console.warn("Could not parse city date:", raw);
    return null;
  }
  return dayjs(jsDate);
}

function getActualPickupDate(info?: CityPickup): dayjs.Dayjs | null {
  if (!info) return null;
  const raw = info.alt_date && info.alt_date.trim() ? info.alt_date : info.date;
  return parseCityDate(raw);
}

async function postToZapier(message: string): Promise<void> {
  await axios.post(zapierWebhookUrl, { message });
}

// ---- your address (for now) ----

const MY_ADDRESS: AddressParams = {
  laddr: "2433",
  sdir: "S",
  sname: "superior",
  stype: "ST",
  faddr: "2433 S sUperIOR ST",
};

// ---- core logic ----

export async function sendPickupAlertForAddress(
  address: AddressParams
): Promise<void> {
  const tomorrow = dayjs().add(1, "day").startOf("day");

  const data = await fetchCityResponse(address);

  if (!data.success) {
    console.error("City API returned success=false for address:", address);
    return;
  }

  const garbageDetermined = data.garbage?.is_determined ?? false;
  const recyclingDetermined = data.recycling?.is_determined ?? false;

  // If neither side has a determined schedule, treat as "no address / no schedule found"
  if (!garbageDetermined && !recyclingDetermined) {
    console.error(
      "City API could not determine a collection schedule for address:",
      address
    );
    return;
  }

  const garbageDate = getActualPickupDate(data.garbage);
  const recyclingDate = getActualPickupDate(data.recycling);

  console.log("City API next pickups for address:", {
    address,
    garbage: data.garbage?.date,
    garbage_alt: data.garbage?.alt_date,
    garbage_is_determined: data.garbage?.is_determined,
    recycling: data.recycling?.date,
    recycling_alt: data.recycling?.alt_date,
    recycling_is_determined: data.recycling?.is_determined,
  });

  const garbageTomorrow = garbageDate?.isSame(tomorrow, "day") ?? false;
  const recyclingTomorrow = recyclingDate?.isSame(tomorrow, "day") ?? false;

  if (!garbageTomorrow && !recyclingTomorrow) {
    console.log("No pickup tomorrow for this address based on city API.");
    return;
  }

  const services: string[] = [];
  if (garbageTomorrow) services.push("garbage");
  if (recyclingTomorrow) services.push("recycling");

  const niceDate = tomorrow.format("dddd, MMMM D, YYYY");
  const message = `Reminder: ${services.join(
    " & "
  )} pickup tomorrow (${niceDate}). Put carts out tonight.`;

  console.log("Sending to Zapier:", message);
  await postToZapier(message);
  console.log("Sent to Zapier OK.");
}

// convenience wrapper for your scheduler / alert:now
export async function sendPickupAlert(): Promise<void> {
  return sendPickupAlertForAddress(MY_ADDRESS);
}

// allow `npm run alert:now`
if (require.main === module) {
  sendPickupAlert().catch((err) => {
    console.error("Error sending pickup alert:", err);
    process.exit(1);
  });
}
