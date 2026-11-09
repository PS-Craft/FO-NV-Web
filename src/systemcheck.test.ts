import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';
import { overall, rateStorage, REQUIRED_STORAGE, type CheckItem } from './systemcheck';

describe('formatBytes', () => {
  it('formatiert Größen', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(8 * 1024 ** 3)).toBe('8.0 GB');
    expect(formatBytes(undefined)).toBe('–');
  });
});

describe('rateStorage', () => {
  it('bewertet Kontingent', () => {
    expect(rateStorage(REQUIRED_STORAGE)).toBe('ok');
    expect(rateStorage(REQUIRED_STORAGE / 2)).toBe('warn');
    expect(rateStorage(1024)).toBe('fail');
    expect(rateStorage(undefined)).toBe('warn');
  });
});

describe('overall', () => {
  const item = (status: CheckItem['status']): CheckItem => ({ id: 'x', label: 'x', status, detail: '' });
  it('nimmt den schlechtesten Status', () => {
    expect(overall([item('ok'), item('ok')])).toBe('ok');
    expect(overall([item('ok'), item('warn')])).toBe('warn');
    expect(overall([item('warn'), item('fail')])).toBe('fail');
  });
});
