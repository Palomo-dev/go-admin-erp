import { normalizePhoneToE164 } from '../phone';

describe('normalizePhoneToE164', () => {
  test.each([
    ['+57 300 300 3030', '+573003003030'],
    ['+57-300-300-3030', '+573003003030'],
    ['+1 (415) 555-2671', '+14155552671'],
  ])('normaliza %s', (input, expected) => {
    expect(normalizePhoneToE164(input)).toBe(expected);
  });

  test.each(['3003003030', '', '+', '+0123456789', '+57 123'])('rechaza %s', (input) => {
    expect(normalizePhoneToE164(input)).toBeNull();
  });
});
