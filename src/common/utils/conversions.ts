export const graphqlToDateTime = (
  dateTime: string | Date,
  timeZone?: string
) => {
  return new Date(dateTime).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(timeZone ? { timeZone } : {}),
  });
};

export const graphqlToDate = (
  date: string | Date | undefined | null,
  timeZone?: string
) => {
  if (!date) {
    return "...";
  }
  return new Date(date).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
};
