/**
 * @jest-environment jsdom
 *
 * Control «Cuándo está activa» (Figma 2693:189260): el caso «sábado 16:00 →
 * domingo 14:00» dice «Dura 22 h», lo resume en palabras, pinta la semana y
 * lista las próximas activaciones dentro de la vigencia. En los cuatro
 * idiomas no falta ninguna clave.
 */
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { renderConIdioma, simularAncho, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { SelectorHorarioPromocion } from '@/components/pos/promociones/horario/SelectorHorarioPromocion';
import { columnasDeHorario, horarioDesdeColumnas, type HorarioFormulario } from '@/lib/promotions/horarioPromocion';

const FINDE = { desde_dia: 'saturday', desde_hora: '16:00', hasta_dia: 'sunday', hasta_hora: '14:00' } as const;
const AHORA = new Date('2026-11-20T15:00:00-05:00');

function Envoltura({ inicial, onCambio }: { inicial: HorarioFormulario; onCambio?: (h: HorarioFormulario) => void }) {
  const [valor, setValor] = useState(inicial);
  return (
    <SelectorHorarioPromocion
      valor={valor}
      onValorChange={(h) => { setValor(h); onCambio?.(h); }}
      zona="America/Bogota"
      vigencia={{ desde: '2026-11-01', hasta: '2026-12-31' }}
      ahora={AHORA}
    />
  );
}

beforeEach(() => simularAncho(1440));

describe('SelectorHorarioPromocion', () => {
  test('franja que cruza días: duración, resumen, semana y próximas', () => {
    renderConIdioma(<Envoltura inicial={horarioDesdeColumnas({ schedule_windows: [FINDE] })} />);
    expect(screen.getByText('Dura 22 h · cruza la medianoche')).toBeTruthy();
    expect(screen.getByText(/desde el sábado a las 16:00 hasta el domingo a las 14:00 \(22 h seguidas\)/)).toBeTruthy();
    expect(screen.getByText(/a las 13:59 recibe el descuento; a las 14:00 ya no/)).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Sábado: 16:00–24:00' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Domingo: 00:00–14:00' })).toBeTruthy();
    expect(screen.getByText(/21 nov 2026 · 16:00 → .*22 nov · 14:00/)).toBeTruthy();
    expect(screen.getByText(/y 3 más; la última termina el .*27 dic a las 14:00/)).toBeTruthy();
    expect(screen.getAllByText(/America\/Bogota \(UTC−5\)/).length).toBeGreaterThan(0);
  });

  test('agregar otra franja y cambiar de modo conserva lo escrito', () => {
    let ultimo: HorarioFormulario | null = null;
    renderConIdioma(<Envoltura inicial={horarioDesdeColumnas({ schedule_windows: [FINDE] })} onCambio={(h) => { ultimo = h; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Agregar otra franja/ }));
    expect(screen.getByText('Franja 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Todo el día' }));
    expect(columnasDeHorario(ultimo!)).toEqual({ applicable_days: null, start_time: null, end_time: null, schedule_windows: null });
    fireEvent.click(screen.getByRole('radio', { name: 'Franja que cruza días' }));
    expect(ultimo!.franjas[0]).toEqual(FINDE);
  });

  test('mismo horario cada día: «Termina al día siguiente · 6 h» y madrugada aparte', () => {
    renderConIdioma(<Envoltura inicial={horarioDesdeColumnas({ applicable_days: ['friday', 'saturday'], start_time: '20:00', end_time: '02:00' })} />);
    expect(screen.getByText('Termina al día siguiente · 6 h')).toBeTruthy();
    expect(screen.getByText(/La madrugada \(00:00–02:00\) cuenta como parte del día en que empezó/)).toBeTruthy();
    expect(screen.getByText('Madrugada del día anterior')).toBeTruthy();
  });

  test.each<IdiomaPrueba>(['en', 'fr', 'pt'])('sin claves faltantes en %s', (idioma) => {
    renderConIdioma(<Envoltura inicial={horarioDesdeColumnas({ schedule_windows: [FINDE] })} />, { idioma });
    expect(document.body.textContent).not.toMatch(/posPromociones\./);
  });
});
