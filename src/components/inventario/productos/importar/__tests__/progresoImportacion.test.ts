import { borrarProgreso, guardarProgreso, huellaFilas, leerProgreso, primerLotePendiente, VERSION_PROGRESO, type ProgresoImportacion } from '../progresoImportacion';

class Memoria implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

const base = (o: Partial<ProgresoImportacion> = {}): ProgresoImportacion => ({
  version: VERSION_PROGRESO, orgId: 7, branchId: 3, huella: huellaFilas(['A', 'B', 'C', 'D']), paso: 'resultado',
  loteActual: 1, totalLotes: 2, total: 4, skusEnviados: ['A', 'B'], creados: 2, actualizados: 0, fallidos: 0,
  estado: 'interrumpido', guardadoEn: '2026-10-27T00:00:00Z', ...o,
});

describe('progresoImportacion', () => {
  it('guarda, lee y borra por organización', () => {
    const s = new Memoria();
    guardarProgreso(base(), s);
    expect(leerProgreso(7, s)?.skusEnviados).toEqual(['A', 'B']);
    expect(leerProgreso(8, s)).toBeNull();
    borrarProgreso(7, s);
    expect(leerProgreso(7, s)).toBeNull();
  });

  it('ignora JSON roto o de otra versión', () => {
    const s = new Memoria();
    s.setItem('goadmin:importar-productos:progreso:7', '{roto');
    expect(leerProgreso(7, s)).toBeNull();
    guardarProgreso(base({ version: 99 }), s);
    expect(leerProgreso(7, s)).toBeNull();
  });

  it('salta los bloques ya enviados solo con la misma huella, org y sede', () => {
    const lotes = [[{ sku: 'A' }, { sku: 'B' }], [{ sku: 'C' }, { sku: 'D' }]];
    const actual = { orgId: 7, branchId: 3, huella: huellaFilas(['A', 'B', 'C', 'D']) };
    expect(primerLotePendiente(lotes, base(), actual)).toBe(1);
    expect(primerLotePendiente(lotes, base(), { ...actual, branchId: 4 })).toBe(0);
    expect(primerLotePendiente(lotes, base(), { ...actual, huella: huellaFilas(['A']) })).toBe(0);
    expect(primerLotePendiente(lotes, null, actual)).toBe(0);
  });

  it('la huella cambia con el orden o el contenido', () => {
    expect(huellaFilas(['A', 'B'])).not.toBe(huellaFilas(['B', 'A']));
    expect(huellaFilas(['A', 'B'])).toBe(huellaFilas(['A', 'B']));
  });
});
