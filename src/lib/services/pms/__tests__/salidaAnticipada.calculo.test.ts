import { calcularSalidaAnticipada } from '../salidaAnticipada.calculo';

describe('calcularSalidaAnticipada', () => {
  it('cobra noches usadas y anula las restantes', () => {
    const r = calcularSalidaAnticipada({ checkin: '2026-10-28', checkout: '2026-11-02', hoy: '2026-10-30', totalHospedaje: 500000, consumos: 30000, pagos: 100000 });
    expect(r).toMatchObject({ nochesPrevistas: 5, nochesUsadas: 2, nochesAnuladas: 3, hospedajeUsado: 200000, hospedajeAnulado: 300000, totalACobrar: 230000, saldo: 130000 });
  });
  it('salida el mismo día del check-in cobra 1 noche', () => {
    const r = calcularSalidaAnticipada({ checkin: '2026-10-30', checkout: '2026-11-01', hoy: '2026-10-30', totalHospedaje: 220000, consumos: 0, pagos: 0 });
    expect(r.nochesUsadas).toBe(1);
    expect(r.hospedajeAnulado).toBe(110000);
  });
  it('nunca anula más noches de las previstas y deja saldo a favor negativo', () => {
    const r = calcularSalidaAnticipada({ checkin: '2026-10-28', checkout: '2026-10-29', hoy: '2026-10-30', totalHospedaje: 100000, consumos: 0, pagos: 150000 });
    expect(r.nochesAnuladas).toBe(0);
    expect(r.saldo).toBe(-50000);
  });
});
