/**
 * Precios por sede (docs/inventario/PRECIOS-POR-SEDE.md): la vigencia se
 * compara por INSTANTE (timestamptz), nunca por día calendario. El resultado
 * no puede depender de la zona del proceso: este archivo corre en
 * `npm run test:tz-all` (UTC, Bogotá, México, Madrid, Santiago, Katmandú).
 *
 * Datos inventados: sede 7.
 */
import { importePrecioVigenteEnSede, precioVigenteEnSede } from '@/lib/pos/precioVigente';

const general = [{ price: '18000', effective_from: '2026-01-01T00:00:00Z', effective_to: null }];

describe('precio de sede alrededor de la medianoche de Bogotá', () => {
  // El precio de sede empieza a las 00:00 de Bogotá del 10-oct = 05:00 UTC.
  const sede = [{ price: '20000', effective_from: '2026-10-10T00:00:00-05:00', effective_to: null }];

  it('un minuto antes rige el general; en el instante exacto, el de la sede', () => {
    expect(importePrecioVigenteEnSede(sede, general, new Date('2026-10-10T04:59:00Z'))).toBe(18000);
    expect(importePrecioVigenteEnSede(sede, general, new Date('2026-10-10T05:00:00Z'))).toBe(20000);
  });

  it('el mismo instante escrito con otro offset da lo mismo', () => {
    expect(importePrecioVigenteEnSede(sede, general, new Date('2026-10-10T00:00:00-05:00'))).toBe(20000);
    expect(importePrecioVigenteEnSede(sede, general, new Date('2026-10-09T23:59:59-05:00'))).toBe(18000);
  });

  it('el cierre (effective_to) es excluido: en el instante del cierre ya rige el general', () => {
    const cerrada = [{ price: '20000', effective_from: '2026-10-01T00:00:00-05:00', effective_to: '2026-10-10T00:00:00-05:00' }];
    expect(precioVigenteEnSede(cerrada, general, new Date('2026-10-10T04:59:59.999Z'))?.origen).toBe('sede');
    expect(precioVigenteEnSede(cerrada, general, new Date('2026-10-10T05:00:00Z'))?.origen).toBe('general');
  });
});
