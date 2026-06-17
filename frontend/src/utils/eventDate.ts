import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Event times are "wall-clock": the hour the coach types must appear identically
 * to everyone, no matter their device timezone. The backend stores that wall
 * clock as UTC (server runs in UTC), so to display it consistently we render the
 * UTC components — never the viewer's local timezone, which would shift the hour.
 *
 * Use this for every event date/time shown to a user. The confirmation email
 * already formats in UTC on the server, so this keeps the app and the email in sync.
 */
export function formatEvent(fecha: string | Date, pattern: string): string {
  const d = new Date(fecha);
  // Shift so the local-time render equals the UTC wall clock.
  const utc = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return format(utc, pattern, { locale: es });
}
