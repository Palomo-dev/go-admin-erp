/**
 * El selector de sucursal escribe `branchFilterAll` en localStorage, pero las
 * lecturas usan el caché en memoria. Si ese caché se queda en «Todas», dos
 * sedes muestran las mismas mesas.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { getBranchFilter, invalidateBranchIdCache, setBranchFilterAllCache } from '@/lib/hooks/useOrganization';

const memoria = new Map<string, string>();

describe('filtro de sucursal en memoria', () => {
  beforeEach(() => {
    memoria.clear();
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => memoria.get(k) ?? null,
        setItem: (k: string, v: string) => memoria.set(k, v),
        removeItem: (k: string) => memoria.delete(k),
        clear: () => memoria.clear(),
      },
    });
    invalidateBranchIdCache();
    setBranchFilterAllCache(false);
  });

  it('con el caché en «Todas», elegir una sucursal vuelve a filtrar por esa sede', () => {
    localStorage.setItem('branchFilterAll', '1');
    localStorage.setItem('currentBranchId', '530');
    setBranchFilterAllCache(true);
    expect(getBranchFilter()).toBeNull();

    localStorage.setItem('branchFilterAll', '0');
    localStorage.setItem('currentBranchId', '531');
    invalidateBranchIdCache();
    setBranchFilterAllCache(false);
    expect(getBranchFilter()).toBe(531);
  });

  it('sin actualizar el caché, localStorage ya no alcanza: las lecturas siguen en «Todas»', () => {
    setBranchFilterAllCache(true);
    localStorage.setItem('branchFilterAll', '0');
    localStorage.setItem('currentBranchId', '530');
    invalidateBranchIdCache();
    expect(getBranchFilter()).toBeNull();
  });
});
