import { describe, expect, it } from 'vitest';
import { settingsSchema } from '@/lib/schemas';
import {
  normaliseAssetUrl,
  normaliseClockTime,
  normaliseInstagram,
  normalisePhone,
} from '@/lib/settings-fields';

const base = {
  businessName: 'NextX',
  displayCurrency: 'SRD',
  lowStockThreshold: 5,
  quoteValidityDays: 14,
  defaultPaymentDays: 14,
  weeklyPurchaseBudgetCents: '',
  reviewHorizonDays: 14,
  safetyStockDays: 7,
  defaultSupplierLeadTimeDays: 28,
  targetBundleMarginBp: 3000,
  defaultBundleDiscountBp: 500,
};

function issues(input: Record<string, unknown>) {
  const result = settingsSchema.safeParse({ ...base, ...input });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('normalisePhone', () => {
  it('turns typed numbers into international form', () => {
    expect(normalisePhone('812 3456')).toBe('+5978123456');
    expect(normalisePhone('8123456')).toBe('+5978123456');
    expect(normalisePhone('+597 812-3456')).toBe('+5978123456');
    expect(normalisePhone('00597 8123456')).toBe('+5978123456');
    expect(normalisePhone('+31 6 12345678')).toBe('+31612345678');
    expect(normalisePhone('(597) 812 3456')).toBe('+5978123456');
  });

  it('refuses things that cannot be dialled', () => {
    for (const value of [
      'abc',
      '123',
      '12345678901234567',
      '0812345678',
      'call me',
      '+',
      '8123 45x6',
    ]) {
      expect(normalisePhone(value), value).toBeNull();
    }
  });
});

describe('normaliseInstagram', () => {
  it('accepts handles and profile URLs', () => {
    expect(normaliseInstagram('@NextX.SR')).toBe('nextx.sr');
    expect(normaliseInstagram('nextx_sr')).toBe('nextx_sr');
    expect(normaliseInstagram('https://www.instagram.com/nextx.sr/')).toBe('nextx.sr');
    expect(normaliseInstagram('instagram.com/nextx.sr?hl=en')).toBe('nextx.sr');
  });

  it('refuses other sites, spaces and over-long handles', () => {
    for (const value of [
      'https://evil.example/nextx',
      'next x',
      'a'.repeat(31),
      '@',
      'javascript:alert(1)',
    ]) {
      expect(normaliseInstagram(value), value).toBeNull();
    }
  });
});

describe('normaliseClockTime and normaliseAssetUrl', () => {
  it('reads 24-hour times', () => {
    expect(normaliseClockTime('15:30')).toBe('15:30');
    expect(normaliseClockTime('9:05')).toBe('09:05');
    for (const value of ['24:00', '9pm', '15.30', '15:60', '']) {
      expect(normaliseClockTime(value), value).toBeNull();
    }
  });

  it('only allows https or root-relative image addresses', () => {
    expect(normaliseAssetUrl('/nextx-logo-light.png')).toBe('/nextx-logo-light.png');
    expect(normaliseAssetUrl('/images/logo.png')).toBe('/images/logo.png');
    expect(normaliseAssetUrl('/a b.png')).toBeNull();
    expect(normaliseAssetUrl('https://cdn.example/logo.png')).toBe(
      'https://cdn.example/logo.png',
    );
    for (const value of [
      'http://cdn.example/logo.png',
      'javascript:alert(1)',
      'data:image/svg+xml;base64,AAAA',
      '//cdn.example/logo.png',
      '/\\evil.example',
      'logo.png',
    ]) {
      expect(normaliseAssetUrl(value), value).toBeNull();
    }
  });
});

describe('settingsSchema public fields', () => {
  it('accepts the existing minimal settings and treats blanks as unset', () => {
    const parsed = settingsSchema.parse({
      ...base,
      whatsapp: '',
      email: '',
      instagram: '',
      logoUrl: '',
      pickupCutoffTime: '',
      announcement: '',
    });
    expect(parsed.whatsapp).toBeUndefined();
    expect(parsed.email).toBeUndefined();
    expect(parsed.announcement).toBeUndefined();
  });

  it('stores a clean WhatsApp number, handle, email and time', () => {
    const parsed = settingsSchema.parse({
      ...base,
      whatsapp: '812 3456',
      phone: '+597 471 234',
      instagram: '@NextX.sr',
      email: ' Shop@NextX.test ',
      pickupCutoffTime: '3:30',
    });
    expect(parsed.whatsapp).toBe('+5978123456');
    expect(parsed.phone).toBe('+597471234');
    expect(parsed.instagram).toBe('nextx.sr');
    expect(parsed.email).toBe('shop@nextx.test');
    expect(parsed.pickupCutoffTime).toBe('03:30');
  });

  it('reports each bad field by name', () => {
    expect(issues({ whatsapp: 'call me' })).toEqual(['whatsapp']);
    expect(issues({ email: 'not-an-email' })).toEqual(['email']);
    expect(issues({ instagram: 'two words' })).toEqual(['instagram']);
    expect(issues({ logoUrl: 'javascript:alert(1)' })).toEqual(['logoUrl']);
    expect(issues({ pickupCutoffTime: '25:00' })).toEqual(['pickupCutoffTime']);
  });

  it('keeps the public hero and announcement within their budgets', () => {
    expect(issues({ announcement: 'x'.repeat(160) })).toEqual([]);
    expect(issues({ announcement: 'x'.repeat(161) })).toEqual(['announcement']);
    expect(issues({ heroTitle: 'x'.repeat(91) })).toEqual(['heroTitle']);
    expect(issues({ heroBody: 'x'.repeat(321) })).toEqual(['heroBody']);
    expect(issues({ openingHours: 'x'.repeat(301) })).toEqual(['openingHours']);
  });
});
