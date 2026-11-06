export const MADRID_TZ = "Europe/Madrid";

export function madridWallClockToUTC(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);

  const utcGuess = new Date(Date.UTC(y, (m ?? 1) - 1, d, h ?? 0, mi ?? 0));

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MADRID_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(utcGuess);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const madridHour = get("hour") === 24 ? 0 : get("hour");
  const madridAsUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    madridHour,
    get("minute"),
    get("second"),
  );

  const offsetMs = utcGuess.getTime() - madridAsUTC;
  return new Date(utcGuess.getTime() + offsetMs).toISOString();
}

export function utcToMadridWallClock(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  const hour = get("hour") === "24" ? "00" : get("hour");

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${get("minute")}`,
  };
}
