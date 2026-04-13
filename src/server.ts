import "dotenv/config";
import express from "express";
import crypto from "crypto";
import path from "path";

import { AddressParams, fetchCityResponse, CityPickup } from "./cityClient";
import { Subscriber, Subscription, User } from "./models";
import {
  createSubscription,
  createUser,
  findSubscriptionByPhoneAndAddress,
  findSubscriptionsByPhone,
  findUserByPhone,
  updateSubscription,
  upsertSubscriptionForSignup,
} from "./userStore";
import { sendSms } from "./smsService";

import dayjs from "dayjs";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));

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

function normalizeAddressParams(address: AddressParams): AddressParams {
  return {
    ...address,
    sdir: address.sdir || "",
  };
}

function toSubscription(subscriber: Subscriber): Subscription {
  return {
    id: subscriber.subscriptionId,
    userId: subscriber.userId,
    address: subscriber.address,
    status: subscriber.status,
    verified: subscriber.verified,
    consent: subscriber.consent,
    createdAt: subscriber.createdAt,
    updatedAt: subscriber.updatedAt,
  };
}

async function resolveRelevantSubscriptionByPhone(
  phone: string
): Promise<Subscriber | null> {
  const subscriptions = await findSubscriptionsByPhone(phone);

  if (subscriptions.length === 0) {
    return null;
  }

  // subscriptions are ordered by updated_at DESC, so pick the first non-unsubscribed
  // and only fall back to the newest overall if all are unsubscribed.
  const mostRecentNonUnsubscribed = subscriptions.find(
    (subscription) => subscription.status !== "unsubscribed"
  );
  return mostRecentNonUnsubscribed ?? subscriptions[0] ?? null;
}

async function buildNextPickupSummary(subscriber: Subscriber): Promise<string | null> {
  const data = await fetchCityResponse(subscriber.address);
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

async function buildNextPickupMessage(
  subscriber: Subscriber,
  mode: "status" | "alreadySubscribed" = "status"
): Promise<string> {
  const address = formatAddress(subscriber.address);
  const nextPickups = await buildNextPickupSummary(subscriber);

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
  return `${PROGRAM_NAME}: Trash/recycling pickup reminders & schedule updates (up to 4 msgs/month). Msg&data rates may apply. Reply STATUS for next dates. Reply STOP to unsubscribe. Support: support@milwaukeegarbagealert.com`;
}

function buildStopMessage(address: string): string {
  return `${PROGRAM_NAME}: You're unsubscribed for ${address}. No more messages will be sent. Reply START to re-subscribe or email support@milwaukeegarbagealert.com.`;
}

function buildPendingReminder(address: string): string {
  return `${PROGRAM_NAME}: Reply YES to confirm pickup texts for ${address}. Reply STOP to unsubscribe, HELP for help.`;
}

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

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

    if (!consent_source) {
      return res.status(400).json({
        error: "Consent source is required.",
      });
    }

    const normalizedPhone = normalizePhone(phone);

    const address = normalizeAddressParams({
      laddr: String(laddr),
      sdir: sdir || "",
      sname,
      stype,
      faddr,
    });

    const existingForAddress = await findSubscriptionByPhoneAndAddress(
      normalizedPhone,
      address
    );

    if (
      existingForAddress &&
      existingForAddress.status === "active" &&
      existingForAddress.verified
    ) {
      console.log(
        "[/signup] existing active subscription, sending already-signed-up status:",
        {
          phone: normalizedPhone,
          subscriptionId: existingForAddress.subscriptionId,
        }
      );

      try {
        const msg = await buildNextPickupMessage(
          existingForAddress,
          "alreadySubscribed"
        );
        await sendSms(existingForAddress.phone, msg);
      } catch (err) {
        console.error(
          "Error building/sending already-signed-up message for user:",
          existingForAddress.phone,
          err
        );
      }

      return res.status(200).json({
        message:
          "You're already subscribed. We sent you a text with your next pickup dates.",
        userId: existingForAddress.userId,
        alreadySignedUp: true,
      });
    }

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

    let user: User | null = await findUserByPhone(normalizedPhone);
    if (!user) {
      user = await createUser({
        id: crypto.randomUUID(),
        phone: normalizedPhone,
        createdAt: now,
        updatedAt: now,
      });
    }

    const subscription: Subscription = {
      id: existingForAddress?.subscriptionId ?? crypto.randomUUID(),
      userId: user.id,
      address,
      status: "pending_confirm",
      verified: false,
      consent: {
        consentChecked: true,
        sourceUrl: String(consent_source),
        submittedAt: now,
        confirmedAt: null,
      },
      createdAt: existingForAddress?.createdAt ?? now,
      updatedAt: now,
    };

    if (existingForAddress) {
      await upsertSubscriptionForSignup(subscription);
    } else {
      await createSubscription(subscription);
    }

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

  const subscriber = await resolveRelevantSubscriptionByPhone(from);

  if (!subscriber) {
    console.log("Inbound SMS from unknown number:", from, "body:", body);
    return res.status(200).type("text/xml").send("<Response></Response>");
  }

  const address = formatAddress(subscriber.address);

  if (STOP_KEYWORDS.has(body)) {
    const updated = await updateSubscription({
      ...toSubscription(subscriber),
      status: "unsubscribed",
      verified: false,
      updatedAt: new Date(),
    });
    console.log("Subscription unsubscribed via SMS:", from, updated.id);

    const msg = buildStopMessage(address);
    await sendSms(subscriber.phone, msg);

    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  if (HELP_KEYWORDS.has(body)) {
    const msg = buildHelpMessage();
    await sendSms(subscriber.phone, msg);

    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  if (body === "START") {
    if (subscriber.status === "unsubscribed") {
      await updateSubscription({
        ...toSubscription(subscriber),
        status: "pending_confirm",
        verified: false,
        consent: {
          ...subscriber.consent,
          submittedAt: new Date(),
          confirmedAt: null,
        },
        updatedAt: new Date(),
      });
    }

    const msg =
      subscriber.status === "active"
        ? await buildNextPickupMessage(subscriber, "status")
        : subscriber.status === "pending_confirm"
        ? buildPendingReminder(address)
        : buildConfirmationMessage(address);
    await sendSms(subscriber.phone, msg);

    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  if (YES_KEYWORDS.has(body)) {
    if (subscriber.status !== "pending_confirm") {
      const msg =
        subscriber.status === "active"
          ? await buildNextPickupMessage(subscriber, "status")
          : buildConfirmationMessage(address);
      await sendSms(subscriber.phone, msg);
      return res
        .status(200)
        .type("text/xml")
        .send(`<Response><Message>${msg}</Message></Response>`);
    }

    await updateSubscription({
      ...toSubscription(subscriber),
      status: "active",
      verified: true,
      consent: {
        ...subscriber.consent,
        confirmedAt: new Date(),
      },
      updatedAt: new Date(),
    });
    console.log("User opted in via YES:", from);

    const refreshed = await resolveRelevantSubscriptionByPhone(from);
    const confirmedSubscriber = refreshed ?? subscriber;

    const nextPickups = await buildNextPickupSummary(confirmedSubscriber);
    const msg = buildWelcomeMessage(address, nextPickups);
    await sendSms(confirmedSubscriber.phone, msg);

    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  if (STATUS_KEYWORDS.has(body)) {
    if (subscriber.status === "active" && subscriber.verified) {
      try {
        const msg = await buildNextPickupMessage(subscriber, "status");
        console.log("Sending next-pickup info to", subscriber.phone, ":", msg);
        await sendSms(subscriber.phone, msg);

        return res
          .status(200)
          .type("text/xml")
          .send(`<Response><Message>${msg}</Message></Response>`);
      } catch (err) {
        console.error(
          "Error fetching next pickup info for user:",
          subscriber.phone,
          err
        );
        const msg = `${PROGRAM_NAME}: Sorry, we couldn't look up your pickup info right now. Please try again later. Reply STOP to unsubscribe, HELP for help.`;
        await sendSms(subscriber.phone, msg);

        return res
          .status(200)
          .type("text/xml")
          .send(`<Response><Message>${msg}</Message></Response>`);
      }
    }

    const msg =
      subscriber.status === "pending_confirm"
        ? buildPendingReminder(address)
        : buildStopMessage(address);
    await sendSms(subscriber.phone, msg);
    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  if (subscriber.status === "active" && subscriber.verified) {
    try {
      const msg = await buildNextPickupMessage(subscriber, "status");
      await sendSms(subscriber.phone, msg);
      return res
        .status(200)
        .type("text/xml")
        .send(`<Response><Message>${msg}</Message></Response>`);
    } catch (err) {
      console.error(
        "Error fetching next pickup info for user:",
        subscriber.phone,
        err
      );
      const msg = `${PROGRAM_NAME}: Sorry, we couldn't look up your pickup info right now. Please try again later. Reply STOP to unsubscribe, HELP for help.`;
      await sendSms(subscriber.phone, msg);
      return res
        .status(200)
        .type("text/xml")
        .send(`<Response><Message>${msg}</Message></Response>`);
    }
  }

  if (subscriber.status === "pending_confirm") {
    const msg = buildPendingReminder(address);
    await sendSms(subscriber.phone, msg);
    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${msg}</Message></Response>`);
  }

  return res.status(200).type("text/xml").send("<Response></Response>");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Onboarding API listening on port ${PORT}`);
});
