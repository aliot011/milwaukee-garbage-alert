import dayjs from "dayjs";
import { Subscriber } from "./models";
import { fetchCityResponse, CityPickup } from "./cityClient";
import { sendSms } from "./smsService";

function parseCityDate(raw: string): dayjs.Dayjs | null {
  if (!raw) return null;
  const withoutWeekday = raw.replace(/^[A-Z]+\s+/, "").trim();
  const jsDate = new Date(withoutWeekday);
  if (Number.isNaN(jsDate.getTime())) {
    console.warn("Could not parse city date:", raw);
    return null;
  }
  return dayjs(jsDate);
}

function getActualPickupDate(info?: CityPickup): dayjs.Dayjs | null {
  if (!info) return null;
  const raw = info.alt_date && info.alt_date.trim() ? info.alt_date : info.date;
  return parseCityDate(raw);
}

export async function sendPickupAlertForSubscriber(
  subscriber: Subscriber
): Promise<void> {
  if (subscriber.status !== "active" || !subscriber.verified) {
    console.log("Skipping subscriber (not active/verified):", subscriber.phone);
    return;
  }

  const tomorrow = dayjs().add(1, "day").startOf("day");
  const data = await fetchCityResponse(subscriber.address);

  if (!data.success) {
    console.error("City API success=false for subscriber:", subscriber.phone);
    return;
  }

  const garbageDate = getActualPickupDate(data.garbage);
  const recyclingDate = getActualPickupDate(data.recycling);

  const garbageTomorrow = garbageDate?.isSame(tomorrow, "day") ?? false;
  const recyclingTomorrow = recyclingDate?.isSame(tomorrow, "day") ?? false;

  if (!garbageTomorrow && !recyclingTomorrow) {
    console.log("No pickup tomorrow for subscriber:", subscriber.phone);
    return;
  }

  const services: string[] = [];
  if (garbageTomorrow) services.push("garbage");
  if (recyclingTomorrow) services.push("recycling");

  const pickupDay = tomorrow.format("dddd, MMMM D, YYYY");
  const upperAddr = subscriber.address.faddr.toUpperCase();

  const message = `MKE Garbage Pickup Alerts: Reminder — ${services.join(
    " & "
  )} pickup is ${pickupDay} for ${upperAddr}. Carts out by 7:00 AM. Reply STOP to unsubscribe, HELP for help.`;

  console.log("Sending SMS to", subscriber.phone, ":", message);
  await sendSms(subscriber.phone, message);
}
