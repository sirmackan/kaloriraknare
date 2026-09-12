export function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dateString: string, days: number): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatHeaderDate(dateString: string): { label: string } {
  const today = getTodayString();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  const weekdays = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  const weekday = weekdays[date.getDay()];
  const dayOfMonth = date.getDate();
  const month = months[date.getMonth()];

  let label = `${weekday}, ${dayOfMonth} ${month}`;
  if (dateString === today) {
    label = `Idag, ${dayOfMonth} ${month}`;
  } else if (dateString === yesterday) {
    label = `Igår, ${dayOfMonth} ${month}`;
  } else if (dateString === tomorrow) {
    label = `Imorgon, ${dayOfMonth} ${month}`;
  }

  return { label };
}
