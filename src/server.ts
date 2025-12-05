// src/server.ts
import express from "express";
import crypto from "crypto";
import dayjs from "dayjs";
import path from "path";

import { AddressParams, fetchCityResponse, CityPickup } from "./cityClient";
import { User } from "./models";
import { saveUser, findUserByPhone, updateUser } from "./userStore";
import { sendSms } from "./smsService";

const app = express();

// Support JSON (from your frontend) and URL-encoded (from Twilio later)
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, "../public")));

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
    console.warn("[inbound] Could not parse city date:", raw);
    return null;
  }
  return dayjs(jsDate);
}

function getActualPickupDate(info?: CityPickup): dayjs.Dayjs | null {
  if (!info) return null;
  const raw = info.alt_date && info.alt_date.trim() ? info.alt_date : info.date;
  return parseCityDate(raw);
}

// --- routes ---

// Simple health check
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * 1) SIGNUP:
 * User sends phone + address params (from frontend or gsheet backend).
 * We validate the address by calling the city API.
 * If it looks good, we create a pending user and send a "Reply YES / CANCEL" SMS.
 */
app.post("/signup", async (req, res) => {
  try {
    const { phone, laddr, sdir, sname, stype, faddr } = req.body;

    if (!phone || !laddr || !sname || !stype || !faddr) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedPhone = normalizePhone(phone);

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

    // Send confirmation via your current SMS channel (Zapier)
    await sendSms(
      user.phone,
      "You have been unsubscribed from MKE pickup alerts."
    );

    // TwiML for future Twilio usage
    return res
      .status(200)
      .type("text/xml")
      .send(
        "<Response><Message>You have been unsubscribed from MKE pickup alerts.</Message></Response>"
      );
  }

  // --- YES/Y: opt-in / confirm ---
  if (body === "YES" || body === "Y") {
    user.status = "active";
    user.verified = true;
    updateUser(user);
    console.log("User opted in via YES:", from);

    await sendSms(
      user.phone,
      "Your MKE pickup alerts are now active. Reply CANCEL at any time to stop."
    );

    return res
      .status(200)
      .type("text/xml")
      .send(
        "<Response><Message>Your MKE pickup alerts are now active. Reply CANCEL at any time to stop.</Message></Response>"
      );
  }

  // --- Any other message from an ACTIVE user: send next pickup info ---
  if (user.status === "active" && user.verified) {
    try {
      const data = await fetchCityResponse(user.address);

      const garbageDetermined = data.garbage?.is_determined ?? false;
      const recyclingDetermined = data.recycling?.is_determined ?? false;
      const upperAddr = user.address.faddr.toUpperCase();

      // If the city API can't determine schedule, tell them that (with address)
      if (!data.success || (!garbageDetermined && !recyclingDetermined)) {
        const msg =
          `We couldn't determine upcoming pickup dates for ${upperAddr} right now. ` +
          `Please double-check your address or try again later. Reply CANCEL to stop alerts.`;
        await sendSms(user.phone, msg);

        return res
          .status(200)
          .type("text/xml")
          .send(`<Response><Message>${msg}</Message></Response>`);
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

      let msg: string;
      if (parts.length > 0) {
        msg = `Your next pickup dates for ${upperAddr} are ${parts.join(
          " and "
        )}. Reply CANCEL at any time to stop alerts.`;
      } else {
        msg =
          `We couldn't find upcoming pickup dates for ${upperAddr} right now. ` +
          `Reply CANCEL to stop alerts.`;
      }

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
