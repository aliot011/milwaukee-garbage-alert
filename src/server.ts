// src/server.ts
import express from "express";
import crypto from "crypto";
import path from "path";

import { AddressParams, fetchCityResponse, CityPickup } from "./cityClient";
import { User } from "./models";
import { saveUser, findUserByPhone, updateUser } from "./userStore";
import { sendSms } from "./smsService";

import dayjs from "dayjs";

const app = express();

// Support JSON (from your frontend) and URL-encoded (from Twilio later)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Support JSON (from your frontend) and URL-encoded (from Twilio later)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static frontend files from /public
const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));

// --- helpers ---

const PROGRAM_NAME = "MKE Garbage Pickup Alerts";

const STOP_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);
const STATUS_KEYWORDS = new Set(["STATUS"]);
const YES_KEYWORDS = new Set(["YES", "Y"]);

// Normalize phone to E.164 where possible.
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (phone.startsWith("+")) {
    return phone;
  }
  return digits ? `+${digits}` : "";
}

function parseCityDate(raw: string): dayjs.Dayjs | null {
  if (!raw) return null;
  // Remove leading weekday (e.g. "THURSDAY ")
  const withoutWeekday = raw.replace(/^[A-Z]+\s+/, "").trim();
  const jsDate = new Date(withoutWeekday);
  if (Number.isNaN(jsDate.getTime())) {
    console.warn("[city] Could not parse city date:", raw);
    return null;
  }
  return dayjs(jsDate);
}

function getActualPickupDate(info?: CityPickup): dayjs.Dayjs | null {
  if (!info) return null;
  const raw = info.alt_date && info.alt_date.trim() ? info.alt_date : info.date;
  return parseCityDate(raw);
}

function formatAddress(address: AddressParams): string {
  return address.faddr ? address.faddr.toUpperCase() : "your address";
}

async function buildNextPickupSummary(user: User): Promise<string | null> {
  const data = await fetchCityResponse(user.address);
  const garbageDetermined = data.garbage?.is_determined ?? false;
  const recyclingDetermined = data.recycling?.is_determined ?? false;

  if (!data.success || (!garbageDetermined && !recyclingDetermined)) {
    return null;
  }

  const garbageDate = getActualPickupDate(data.garbage);
  const recyclingDate = getActualPickupDate(data.recycling);

  const parts: string[] = [];
  if (garbageDate) {
    parts.push(`garbage: ${garbageDate.format("dddd, MMMM D, YYYY")}`);
  }
  if (recyclingDate) {
    parts.push(`recycling: ${recyclingDate.format("dddd, MMMM D, YYYY")}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" and ");
}

/**
 * Helper to build a status / “already subscribed” message with next pickup dates.
 *
 * mode = "status"           → used when user texts STATUS
 * mode = "alreadySubscribed" → used when user hits /signup again with same phone
 */
async function buildNextPickupMessage(
  user: User,
  mode: "status" | "alreadySubscribed" = "status"
): Promise<string> {
  const address = formatAddress(user.address);
  const nextPickups = await buildNextPickupSummary(user);

  if (!nextPickups) {
    return `${PROGRAM_NAME}: We couldn't determine upcoming pickup dates for ${address}. Reply STOP to unsubscribe, HELP for help.`;
  }

  if (mode === "alreadySubscribed") {
    return `${PROGRAM_NAME}: You're already subscribed for ${address}. Next: ${nextPickups}. Reply STOP to unsubscribe or STATUS for next dates.`;
  }

  return `${PROGRAM_NAME}: Next pickups for ${address}: ${nextPickups}. Reply STOP to unsubscribe, HELP for help.`;
}

function buildConfirmationMessage(address: string): string {
  return `${PROGRAM_NAME}: Reply YES to confirm trash/recycling pickup texts for ${address}. Up to 4 msgs/month. Msg&data rates may apply. Reply STOP to unsubscribe, HELP for help.`;
}

function buildWelcomeMessage(address: string, nextPickups: string | null): string {
  if (!nextPickups) {
    return `${PROGRAM_NAME}: You're subscribed for ${address}. Up to 4 msgs/month. Msg&data rates may apply. Reply STATUS for next dates, STOP to unsubscribe, HELP for help.`;
  }

  return `${PROGRAM_NAME}: You're subscribed for ${address}. Next: ${nextPickups}. Up to 4 msgs/month. Msg&data rates may apply. Reply STATUS for next dates, STOP to unsubscribe, HELP for help.`;
}

function buildHelpMessage(): string {
  return `${PROGRAM_NAME}: Trash/recycling pickup reminders & schedule updates (up to 4 msgs/month). Msg&data rates may apply. Reply STATUS for next dates. Reply STOP to unsubscribe. Support: jalioto@joesidea.com`;
}

function buildStopMessage(address: string): string {
  return `${PROGRAM_NAME}: You're unsubscribed for ${address}. No more messages will be sent. Reply START to re-subscribe or email jalioto@joesidea.com.`;
}

function buildPendingReminder(address: string): string {
  return `${PROGRAM_NAME}: Reply YES to confirm pickup texts for ${address}. Reply STOP to unsubscribe, HELP for help.`;
}

// --- routes ---

// Simple health check
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * 1) SIGNUP:
 * User sends phone + address params (from frontend or gsheet backend).
 * If the phone is already an active user, we:
 *   - DO NOT create a new user
 *   - send them a text saying they’re already signed up + next pickup dates + STOP reminder
 * Otherwise:
 *   - We validate the address by calling the city API.
 *   - If it looks good, we create a pending user and send a "Reply YES / STOP" SMS.
 */
app.post("/signup", async (req, res) => {
  try {
    const {
      phone,
      laddr,
      sdir,
      sname,
      stype,
      faddr,
      sms_consent,
      consent_source,
    } = req.body;

    if (!phone || !laddr || !sname || !stype || !faddr) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!sms_consent || !consent_source) {
      return res.status(400).json({
        error: "SMS consent and consent source are required.",
      });
    }

    const normalizedPhone = normalizePhone(phone);

    // If this phone is already an ACTIVE user, treat this as an idempotent call:
    // don’t create a new record; text them their status + next dates instead.
    const existingUser = findUserByPhone(normalizedPhone);

    if (
      existingUser &&
      existingUser.status === "active" &&
      existingUser.verified
    ) {
      console.log(
        "[/signup] existing active user, sending already-signed-up status:",
        {
          phone: normalizedPhone,
        }
      );

      try {
        const msg = await buildNextPickupMessage(
          existingUser,
          "alreadySubscribed"
        );
        await sendSms(existingUser.phone, msg);
      } catch (err) {
        console.error(
          "Error building/sending already-signed-up message for user:",
          existingUser.phone,
          err
        );
        // We still return 200 to the frontend so it doesn’t look like an error.
      }

      return res.status(200).json({
        message:
          "You're already subscribed. We sent you a text with your next pickup dates.",
        userId: existingUser.id,
        alreadySignedUp: true,
      });
    }

    // Otherwise, continue with normal signup flow
    const address: AddressParams = {
      laddr: String(laddr),
      sdir: sdir || "",
      sname,
      stype,
      faddr,
    };

    // Validate address via city API
    const cityData = await fetchCityResponse(address);
    const garbageDetermined = cityData.garbage?.is_determined ?? false;
    const recyclingDetermined = cityData.recycling?.is_determined ?? false;

    if (!cityData.success || (!garbageDetermined && !recyclingDetermined)) {
      return res.status(400).json({
        error:
          "Could not determine a collection schedule for that address. Please double-check it.",
      });
    }

    const now = new Date();
    const user: User = existingUser
      ? {
          ...existingUser,
          phone: normalizedPhone,
          address,
          status: "pending_confirm",
          verified: false,
          consent: {
            consentChecked: true,
            sourceUrl: String(consent_source),
            submittedAt: now,
            confirmedAt: null,
          },
          updatedAt: now,
        }
      : {
          id: crypto.randomUUID(),
          phone: normalizedPhone,
          address,
          status: "pending_confirm",
          verified: false,
          consent: {
            consentChecked: true,
            sourceUrl: String(consent_source),
            submittedAt: now,
            confirmedAt: null,
          },
          createdAt: now,
          updatedAt: now,
        };

    saveUser(user);

    // Send opt-in SMS (YES to confirm, STOP to stop)
    const upperAddr = address.faddr.toUpperCase();
    const message = buildConfirmationMessage(upperAddr);
    await sendSms(user.phone, message);

    return res.status(200).json({
      message:
        "Signup received. We sent you a text — reply YES to confirm. Reply STOP to unsubscribe, HELP for help.",
      userId: user.id,
    });
  } catch (err) {
    console.error("Error in /signup:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 2) INBOUND SMS: YES/Y = opt-in, STOP = opt-out, HELP/INFO = help,
// STATUS = next pickup info.
app.post("/sms/inbound", async (req, res) => {
  const fromRaw = (req.body.From || "") as string;
  const bodyRaw = (req.body.Body || "") as string;

  console.log("[/sms/inbound] incoming:", {
    From: fromRaw,
    Body: bodyRaw,
    rawBody: req.body,
  });

  const from = normalizePhone(fromRaw);
  const body = bodyRaw.trim().toUpperCase();

  if (!from) {
    console.warn("Inbound SMS with no From number");
    return res.status(200).type("text/xml").send("<Response></Response>");
  }

  const user = findUserByPhone(from);

  if (!user) {
    console.log("Inbound SMS from unknown number:", from, "body:", body);
    return res.status(200).type("text/xml").send("<Response></Response>");
  }

  const address = formatAddress(user.address);

  // --- STOP keywords: unsubscribe ---
  if (STOP_KEYWORDS.has(body)) {
    user.status = "unsubscribed";
    user.verified = false;
    updateUser(user);
    console.log("User unsubscribed via SMS:", from);

    const msg = buildStopMessage(address);
    await sendSms(user.phone, msg);

    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  // --- HELP/INFO: help ---
  if (HELP_KEYWORDS.has(body)) {
    const msg = buildHelpMessage();
    await sendSms(user.phone, msg);

    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  // --- START: re-subscribe flow ---
  if (body === "START" && user.status === "unsubscribed") {
    user.status = "pending_confirm";
    user.verified = false;
    user.consent.confirmedAt = null;
    user.consent.submittedAt = new Date();
    updateUser(user);

    const msg = buildConfirmationMessage(address);
    await sendSms(user.phone, msg);

    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  // --- YES/Y: opt-in / confirm ---
  if (YES_KEYWORDS.has(body)) {
    if (user.status !== "pending_confirm") {
      const msg =
        user.status === "active"
          ? await buildNextPickupMessage(user, "status")
          : buildConfirmationMessage(address);
      await sendSms(user.phone, msg);
      return res
        .status(200)
        .type("text/xml")
        .send(`<Response><Message>${msg}</Message></Response>`);
    }

    user.status = "active";
    user.verified = true;
    user.consent.confirmedAt = new Date();
    updateUser(user);
    console.log("User opted in via YES:", from);

    const nextPickups = await buildNextPickupSummary(user);
    const msg = buildWelcomeMessage(address, nextPickups);
    await sendSms(user.phone, msg);

    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  // --- STATUS: send next pickup info ---
  if (STATUS_KEYWORDS.has(body)) {
    if (user.status === "active" && user.verified) {
      try {
        const msg = await buildNextPickupMessage(user, "status");
        console.log("Sending next-pickup info to", user.phone, ":", msg);
        await sendSms(user.phone, msg);

        return res
          .status(200)
          .type("text/xml")
          .send(`<Response><Message>${msg}</Message></Response>`);
      } catch (err) {
        console.error(
          "Error fetching next pickup info for user:",
          user.phone,
          err
        );
        const msg = `${PROGRAM_NAME}: Sorry, we couldn't look up your pickup info right now. Please try again later. Reply STOP to unsubscribe, HELP for help.`;
        await sendSms(user.phone, msg);

        return res
          .status(200)
          .type("text/xml")
          .send(`<Response><Message>${msg}</Message></Response>`);
      }
    }

    const msg =
      user.status === "pending_confirm"
        ? buildPendingReminder(address)
        : buildStopMessage(address);
    await sendSms(user.phone, msg);
    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  // --- Any other message from an ACTIVE user: send next pickup info ---
  if (user.status === "active" && user.verified) {
    try {
      const msg = await buildNextPickupMessage(user, "status");
      await sendSms(user.phone, msg);
      return res
        .status(200)
        .type("text/xml")
        .send(`<Response><Message>${msg}</Message></Response>`);
    } catch (err) {
      console.error(
        "Error fetching next pickup info for user:",
        user.phone,
        err
      );
      const msg = `${PROGRAM_NAME}: Sorry, we couldn't look up your pickup info right now. Please try again later. Reply STOP to unsubscribe, HELP for help.`;
      await sendSms(user.phone, msg);
      return res
        .status(200)
        .type("text/xml")
        .send(`<Response><Message>${msg}</Message></Response>`);
    }
  }

  // --- Any other message from non-active user: send confirmation reminder ---
  if (user.status === "pending_confirm") {
    const msg = buildPendingReminder(address);
    await sendSms(user.phone, msg);
    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  return res.status(200).type("text/xml").send("<Response></Response>");
});

// --- start server ---

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Onboarding API listening on port ${PORT}`);
});
