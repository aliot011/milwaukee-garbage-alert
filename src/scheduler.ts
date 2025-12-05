// src/scheduler.ts
import cron from "node-cron";
import { getActiveUsers } from "./userStore";
import { sendPickupAlertForUser } from "./sendAlert";

console.log("Garbage/Recycling reminder scheduler started");

cron.schedule("0 20 * * *", async () => {
  console.log("Running scheduled pickup check at", new Date().toISOString());

  const users = getActiveUsers();
  console.log("Found", users.length, "active users");

  for (const user of users) {
    try {
      await sendPickupAlertForUser(user);
    } catch (err) {
      console.error("Error sending alert for user:", user.phone, err);
    }
  }
});
