"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPickupAlertForUser = sendPickupAlertForUser;
// src/sendAlert.ts
const dayjs_1 = __importDefault(require("dayjs"));
const cityClient_1 = require("./cityClient");
const smsService_1 = require("./smsService");
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
function getActualPickupDate(info) {
    if (!info)
        return null;
    const raw = info.alt_date && info.alt_date.trim() ? info.alt_date : info.date;
    return parseCityDate(raw);
}
async function sendPickupAlertForUser(user) {
    if (user.status !== "active" || !user.verified) {
        console.log("Skipping user (not active/verified):", user.phone);
        return;
    }
    const tomorrow = (0, dayjs_1.default)().add(1, "day").startOf("day");
    const data = await (0, cityClient_1.fetchCityResponse)(user.address);
    if (!data.success) {
        console.error("City API success=false for user:", user.phone);
        return;
    }
    const garbageDate = getActualPickupDate(data.garbage);
    const recyclingDate = getActualPickupDate(data.recycling);
    const garbageTomorrow = garbageDate?.isSame(tomorrow, "day") ?? false;
    const recyclingTomorrow = recyclingDate?.isSame(tomorrow, "day") ?? false;
    if (!garbageTomorrow && !recyclingTomorrow) {
        console.log("No pickup tomorrow for user:", user.phone);
        return;
    }
    const services = [];
    if (garbageTomorrow)
        services.push("garbage");
    if (recyclingTomorrow)
        services.push("recycling");
    const niceDate = tomorrow.format("dddd, MMMM D, YYYY");
    const upperAddr = user.address.faddr.toUpperCase();
    const message = `Reminder: ${services.join(" & ")} pickup tomorrow (${niceDate}) for ${upperAddr}. Put carts out tonight. Reply CANCEL at any time to stop alerts.`;
    console.log("Sending SMS to", user.phone, ":", message);
    await (0, smsService_1.sendSms)(user.phone, message);
}
