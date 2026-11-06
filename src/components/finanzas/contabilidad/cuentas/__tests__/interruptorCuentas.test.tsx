/**
 * @jest-environment jsdom
 *
 * «Ver cuentas contables»: encenderlo o apagarlo no cambia el documento.
 * Usa los hooks y las piezas reales; solo se simula la llamada a la base.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { useState } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { lineaAceptaSugerencia, type CuentaEfectiva } from '@/lib/finanzas/contabilidad/cuentaEfectiva';
import { InterruptorCuentas, PieCuentaLinea } from '../PiezasCuentaLinea';
import { useCuentasEfectivas, useSugerenciaProveedor } from '../useCuentasEfectivas';
import { useVerCuentas } from '../useVerCuentas';
import { CuentasAutomaticasService } from '../CuentasAutomaticasService';

jest.mock('../CuentasAutomaticasService', () => ({
  buscarCuentas: jest.fn(),
  CuentasAutomaticasService: {
    efectivas: jest.fn(),
    sugerida: jest.fn(),
    verCuentas: jest.fn(),
    guardarVerCuentas: jest.fn(),
  },
}));

const servicio = CuentasAutomaticasService as jest.Mocked<typeof CuentasAutomaticasService>;

const efectiva = (clave: string): CuentaEfectiva => ({
  clave,
  rol: 'costo',
  cuenta: '14350101',
  nombre: 'Mercancías',
  origen: 'sede',
  estado: 'automatica',
  claveContable: 'inventario',
  configurada: '14350101',
  fallo: null,
  asentable: true,
  prevista: false,
  categoriaId: null,
  categoriaNombre: null,
  categoriaOrigen: null,
});

const INICIAL = [
  { key: 'a', product_id: 1, cuenta_contable: null as string | null },
  { key: 'b', product_id: null, cuenta_contable: null as string | null },
];

let documento: typeof INICIAL = [];

function Formulario() {
  const [lineas, setLineas] = useState(INICIAL);
  documento = lineas;
  const ver = useVerCuentas();
  const consultas = lineas.map((l) => ({ clave: l.key, product_id: l.product_id, cuenta_contable: l.cuenta_contable }));
  const cuentas = useCuentasEfectivas(1, 'compra', consultas, ver.activo);
  const sugerencia = useSugerenciaProveedor(7, ver.activo);
  return (
    <div>
      <InterruptorCuentas activo={ver.activo} onCambiar={ver.cambiar} />
      {ver.activo &&
        lineas.map((l) => (
          <PieCuentaLinea
            key={l.key}
            efectiva={cuentas.porClave.get(l.key)}
            cargando={cuentas.cargando}
            sugerencia={lineaAceptaSugerencia(l) ? sugerencia : null}
            onAbrir={() => undefined}
            onUsarSugerencia={(cuenta) => setLineas((prev) => prev.map((x) => (x.key === l.key ? { ...x, cuenta_contable: cuenta } : x)))}
          />
        ))}
    </div>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  servicio.verCuentas.mockResolvedValue(false);
  servicio.guardarVerCuentas.mockResolvedValue();
  servicio.efectivas.mockImplementation(async (_sede, _doc, consultas) => consultas.map((c) => efectiva(c.clave)));
  servicio.sugerida.mockResolvedValue({ cuenta: '51355001', nombre: 'Fletes', veces: 3, compras: 3 });
});

async function interruptor() {
  const control = await screen.findByRole('switch');
  await act(async () => {
    await Promise.resolve();
  });
  return control;
}

describe('apagado', () => {
  test('no llama a la base ni muestra nada', async () => {
    renderConIdioma(<Formulario />);
    await interruptor();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(servicio.efectivas).not.toHaveBeenCalled();
    expect(servicio.sugerida).not.toHaveBeenCalled();
    expect(screen.queryByText(/14350101/)).toBeNull();
  });
});

describe('encender y apagar', () => {
  test('el documento queda idéntico', async () => {
    renderConIdioma(<Formulario />);
    const control = await interruptor();
    const antes = JSON.stringify(documento);

    fireEvent.click(control);
    await waitFor(() => expect(screen.getAllByText(/14350101/).length).toBeGreaterThan(0));
    await screen.findByText(/51355001/);
    expect(JSON.stringify(documento)).toBe(antes);

    fireEvent.click(control);
    await waitFor(() => expect(screen.queryByText(/14350101/)).toBeNull());
    expect(JSON.stringify(documento)).toBe(antes);
  });

  test('la sugerencia no se escribe sola: la acepta la persona', async () => {
    renderConIdioma(<Formulario />);
    fireEvent.click(await interruptor());
    const usar = await screen.findByRole('button', { name: 'Usar' });
    expect(documento.find((l) => l.key === 'b')?.cuenta_contable).toBeNull();

    fireEvent.click(usar);
    await waitFor(() => expect(documento.find((l) => l.key === 'b')?.cuenta_contable).toBe('51355001'));
    expect(documento.find((l) => l.key === 'a')?.cuenta_contable).toBeNull();
  });

  test('solo la línea manual recibe la sugerencia', async () => {
    renderConIdioma(<Formulario />);
    fireEvent.click(await interruptor());
    await screen.findByRole('button', { name: 'Usar' });
    expect(screen.getAllByRole('button', { name: 'Usar' })).toHaveLength(1);
  });
});

describe('preferencia por persona', () => {
  test('se guarda en el perfil, no solo en el navegador', async () => {
    renderConIdioma(<Formulario />);
    fireEvent.click(await interruptor());
    await waitFor(() => expect(servicio.guardarVerCuentas).toHaveBeenCalledWith(true));
  });

  test('sin nada en el navegador, manda el perfil', async () => {
    servicio.verCuentas.mockResolvedValue(true);
    renderConIdioma(<Formulario />);
    await waitFor(() => expect((screen.getByRole('switch') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true'));
  });

  test('el perfil gana a lo que recordaba el navegador', async () => {
    window.localStorage.setItem('go.ver-cuentas-contables', '1');
    servicio.verCuentas.mockResolvedValue(false);
    renderConIdioma(<Formulario />);
    await waitFor(() => expect(servicio.verCuentas).toHaveBeenCalled());
    await waitFor(() => expect((screen.getByRole('switch') as HTMLButtonElement).getAttribute('aria-checked')).toBe('false'));
  });

  test('sin navegador disponible, sigue funcionando', async () => {
    const lectura = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    servicio.verCuentas.mockResolvedValue(true);
    renderConIdioma(<Formulario />);
    await waitFor(() => expect((screen.getByRole('switch') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true'));
    lectura.mockRestore();
  });
});

describe('los formularios reales', () => {
  const raiz = join(process.cwd(), 'src/components/finanzas');
  const compra = readFileSync(join(raiz, 'facturas-compra/formulario/FormularioFacturaCompra.tsx'), 'utf8');
  const venta = readFileSync(join(raiz, 'facturas-venta/formulario/FormularioFacturaVenta.tsx'), 'utf8');

  test.each([
    ['compra', compra],
    ['venta', venta],
  ])('%s: el interruptor solo decide qué se ve', (_nombre, fuente) => {
    const usos = fuente.split('\n').filter((l) => l.includes('verCuentas.activo'));
    expect(usos.length).toBeGreaterThan(0);
    for (const linea of usos) {
      expect(linea).toMatch(/pieLinea|cuentasActivas =|useCuentasEfectivas|<InterruptorCuentas/);
    }
    expect(fuente).not.toMatch(/setLineas[^\n]*verCuentas/);
  });

  test('la compra solo cambia la cuenta de una línea por una acción de la persona', () => {
    const escrituras = compra.split('\n').filter((l) => l.includes('cuenta_contable:') && l.includes('cambiarLinea'));
    expect(escrituras).toHaveLength(2);
    expect(escrituras.some((l) => l.includes('onUsarSugerencia'))).toBe(true);
    expect(escrituras.some((l) => l.includes('cambio.cuentaLinea'))).toBe(true);
  });
});
