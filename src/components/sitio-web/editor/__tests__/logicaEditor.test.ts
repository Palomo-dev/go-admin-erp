/**
 * @jest-environment jsdom
 *
 * Lógica sin React del editor: autoguardado (A/05m), texto de cada cambio del diálogo Publicar
 * (A/05g) y «hace N minutos» del conflicto (A/05i).
 */
import { programarAutoguardado } from '../useAutoguardado';
import { describirCambio } from '../describirCambio';
import { haceCuanto } from '../DialogoConflicto';
import { textoEditor, TEXTOS_EDITOR } from '../textos';
import { medidasLienzo } from '../LienzoEditor';
import * as disp from '@/components/sitio-web/ui/dispositivos';
import * as iconos from '@/components/sitio-web/ui/iconosSitio';
import { interpolar } from '@/components/sitio-web/ui/textos';

const t = (clave: string, valores?: Record<string, string | number>) => interpolar(textoEditor(clave) ?? clave, valores);

describe('autoguardado', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('guarda una vez tras la espera desde el último cambio', async () => {
    const guardar = jest.fn(async () => true);
    const a = programarAutoguardado(guardar, 1500);
    a.programar();
    jest.advanceTimersByTime(1000);
    a.programar();
    jest.advanceTimersByTime(1000);
    expect(guardar).not.toHaveBeenCalled();
    jest.advanceTimersByTime(600);
    await Promise.resolve();
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  test('«ahora» guarda lo pendiente y, sin cambios, no llama al servidor', async () => {
    const guardar = jest.fn(async () => true);
    const a = programarAutoguardado(guardar, 1500);
    expect(await a.ahora()).toBe(true);
    expect(guardar).not.toHaveBeenCalled();
    a.programar();
    expect(await a.ahora()).toBe(true);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(a.pendiente()).toBe(false);
  });

  test('un error deja lo pendiente para «Reintentar»; deshabilitado no programa', async () => {
    const guardar = jest.fn(async () => false);
    const a = programarAutoguardado(guardar, 1500);
    a.programar();
    expect(await a.ahora()).toBe(false);
    expect(a.pendiente()).toBe(true);
    a.reiniciar();
    a.habilitar(false);
    a.programar();
    jest.advanceTimersByTime(5000);
    expect(guardar).toHaveBeenCalledTimes(1);
  });
});

describe('lista de cambios de «Publicar»', () => {
  test('sección editada con cambio de variante y contenido', () => {
    const d = describirCambio(
      {
        tipo: 'seccion',
        accion: 'editada',
        paginaId: 'p1',
        pagina: 'Inicio',
        seccionId: 's1',
        seccionTipo: 'menu_preview',
        detalle: { variante: { antes: 'tabs', despues: 'anchors' }, contenido: true, estilo: false, visibilidad: false },
      },
      t,
    );
    expect(d.titulo).toBe('Inicio · Carta destacada');
    expect(d.detalle).toMatch(/^Variante «.+» → «.+» · contenido$/);
    expect(d.ver).toEqual({ paginaId: 'p1', seccionId: 's1' });
  });

  test('estilo del sitio con color y una sección nueva', () => {
    expect(
      describirCambio({ tipo: 'tema', colores: [{ rol: 'primario', antes: '#C8A97E', despues: '#8C6A3F' }], tipografia: false, otros: false }, t).detalle,
    ).toBe('Acento #C8A97E → #8C6A3F');
    expect(describirCambio({ tipo: 'seccion', accion: 'nueva', paginaId: 'p1', pagina: 'Inicio', seccionId: 's9', seccionTipo: 'events' }, t).detalle).toBe(
      'Sección nueva',
    );
  });
});

describe('conflicto', () => {
  test('hace cuánto publicó la otra persona', () => {
    const ahora = new Date('2026-10-06T15:00:00Z');
    expect(haceCuanto('2026-10-06T14:58:00Z', t, ahora)).toBe('hace 2 minutos');
    expect(haceCuanto('2026-10-06T14:59:50Z', t, ahora)).toBe('hace un momento');
    expect(haceCuanto('2026-10-06T13:00:00Z', t, ahora)).toBe('hace 2 horas');
  });
});

describe('textos', () => {
  test('sin emojis ni signos de admiración y con «GO Admin» bien escrito', () => {
    const todos = JSON.stringify(TEXTOS_EDITOR);
    expect(todos).not.toMatch(/[!¡]/);
    expect(todos).not.toMatch(/GoAdmin/);
    expect(todos).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('lienzo del editor · dispositivos con iconos y px (tabla única)', () => {
  test('cuatro dispositivos con su ancho real y un icono distinto cada uno', () => {
    expect(disp.DISPOSITIVOS_EDITOR.map((d) => disp.VIEWPORT_DISPOSITIVO[d].ancho)).toEqual([1440, 1024, 768, 390]);
    const ics = disp.DISPOSITIVOS_EDITOR.map((d) => iconos.ICONO_DISPOSITIVO_VISTA[d]);
    expect(new Set(ics).size).toBe(4);
    expect(disp.DISPOSITIVO_INSPECTOR.tableta).toBe('tablet');
  });

  test('computador y portátil se escalan para caber', () => {
    expect(medidasLienzo('escritorio', 720)).toEqual({ escala: 0.5, anchoMarco: 720, alto: 760 });
    expect(medidasLienzo('portatil', 2048).escala).toBe(1);
  });

  test('el celular va a tamaño real si cabe y se reduce si no (1024 px con paneles, panel Estilo)', () => {
    expect(medidasLienzo('celular', 600)).toEqual({ escala: 1, anchoMarco: 408, alto: 844 });
    const a1024 = medidasLienzo('celular', 336);
    expect(a1024.escala).toBeCloseTo((336 - 18) / 390, 5);
    expect(a1024.anchoMarco).toBeLessThanOrEqual(336);
    const conEstilo = medidasLienzo('celular', 256);
    expect(conEstilo.anchoMarco).toBeLessThanOrEqual(256);
  });

  test('la tableta va a tamaño real si cabe y se reduce si no', () => {
    expect(medidasLienzo('tableta', 1200)).toEqual({ escala: 1, anchoMarco: 786, alto: 1024 });
    const m = medidasLienzo('tableta', 402);
    expect(m.escala).toBe(0.5);
    expect(m.anchoMarco).toBe(402);
  });
});

describe('tableta, carta y encabezado en el celular', () => {
  test('mientras el sitio público no lea la tableta, sigue al computador', () => {
    const { conTabletaSegunContrato, TABLETA_EN_SITIO_PUBLICO } = jest.requireActual('@/components/sitio-web/ui/visibilidadDispositivo');
    expect(TABLETA_EN_SITIO_PUBLICO).toBe(false);
    expect(conTabletaSegunContrato({ computador: true, tableta: false, celular: true })).toEqual({ computador: true, tableta: true, celular: true });
    expect(conTabletaSegunContrato({ computador: false, tableta: true, celular: true })).toEqual({ computador: false, tableta: false, celular: true });
    expect(conTabletaSegunContrato({ computador: true, tableta: false, celular: true }, true)).toEqual({ computador: true, tableta: false, celular: true });
  });

  test('la sección Carta solo guarda qué carta muestra', () => {
    const { cartaElegida } = jest.requireActual('../HojaCartaEditor');
    expect(cartaElegida({ carta_id: 'c-1' })).toBe('c-1');
    expect(cartaElegida({ carta_id: '' })).toBeNull();
    expect(cartaElegida(null)).toBeNull();
  });

  test('resumen de los siete ajustes de «Encabezado y pie» (D/05-27)', () => {
    const { resumenEncabezadoPie, AJUSTES_ENCABEZADO_PIE } = jest.requireActual('../movil/EncabezadoPieMovil');
    const r = resumenEncabezadoPie(
      {
        header_style: 'mega',
        menu_position: 'below',
        search_style: 'bar',
        mobile_search_style: 'icon',
        show_topbar: true,
        topbar_announcement: null,
        header_cta_text: 'Reservar',
        header_cta_url: '/reservas',
        show_header_cart: true,
        show_header_auth: true,
        footer_style: 'split',
        footer_columns: 3,
        mobile_menu_style: 'drawer',
        mobile_sticky_header: true,
      },
      t,
    );
    expect(Object.keys(r)).toEqual([...AJUSTES_ENCABEZADO_PIE]);
    expect(r.diseno).toBe('Megamenú · barra de menú bajo el logo');
    expect(r.buscador).toBe('Barra visible · icono en el celular');
    expect(r.barra).toBe('Activa');
    expect(r.boton).toBe('Reservar → /reservas');
    expect(r.acciones).toBe('Carrito, Cuenta');
    expect(r.pie).toBe('Dividido · 3 columnas');
    expect(r.celular).toBe('Cajón lateral · fijo al desplazar');
  });
});
