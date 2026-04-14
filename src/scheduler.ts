import "dotenv/config";
import cron from "node-cron";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { getActiveSubscribersForHour } from "./userStore";
import { sendPickupAlertForSubscriber } from "./sendAlert";
import { sendErrorAlert } from "./emailService";

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

process.on("uncaughtException", (err) => {
  console.error("[scheduler] Uncaught exception:", err);
  sendErrorAlert(
    `Scheduler uncaught exception — ${err.message}`,
    `An uncaught exception occurred in the scheduler process.\n\nError: ${err.message}\n\nStack:\n${err.stack ?? "n/a"}`
  ).catch(() => {});
});

process.on("unhandledRejection", (reason) => {
  const detail = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack ?? "n/a" : "n/a";
  console.error("[scheduler] Unhandled rejection:", reason);
  sendErrorAlert(
    `Scheduler unhandled rejection — ${detail}`,
    `An unhandled promise rejection occurred in the scheduler.\n\nReason: ${detail}\n\nStack:\n${stack}`
  ).catch(() => {});
});
