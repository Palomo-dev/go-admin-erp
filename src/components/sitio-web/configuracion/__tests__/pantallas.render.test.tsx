/**
 * @jest-environment jsdom
 *
 * Pantallas del área «configuracion»: Configuración del sitio (Figma B/12-01,
 * 12-03, 12-04) y Carta (B/13-01, 13-04, 13-06) en sus estados, con los hooks
 * doblados. Organización ficticia («Tu marca»); sin datos reales.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import type { FormularioConfiguracion, RespuestaConfiguracion } from '@/lib/website/configuracionSitio';
import { documentosLegales } from '@/lib/website/configuracionSitio';
import type { CartaResumen, RespuestaCartas } from '@/lib/website/carta';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/app/sitio-web/configuracion',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('../../useUrlSitio', () => ({
  useUrlSitio: () => ({ host: 'tu-marca.goadmin.io', subdominio: 'tu-marca', url: 'https://tu-marca.goadmin.io', cargando: false, recargar: jest.fn() }),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));

let config: Record<string, unknown>;
jest.mock('../useConfiguracionSitio', () => ({ ...jest.requireActual('../useConfiguracionSitio'), useConfiguracionSitio: () => config }));

let cartas: Record<string, unknown>;
jest.mock('../carta/useCarta', () => ({
  ...jest.requireActual('../carta/useCarta'),
  useCartas: () => cartas,
  useVistaPreviaCarta: () => ({ datos: null, cargando: false, fallo: null, recargar: jest.fn() }),
}));

import { ConfiguracionSitio } from '../ConfiguracionSitio';
import { PantallaCartas } from '../carta/PantallaCartas';

const formulario: FormularioConfiguracion = {
  nombre: 'Tu marca',
  logoUrl: null,
  faviconUrl: null,
  correo: 'hola@tumarca.com',
  telefono: '+57 604 555 0100',
  whatsapp: '+57 300 555 0100',
  saludoWhatsapp: '',
  chatActivo: true,
  idioma: 'es-CO',
  mantenimiento: false,
  codigo: [{ id: 'c1', nombre: 'Chat de soporte externo', alcance: 'todas', posicion: 'body', activo: true, codigo: '<script></script>', autor: 'Persona de prueba', creadoEn: '2026-10-01' }],
};

function datosConfig(extra: Partial<RespuestaConfiguracion> = {}): RespuestaConfiguracion {
  return {
    permisos: { editar: true, publicar: true },
    host: 'tu-marca.goadmin.io',
    subdominio: 'tu-marca',
    organizacion: { nombre: 'Mi empresa S.A.S.', logoUrl: null, correo: 'info@miempresa.co', telefono: null },
    ajustes: {
      correo: formulario.correo,
      telefono: formulario.telefono,
      whatsapp: formulario.whatsapp,
      saludoWhatsapp: null,
      chatActivo: true,
      idioma: 'es-CO',
      mantenimiento: false,
      mensajeMantenimiento: null,
      codigo: formulario.codigo,
      publicado: true,
      publicadoEn: '2026-09-12T15:00:00Z',
    },
    moduloChat: true,
    monedas: { base: 'COP', todas: ['COP'] },
    pendientes: [],
    ...extra,
  };
}

function estadoConfig(extra: Record<string, unknown> = {}) {
  config = {
    datos: datosConfig(),
    cargando: false,
    fallo: null,
    original: formulario,
    formulario,
    errores: {},
    cambios: 0,
    guardando: false,
    errorGuardado: false,
    legales: documentosLegales([{ id: 'p1', slug: 'terminos', titulo: 'Términos', publicada: true, estado: 'publicado', actualizadaEn: '2026-09-12T15:00:00Z' }]),
    legalesError: false,
    creandoLegal: null,
    publicando: false,
    eliminando: false,
    conflicto: false,
    editar: jest.fn(),
    usarDatosOrganizacion: jest.fn(),
    descartar: jest.fn(),
    guardar: jest.fn().mockResolvedValue('ok'),
    cerrarErrorGuardado: jest.fn(),
    recargar: jest.fn(),
    crearLegal: jest.fn(),
    cambiarPublicacion: jest.fn().mockResolvedValue(true),
    eliminarSitio: jest.fn().mockResolvedValue(null),
    ...extra,
  };
}

beforeEach(() => {
  simularAncho(1440);
  push.mockReset();
});

describe('Configuración del sitio (B/12)', () => {
  it('listo: un solo formulario con índice, legales con estado y zona de peligro', () => {
    estadoConfig();
    renderConIdioma(<ConfiguracionSitio />);
    expect(screen.getByRole('heading', { level: 1, name: 'Configuración del sitio' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Secciones de la configuración' })).toBeTruthy();
    for (const s of ['Datos del negocio', 'Legales', 'Código y píxeles', 'Chat en el sitio', 'Idioma y moneda', 'Mantenimiento', 'Zona de peligro']) {
      expect(screen.getByRole('heading', { level: 2, name: s })).toBeTruthy();
    }
    expect(screen.getByDisplayValue('Tu marca')).toBeTruthy();
    expect(screen.getAllByText('Falta').length).toBeGreaterThan(0);
    expect(screen.getByText(/Sin política de tratamiento de datos/)).toBeTruthy();
    expect(screen.getByText(/añadido por Persona de prueba/)).toBeTruthy();
    // Sin cambios no hay barra.
    expect(screen.queryByText('Tienes cambios sin guardar')).toBeNull();
  });

  it('sucio: la barra única cuenta los cambios y guarda en lote', () => {
    estadoConfig({ cambios: 3 });
    renderConIdioma(<ConfiguracionSitio />);
    expect(screen.getByText('Tienes cambios sin guardar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
    expect(config.guardar).toHaveBeenCalled();
  });

  it('despublicar pide confirmación con la dirección del sitio', () => {
    estadoConfig();
    renderConIdioma(<ConfiguracionSitio />);
    fireEvent.click(screen.getByRole('button', { name: 'Despublicar' }));
    expect(screen.getByText('¿Despublicar tu sitio?')).toBeTruthy();
    expect(screen.getByText(/tu-marca.goadmin.io mostrará «Sitio no disponible»/)).toBeTruthy();
  });

  it('cargando: esqueleto de una tarjeta de formulario', () => {
    estadoConfig({ cargando: true, datos: null, formulario: null });
    const { container } = renderConIdioma(<ConfiguracionSitio />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('error de carga: «Reintentar»', () => {
    estadoConfig({ fallo: 'error', datos: null, formulario: null });
    renderConIdioma(<ConfiguracionSitio />);
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(config.recargar).toHaveBeenCalled();
  });

  it('error al guardar: conserva los cambios y ofrece reintentar', () => {
    estadoConfig({ errorGuardado: true, cambios: 2 });
    renderConIdioma(<ConfiguracionSitio />);
    expect(screen.getByText('No pudimos guardar los cambios')).toBeTruthy();
    expect(screen.getByText('Tus cambios siguen aquí. Revisa tu conexión y vuelve a guardar.')).toBeTruthy();
  });

  it('sin permiso: el vacío «No tienes permiso para cambiar estos ajustes»', () => {
    estadoConfig({ datos: datosConfig({ permisos: { editar: false, publicar: false } }) });
    renderConIdioma(<ConfiguracionSitio />);
    expect(screen.getByText('No tienes permiso para cambiar estos ajustes')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Datos del negocio' })).toBeNull();
  });

  it('primera vez: «Usar datos de la organización» precarga sin guardar', () => {
    estadoConfig({ formulario: { ...formulario, nombre: '', correo: '', telefono: '' }, original: { ...formulario, nombre: '', correo: '', telefono: '' } });
    renderConIdioma(<ConfiguracionSitio />);
    expect(screen.getByText('Completa los datos de tu negocio')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Usar datos de la organización/ }));
    expect(config.usarDatosOrganizacion).toHaveBeenCalled();
    expect(config.guardar).not.toHaveBeenCalled();
  });

  it('migración pendiente: avisa y bloquea lo que aún no tiene columna', () => {
    estadoConfig({ datos: datosConfig({ pendientes: ['contacto', 'idioma', 'mantenimiento', 'codigo', 'eliminar'] }) });
    renderConIdioma(<ConfiguracionSitio />);
    expect(screen.getByText('Algunos ajustes llegan con la próxima actualización')).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Sitio en construcción/ })).toHaveProperty("disabled", true);
  });

  it('móvil 390: lista de secciones con resumen y abre una sola sección', () => {
    simularAncho(390);
    estadoConfig();
    renderConIdioma(<ConfiguracionSitio />);
    expect(screen.getByText('Tu marca · hola@tumarca.com')).toBeTruthy();
    expect(screen.getByText('4 documentos faltan')).toBeTruthy();
    expect(screen.getByText('1 script activo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Mantenimiento/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Mantenimiento' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Legales' })).toBeNull();
  });
});

describe('Configuración del sitio · iconos y tamaños (petición del dueño)', () => {
  const SECCIONES = ['datos', 'legales', 'codigo', 'chat', 'idioma', 'mantenimiento', 'peligro'] as const;

  it('escritorio: cada entrada del índice lleva el icono de 16 px de su sección, y su tarjeta el mismo', () => {
    estadoConfig();
    const { container } = renderConIdioma(<ConfiguracionSitio />);
    for (const s of SECCIONES) {
      const enlace = container.querySelector(`nav a[data-seccion="${s}"]`);
      const icono = enlace?.querySelector('svg');
      expect(icono?.getAttribute('class')).toContain('size-4');
      expect(icono?.getAttribute('aria-hidden')).toBe('true');
      const tarjeta = container.querySelector(`section#${s}`);
      // El título de la tarjeta lleva el MISMO icono (misma clase lucide).
      const claseLucide = (icono?.getAttribute('class') ?? '').split(' ').find((c) => c.startsWith('lucide-'));
      expect(claseLucide).toBeTruthy();
      expect(tarjeta?.querySelector(`svg.${claseLucide}`)).toBeTruthy();
    }
    // «Código y píxeles» usa # como la captura móvil B/12-03.
    expect(container.querySelector('nav a[data-seccion="codigo"] svg.lucide-hash')).toBeTruthy();
    // Solo la Zona de peligro pinta su icono en rojo.
    expect(container.querySelector('section#peligro [data-tono="peligro"]')).toBeTruthy();
    expect(container.querySelector('section#datos [data-tono="neutro"]')).toBeTruthy();
  });

  it('legales: el estado lleva icono además del color (Falta = triángulo)', () => {
    estadoConfig();
    const { container } = renderConIdioma(<ConfiguracionSitio />);
    const filas = container.querySelectorAll('section#legales li');
    expect(filas.length).toBeGreaterThan(1);
    filas.forEach((li) => expect(li.querySelectorAll('svg').length).toBeGreaterThanOrEqual(3));
  });

  it('móvil 390: filas de 56 px con icono de 20 px; la de peligro en rojo', () => {
    simularAncho(390);
    estadoConfig();
    const { container } = renderConIdioma(<ConfiguracionSitio />);
    for (const s of SECCIONES) {
      const fila = container.querySelector(`button[data-seccion="${s}"]`);
      expect(fila?.getAttribute('class')).toContain('min-h-14');
      const icono = fila?.querySelector('svg');
      expect(icono?.getAttribute('class')).toContain('size-5');
      expect(icono?.getAttribute('class')).toContain(s === 'peligro' ? 'text-danger-text' : 'text-fg-secondary');
    }
  });
});

const carta = (extra: Partial<CartaResumen> = {}): CartaResumen => ({
  id: '00000000-0000-4000-8000-000000000001',
  nombre: 'Almuerzo',
  icono: 'almuerzo',
  horario: { '1': [{ from: '12:00', to: '15:30' }], '2': [{ from: '12:00', to: '15:30' }] },
  sedes: [1],
  pdfUrl: null,
  activa: true,
  categorias: 4,
  productos: 22,
  vigenteEn: [1],
  ...extra,
});

function datosCartas(extra: Partial<RespuestaCartas> = {}): RespuestaCartas {
  return {
    disponible: true,
    permisos: { editar: true },
    esRestaurante: true,
    host: 'tu-marca.goadmin.io',
    sedes: [
      { id: 1, nombre: 'Sede Centro' },
      { id: 2, nombre: 'Sede Norte' },
    ],
    cartas: [
      carta(),
      carta({ id: '00000000-0000-4000-8000-000000000002', nombre: 'Desayuno', icono: 'desayuno', sedes: null, vigenteEn: [], pdfUrl: 'https://x/carta.pdf' }),
    ],
    ahora: { dia: 5, hora: '12:40' },
    vigentes: [
      { sedeId: 1, sede: 'Sede Centro', cartas: ['Almuerzo'] },
      { sedeId: 2, sede: 'Sede Norte', cartas: [] },
    ],
    ...extra,
  };
}

function estadoCartas(extra: Record<string, unknown> = {}) {
  cartas = { datos: datosCartas(), cargando: false, fallo: null, ocupado: false, recargar: jest.fn(), crear: jest.fn().mockResolvedValue('nueva'), eliminar: jest.fn(), mover: jest.fn(), ...extra };
}

describe('Carta (B/13)', () => {
  it('listo: tarjetas con horario, sedes y estado vigente, banner «Ahora…»', () => {
    estadoCartas();
    const { container } = renderConIdioma(<PantallaCartas />);
    expect(screen.getByText('2 cartas · se muestran según la hora y la sede')).toBeTruthy();
    // Icono de cada carta en la caja de 40 con tinte (CajaIcono del módulo) y «Fuera de horario» con luna.
    expect(container.querySelectorAll('span[data-tamano="md"] svg.lucide-utensils-crossed').length).toBeGreaterThan(0);
    expect(screen.getByText('Fuera de horario').parentElement?.querySelector('svg.lucide-moon')).toBeTruthy();
    expect(screen.getByText(/Ahora \(vie 12:40 p\. m\.\) tus clientes ven: Almuerzo en Sede Centro/)).toBeTruthy();
    expect(screen.getByText('Visible ahora')).toBeTruthy();
    expect(screen.getByText('Fuera de horario')).toBeTruthy();
    expect(screen.getAllByText('Lun–Mar 12:00 p. m. – 3:30 p. m.')).toHaveLength(2);
    expect(screen.getByText('Sede Centro · 4 categorías · 22 productos')).toBeTruthy();
    expect(screen.getByText('PDF')).toBeTruthy();
    expect(screen.getByText(/Si dos cartas coinciden en hora y sede/)).toBeTruthy();
  });

  it('vacío: «Crear carta principal» crea con todas las categorías', () => {
    estadoCartas({ datos: datosCartas({ cartas: [], vigentes: [] }) });
    renderConIdioma(<PantallaCartas />);
    fireEvent.click(screen.getByRole('button', { name: /Crear carta principal/ }));
    expect(cartas.crear).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Carta principal', todasLasCategorias: true }));
  });

  it('error: la carta pública sigue funcionando', () => {
    estadoCartas({ datos: null, fallo: 'error' });
    renderConIdioma(<PantallaCartas />);
    expect(screen.getByText('No pudimos cargar tus cartas')).toBeTruthy();
    expect(screen.getByText('Tu carta pública sigue funcionando con la última versión guardada.')).toBeTruthy();
  });

  it('sin permiso', () => {
    estadoCartas({ datos: datosCartas({ permisos: { editar: false } }) });
    renderConIdioma(<PantallaCartas />);
    expect(screen.getByText('No tienes permiso para editar la carta')).toBeTruthy();
  });

  it('no restaurante: explica y lleva al Resumen', () => {
    estadoCartas({ datos: datosCartas({ esRestaurante: false }) });
    renderConIdioma(<PantallaCartas />);
    expect(screen.getByText('La carta es solo para restaurantes')).toBeTruthy();
  });

  it('sin la migración: la carta implícita y el aviso, sin «Nueva carta»', () => {
    estadoCartas({
      datos: datosCartas({ disponible: false, ahora: null, vigentes: [], cartas: [carta({ id: 'principal', nombre: 'Carta principal', implicita: true, sedes: null })] }),
    });
    renderConIdioma(<PantallaCartas />);
    expect(screen.getByText('Hoy tu sitio muestra una sola carta con todo el inventario')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nueva carta/ })).toHaveProperty("disabled", true);
  });

  it('móvil 390: lista compacta y barra fija con «Carta QR» y «Nueva carta»', () => {
    simularAncho(390);
    estadoCartas();
    renderConIdioma(<PantallaCartas />);
    expect(screen.getByText('Lun–Mar 12–15:30 · Sede Centro')).toBeTruthy();
    expect(screen.getAllByText('Carta QR').length).toBeGreaterThan(0);
  });
});
