/**
 * @jest-environment jsdom
 *
 * El carrito abierto vuelve a calcular promociones al montar, por el aviso
 * del mismo navegador, por realtime y cada 60 s si la pestaña está visible.
 * Un temporizador atrasado no toca un carrito que ya no es el actual.
 */
import { act, render } from '@testing-library/react';
import { useRecalcularAlCambiarPromociones, INTERVALO_RESPALDO_PROMOCIONES_MS } from '@/lib/pos/venta/recalculoPromociones';
import { avisarCambioPromociones } from '@/lib/pos/venta/avisosPromociones';

interface CanalSupabase {
  nombre: string;
  cbs: Array<() => void>;
}

interface GlobalConCanales {
  __canalesPromo: CanalSupabase[];
  BroadcastChannel: new (nombre: string) => BroadcastChannel;
}

const g = globalThis as unknown as GlobalConCanales;
g.__canalesPromo = [];

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    channel: (nombre: string) => {
      const canal: CanalSupabase & { on: (evento: string, filtro: unknown, cb: () => void) => CanalSupabase; subscribe: () => CanalSupabase } = {
        nombre,
        cbs: [],
        on(_evento: string, _filtro: unknown, cb: () => void) {
          canal.cbs.push(cb);
          return canal;
        },
        subscribe() {
          return canal;
        },
      };
      (globalThis as unknown as GlobalConCanales).__canalesPromo.push(canal);
      return canal;
    },
    removeChannel: jest.fn(),
  },
}));

class CanalPrueba {
  static abiertos: CanalPrueba[] = [];
  nombre: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  cerrado = false;
  constructor(nombre: string) {
    this.nombre = nombre;
    CanalPrueba.abiertos.push(this);
  }
  postMessage(data: unknown) {
    for (const otro of CanalPrueba.abiertos) {
      if (otro === this || otro.cerrado || otro.nombre !== this.nombre || !otro.onmessage) continue;
      otro.onmessage({ data } as MessageEvent);
    }
  }
  close() {
    this.cerrado = true;
  }
}

function Sonda(props: {
  org: number | null;
  id: string | null;
  hay: boolean;
  recalcular: (id: string) => void;
}) {
  useRecalcularAlCambiarPromociones({
    organizationId: props.org,
    cuentaId: props.id,
    hayLineas: props.hay,
    recalcular: props.recalcular,
  });
  return null;
}

function avanzar(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  g.__canalesPromo = [];
  CanalPrueba.abiertos = [];
  g.BroadcastChannel = CanalPrueba as unknown as GlobalConCanales['BroadcastChannel'];
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRecalcularAlCambiarPromociones', () => {
  test('al montar recalcula la cuenta con líneas; vacía no se suscribe', () => {
    const recalcular = jest.fn();
    const { rerender } = render(<Sonda org={120} id="c1" hay recalcular={recalcular} />);
    expect(recalcular).not.toHaveBeenCalled();
    avanzar(400);
    expect(recalcular).toHaveBeenCalledTimes(1);
    expect(recalcular).toHaveBeenCalledWith('c1');
    expect(g.__canalesPromo.map((c) => c.nombre)).toEqual(['pos-promos-120-c1']);

    recalcular.mockClear();
    rerender(<Sonda org={120} id="c1" hay={false} recalcular={recalcular} />);
    avanzar(INTERVALO_RESPALDO_PROMOCIONES_MS + 400);
    expect(recalcular).not.toHaveBeenCalled();
  });

  test('un aviso del mismo navegador y un cambio de realtime vuelven a calcular', () => {
    const recalcular = jest.fn();
    render(<Sonda org={120} id="c1" hay recalcular={recalcular} />);
    avanzar(400);
    recalcular.mockClear();

    act(() => {
      avisarCambioPromociones();
    });
    expect(recalcular).not.toHaveBeenCalled();
    avanzar(400);
    expect(recalcular).toHaveBeenCalledWith('c1');

    recalcular.mockClear();
    act(() => {
      g.__canalesPromo[0].cbs[0]();
      g.__canalesPromo[0].cbs[1]();
    });
    avanzar(400);
    expect(recalcular).toHaveBeenCalledTimes(1);
    expect(recalcular).toHaveBeenCalledWith('c1');
  });

  test('al cambiar de cuenta, el temporizador viejo no recalcula el carrito anterior', () => {
    const recalcular = jest.fn();
    const { rerender } = render(<Sonda org={120} id="c1" hay recalcular={recalcular} />);
    avanzar(200);
    rerender(<Sonda org={120} id="c2" hay recalcular={recalcular} />);
    avanzar(200);
    expect(recalcular).not.toHaveBeenCalled();
    avanzar(200);
    expect(recalcular).toHaveBeenCalledTimes(1);
    expect(recalcular).toHaveBeenCalledWith('c2');
    expect(g.__canalesPromo.map((c) => c.nombre)).toEqual(['pos-promos-120-c1', 'pos-promos-120-c2']);
  });

  test('el respaldo de 60 s corre solo con la pestaña visible', () => {
    let estado = 'hidden';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado });
    const recalcular = jest.fn();
    render(<Sonda org={120} id="c1" hay recalcular={recalcular} />);
    avanzar(400);
    expect(recalcular).toHaveBeenCalledTimes(1);
    recalcular.mockClear();

    avanzar(INTERVALO_RESPALDO_PROMOCIONES_MS + 400);
    expect(recalcular).not.toHaveBeenCalled();

    estado = 'visible';
    avanzar(INTERVALO_RESPALDO_PROMOCIONES_MS);
    expect(recalcular).toHaveBeenCalledTimes(1);
    expect(recalcular).toHaveBeenCalledWith('c1');
  });
});
