import { describe, expect, it } from 'vitest';
import {
  countByIssue,
  formatMarginPercent,
  marginBasisPoints,
  type QualitySubject,
  qualityIssues,
  unitCostCents,
} from '@/lib/catalog-quality';

const healthy: QualitySubject = {
  status: 'active',
  catalogPublished: true,
  imageCount: 2,
  categoryId: 'cat',
  activeVariantCount: 2,
  variantsWithoutPrice: 0,
  variantsWithoutCost: 0,
  lowestMarginBp: 3000,
  onHand: 8,
};

const codes = (subject: QualitySubject) => qualityIssues(subject).map((issue) => issue.code);

describe('unit cost and margin', () => {
  it('prefers the landed average, then the list cost, else unknown', () => {
    expect(unitCostCents({ onHand: 4, valueCents: 10_000, referenceCostCents: 3000 })).toBe(
      2500,
    );
    expect(unitCostCents({ onHand: 0, valueCents: 0, referenceCostCents: 3000 })).toBe(3000);
    expect(unitCostCents({ onHand: 3, valueCents: 0, referenceCostCents: 0 })).toBeNull();
  });
  it('works margin on the price in basis points', () => {
    expect(marginBasisPoints(10_000, 6000)).toBe(4000);
    expect(marginBasisPoints(1000, 1500)).toBe(-5000);
    expect(marginBasisPoints(0, 500)).toBeNull();
    expect(marginBasisPoints(1000, null)).toBeNull();
    expect(formatMarginPercent(4000)).toBe('40%');
    expect(formatMarginPercent(null)).toBe('—');
  });
});

describe('qualityIssues', () => {
  it('has nothing to say about a healthy product', () => {
    expect(codes(healthy)).toEqual([]);
  });
  it('has nothing to say about an archived product', () => {
    expect(codes({ ...healthy, status: 'archived', imageCount: 0, categoryId: null })).toEqual(
      [],
    );
  });
  it('flags a missing photo, cost and category', () => {
    expect(codes({ ...healthy, imageCount: 0 })).toContain('no_photo');
    expect(codes({ ...healthy, variantsWithoutCost: 1 })).toContain('no_cost');
    expect(codes({ ...healthy, categoryId: null })).toContain('no_category');
  });
  it('flags a price at zero and a negative margin as the most serious', () => {
    const issues = qualityIssues({ ...healthy, variantsWithoutPrice: 1, lowestMarginBp: -200 });
    expect(
      issues
        .map((issue) => issue.code)
        .slice(0, 2)
        .sort(),
    ).toEqual(['negative_margin', 'no_price']);
    expect(issues[0]?.severity).toBe('high');
  });
  it('flags published products that are out of stock', () => {
    expect(codes({ ...healthy, onHand: 0 })).toContain('published_out_of_stock');
    expect(codes({ ...healthy, onHand: -2 })).toContain('published_out_of_stock');
    expect(codes({ ...healthy, onHand: 1 })).not.toContain('published_out_of_stock');
  });
  it('flags active, unpublished products that have stock, but not drafts', () => {
    expect(codes({ ...healthy, catalogPublished: false })).toContain('unpublished_with_stock');
    expect(codes({ ...healthy, catalogPublished: false, onHand: 0 })).not.toContain(
      'unpublished_with_stock',
    );
    expect(codes({ ...healthy, catalogPublished: false, status: 'draft' })).not.toContain(
      'unpublished_with_stock',
    );
  });
  it('treats a published product with no photo as high severity', () => {
    const issue = qualityIssues({ ...healthy, imageCount: 0 }).find(
      (i) => i.code === 'no_photo',
    );
    expect(issue?.severity).toBe('high');
    const draft = qualityIssues({
      ...healthy,
      catalogPublished: false,
      onHand: 0,
      imageCount: 0,
    });
    expect(draft.find((i) => i.code === 'no_photo')?.severity).toBe('medium');
  });
  it('points every issue at a place to fix it', () => {
    for (const issue of qualityIssues({
      ...healthy,
      imageCount: 0,
      categoryId: null,
      variantsWithoutCost: 2,
      variantsWithoutPrice: 1,
      lowestMarginBp: -1,
      onHand: 0,
    })) {
      expect(issue.fix.hash).toMatch(/^#/);
      expect(issue.detail.length).toBeGreaterThan(10);
    }
  });
});

describe('countByIssue', () => {
  it('counts each kind of problem across products', () => {
    const rows = [
      { issues: qualityIssues({ ...healthy, imageCount: 0 }) },
      { issues: qualityIssues({ ...healthy, imageCount: 0, categoryId: null }) },
      { issues: [] },
    ];
    const counts = countByIssue(rows);
    expect(counts.no_photo).toBe(2);
    expect(counts.no_category).toBe(1);
    expect(counts.no_cost).toBe(0);
  });
});
