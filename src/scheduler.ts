import "dotenv/config";
import cron from "node-cron";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { getActiveSubscribersForHour } from "./userStore";
import { sendPickupAlertForSubscriber } from "./sendAlert";

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
