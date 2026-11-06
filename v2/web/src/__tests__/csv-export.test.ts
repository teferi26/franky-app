import { describe, expect, it } from 'vitest';
import { rowsToCsv } from '../lib/csv-export';

describe('Safe spreadsheet exports', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@SUM(A1:A2)', '  =1+1', '\t=1+1', '\r\n=1+1'])('neutralizes a formula-like user label: %s', value => {
    expect(rowsToCsv([{ carrera: value }]).split('\r\n').slice(1).join('\r\n')).toContain(`'${value}`);
  });
  it('retains real numeric values, including negative amounts', () => {
    expect(rowsToCsv([{ euros: -25, count: 0, active: false }])).toBe('euros;count;active\r\n-25;0;false');
  });
  it('escapes separators, quotes and line breaks in headers and text', () => {
    expect(rowsToCsv([{ 'campo;nombre': 'Una "carrera"\nMadrid' }])).toBe('"campo;nombre"\r\n"Una ""carrera""\nMadrid"');
  });
  it('protects dynamic headers and preserves Spanish characters', () => {
    expect(rowsToCsv([{ '=SUM(A1:A2)': 'Ingeniería y Educación' }])).toBe("'=SUM(A1:A2)\r\nIngeniería y Educación");
  });
});
