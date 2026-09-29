/**
 * @jest-environment jsdom
 *
 * Configuración › POS › «Básculas» (fase 3, Figma K1–K8) con los textos reales
 * en 4 idiomas: lista, vacío, cargando, error y sin permiso; el formulario
 * (validación, Web Serial no disponible) y «Probar lectura» con un puente del
 * Desktop doble: bytes crudos y sugerencia cuando la trama no se reconoce.
 *
 * Datos inventados: organización 120, sucursal 7.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { BasculasVista } from '@/components/pos/configuracion/basculas/BasculasVista';
import { BasculaFormDialog } from '@/components/pos/configuracion/basculas/BasculaFormDialog';
import { ProbarLectura } from '@/components/pos/configuracion/basculas/ProbarLectura';
import type { BasculaConfigurada } from '@/lib/services/basculasService';
import type { ConfigBascula } from '@/lib/pos/bascula/tipos';
import type { EntornoBascula } from '@/lib/pos/bascula/transportes';
import type { DesktopScaleBridge } from '@/lib/utils/desktop';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import fr from '../../../../../../messages/fr.json';
import pt from '../../../../../../messages/pt.json';

const MENSAJES = { es, en, fr, pt } as const;
const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const cfg = (idioma: IdiomaPrueba) => MENSAJES[idioma].posBascula.config;

const FILA: BasculaConfigurada = {
  id: 'b-1',
  organization_id: 120,
  branch_id: 7,
  branch_name: 'Centro',
  name: 'Mostrador carnes',
  transport: 'desktop_serial',
  protocol: 'toledo_8217',
  device_hint: 'COM3',
  pos_terminal_name: null,
  print_agent_name: null,
  is_active: true,
  last_test_at: '2026-09-29T15:00:00Z',
  last_test_ok: true,
  created_at: '2026-09-29T14:00:00Z',
  updated_at: '2026-09-29T15:00:00Z',
};

const acciones = {
  formatearFecha: () => '29/09/2026 10:00',
  onNueva: jest.fn(),
  onEditar: jest.fn(),
  onArchivar: jest.fn(),
  onReactivar: jest.fn(),
  onUsarEnEsteEquipo: jest.fn(),
  onReintentar: jest.fn(),
};

describe.each(IDIOMAS)('BasculasVista (%s)', (idioma) => {
  const m = cfg(idioma);

  it('lista: nombre, estado de la prueba, «En este equipo» y acciones', () => {
    const onEditar = jest.fn();
    renderConIdioma(
      <BasculasVista
        {...acciones}
        onEditar={onEditar}
        estado="listo"
        basculas={[FILA, { ...FILA, id: 'b-2', name: 'Vieja', is_active: false, last_test_ok: null, last_test_at: null }]}
        preferidas={{ 7: 'b-1' }}
      />,
      { idioma },
    );
    expect(screen.getByText('Mostrador carnes')).toBeTruthy();
    expect(screen.getByText(m.estados.probada)).toBeTruthy();
    expect(screen.getByText(m.enEsteEquipo)).toBeTruthy();
    expect(screen.getByText(m.estados.archivada)).toBeTruthy();
    expect(screen.getAllByText(new RegExp(m.protocolos.toledo_8217))).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: m.editarNombre.replace('{nombre}', 'Mostrador carnes') }));
    expect(onEditar).toHaveBeenCalledWith(expect.objectContaining({ id: 'b-1' }));
    expect(screen.getByRole('button', { name: new RegExp(m.reactivar) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(m.nueva) })).toBeTruthy();
  });

  it('vacío con su acción, cargando, error con reintentar y sin permiso', () => {
    const { rerender } = renderConIdioma(<BasculasVista {...acciones} estado="listo" basculas={[]} />, { idioma });
    expect(screen.getByText(m.vacio.titulo)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(m.nueva) }));
    expect(acciones.onNueva).toHaveBeenCalled();
    rerender(<BasculasVista {...acciones} estado="cargando" basculas={[]} />);
    expect(screen.getByText(m.cargando)).toBeTruthy();
    rerender(<BasculasVista {...acciones} estado="error" basculas={[]} />);
    expect(screen.getByText(m.error.titulo)).toBeTruthy();
    rerender(<BasculasVista {...acciones} estado="sinPermiso" basculas={[]} />);
    expect(screen.getByText(m.sinPermiso.titulo)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(m.nueva) })).toBeNull();
  });
});

// ── Formulario y prueba de lectura ─────────────────────────────────────────

function puenteDoble() {
  let datos: ((c: Uint8Array) => void) | null = null;
  const puente: DesktopScaleBridge = {
    listPorts: jest.fn(async () => [{ path: 'COM3', manufacturer: 'Prolific' }]),
    open: jest.fn(async () => ({ scaleId: 'prueba', status: 'open' as const })),
    close: jest.fn(async () => ({ scaleId: null, status: 'closed' as const })),
    status: jest.fn(async () => ({ scaleId: null, status: 'closed' as const })),
    write: jest.fn(async () => undefined),
    onData: (h) => {
      datos = h;
      return () => (datos = null);
    },
    onState: () => () => undefined,
  };
  return { puente, emitir: (texto: string) => datos?.(Uint8Array.from(texto, (c) => c.charCodeAt(0))) };
}

const CONFIG: ConfigBascula = {
  id: 'prueba',
  nombre: 'Mostrador',
  transporte: 'desktop_serial',
  protocolo: 'mettler_sics',
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

describe.each(IDIOMAS)('Probar lectura (%s)', (idioma) => {
  const m = cfg(idioma).prueba;

  it('trama no reconocida: bytes crudos y el protocolo que la entiende', async () => {
    const d = puenteDoble();
    const entorno: EntornoBascula = { desktop: d.puente, serial: null, enDesktop: true };
    const onUsarProtocolo = jest.fn();
    const onResultado = jest.fn();
    renderConIdioma(<ProbarLectura config={CONFIG} entorno={entorno} onUsarProtocolo={onUsarProtocolo} onResultado={onResultado} />, { idioma });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(m.iniciar) }));
    await waitFor(() => expect(d.puente.open).toHaveBeenCalled());
    act(() => d.emitir('ST,GS,+00.735kg\r\n'));
    expect(screen.getByText(m.noReconocida.replace('{protocolo}', cfg(idioma).protocolos.mettler_sics))).toBeTruthy();
    expect(document.querySelector('[data-crudo="texto"]')?.textContent).toContain('ST,GS,+00.735kg');
    expect(document.querySelector('[data-crudo="hex"]')?.textContent).toContain('53 54 2C 47 53');
    fireEvent.click(screen.getByRole('button', { name: m.usarSugerido.replace('{protocolo}', cfg(idioma).protocolos.continuous_st_gs) }));
    expect(onUsarProtocolo).toHaveBeenCalledWith('continuous_st_gs');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(m.detener) }));
    expect(onResultado).toHaveBeenCalledWith(false);
  });

  it('trama reconocida: muestra la lectura y la prueba sale bien', async () => {
    const d = puenteDoble();
    const onResultado = jest.fn();
    renderConIdioma(
      <ProbarLectura config={{ ...CONFIG, protocolo: 'continuous_st_gs' }} entorno={{ desktop: d.puente, serial: null, enDesktop: true }} onResultado={onResultado} />,
      { idioma },
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(m.iniciar) }));
    await waitFor(() => expect(d.puente.open).toHaveBeenCalled());
    act(() => d.emitir('ST,GS,+00.735kg\r\n'));
    expect(screen.getByText(new RegExp(m.estable))).toBeTruthy();
    expect(onResultado).toHaveBeenCalledWith(true);
  });
});

describe.each(IDIOMAS)('Formulario de báscula (%s)', (idioma) => {
  const f = cfg(idioma).form;

  it('valida nombre y puerto antes de guardar; Web Serial avisa cuando no está disponible', async () => {
    const onGuardar = jest.fn();
    const d = puenteDoble();
    renderConIdioma(
      <BasculaFormDialog
        abierto
        onAbiertoChange={jest.fn()}
        bascula={null}
        sucursales={[{ id: 7, name: 'Centro' }]}
        sucursalPorDefecto={7}
        entorno={{ desktop: d.puente, serial: null, enDesktop: true }}
        guardando={false}
        errorServidor={null}
        onGuardar={onGuardar}
      />,
      { idioma },
    );
    await waitFor(() => expect(d.puente.listPorts).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: f.crear }));
    expect(onGuardar).not.toHaveBeenCalled();
    expect(screen.getByText(f.errores.nombreVacio)).toBeTruthy();
    expect(screen.getByText(f.errores.puertoDesktop)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(new RegExp(`^${f.nombre}`)), { target: { value: 'Mostrador carnes' } });
    fireEvent.change(await screen.findByLabelText(new RegExp(`^${f.puerto}`)), { target: { value: 'COM3' } });
    fireEvent.click(screen.getByRole('button', { name: f.crear }));
    expect(onGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Mostrador carnes', branch_id: 7, transport: 'desktop_serial', device_hint: 'COM3', protocol: 'continuous_st_gs', baud_rate: 9600 }),
      null,
    );

    fireEvent.click(screen.getByRole('radio', { name: cfg(idioma).transportes.web_serial }));
    expect(screen.getByText(f.webSerialEnDesktop)).toBeTruthy();
  });
});
