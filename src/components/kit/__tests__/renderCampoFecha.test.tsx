/**
 * @jest-environment jsdom
 *
 * Kit · `CampoFecha` y `DateRangeButton` con el calendario de marca (Figma
 * `DateRange` 104:3343): nada de `<input type="date">` del navegador, días
 * calendario puros y el mismo día con cualquier `TZ` del proceso (correr con
 * `TZ=UTC` y `TZ=America/Bogota`).
 */
import * as React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { CampoFecha } from '../CampoFecha';
import { DateRangeButton } from '../DateRangeButton';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { RangoFechas } from '../rangoFechas';

function Controlado(props: Partial<React.ComponentProps<typeof CampoFecha>> & { inicial?: string; onCambio?: (d: string) => void }) {
  const { inicial = '', onCambio, ...resto } = props;
  const [valor, setValor] = React.useState(inicial);
  return (
    <CampoFecha
      aria-label="Vigente desde"
      hoy="2026-09-28"
      {...resto}
      valor={valor}
      onValorChange={(d) => {
        setValor(d);
        onCambio?.(d);
      }}
    />
  );
}

function abrir(nombre: RegExp = /Vigente desde/) {
  const boton = screen.getByRole('combobox', { name: nombre });
  act(() => {
    fireEvent.click(boton);
  });
  return boton;
}

/** Botón de un día de la grilla abierta (`data-dia`). */
function dia(d: string): HTMLButtonElement {
  const boton = document.querySelector<HTMLButtonElement>(`[role="grid"] button[data-dia="${d}"]`);
  if (!boton) throw new Error(`No se ve el día ${d}`);
  return boton;
}

describe('CampoFecha (render)', () => {
  test('sin valor muestra el texto de ayuda y no hay input nativo de fecha', () => {
    const { container } = renderConIdioma(<Controlado />);
    expect(screen.getByRole('combobox', { name: /Vigente desde: sin fecha/ })).toBeTruthy();
    expect(screen.getByText('Elegir fecha')).toBeTruthy();
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  test('con valor muestra el día en formato de Figma, sin correrse', () => {
    renderConIdioma(<Controlado inicial="2026-09-01" />);
    expect(screen.getByText('1 sep 2026')).toBeTruthy();
  });

  test('elegir un día entrega YYYY-MM-DD, cierra y devuelve el foco al disparador', async () => {
    const onCambio = jest.fn();
    renderConIdioma(<Controlado inicial="2026-09-10" onCambio={onCambio} />);
    const disparador = abrir();
    expect(disparador.getAttribute('aria-expanded')).toBe('true');
    expect(disparador.getAttribute('aria-controls')).toBe(screen.getByRole('dialog').id);
    expect(screen.getByRole('grid')).toBeTruthy();
    expect(screen.getByText('Septiembre 2026')).toBeTruthy();
    act(() => {
      fireEvent.click(dia('2026-09-15'));
    });
    expect(onCambio).toHaveBeenCalledWith('2026-09-15');
    expect(screen.queryByRole('grid')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(disparador));
    expect(screen.getByText('15 sep 2026')).toBeTruthy();
  });

  test('min y max: los días fuera quedan deshabilitados y no se eligen', () => {
    const onCambio = jest.fn();
    renderConIdioma(<Controlado inicial="2026-09-15" min="2026-09-10" max="2026-09-20" onCambio={onCambio} />);
    abrir();
    const antes = dia('2026-09-09');
    expect(antes.getAttribute('aria-disabled')).toBe('true');
    act(() => {
      fireEvent.click(antes);
    });
    act(() => {
      fireEvent.click(dia('2026-09-21'));
    });
    expect(onCambio).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toHaveProperty('disabled', true);
  });

  test('teclado: el foco abre en el día elegido y las flechas lo mueven', () => {
    const onCambio = jest.fn();
    renderConIdioma(<Controlado inicial="2026-09-30" onCambio={onCambio} />);
    abrir();
    const actual = document.activeElement as HTMLElement;
    expect(actual.getAttribute('data-dia')).toBe('2026-09-30');
    act(() => {
      fireEvent.keyDown(actual, { key: 'ArrowRight' });
    });
    const siguiente = document.activeElement as HTMLElement;
    expect(siguiente.getAttribute('data-dia')).toBe('2026-10-01');
    expect(screen.getByText('Octubre 2026')).toBeTruthy();
    act(() => {
      fireEvent.keyDown(siguiente, { key: 'PageDown' });
    });
    expect((document.activeElement as HTMLElement).getAttribute('data-dia')).toBe('2026-11-01');
    act(() => {
      fireEvent.click(document.activeElement as HTMLElement);
    });
    expect(onCambio).toHaveBeenCalledWith('2026-11-01');
  });

  test('«Hoy» es el día de la organización y «Limpiar» deja el campo vacío', () => {
    const onCambio = jest.fn();
    renderConIdioma(<Controlado inicial="2026-09-01" onCambio={onCambio} />);
    abrir();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    });
    expect(onCambio).toHaveBeenLastCalledWith('2026-09-28');
    abrir();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    });
    expect(onCambio).toHaveBeenLastCalledWith('');
  });

  test('obligatorio: sin «Limpiar» y con campo oculto validable para el formulario', () => {
    const { container } = renderConIdioma(<Controlado inicial="2026-09-01" name="effective_from" required />);
    const oculto = container.querySelector('input[name="effective_from"]') as HTMLInputElement;
    expect(oculto.value).toBe('2026-09-01');
    expect(oculto.required).toBe(true);
    abrir();
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull();
  });

  test('inglés: semana desde el domingo, mes y botones traducidos', () => {
    renderConIdioma(<Controlado inicial="2026-09-01" aria-label="Start date" />, { idioma: 'en' });
    abrir(/Start date/);
    expect(screen.getByText('September 2026')).toBeTruthy();
    const cabecera = screen.getAllByRole('columnheader');
    expect(cabecera[0].getAttribute('aria-label')).toBe('Sunday');
    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy();
    expect(screen.getByText('Sep 1, 2026')).toBeTruthy();
  });

  test('español: semana desde el lunes (L M X J V S D)', () => {
    renderConIdioma(<Controlado inicial="2026-09-01" />);
    abrir();
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent).join(' ')).toBe('L M X J V S D');
  });
});

describe('DateRangeButton con calendario (render)', () => {
  function RangoControlado({ onCambio }: { onCambio: (r: RangoFechas) => void }) {
    const [valor, setValor] = React.useState<RangoFechas>({ desde: '2026-09-01', hasta: '2026-09-21' });
    return (
      <DateRangeButton
        hoy="2026-09-28"
        valor={valor}
        onValorChange={(r) => {
          setValor(r);
          onCambio(r);
        }}
      />
    );
  }

  test('pie «Desde · Hasta» y rango elegido con dos clics, en orden', () => {
    const onCambio = jest.fn();
    renderConIdioma(<RangoControlado onCambio={onCambio} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Rango de fechas/ }));
    });
    expect(screen.getByText('Desde 1 sep · Hasta 21 sep')).toBeTruthy();
    act(() => {
      fireEvent.click(dia('2026-09-20'));
    });
    expect(onCambio).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(dia('2026-09-05'));
    });
    expect(onCambio).toHaveBeenCalledWith({ desde: '2026-09-05', hasta: '2026-09-20' });
  });

  test('los atajos aplican al instante y no se puede pasar de hoy', () => {
    const onCambio = jest.fn();
    renderConIdioma(<RangoControlado onCambio={onCambio} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Rango de fechas/ }));
    });
    expect(dia('2026-09-29').getAttribute('aria-disabled')).toBe('true');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Hoy' }));
    });
    expect(onCambio).toHaveBeenCalledWith({ desde: '2026-09-28', hasta: '2026-09-28' });
  });
});
