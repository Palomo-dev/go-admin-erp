/**
 * @jest-environment jsdom
 *
 * Cierre de conciliación: con diferencia el motivo es obligatorio y la diferencia
 * pasa como partida pendiente. El servidor valida lo mismo (supabase/tests/contador).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { planCierre } from '@/lib/finanzas/conciliacion/diferencia';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/app/finanzas/conciliacion-bancaria/1',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: (v: string | null) => v ?? '' }),
}));

const resolverPartida = jest.fn();
jest.mock('../ConciliacionService', () => ({
  ConciliacionService: { resolverPartida: (...a: unknown[]) => resolverPartida(...a) },
}));

import { CerrarConciliacionDialog } from '../CerrarConciliacionDialog';
import { PartidasConciliacion } from '../PartidasConciliacion';
import type { PartidaConciliacion, PartidasDeConciliacion } from '../ConciliacionService';

const formatear = (n: number) => `$ ${n}`;

function dialogo(plan = planCierre(100, 340, 0), onConfirmar = jest.fn(), error: string | null = null) {
  renderConIdioma(
    <CerrarConciliacionDialog
      abierto
      onAbiertoChange={jest.fn()}
      contexto="Corriente · noviembre"
      plan={plan}
      formatear={formatear}
      cargando={false}
      error={error}
      onConfirmar={onConfirmar}
    />,
  );
  return onConfirmar;
}

describe('cerrar con diferencia', () => {
  it('avisa que queda pendiente y que no se ajusta contra resultados', () => {
    dialogo();
    expect(screen.getByText('La diferencia de $ 240 queda pendiente')).toBeTruthy();
    expect(screen.getByText(/No se ajusta contra resultados/)).toBeTruthy();
    expect(screen.getByText('Queda registrado quién cerró y cuándo.')).toBeTruthy();
  });

  it('sin motivo no cierra', () => {
    const onConfirmar = dialogo();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar con partida pendiente' }));
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('con motivo entrega el texto limpio', async () => {
    const onConfirmar = dialogo();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Consignación   del 30  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar con partida pendiente' }));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith('Consignación del 30'));
  });

  it('muestra el rechazo del servidor', () => {
    dialogo(planCierre(100, 340, 0), jest.fn(), 'Primero cierra la conciliación anterior de esta cuenta.');
    expect(screen.getByRole('alert').textContent).toContain('Primero cierra la conciliación anterior');
  });
});

describe('cerrar con partidas traídas', () => {
  it('la diferencia ya explicada no promete una partida nueva, pero pide motivo', () => {
    const onConfirmar = dialogo(planCierre(100, 340, -240));
    expect(screen.getByText('La diferencia de $ 240 sigue en partidas traídas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar conciliación' }));
    expect(onConfirmar).not.toHaveBeenCalled();
  });
});

describe('cerrar sin diferencia', () => {
  it('no pide motivo', async () => {
    const onConfirmar = dialogo(planCierre(100, 100, 0));
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar conciliación' }));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith(null));
  });
});

const partida = (extra: Partial<PartidaConciliacion> = {}): PartidaConciliacion => ({
  id: 'p1',
  fecha: '2026-10-31',
  descripcion: 'Consignación sin abonar en el extracto',
  valor: -240,
  estado: 'pendiente',
  registrada_por: 'Ana Prueba',
  resuelta_en: null,
  resuelta_aqui: false,
  bank_transaction_id: null,
  origen_fin: '2026-10-31',
  ...extra,
});

function partidas(datos: Partial<PartidasDeConciliacion>, cerrada = false, puedeResolver = true, onCambio = jest.fn()) {
  renderConIdioma(
    <PartidasConciliacion
      reconciliationId="r1"
      partidas={{ cierre: null, traidas_pendientes: 0, propias: [], traidas: [], ...datos }}
      cerrada={cerrada}
      puedeResolver={puedeResolver}
      items={[]}
      formatear={formatear}
      onCambio={onCambio}
    />,
  );
  return onCambio;
}

describe('partidas de la conciliación', () => {
  beforeEach(() => jest.clearAllMocks());

  it('la cerrada muestra su partida, con signo y quién la registró', () => {
    partidas({ propias: [partida()] }, true);
    expect(screen.getByRole('heading', { name: 'Partidas conciliatorias pendientes' })).toBeTruthy();
    expect(screen.getByText('$ -240')).toBeTruthy();
    expect(screen.getByText('Ana Prueba')).toBeTruthy();
    expect(screen.getByText(/no genera asiento ni ajuste a resultados/)).toBeTruthy();
  });

  it('las traídas se titulan con su mes y se pueden resolver', async () => {
    resolverPartida.mockResolvedValue(undefined);
    const onCambio = partidas({ traidas: [partida()] });
    expect(screen.getByRole('heading', { name: 'Traídas de octubre' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Marcar resuelta' }));
    const botones = await screen.findAllByRole('button', { name: 'Marcar resuelta' });
    fireEvent.click(botones[botones.length - 1]);

    await waitFor(() => expect(resolverPartida).toHaveBeenCalledWith('p1', 'r1', null));
    await waitFor(() => expect(onCambio).toHaveBeenCalled());
  });

  it('sin permiso, o cerrada, no se resuelve', () => {
    partidas({ traidas: [partida()] }, false, false);
    expect(screen.queryByRole('button', { name: 'Marcar resuelta' })).toBeNull();
  });

  it('la resuelta dice cuándo y enlaza el movimiento', () => {
    partidas({
      traidas: [partida({ estado: 'resuelta', resuelta_en: '3 nov', resuelta_aqui: true, bank_transaction_id: 102 })],
    });
    expect(screen.getByText('Resuelta 3 nov')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver movimiento' })).toBeTruthy();
  });

  it('sin partidas no dibuja nada', () => {
    partidas({});
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
