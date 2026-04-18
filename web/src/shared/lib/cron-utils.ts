import parser from 'cron-parser';

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom_days';

export function calculateNextRunAt(
  recurrenceType: RecurrenceType,
  cronExpression?: string | null,
  customDays?: number[] | null,
  now: Date = new Date()
): Date {
  if (cronExpression) {
    try {
      const parserWithParse = parser as unknown as {
        parseExpression: (
          expression: string,
          options: { currentDate: Date },
        ) => { next: () => { toDate: () => Date } };
      };
      const interval = parserWithParse.parseExpression(cronExpression, { currentDate: now });
      return interval.next().toDate();
    } catch (e) {
      console.error('Error parsing cron expression', e);
      // Fallback a mañana
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  // Fallback if no expression provided, calculate basic next run based on type
  const next = new Date(now);
  switch (recurrenceType) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    case 'custom_days':
      if (customDays && customDays.length > 0) {
        // Encontrar siguiente día en customDays (0 = Domingo, 1 = Lunes ...)
        let added = 0;
        do {
          next.setDate(next.getDate() + 1);
          added++;
          if (added > 7) break; // Safety break
        } while (!customDays.includes(next.getDay()));
      } else {
        next.setDate(next.getDate() + 1);
      }
      break;
    default:
      next.setDate(next.getDate() + 1);
  }
  return next;
}
