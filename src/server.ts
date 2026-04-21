import "dotenv/config";
import express from "express";
import crypto from "crypto";
import path from "path";

import { AddressParams, fetchCityResponse, CityPickup } from "./cityClient";
import { Subscriber, Subscription, User } from "./models";
import {
  createSubscription,
  createUser,
  disableEmailAlertsForUser,
  findSubscriptionByPhoneAndAddress,
  findSubscriptionsByPhone,
  findUserByPhone,
  findUserByVerificationToken,
  setEmailVerificationToken,
  updateSubscription,
  upsertSubscriptionForSignup,
  verifyUserEmail,
  getAllSubscribers,
  adminUpdateSubscription,
  adminUpdateUser,
  deleteSubscription,
  deleteUser,
  createMissedPickupReport,
  getMissedPickupReports,
} from "./userStore";
import { sendSms } from "./smsService";
import { sendVerificationEmail, verifyUnsubscribeToken, sendErrorAlert } from "./emailService";
import { parseTimeToHour, formatHour } from "./parseTime";

import dayjs from "dayjs";
import cron from "node-cron";
import { getActiveSubscribersForHour } from "./userStore";
import { sendPickupAlertForSubscriber } from "./sendAlert";

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
const MISSED_KEYWORDS = new Set(["MISSED", "NOPICKUP"]);
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
  return parseCityDate(info.date);
}

function getAltPickupDate(info?: CityPickup): dayjs.Dayjs | null {
  if (!info) return null;
  const alt = info.alt_date?.trim();
  if (!alt) return null;
  const altDate = parseCityDate(alt);
  const primaryDate = parseCityDate(info.date);
  if (altDate && primaryDate && altDate.isSame(primaryDate, "day")) return null;
  return altDate;
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
    notifyHour: subscriber.notifyHour,
    awaitingTimePref: subscriber.awaitingTimePref,
    emailAlerts: subscriber.emailAlerts,
    smsAlerts: subscriber.smsAlerts,
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

  const garbageAlt = getAltPickupDate(data.garbage);
  const recyclingAlt = getAltPickupDate(data.recycling);

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

  let altNote = "";
  if (garbageAlt && recyclingAlt) {
    if (garbageAlt.isSame(recyclingAlt, "day")) {
      altNote = ` Note: the city has also indicated a possible alternate pickup date of ${garbageAlt.format("dddd, MMMM D")} — when in doubt, put carts out both days.`;
    } else {
      altNote = ` Note: the city has also indicated possible alternate pickup dates of ${garbageAlt.format("dddd, MMMM D")} for garbage and ${recyclingAlt.format("dddd, MMMM D")} for recycling — when in doubt, put carts out both days.`;
    }
  } else if (garbageAlt) {
    altNote = ` Note: the city has also indicated a possible alternate pickup date of ${garbageAlt.format("dddd, MMMM D")} for garbage — when in doubt, put carts out both days.`;
  } else if (recyclingAlt) {
    altNote = ` Note: the city has also indicated a possible alternate pickup date of ${recyclingAlt.format("dddd, MMMM D")} for recycling — when in doubt, put carts out both days.`;
  }

  return parts.join(" and ") + altNote;
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

  return `${PROGRAM_NAME}: Next pickups for ${address}: ${nextPickups}. Text STATUS anytime for pickup dates. Text a time (e.g. 7PM) to change your reminder hour the day before pickup. Reply STOP to unsubscribe.`;
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
  return `${PROGRAM_NAME}: Trash/recycling pickup reminders & schedule updates (up to 4 msgs/month). Msg&data rates may apply. Reply STATUS for next dates. Reply MISSED if your pickup was skipped. Reply STOP to unsubscribe. Support: support@milwaukeegarbagealert.com`;
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

app.get("/api/verify-email", async (req, res) => {
  const token = String(req.query.token || "").trim();

  if (!token) {
    return res.status(400).json({ error: "Missing token." });
  }

  const user = await findUserByVerificationToken(token);

  if (!user) {
    return res.status(400).json({ error: "Invalid or expired verification link." });
  }

  if (user.emailVerificationTokenExpiresAt && user.emailVerificationTokenExpiresAt < new Date()) {
    return res.status(400).json({ error: "This verification link has expired. Please sign up again to get a new one." });
  }

  await verifyUserEmail(user.id);

  return res.status(200).json({ message: "Email verified! You're all set." });
});

app.get("/api/unsubscribe-email", async (req, res) => {
  const uid = String(req.query.uid || "").trim();
  const token = String(req.query.token || "").trim();

  if (!uid || !token) {
    return res.status(400).json({ error: "Invalid unsubscribe link." });
  }

  let valid = false;
  try {
    valid = verifyUnsubscribeToken(uid, token);
  } catch {
    valid = false;
  }

  if (!valid) {
    return res.status(400).json({ error: "Invalid unsubscribe link." });
  }

  await disableEmailAlertsForUser(uid);
  return res.status(200).json({ message: "You have been unsubscribed from email alerts." });
});

app.post("/signup", async (req, res) => {
  try {
    const {
      phone,
      email,
      laddr,
      sdir,
      sname,
      stype,
      faddr,
      sms_consent,
      email_alerts,
      sms_alerts,
      consent_source,
    } = req.body;

    if (!phone || !email || !laddr || !sdir || !sname || !stype || !faddr) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: "Invalid email address." });
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
    const normalizedEmail = String(email).trim();
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (!user) {
      user = await createUser({
        id: crypto.randomUUID(),
        phone: normalizedPhone,
        email: normalizedEmail,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationTokenExpiresAt: verificationTokenExpiresAt,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await setEmailVerificationToken(user.id, verificationToken, verificationTokenExpiresAt);
    }

    try {
      await sendVerificationEmail(normalizedEmail, user.id, verificationToken);
    } catch (err) {
      console.error("[/signup] Failed to send verification email:", err);
    }

    sendErrorAlert(
      `New signup — ${normalizedEmail}`,
      `A new user signed up for MKE Garbage Pickup Alerts.\n\nEmail: ${normalizedEmail}\nPhone: ${normalizedPhone}\nAddress: ${address.faddr}\nSMS alerts: ${sms_alerts !== false}\nEmail alerts: ${email_alerts !== false}`
    ).catch(() => {});

    const autoOptIn = sms_consent === true;

    const subscription: Subscription = {
      id: existingForAddress?.subscriptionId ?? crypto.randomUUID(),
      userId: user.id,
      address,
      status: autoOptIn ? "active" : "pending_confirm",
      verified: autoOptIn,
      consent: {
        consentChecked: true,
        sourceUrl: String(consent_source),
        submittedAt: now,
        confirmedAt: autoOptIn ? now : null,
      },
      notifyHour: existingForAddress?.notifyHour ?? 19,
      awaitingTimePref: false,
      emailAlerts: email_alerts !== false,
      smsAlerts: sms_alerts !== false,
      createdAt: existingForAddress?.createdAt ?? now,
      updatedAt: now,
    };

    if (existingForAddress) {
      await upsertSubscriptionForSignup(subscription);
    } else {
      await createSubscription(subscription);
    }

    const upperAddr = address.faddr.toUpperCase();

    if (autoOptIn) {
      const subscriber = await findSubscriptionByPhoneAndAddress(normalizedPhone, address);
      const nextPickups = subscriber ? await buildNextPickupSummary(subscriber) : null;
      const message = buildWelcomeMessage(upperAddr, nextPickups);
      await sendSms(user.phone, message);

      return res.status(200).json({
        message: "You're signed up for pickup alerts.",
        userId: user.id,
      });
    }

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

  // Time preference reply — works anytime for active subscribers, or when explicitly awaiting
  if (!STOP_KEYWORDS.has(body) && !HELP_KEYWORDS.has(body) && body !== "START" && !YES_KEYWORDS.has(body) && !STATUS_KEYWORDS.has(body) && !MISSED_KEYWORDS.has(body)) {
    const isActiveVerified = subscriber.status === "active" && subscriber.verified;
    if (subscriber.awaitingTimePref || isActiveVerified) {
      const hour = parseTimeToHour(body);
      if (hour !== null) {
        await updateSubscription({
          ...toSubscription(subscriber),
          notifyHour: hour,
          awaitingTimePref: false,
          updatedAt: new Date(),
        });
        const msg = `${PROGRAM_NAME}: Got it! You'll receive your reminders at ${formatHour(hour)} CT the night before pickup. Reply STOP to unsubscribe, HELP for help.`;
        return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
      }
    }
  }

  if (STOP_KEYWORDS.has(body)) {
    const updated = await updateSubscription({
      ...toSubscription(subscriber),
      status: "unsubscribed",
      verified: false,
      updatedAt: new Date(),
    });
    console.log("Subscription unsubscribed via SMS:", from, updated.id);
    const msg = buildStopMessage(address);
    return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
  }

  if (HELP_KEYWORDS.has(body)) {
    const msg = buildHelpMessage();
    return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
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
    return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
  }

  if (YES_KEYWORDS.has(body)) {
    if (subscriber.status !== "pending_confirm") {
      const msg =
        subscriber.status === "active"
          ? await buildNextPickupMessage(subscriber, "status")
          : buildConfirmationMessage(address);
      return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
    }

    await updateSubscription({
      ...toSubscription(subscriber),
      status: "active",
      verified: true,
      consent: {
        ...subscriber.consent,
        confirmedAt: new Date(),
      },
      awaitingTimePref: true,
      updatedAt: new Date(),
    });
    console.log("User opted in via YES:", from);

    const refreshed = await resolveRelevantSubscriptionByPhone(from);
    const confirmedSubscriber = refreshed ?? subscriber;

    const nextPickups = await buildNextPickupSummary(confirmedSubscriber);
    const welcomeMsg = buildWelcomeMessage(address, nextPickups);
    const timePrompt = `${PROGRAM_NAME}: What time would you like your reminders? Reply with a time like 6PM or 8PM. Default is 7PM if you don't reply.`;

    return res
      .status(200)
      .type("text/xml")
      .send(`<Response><Message>${welcomeMsg}</Message><Message>${timePrompt}</Message></Response>`);
  }

  if (MISSED_KEYWORDS.has(body)) {
    if (subscriber.status === "active" && subscriber.verified) {
      await createMissedPickupReport(
        crypto.randomUUID(),
        subscriber.subscriptionId,
        subscriber.address.faddr
      );
      console.log("Missed pickup report logged for subscription:", subscriber.subscriptionId, subscriber.address.faddr);
      const msg = `${PROGRAM_NAME}: Thanks for letting us know. Your missed pickup has been logged. For immediate help, contact Milwaukee DPW: (414) 286-2489.`;
      return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
    }
    return res.status(200).type("text/xml").send("<Response></Response>");
  }

  if (STATUS_KEYWORDS.has(body)) {
    if (subscriber.status === "active" && subscriber.verified) {
      try {
        const msg = await buildNextPickupMessage(subscriber, "status");
        console.log("Sending next-pickup info to", subscriber.phone, ":", msg);
        return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
      } catch (err) {
        console.error("Error fetching next pickup info for user:", subscriber.phone, err);
        const msg = `${PROGRAM_NAME}: Sorry, we couldn't look up your pickup info right now. Please try again later. Reply STOP to unsubscribe, HELP for help.`;
        return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
      }
    }

    const msg =
      subscriber.status === "pending_confirm"
        ? buildPendingReminder(address)
        : buildStopMessage(address);
    return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
  }

  if (subscriber.status === "active" && subscriber.verified) {
    try {
      const msg = await buildNextPickupMessage(subscriber, "status");
      return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
    } catch (err) {
      console.error("Error fetching next pickup info for user:", subscriber.phone, err);
      const msg = `${PROGRAM_NAME}: Sorry, we couldn't look up your pickup info right now. Please try again later. Reply STOP to unsubscribe, HELP for help.`;
      return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
    }
  }

  if (subscriber.status === "pending_confirm") {
    const msg = buildPendingReminder(address);
    return res.status(200).type("text/xml").send(`<Response><Message>${msg}</Message></Response>`);
  }

  return res.status(200).type("text/xml").send("<Response></Response>");
});

// ─── Admin API ───────────────────────────────────────────────────────────────

const adminTokens = new Set<string>();

function adminAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !adminTokens.has(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body as { password?: string };
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return res.status(500).json({ error: "Admin not configured" });
  }
  if (!password || password !== adminPassword) {
    return res.status(401).json({ error: "Invalid password" });
  }
  const token = crypto.randomUUID();
  adminTokens.add(token);
  return res.json({ token });
});

app.get("/api/admin/subscribers", adminAuth, async (_req, res) => {
  const subscribers = await getAllSubscribers();
  return res.json(subscribers);
});

app.patch("/api/admin/subscribers/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { userId, phone, email, emailVerified, status, verified, notifyHour, awaitingTimePref, emailAlerts, smsAlerts } = req.body as Record<string, unknown>;

  try {
    await adminUpdateSubscription(id, {
      status: typeof status === "string" ? status : undefined,
      verified: typeof verified === "boolean" ? verified : undefined,
      notifyHour: typeof notifyHour === "number" ? notifyHour : undefined,
      awaitingTimePref: typeof awaitingTimePref === "boolean" ? awaitingTimePref : undefined,
      emailAlerts: typeof emailAlerts === "boolean" ? emailAlerts : undefined,
      smsAlerts: typeof smsAlerts === "boolean" ? smsAlerts : undefined,
    });

    if (typeof userId === "string") {
      await adminUpdateUser(userId, {
        phone: typeof phone === "string" ? phone : undefined,
        email: typeof email === "string" ? email : undefined,
        emailVerified: typeof emailVerified === "boolean" ? emailVerified : undefined,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Admin update error:", err);
    return res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/api/admin/subscribers/:id", adminAuth, async (req, res) => {
  try {
    await deleteSubscription(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete subscription error:", err);
    return res.status(500).json({ error: "Delete failed" });
  }
});

app.delete("/api/admin/users/:id", adminAuth, async (req, res) => {
  try {
    await deleteUser(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    return res.status(500).json({ error: "Delete failed" });
  }
});

app.get("/api/admin/missed-pickup-reports", adminAuth, async (_req, res) => {
  const reports = await getMissedPickupReports();
  return res.json(reports);
});

// SPA fallback — serve index.html for all non-API routes
app.use((_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Global Express error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] Unhandled error:", err);
  sendErrorAlert(
    `Server error — ${err.message}`,
    `An unhandled error occurred in the web server.\n\nError: ${err.message}\n\nStack:\n${err.stack ?? "n/a"}`
  ).catch(() => {});
  res.status(500).json({ error: "Internal server error" });
});

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
  sendErrorAlert(
    `Uncaught exception — ${err.message}`,
    `An uncaught exception crashed the server process.\n\nError: ${err.message}\n\nStack:\n${err.stack ?? "n/a"}`
  ).catch(() => {});
});

process.on("unhandledRejection", (reason) => {
  const detail = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack ?? "n/a" : "n/a";
  console.error("[server] Unhandled rejection:", reason);
  sendErrorAlert(
    `Unhandled promise rejection — ${detail}`,
    `An unhandled promise rejection occurred in the web server.\n\nReason: ${detail}\n\nStack:\n${stack}`
  ).catch(() => {});
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Onboarding API listening on port ${PORT}`);
});

// Scheduler — runs in the same process as the web server
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

console.log("Garbage/Recycling reminder scheduler started");

cron.schedule("0 * * * *", async () => {
  const currentHour = dayjs().tz("America/Chicago").hour();
  console.log("Running scheduled pickup check at", new Date().toISOString(), "— Chicago hour:", currentHour);

  const subscribers = await getActiveSubscribersForHour(currentHour);
  console.log("Found", subscribers.length, "active subscribers for hour", currentHour);

  for (const subscriber of subscribers) {
    try {
      await sendPickupAlertForSubscriber(subscriber);
    } catch (err) {
      console.error("Error sending alert for subscriber:", subscriber.phone, err);
    }
  }
}, { timezone: "America/Chicago" });
