"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/scheduler.ts
const node_cron_1 = __importDefault(require("node-cron"));
const userStore_1 = require("./userStore");
const sendAlert_1 = require("./sendAlert");
console.log("Garbage/Recycling reminder scheduler started");
node_cron_1.default.schedule("0 20 * * *", async () => {
    console.log("Running scheduled pickup check at", new Date().toISOString());
    const users = (0, userStore_1.getActiveUsers)();
    console.log("Found", users.length, "active users");
    for (const user of users) {
        try {
            await (0, sendAlert_1.sendPickupAlertForUser)(user);
        }
        catch (err) {
            console.error("Error sending alert for user:", user.phone, err);
        }
    }
});
