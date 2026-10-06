/**
 * @jest-environment jsdom
 *
 * Pantallas del área «ventas»: Ventas en línea (Figma B/10-01…10-03) y Sedes
 * en la web (B/11-01…11-03) en sus estados, con los hooks doblados.
 * Organización ficticia; sin datos reales.
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { RespuestaVentas } from '@/lib/website/ventasSitio.server';
import {
  progresoVentas,
  tarjetaCheckout,
  tarjetaCupones,
  tarjetaEnvios,
  tarjetaPagos,
  tarjetaPasarela,
  tarjetaPedidos,
  tarjetaReservas,
  type EntradaTablero,
} from '../estadoVentas';
import type { RespuestaSedesWeb, SedeWebFila } from '../sedesWeb';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/app/sitio-web/ventas', useSearchParams: () => new URLSearchParams() }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('../../useUrlSitio', () => ({
  useUrlSitio: () => ({ host: 'tu-marca.goadmin.io', subdominio: 'tu-marca', url: 'https://tu-marca.goadmin.io', cargando: false, recargar: jest.fn() }),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/components/transporte/tarifas-envio', () => ({ TarifasEnvio: () => <div data-testid="tarifas-envio-transporte">Tarifas de Transporte</div> }));

let ventas: {
  datos: RespuestaVentas | null;
  cargando: boolean;
  actualizando: boolean;
  fallo: 'error' | 'sin_permiso' | null;
  recargar: jest.Mock;
  guardarCheckout: jest.Mock;
  alternarReservas: jest.Mock;
};
jest.mock('../useVentasSitio', () => ({ ...jest.requireActual('../useVentasSitio'), useVentasSitio: () => ventas }));

let sedes: Record<string, unknown>;
jest.mock('../useSedesWeb', () => ({ ...jest.requireActual('../useSedesWeb'), useSedesWeb: () => sedes }));

import { PantallaVentas } from '../PantallaVentas';
import { PantallaSedesWeb } from '../PantallaSedesWeb';

const enlace = (texto: string, modulo: string, visible = true) => ({ href: `/app/${texto}`, texto, visible, modulo });

function tablero(): EntradaTablero[] {
  return [
    tarjetaCheckout({ modo: 'steps', tiposEntrega: ['delivery_own'], invitado: true, pedidoMinimo: 30000, sellos: true, logosPago: true, ventaEnLinea: true, hayAjustes: true, editable: true }),
    tarjetaPagos([{ nombre: 'Wompi · tarjeta, PSE, Nequi', visible: true, activo: true, conPasarela: true }], enlace('irFinanzasMetodos', 'finance')),
    tarjetaEnvios({ enlace: enlace('irTransporteTarifas', 'transport'), envioActivo: true, tiposEntrega: ['delivery_own'], tarifaPlana: 12000, envioGratisDesde: 200000, tarifasZonaWeb: 0 }),
    tarjetaCupones({ enlace: enlace('irPosPromociones', 'pointOfSale'), cuponesUsables: 2, promocionesWeb: 0 }),
    tarjetaPedidos({ enlace: enlace('irPosPedidos', 'pointOfSale'), ventaEnLinea: true, pendientes: 12, pagadosHoy: 8, totalHoy: 1240000, avisosCliente: ['correo'] }),
    tarjetaReservas({ enlace: enlace('irPosReservas', 'pointOfSale'), sedes: [{ nombre: 'Sede Centro', recibiendo: true }, { nombre: 'Sede Norte', recibiendo: false }] }, true),
    tarjetaPasarela({ enlace: enlace('irIntegraciones', 'integrations'), conexiones: [{ proveedor: 'Wompi', estado: 'connected', entorno: 'production' }], firma: 'match', ultimoPago: null, enlazadaAlSitio: true }),
  ];
}

function respuesta(t: EntradaTablero[] = tablero()): RespuestaVentas {
  return {
    estado: 'listo',
    tablero: t,
    progreso: progresoVentas(t),
    checkout: {
      modo: 'steps',
      tiposEntrega: ['delivery_own'],
      invitado: true,
      pedidoMinimo: 30000,
      sellos: true,
      listaSellos: [{ icono: '', texto: 'Compra segura' }],
      logosPago: true,
      ventaEnLinea: true,
      envioActivo: true,
      tarifaPlana: 12000,
      envioGratisDesde: 200000,
      pendienteMigracion: true,
    },
    permisos: { editar: true, publicar: true },
    giro: 'restaurante',
    moneda: { code: 'COP', decimals: 0, locale: 'es-CO' },
    zonaHoraria: 'America/Bogota',
    sitio: { host: 'tu-marca.goadmin.io', url: 'https://tu-marca.goadmin.io', publicado: true },
    tarifasEnvio: enlace('irTransporteTarifas', 'transport'),
  };
}

function ponerVentas(p: Partial<typeof ventas>) {
  ventas = { datos: null, cargando: false, actualizando: false, fallo: null, recargar: jest.fn(), guardarCheckout: jest.fn(), alternarReservas: jest.fn(), ...p };
}

describe('Ventas en línea', () => {
  test('listo (B/10-01): «5 de 6 listos para vender», Falta: tarifas por zona y las 7 tarjetas', () => {
    ponerVentas({ datos: respuesta() });
    renderConIdioma(<PantallaVentas />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ventas en línea');
    expect(screen.getByText('5 de 6 listos para vender')).toBeTruthy();
    expect(screen.getByText('Falta: tarifas de envío por zona (hoy solo tarifa plana).')).toBeTruthy();
    for (const titulo of ['Checkout del sitio', 'Métodos de pago en la web', 'Envíos', 'Cupones y promociones', 'Pedidos online', 'Reservas de mesas en la web', 'Pasarela de pago']) {
      expect(screen.getAllByText(titulo).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Falta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Opcional').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Ir a Transporte › Tarifas de envío' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Probar una compra/ }).getAttribute('href')).toBe('https://tu-marca.goadmin.io');
  });

  test('iconos: badge de estado con icono, filas con marca leída y «Ir a …» con el icono del destino', () => {
    ponerVentas({ datos: respuesta() });
    renderConIdioma(<PantallaVentas />);
    const configurado = screen.getAllByText('Configurado')[0].parentElement;
    expect(configurado?.querySelector('svg')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Listo' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Revisar' }).length).toBeGreaterThan(0);
    const irFinanzas = screen.getByRole('link', { name: 'Ir a Finanzas › Métodos de pago' });
    expect(irFinanzas.querySelector('svg')).toBeTruthy();
  });

  test('Envíos abre EL MISMO componente de Tarifas de envío de Transporte', () => {
    ponerVentas({ datos: respuesta() });
    renderConIdioma(<PantallaVentas />);
    fireEvent.click(screen.getByRole('button', { name: /Gestionar tarifas de envío/ }));
    expect(screen.getByTestId('tarifas-envio-transporte')).toBeTruthy();
  });

  test('«Editar opciones» abre el diálogo del checkout con lo pendiente de migración deshabilitado', () => {
    ponerVentas({ datos: respuesta() });
    renderConIdioma(<PantallaVentas />);
    fireEvent.click(screen.getByRole('button', { name: /Editar opciones/ }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Opciones del checkout')).toBeTruthy();
    expect(within(dialogo).getAllByText('Se activa con una actualización pendiente de la base de datos.').length).toBe(2);
    expect((within(dialogo).getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('módulo no contratado: «Disponible con …» en lugar del enlace', () => {
    const t = tablero();
    t[1] = tarjetaPagos([], enlace('irFinanzasMetodos', 'finance', false));
    ponerVentas({ datos: respuesta(t) });
    renderConIdioma(<PantallaVentas />);
    expect(screen.queryByRole('link', { name: 'Ir a Finanzas › Métodos de pago' })).toBeNull();
    expect(screen.getAllByText(/^Disponible con /).length).toBeGreaterThan(0);
  });

  test('error parcial (B/10-03): la tarjeta de Envíos dice qué falló y deja reintentar', () => {
    const t = tablero();
    t[2] = { tema: 'envios', error: true };
    const recargar = jest.fn();
    ponerVentas({ datos: respuesta(t), recargar });
    renderConIdioma(<PantallaVentas />);
    expect(screen.getAllByText('No pudimos leer el estado de Envíos').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /Reintentar/ })[0]);
    expect(recargar).toHaveBeenCalledWith(true);
  });

  test('vacío: «Tu sitio todavía no vende»', () => {
    const t: EntradaTablero[] = [
      tarjetaPagos([], enlace('irFinanzasMetodos', 'finance')),
      tarjetaPasarela({ enlace: enlace('irIntegraciones', 'integrations'), conexiones: [], firma: null, ultimoPago: null, enlazadaAlSitio: false }),
    ];
    ponerVentas({ datos: respuesta(t) });
    renderConIdioma(<PantallaVentas />);
    expect(screen.getByText('Tu sitio todavía no vende')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Conectar Wompi/ }).getAttribute('href')).toBe('/app/integraciones/conexiones');
  });

  test('cargando, error total, sin permiso y primera vez', () => {
    ponerVentas({ cargando: true });
    const { unmount } = renderConIdioma(<PantallaVentas />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    unmount();

    ponerVentas({ fallo: 'error' });
    const r2 = renderConIdioma(<PantallaVentas />);
    expect(screen.getByText('No pudimos cargar las ventas del sitio')).toBeTruthy();
    r2.unmount();

    ponerVentas({ fallo: 'sin_permiso' });
    const r3 = renderConIdioma(<PantallaVentas />);
    expect(screen.getByText('No tienes permiso para ver las ventas del sitio')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Probar una compra/ })).toBeNull();
    r3.unmount();

    ponerVentas({ datos: { ...respuesta([]), estado: 'primera_vez', checkout: null } });
    renderConIdioma(<PantallaVentas />);
    expect(screen.getByText('Aún no tienes sitio web')).toBeTruthy();
  });
});

function sede(p: Partial<SedeWebFila>): SedeWebFila {
  return {
    id: 1,
    nombre: 'Sede Centro',
    direccion: 'Cra. 10 # 20-30',
    ciudad: null,
    principal: true,
    publicada: true,
    slug: 'centro',
    slugSugerido: 'centro',
    fuenteStock: true,
    dominioPropio: null,
    horario: [
      { desde: 'monday', hasta: 'saturday', abre: '08:00', cierra: '20:00' },
      { desde: 'sunday', hasta: 'sunday', abre: '09:00', cierra: '14:00' },
    ],
    apertura: { abierto: true, hasta: '20:00' },
    latitud: null,
    longitud: null,
    ...p,
  };
}

function ponerSedes(p: Partial<{ datos: RespuestaSedesWeb | null; cargando: boolean; fallo: 'error' | 'sin_permiso' | null; sedes: SedeWebFila[] }>) {
  const datos = p.datos ?? null;
  sedes = {
    datos,
    cargando: false,
    fallo: null,
    modo: datos?.modo ?? 'selector',
    sedes: p.sedes ?? datos?.sedes ?? [],
    cambios: 0,
    guardando: false,
    erroresSlug: {},
    recargar: jest.fn(),
    cambiarModo: jest.fn(),
    publicar: jest.fn(),
    cambiarSlug: jest.fn(),
    cambiarFuenteStock: jest.fn(),
    descartar: jest.fn(),
    guardar: jest.fn(),
    ...p,
  };
}

const respuestaSedes = (lista: SedeWebFila[]): RespuestaSedesWeb => ({
  estado: lista.length > 1 ? 'listo' : 'una_sede',
  modo: 'selector',
  modoPendienteMigracion: false,
  host: 'tumarca.com',
  sedes: lista,
  sedePrincipal: lista[0]?.nombre ?? null,
  permisos: { editar: true, publicar: true },
});

describe('Sedes en la web', () => {
  test('listo (B/11-01): subtítulo, dirección tumarca.com/<slug>, horario de la sucursal y conectar dominio', () => {
    const lista = [sede({}), sede({ id: 2, nombre: 'Sede Norte', principal: false, slug: 'norte' }), sede({ id: 3, nombre: 'Bodega Sur', principal: false, publicada: false, slug: null, direccion: null })];
    ponerSedes({ datos: respuestaSedes(lista) });
    renderConIdioma(<PantallaSedesWeb />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sedes en la web');
    expect(screen.getAllByText('3 sucursales · 2 publicadas').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'tumarca.com/centro' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lun–Sáb 08:00–20:00 · Dom 09:00–14:00').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Conectar dominio' })[0].getAttribute('href')).toBe('/app/sitio-web/dominios?accion=conectar&sede=1');
    expect(screen.getAllByText('No se muestra a clientes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('¿Dónde quieres comprar?').length).toBeGreaterThan(0);
  });

  test('una sola sucursal, error y sin permiso (B/11-03)', () => {
    ponerSedes({ datos: respuestaSedes([sede({})]) });
    const r1 = renderConIdioma(<PantallaSedesWeb />);
    expect(screen.getByText('Tienes una sola sucursal')).toBeTruthy();
    expect(screen.getByText(/Tu sitio muestra Sede Centro automáticamente/)).toBeTruthy();
    r1.unmount();

    ponerSedes({ fallo: 'error' });
    const r2 = renderConIdioma(<PantallaSedesWeb />);
    expect(screen.getByText('No pudimos cargar tus sedes')).toBeTruthy();
    r2.unmount();

    ponerSedes({ fallo: 'sin_permiso' });
    renderConIdioma(<PantallaSedesWeb />);
    expect(screen.getByText('No tienes permiso para publicar sedes')).toBeTruthy();
    expect(screen.getByText('Pide el permiso «Editar sitio web» a un administrador.')).toBeTruthy();
  });
});

describe('Ventas en línea en móvil (B/10-02)', () => {
  test('los temas forman UNA lista agrupada (un <ul> con un <li> por tema)', () => {
    ponerVentas({ datos: respuesta() });
    renderConIdioma(<PantallaVentas />);
    const lista = screen.getByRole('list', { name: 'las ventas del sitio' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(7);
    // «5 de 6 listos» ya no es una línea suelta del cuerpo: va en la cabecera móvil.
    expect(screen.queryByText('5 de 6 listos')).toBeNull();
  });

  test('Pedidos online muestra «Avisos al cliente» con el canal real', () => {
    ponerVentas({ datos: respuesta() });
    renderConIdioma(<PantallaVentas />);
    expect(screen.getAllByText('Avisos al cliente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Correo').length).toBeGreaterThan(0);
  });
});

describe('Sedes en la web en móvil (B/11-02)', () => {
  const lista = () => [
    sede({}),
    sede({ id: 2, nombre: 'Sede Norte', principal: false, slug: 'norte', dominioPropio: { host: 'norte.tumarca.com', estado: 'activo' } }),
  ];

  test('la dirección móvil muestra el dominio propio cuando existe', () => {
    ponerSedes({ datos: respuestaSedes(lista()) });
    renderConIdioma(<PantallaSedesWeb />);
    expect(screen.getAllByText('norte.tumarca.com').length).toBeGreaterThan(0);
  });

  test('tocar la tarjeta abre la hoja con la dirección editable, su error y «Conectar dominio»', () => {
    const cambiarSlug = jest.fn();
    ponerSedes({ datos: respuestaSedes(lista()), erroresSlug: { 1: 'repetido' }, cambiarSlug } as never);
    renderConIdioma(<PantallaSedesWeb />);
    fireEvent.click(screen.getByRole('button', { name: 'Sede Centro' }));
    const hoja = screen.getByRole('dialog');
    expect(within(hoja).getByText('Otra sede ya usa esa dirección.')).toBeTruthy();
    const campo = within(hoja).getByLabelText('Dirección web') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'centro-2' } });
    expect(cambiarSlug).toHaveBeenCalledWith(1, 'centro-2');
    expect(within(hoja).getByRole('link', { name: /Conectar dominio/ }).getAttribute('href')).toBe('/app/sitio-web/dominios?accion=conectar&sede=1');
    expect(within(hoja).getByLabelText('En la web')).toBeTruthy();
  });

  test('«Recargar» con cambios sin guardar pide confirmación antes de descartarlos', () => {
    const recargar = jest.fn();
    ponerSedes({ datos: respuestaSedes(lista()), cambios: 2, recargar } as never);
    renderConIdioma(<PantallaSedesWeb />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Recargar' })[0]);
    expect(recargar).not.toHaveBeenCalled();
    const dialogo = screen.getByRole('dialog', { name: '¿Recargar y descartar los cambios?' });
    expect(within(dialogo).getByText('¿Recargar y descartar los cambios?')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar y recargar' }));
    expect(recargar).toHaveBeenCalled();
  });

  test('«Recargar» sin cambios recarga directo', () => {
    const recargar = jest.fn();
    ponerSedes({ datos: respuestaSedes(lista()), recargar } as never);
    renderConIdioma(<PantallaSedesWeb />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Recargar' })[0]);
    expect(recargar).toHaveBeenCalled();
  });
});
