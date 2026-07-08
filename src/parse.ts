export function parseZonedDate(date: string, timeZone: string) {
  const [year, month, day] = date.split(".").map((s) => Number.parseInt(s));

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid date: ${date}`);
  }

  return Temporal.ZonedDateTime.from({
    year,
    month,
    day,
    timeZone,
  });
}

export function parseDate(date: string) {
  const [year, month, day] = date.split(".").map((s) => Number.parseInt(s));

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid date: ${date}`);
  }

  return Temporal.PlainDate.from({
    year,
    month,
    day,
  });
}
