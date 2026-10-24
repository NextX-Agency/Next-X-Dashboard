import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '@/lib/csv';

describe('CSV exports', () => {
  it('quotes commas, quotes, and line breaks safely', () => {
    expect(csvCell('ACME, "Wholesale"')).toBe('"ACME, ""Wholesale"""');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
    expect(csvCell(null)).toBe('');
  });

  it('writes a BOM, CRLF-delimited document with a trailing newline', () => {
    const rows = [
      ['NX-1', 'ready'],
      ['NX-2', 'needs, review'],
    ];
    const columns = [
      { label: 'sku', value: (row: string[]) => row[0] },
      { label: 'note', value: (row: string[]) => row[1] },
    ];
    expect(toCsv(rows, columns)).toBe(
      '\uFEFFsku,note\r\nNX-1,ready\r\nNX-2,"needs, review"\r\n',
    );
  });

  it('neutralises spreadsheet formula cells', () => {
    expect(
      toCsv(
        [{ value: '=HYPERLINK("https://example.com")' }],
        [{ label: 'value', value: (row) => row.value }],
      ),
    ).toBe('\uFEFFvalue\r\n"\'=HYPERLINK(""https://example.com"")"\r\n');
  });

  it('neutralises every formula trigger but leaves negative numbers alone', () => {
    const cell = (value: string) =>
      toCsv([{ value }], [{ label: 'v', value: (row) => row.value }]).split('\r\n')[1];
    expect(cell('+1+1')).toBe("'+1+1");
    expect(cell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(cell('-2+3')).toBe("'-2+3");
    expect(cell('-cmd|x')).toBe("'-cmd|x");
    expect(cell('\tcmd')).toBe("'\tcmd");
    // Ledger outflows and refunds are negative numbers; they must stay numeric.
    expect(cell('-1250')).toBe('-1250');
    expect(cell('-3.5')).toBe('-3.5');
    expect(cell('-1,250.00')).toBe('"-1,250.00"');
  });
});
