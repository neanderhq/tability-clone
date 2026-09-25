const finishedStatuses = new Set(["COMPLETED", "ARCHIVED", "Completed", "Archived"]);

function localDayAfter(dateValue: string) {
  const datePart = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!datePart) {
    return null;
  }

  const year = Number(datePart[1]);
  const month = Number(datePart[2]);
  const day = Number(datePart[3]);
  const dueDate = new Date(year, month - 1, day);

  if (
    dueDate.getFullYear() !== year ||
    dueDate.getMonth() !== month - 1 ||
    dueDate.getDate() !== day
  ) {
    return null;
  }

  return new Date(year, month - 1, day + 1);
}

export function isObjectiveOverdue(
  dueDate?: string | null,
  status?: string | null,
  now = new Date(),
) {
  if (!dueDate || !status || finishedStatuses.has(status)) {
    return false;
  }

  const overdueAt = localDayAfter(dueDate);

  return overdueAt ? now.getTime() >= overdueAt.getTime() : false;
}
