import { LOCK_AFTER_MS, shouldLockOnReturn } from '../logic';

describe('verrouillage', () => {
  it('se verrouille après 1 minute en arrière-plan, pas avant', () => {
    expect(LOCK_AFTER_MS).toBe(60_000);
    expect(shouldLockOnReturn(null, 1_000_000)).toBe(false);
    expect(shouldLockOnReturn(1_000_000, 1_000_000 + 59_999)).toBe(false);
    expect(shouldLockOnReturn(1_000_000, 1_000_000 + 60_000)).toBe(true);
  });
});
