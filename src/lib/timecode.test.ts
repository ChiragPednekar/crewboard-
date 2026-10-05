import { describe, expect, it } from 'vitest';

import { formatTimecode, parseTimecode } from './timecode';

describe('timecodes', () => {
  it('formats seconds', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(42.9)).toBe('0:42');
    expect(formatTimecode(725)).toBe('12:05');
    expect(formatTimecode(3723)).toBe('1:02:03');
  });
  it('parses what people type', () => {
    expect(parseTimecode('42')).toBe(42);
    expect(parseTimecode('0:42')).toBe(42);
    expect(parseTimecode('12:05')).toBe(725);
    expect(parseTimecode('1:02:03')).toBe(3723);
  });
  it('rejects nonsense', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('1:75')).toBeNull();
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('1:2:3:4')).toBeNull();
  });
  it('round-trips', () => {
    for (const s of [0, 9, 61, 3599, 3600, 7322]) expect(parseTimecode(formatTimecode(s))).toBe(s);
  });
});
