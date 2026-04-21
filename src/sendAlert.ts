import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Subscriber } from "./models";

dayjs.extend(utc);
dayjs.extend(timezone);
import { fetchCityResponse, CityPickup } from "./cityClient";
import { sendSms } from "./smsService";
import { sendPickupAlertEmail } from "./emailService";

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
  return parseCityDate(info.date);
}

function getAltPickupDate(info?: CityPickup): dayjs.Dayjs | null {
  if (!info) return null;
  const alt = info.alt_date?.trim();
  if (!alt) return null;
  const altDate = parseCityDate(alt);
  const primaryDate = parseCityDate(info.date);
  if (altDate && primaryDate && altDate.isSame(primaryDate, "day")) return null;
  return altDate;
}

export async function sendPickupAlertForSubscriber(
  subscriber: Subscriber
): Promise<void> {
  if (subscriber.status !== "active" || !subscriber.verified) {
    console.log("Skipping subscriber (not active/verified):", subscriber.phone);
    return;
  }

  const tomorrow = dayjs().tz("America/Chicago").add(1, "day").startOf("day");
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

  // Collect any alt dates for services being alerted
  const garbageAlt = garbageTomorrow ? getAltPickupDate(data.garbage) : null;
  const recyclingAlt = recyclingTomorrow ? getAltPickupDate(data.recycling) : null;

  let altNote = "";
  if (garbageAlt && recyclingAlt) {
    if (garbageAlt.isSame(recyclingAlt, "day")) {
      altNote = ` Note: the city has also indicated a possible alternate pickup date of ${garbageAlt.format("dddd, MMMM D")} — when in doubt, put carts out both days.`;
    } else {
      altNote = ` Note: the city has also indicated possible alternate pickup dates of ${garbageAlt.format("dddd, MMMM D")} for garbage and ${recyclingAlt.format("dddd, MMMM D")} for recycling — when in doubt, put carts out both days.`;
    }
  } else if (garbageAlt) {
    altNote = ` Note: the city has also indicated a possible alternate pickup date of ${garbageAlt.format("dddd, MMMM D")} — when in doubt, put carts out both days.`;
  } else if (recyclingAlt) {
    altNote = ` Note: the city has also indicated a possible alternate pickup date of ${recyclingAlt.format("dddd, MMMM D")} — when in doubt, put carts out both days.`;
  }

  if (subscriber.smsAlerts) {
    const message = `MKE Garbage Pickup Alerts: Reminder — ${services.join(
      " & "
    )} pickup is ${pickupDay} for ${upperAddr}. Carts out by 7:00 AM.${altNote} Text STATUS for pickup dates or a time (e.g. 7PM) to change your reminder. Reply STOP to unsubscribe.`;
    console.log("Sending SMS to", subscriber.phone, ":", message);
    await sendSms(subscriber.phone, message);
  }

  if (subscriber.emailAlerts && subscriber.email && subscriber.emailVerified) {
    console.log("Sending email alert to", subscriber.email);
    await sendPickupAlertEmail(subscriber.email, subscriber.userId, upperAddr, services, pickupDay, altNote || undefined);
  }
}
