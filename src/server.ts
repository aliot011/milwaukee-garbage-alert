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

// Very naive phone normalization for now: strip non-digits
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
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

/**
 * Helper to build a status / “already signed up” message with next pickup dates.
 *
 * mode = "status"          → used when user texts STATUS / any non-CANCEL text
 * mode = "alreadySignedUp" → used when user hits /signup again with same phone
 */
async function buildNextPickupMessage(
  user: User,
  mode: "status" | "alreadySignedUp" = "status"
): Promise<string> {
  const data = await fetchCityResponse(user.address);

  const garbageDetermined = data.garbage?.is_determined ?? false;
  const recyclingDetermined = data.recycling?.is_determined ?? false;
  const upperAddr =
    (user.address?.faddr && user.address.faddr.toUpperCase()) || "";

  const prefixAlready = upperAddr
    ? `You're already signed up for MKE pickup alerts for ${upperAddr}. `
    : "You're already signed up for MKE pickup alerts. ";

  const prefixStatus = upperAddr ? `For ${upperAddr}, ` : "";

  const prefix = mode === "alreadySignedUp" ? prefixAlready : prefixStatus;

  if (!data.success || (!garbageDetermined && !recyclingDetermined)) {
    const tail =
      "We couldn't determine upcoming pickup dates for your address right now. Reply CANCEL to stop alerts.";
    return prefix ? `${prefix}${tail}` : tail;
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
    const tail =
      "We couldn't find upcoming pickup dates for your address right now. Reply CANCEL to stop alerts.";
    return prefix ? `${prefix}${tail}` : tail;
  }

  const tail = `your next pickup dates are ${parts.join(
    " and "
  )}. Reply CANCEL at any time to stop alerts.`;

  if (!prefix) {
    return `Your next pickup dates are ${parts.join(
      " and "
    )}. Reply CANCEL at any time to stop alerts.`;
  }

  return `${prefix}${tail}`;
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
 *   - send them a text saying they’re already signed up + next pickup dates + CANCEL reminder
 * Otherwise:
 *   - We validate the address by calling the city API.
 *   - If it looks good, we create a pending user and send a "Reply YES / CANCEL" SMS.
 */
app.post("/signup", async (req, res) => {
  try {
    const { phone, laddr, sdir, sname, stype, faddr } = req.body;

    if (!phone || !laddr || !sname || !stype || !faddr) {
      return res.status(400).json({ error: "Missing required fields" });
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
          "alreadySignedUp"
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
          "You're already signed up. We sent you a text with your next pickup dates and how to cancel.",
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

    const id = crypto.randomUUID();

    const user: User = {
      id,
      phone: normalizedPhone,
      address,
      status: "pending", // waiting for YES
      verified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    saveUser(user);

    // Send opt-in SMS (YES to confirm, CANCEL to stop)
    const upperAddr = address.faddr.toUpperCase();
    const message = `MKE Pickup Alerts: Reply YES to confirm alerts for ${upperAddr}. Reply CANCEL to stop.`;
    await sendSms(user.phone, message);

    return res.status(200).json({
      message:
        "Signup received. We sent you a text — reply YES to confirm, or CANCEL to opt out.",
      userId: user.id,
    });
  } catch (err) {
    console.error("Error in /signup:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 2) INBOUND SMS: YES/Y = opt-in, CANCEL = opt-out,
// any other message from an active user = next pickup info.
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

  // --- CANCEL: unsubscribe ---
  if (body === "CANCEL") {
    user.status = "cancelled";
    user.verified = false;
    updateUser(user);
    console.log("User cancelled via SMS:", from);

    const msg = "You have been unsubscribed from MKE pickup alerts.";
    await sendSms(user.phone, msg);

    // TwiML for future Twilio usage
    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  // --- YES/Y: opt-in / confirm ---
  if (body === "YES" || body === "Y") {
    user.status = "active";
    user.verified = true;
    updateUser(user);
    console.log("User opted in via YES:", from);

    const msg =
      "Your MKE pickup alerts are now active. Reply CANCEL at any time to stop.";
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
      const msg =
        "Sorry, we couldn't look up your pickup info right now. Please try again later. Reply CANCEL to stop alerts.";
      await sendSms(user.phone, msg);

      return res
        .status(200)
        .type("text/xml")
        .send(`<Response><Message>${msg}</Message></Response>`);
    }
  }

  // --- Any other message from non-active user: ignore for now ---
  return res.status(200).type("text/xml").send("<Response></Response>");
});

// --- start server ---

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Onboarding API listening on port ${PORT}`);
});
