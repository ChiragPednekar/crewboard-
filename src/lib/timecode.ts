/** "0:42", "12:05", "1:02:03" from seconds. */
export function formatTimecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Parse "42", "0:42", "1:02:03" (also "1m 5s"-free plain forms). Returns null when invalid. */
export function parseTimecode(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d{1,2}(:\d{1,2}){0,2}$/.test(v)) return null;
  const parts = v.split(':').map(Number);
  if (parts.slice(1).some((p) => p > 59)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}
