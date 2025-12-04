"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/scheduler.ts
const node_cron_1 = __importDefault(require("node-cron"));
const sendAlert_1 = require("./sendAlert");
console.log("Garbage/Recycling reminder scheduler started.");
// Runs every day at 8:00 PM (server's local time)
node_cron_1.default.schedule("0 20 * * *", () => {
    console.log("Running scheduled pickup check at", new Date().toISOString());
    (0, sendAlert_1.sendPickupAlert)().catch((err) => {
        console.error("Error in scheduled pickup alert:", err);
    });
});
// keep the process alive – node-cron does this by having active timers
