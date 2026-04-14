/**
 * Parse a user's time reply into a 24-hour integer (0–23), rounded to nearest hour.
 * Returns null if the input can't be parsed.
 *
 * Handles: "7pm", "7 PM", "19:00", "7:30pm", "8:45AM", "9", "21"
 */
export function parseTimeToHour(input: string): number | null {
  const s = input.trim().toUpperCase();

  // Match: optional hours, optional :minutes, optional AM/PM
  const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];

  if (hour < 0 || hour > 23) return null;
  if (minutes < 0 || minutes > 59) return null;

  // Apply AM/PM
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  // For bare numbers with no AM/PM (e.g. "7" or "8"), assume PM if <= 11
  if (!meridiem && hour <= 11) hour += 12;

  if (hour > 23) return null;

  // Round to nearest hour
  return minutes >= 30 ? (hour + 1) % 24 : hour;
}

export function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
}
