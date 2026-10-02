import { describe, expect, it } from 'vitest';

import { csvCell, safeFileName, toCsv } from './export';

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Kesar Foods, Mumbai')).toBe('"Kesar Foods, Mumbai"');
    expect(csvCell('He said "great"')).toBe('"He said ""great"""');
    expect(csvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
  });
  it('neutralises formula injection', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98190')).toBe("'+91 98190");
    expect(csvCell('@sum')).toBe("'@sum");
  });
  it('keeps numbers numeric and blanks empty', () => {
    expect(csvCell(93.03)).toBe('93.03');
    expect(csvCell(-2)).toBe('-2');
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF', () => {
    expect(toCsv({ headers: ['Name', 'Score'], rows: [['Priya', 93.03], ['Arjun, M', 92.83]] })).toBe('Name,Score\r\nPriya,93.03\r\n"Arjun, M",92.83');
  });
});

describe('safeFileName', () => {
  it('strips unsafe characters', () => {
    expect(safeFileName('Assessments – October 2026')).toBe('Assessments-October-2026');
    expect(safeFileName('../../etc')).toBe('etc');
  });
});
