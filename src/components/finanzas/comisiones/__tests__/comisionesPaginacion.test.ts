/// <reference types="jest" />
/**
 * /app/finanzas/comisiones truncaba en 200 sin decirlo (la API devuelve
 * `count` y la UI lo ignoraba). Ahora pide la página siguiente con offset.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { COMMISSIONS_PAGE_SIZE, appendCommissionPage, buildCommissionsQuery, emptyFilters } from '../comisionesModel';

describe('paginación de comisiones', () => {
  it('la primera página no manda offset (compatibilidad); las siguientes sí', () => {
    expect(buildCommissionsQuery(emptyFilters())).toBe('');
    expect(buildCommissionsQuery({ ...emptyFilters(), status: 'accrued' }, { offset: 200 })).toBe(`status=accrued&offset=200&limit=${COMMISSIONS_PAGE_SIZE}`);
  });

  it('appendCommissionPage no duplica filas', () => {
    expect(appendCommissionPage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('la página usa count y ofrece «cargar más»', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/app/finanzas/comisiones/page.tsx'), 'utf8');
    expect(page).toMatch(/state\.count > state\.rows\.length/);
    expect(page).toMatch(/state\.loadMore\(\)/);
  });

  it('el servicio huérfano commissionsService.ts ya no existe', () => {
    expect(existsSync(join(process.cwd(), 'src/lib/services/commissionsService.ts'))).toBe(false);
  });
});
