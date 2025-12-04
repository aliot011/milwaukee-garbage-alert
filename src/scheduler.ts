// src/scheduler.ts
import cron from "node-cron";
import { sendPickupAlert } from "./sendAlert";

console.log("Garbage/Recycling reminder scheduler started.");

// Runs every day at 8:00 PM (server's local time)
cron.schedule("0 02 * * *", () => {
  console.log("Running scheduled pickup check at", new Date().toISOString());
  sendPickupAlert().catch((err) => {
    console.error("Error in scheduled pickup alert:", err);
  });
});

// keep the process alive – node-cron does this by having active timers
