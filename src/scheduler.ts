import cron from "node-cron";
import { getActiveSubscribers } from "./userStore";
import { sendPickupAlertForSubscriber } from "./sendAlert";

console.log("Garbage/Recycling reminder scheduler started");

cron.schedule("0 20 * * *", async () => {
  console.log("Running scheduled pickup check at", new Date().toISOString());

  const subscribers = await getActiveSubscribers();
  console.log("Found", subscribers.length, "active subscribers");

  for (const subscriber of subscribers) {
    try {
      await sendPickupAlertForSubscriber(subscriber);
    } catch (err) {
      console.error("Error sending alert for subscriber:", subscriber.phone, err);
    }
  }
});
