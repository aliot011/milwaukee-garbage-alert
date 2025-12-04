"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPickupAlertForAddress = sendPickupAlertForAddress;
exports.sendPickupAlert = sendPickupAlert;
// src/sendAlert.ts
const dayjs_1 = __importDefault(require("dayjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
const cityClient_1 = require("./cityClient");
dotenv_1.default.config();
// ---- helpers ----
function getEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}
const zapierWebhookUrl = getEnv("ZAPIER_WEBHOOK_URL");
/**
 * City returns "THURSDAY DECEMBER 4, 2025".
 * Strip weekday and parse "DECEMBER 4, 2025".
 */
function parseCityDate(raw) {
    if (!raw)
        return null;
    const withoutWeekday = raw.replace(/^[A-Z]+\s+/, "").trim();
    const jsDate = new Date(withoutWeekday);
    if (Number.isNaN(jsDate.getTime())) {
        console.warn("Could not parse city date:", raw);
        return null;
    }
    return (0, dayjs_1.default)(jsDate);
}
/**
 * Use alt_date if present (holiday / alt pickup),
 * otherwise use date.
 */
function getActualPickupDate(info) {
    if (!info)
        return null;
    const raw = info.alt_date && info.alt_date.trim() ? info.alt_date : info.date;
    return parseCityDate(raw);
}
async function postToZapier(message) {
    await axios_1.default.post(zapierWebhookUrl, { message });
}
// ---- Your address config (for now) ----
// Later, this can come from a DB row per user.
const MY_ADDRESS = {
    laddr: "1403",
    sdir: "E",
    sname: "POTTER",
    stype: "AV",
    faddr: "1403 E POTTER AV",
};
// ---- Core logic, generalized to any address ----
async function sendPickupAlertForAddress(address) {
    const tomorrow = (0, dayjs_1.default)().add(1, "day").startOf("day");
    const data = await (0, cityClient_1.fetchCityResponse)(address);
    if (!data.success) {
        console.error("City API returned success=false");
        return;
    }
    const garbageDate = getActualPickupDate(data.garbage);
    const recyclingDate = getActualPickupDate(data.recycling);
    console.log("City API next pickups for address:", {
        address,
        garbage: data.garbage?.date,
        garbage_alt: data.garbage?.alt_date,
        recycling: data.recycling?.date,
        recycling_alt: data.recycling?.alt_date,
    });
    const garbageTomorrow = garbageDate?.isSame(tomorrow, "day") ?? false;
    const recyclingTomorrow = recyclingDate?.isSame(tomorrow, "day") ?? false;
    if (!garbageTomorrow && !recyclingTomorrow) {
        console.log("No pickup tomorrow for this address based on city API.");
        return;
    }
    const services = [];
    if (garbageTomorrow)
        services.push("garbage");
    if (recyclingTomorrow)
        services.push("recycling");
    const niceDate = tomorrow.format("dddd, MMMM D, YYYY");
    const message = `Reminder: ${services.join(" & ")} pickup tomorrow (${niceDate}). Put carts out tonight.`;
    console.log("Sending to Zapier:", message);
    await postToZapier(message);
    console.log("Sent to Zapier OK.");
}
// Convenience wrapper for your personal scheduler
async function sendPickupAlert() {
    return sendPickupAlertForAddress(MY_ADDRESS);
}
// Allow running this as `npm run alert:now`
if (require.main === module) {
    sendPickupAlert().catch((err) => {
        console.error("Error sending pickup alert:", err);
        process.exit(1);
    });
}
