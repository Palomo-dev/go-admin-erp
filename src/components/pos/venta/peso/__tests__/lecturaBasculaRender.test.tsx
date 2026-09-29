/**
 * @jest-environment jsdom
 *
 * Lectura de la báscula dentro de «Pesar» (fase 3, §2.6, §2.9 y §11 de
 * PRODUCTOS-POR-PESO-BASCULA.md) con los textos reales en 4 idiomas: estados
 * de `LecturaBascula`, el auto-agregar del diálogo con un lector doble, el
 * peso anterior que no se repite, el flujo sin báscula intacto y el lector de
 * códigos activo con «Pesar» abierto.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { LecturaBascula } from '@/components/pos/venta/peso/LecturaBascula';
import { DialogoPesar } from '@/components/pos/venta/peso/DialogoPesar';
import type { Product } from '@/components/pos/types';
import type { ConfigBascula } from '@/lib/pos/bascula/tipos';
import type { EstadoLector } from '@/lib/pos/bascula/lector';
import type { LectorEnVivo } from '@/lib/pos/bascula/useLectorBascula';
import { dialogOpen } from '@/hooks/useHardwareBarcodeScanner';
import { contextoMoneda } from '@/lib/utils/moneda';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import fr from '../../../../../../messages/fr.json';
import pt from '../../../../../../messages/pt.json';

const MENSAJES = { es, en, fr, pt } as const;
const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const lec = (idioma: IdiomaPrueba) => MENSAJES[idioma].posBascula.lectura;

describe.each(IDIOMAS)('LecturaBascula (%s)', (idioma) => {
  const m = lec(idioma);

  it('estable: peso, bruto y tara, Cero y Tara con su atajo', () => {
    const onCero = jest.fn();
    renderConIdioma(
      <LecturaBascula estado="estable" nombreBascula="Mostrador" neto="0,735 kg" bruto="0,750 kg" tara="0,015 kg" taraActiva onCero={onCero} onTara={jest.fn()} onQuitarTara={jest.fn()} />,
      { idioma },
    );
    expect(screen.getByText('0,735 kg')).toBeTruthy();
    expect(screen.getByText(m.estado.estable)).toBeTruthy();
    const cero = screen.getByRole('button', { name: new RegExp(m.acciones.cero) });
    expect(cero.getAttribute('aria-keyshortcuts')).toBe('Z');
    fireEvent.click(cero);
    expect(onCero).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: new RegExp(m.acciones.quitarTara) })).toBeTruthy();
  });

  it('inestable, fuera de rango, error con reintentar y conectar, conectando', () => {
    const { rerender } = renderConIdioma(<LecturaBascula estado="inestable" neto="0,742 kg" />, { idioma });
    expect(screen.getByText(m.motivos.inestable)).toBeTruthy();
    rerender(<LecturaBascula estado="fuera_de_rango" fueraDeRango="sobrecarga" capacidad="15 kg" />);
    expect(screen.getByText(m.sobrecarga.replace('{capacidad}', '15 kg'))).toBeTruthy();
    rerender(<LecturaBascula estado="fuera_de_rango" fueraDeRango="bajo_cero" />);
    expect(screen.getByText(m.bajoCero)).toBeTruthy();
    const onReintentar = jest.fn();
    rerender(<LecturaBascula estado="error" error="sin_puerto" onReintentar={onReintentar} onConectar={jest.fn()} onPesarAMano={jest.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe(m.errores.sin_puerto);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(m.acciones.reintentar) }));
    expect(onReintentar).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: new RegExp(m.acciones.conectar) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(m.acciones.pesarAMano) })).toBeTruthy();
    rerender(<LecturaBascula estado="conectando" nombreBascula="Mostrador" />);
    expect(screen.getByText(m.conectando.replace('{bascula}', 'Mostrador'))).toBeTruthy();
  });

  it('esperando auto-agregar: indicador claro; con el peso anterior, pide retirarlo', () => {
    const { rerender } = renderConIdioma(<LecturaBascula estado="inestable" esperandoAuto="estable" />, { idioma });
    expect(screen.getByText(m.auto.esperando)).toBeTruthy();
    rerender(<LecturaBascula estado="estable" neto="0,750 kg" esperandoAuto="pesoNuevo" />);
    expect(screen.getByText(m.auto.pesoNuevo)).toBeTruthy();
  });
});

// ── «Pesar» con la báscula del equipo ───────────────────────────────────────

const QUESO = {
  id: 31,
  name: 'Queso campesino',
  price: 18900,
  sale_mode: 'weight',
  qty_decimals: 3,
  unit_code: 'KG  ',
  track_stock: false,
  min_sale_qty: 0.05,
} as unknown as Product;

const BASCULA: ConfigBascula = {
  id: '6b0e1c8e-8a52-4f4e-9a38-2f1a3c9d7e11',
  nombre: 'Mostrador',
  transporte: 'desktop_serial',
  protocolo: 'continuous_st_gs',
  dispositivo: 'COM3',
  baudios: 9600,
  bitsDatos: 8,
  paridad: 'none',
  bitsParada: 1,
  unidad: 'KG',
  decimales: 3,
  capacidad: 15,
  division: 0.005,
  estableMs: 500,
};

function estadoLector(peso: number | null, estable: boolean): EstadoLector {
  return {
    fase: 'leyendo',
    error: null,
    lectura: { neto: peso, bruto: peso, tara: null, unidad: 'KG', estable, estado: 'ok', netoDeBascula: false },
    peso,
    unidad: 'KG',
    estable,
    ultimaLecturaMs: 0,
    crudo: new Uint8Array(0),
    tramasReconocidas: 1,
    tramasNoReconocidas: 0,
    ceroEnPos: true,
  };
}

const lectorDoble = (estado: EstadoLector | null): LectorEnVivo => ({
  estado,
  cero: jest.fn(),
  reintentar: jest.fn(),
  conectarWebSerial: jest.fn(async () => null),
  puedeElegirPuerto: false,
});

const MONEDA = contextoMoneda('COP', { decimals: 0, locale: 'es-CO' });

function pesar(props: Partial<React.ComponentProps<typeof DialogoPesar>> = {}) {
  return (
    <DialogoPesar
      abierto
      onAbiertoChange={jest.fn()}
      producto={QUESO}
      precioPorUnidad={18900}
      moneda={MONEDA}
      puedePesarAMano
      onConfirmar={jest.fn()}
      {...props}
    />
  );
}

describe.each(IDIOMAS)('«Pesar» con báscula (%s)', (idioma) => {
  const m = lec(idioma);
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('inestable no agrega; al estabilizarse se agrega solo una vez con origen báscula', () => {
    const onConfirmar = jest.fn();
    const { rerender } = renderConIdioma(
      pesar({ bascula: BASCULA, lector: lectorDoble(estadoLector(0.75, false)), agregarAlEstabilizar: true, lecturaNueva: true, onConfirmar }),
      { idioma },
    );
    expect(screen.getByText(m.auto.esperando)).toBeTruthy();
    expect(onConfirmar).not.toHaveBeenCalled();
    act(() => {
      rerender(pesar({ bascula: BASCULA, lector: lectorDoble(estadoLector(0.75, true)), agregarAlEstabilizar: true, lecturaNueva: true, onConfirmar }));
    });
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    const [cantidad, pesaje] = onConfirmar.mock.calls[0];
    expect(cantidad).toBe(0.75);
    expect(pesaje).toMatchObject({ origen: 'bascula', neto: 0.75, estable: true, bascula_id: BASCULA.id, unidad: 'KG' });
    act(() => {
      rerender(pesar({ bascula: BASCULA, lector: lectorDoble(estadoLector(0.75, true)), agregarAlEstabilizar: true, lecturaNueva: true, onConfirmar }));
    });
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it('con el peso de la pesada anterior no se agrega solo; sin la regla espera Enter', () => {
    const onConfirmar = jest.fn();
    const { rerender } = renderConIdioma(
      pesar({ bascula: BASCULA, lector: lectorDoble(estadoLector(0.75, true)), agregarAlEstabilizar: true, lecturaNueva: false, onConfirmar }),
      { idioma },
    );
    expect(screen.getByText(m.auto.pesoNuevo)).toBeTruthy();
    expect(onConfirmar).not.toHaveBeenCalled();
    rerender(pesar({ bascula: BASCULA, lector: lectorDoble(estadoLector(0.75, true)), agregarAlEstabilizar: false, onConfirmar }));
    expect(onConfirmar).not.toHaveBeenCalled();
    // Al abrir, el foco va a la lectura (no a la «×»): Enter agrega.
    act(() => {
      jest.advanceTimersByTime(50);
    });
    const lectura = document.querySelector<HTMLElement>('[data-lectura-bascula]');
    expect(document.activeElement).toBe(lectura);
    fireEvent.keyDown(lectura as HTMLElement, { key: 'Enter' });
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it('el lector de códigos sigue activo con «Pesar» abierto', () => {
    renderConIdioma(pesar({ bascula: BASCULA, lector: lectorDoble(estadoLector(0.75, false)) }), { idioma });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(dialogOpen(document)).toBe(false);
  });
});

describe('«Pesar» sin báscula: el flujo de siempre', () => {
  it('peso a mano con Enter y origen manual', () => {
    const onConfirmar = jest.fn();
    renderConIdioma(pesar({ onConfirmar }));
    expect(screen.getByText(MENSAJES.es.posPeso.dialogo.estadoManual)).toBeTruthy();
    const campo = screen.getByLabelText(MENSAJES.es.posPeso.dialogo.campo.replace('{unidad}', 'kg'));
    fireEvent.change(campo, { target: { value: '0,735' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(onConfirmar).toHaveBeenCalledWith(0.735, expect.objectContaining({ origen: 'manual' }));
  });
});
