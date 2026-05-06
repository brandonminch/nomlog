import { approximateIsoDateFromAgeYears, getAgeYearsFromDateOfBirth } from './ageFromDateOfBirth';

describe('getAgeYearsFromDateOfBirth', () => {
  it('counts full years in UTC before birthday', () => {
    const age = getAgeYearsFromDateOfBirth('2000-06-15', new Date('2025-06-14T12:00:00Z'), 'UTC');
    expect(age).toBe(24);
  });

  it('counts full years in UTC on birthday', () => {
    const age = getAgeYearsFromDateOfBirth('2000-06-15', new Date('2025-06-15T12:00:00Z'), 'UTC');
    expect(age).toBe(25);
  });
});

describe('approximateIsoDateFromAgeYears', () => {
  it('returns January 1 of UTC year minus age', () => {
    const y = new Date().getUTCFullYear() - 10;
    expect(approximateIsoDateFromAgeYears(10)).toBe(`${String(y).padStart(4, '0')}-01-01`);
  });
});
