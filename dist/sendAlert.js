"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPickupAlert = sendPickupAlert;
// src/sendAlert.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dayjs_1 = __importDefault(require("dayjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
dotenv_1.default.config();
// ---- Helper to safely read env vars ----
function getEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}
// ---- Load schedule ----
const schedulePath = path_1.default.join(__dirname, "..", "schedule.json");
const rawSchedule = fs_1.default.readFileSync(schedulePath, "utf8");
const schedule = JSON.parse(rawSchedule);
// ---- Zapier webhook ----
const zapierWebhookUrl = getEnv("ZAPIER_WEBHOOK_URL");
// ---- Logic ----
function getTomorrowDate() {
    // Uses the machine's local timezone (set it to Central / Milwaukee)
    return (0, dayjs_1.default)().add(1, "day").format("YYYY-MM-DD");
}
async function postToZapier(message) {
    // axios works in Node 14/16/18, no ESM drama
    await axios_1.default.post(zapierWebhookUrl, { message });
}
async function sendPickupAlert() {
    const tomorrow = getTomorrowDate();
    const pickup = schedule.find((entry) => entry.date === tomorrow);
    if (!pickup) {
        console.log(`No pickup scheduled for ${tomorrow}`);
        return;
    }
    const services = [];
    if (pickup.garbage)
        services.push("garbage");
    if (pickup.recycling)
        services.push("recycling");
    if (services.length === 0) {
        console.log(`Entry found for ${tomorrow} but no services set.`);
        return;
    }
    const niceDate = (0, dayjs_1.default)(tomorrow).format("dddd, MMM D");
    const body = `Reminder: ${services.join(" & ")} pickup tomorrow (${niceDate}). Put carts out tonight.`;
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
