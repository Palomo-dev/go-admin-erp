/**
 * Contrato de las variantes de «Café de especialidad» (Figma «16 Sitio web», 2223:46106, láminas
 * 12 a 15): defaults de las láminas con el contenido vacío, valores fuera de la regla = default, y
 * las ayudas puras que comparten el editor y el sitio (modo de reserva, mesas parecidas, mensaje
 * de WhatsApp).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CLAVES_DISENO_SECCION_CAFE,
  CLAVES_SECCION_CAFE,
  DEFAULT_CARTA_PUNTOS,
  DEFAULT_PORTADA_EDITORIAL,
  DEFAULT_RESERVA_PLANO,
  MAX_BOTONES_PORTADA,
  MAX_CAPITULOS,
  MAX_FOTOS_PORTADA,
  VARIANTES_CAFE,
  esVarianteCafe,
  mensajeReservaWhatsapp,
  mesasMasParecidas,
  normalizarCartaPuntos,
  normalizarHistoriaCapitulos,
  normalizarPortadaEditorial,
  normalizarReservaPlano,
  resolverModoReserva,
  selectorSedeVisible,
  textoContador,
  tienePlano,
} from '../seccionesCafe';

describe('variantes', () => {
  test('una variante nueva por tipo existente', () => {
    expect(VARIANTES_CAFE).toEqual({ hero: 'carousel_editorial', how_it_works: 'chapters', menu_full: 'dotted', reservation: 'floor_plan' });
    expect(esVarianteCafe('menu_full', 'dotted')).toBe(true);
    expect(esVarianteCafe('menu_full', 'anchors')).toBe(false);
    expect(esVarianteCafe('table_bill', 'dotted')).toBe(false);
  });

  test('las claves de contenido y las de diseño no se cruzan', () => {
    for (const tipo of Object.keys(VARIANTES_CAFE) as (keyof typeof VARIANTES_CAFE)[]) {
      const contenido = new Set(CLAVES_SECCION_CAFE[tipo]);
      expect(CLAVES_DISENO_SECCION_CAFE[tipo].filter((k) => contenido.has(k))).toEqual([]);
    }
  });

  test('código puro: sin imports (se copia tal cual a goadmin-websites)', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'seccionesCafe.ts'), 'utf8');
    expect(fuente).not.toMatch(/^\s*import\s/m);
    expect(fuente).not.toMatch(/require\(/);
  });
});

describe('Portada · Carrusel editorial (lámina 12)', () => {
  test('sin contenido: los defaults de la lámina', () => {
    expect(normalizarPortadaEditorial(null)).toEqual(DEFAULT_PORTADA_EDITORIAL);
    expect(DEFAULT_PORTADA_EDITORIAL).toMatchObject({
      subtitleStyle: 'normal',
      intervalMs: 6000,
      transition: 'fade',
      showArrows: false,
      dotStyle: 'bars',
      height: '100vh',
      contentPosition: 'middle-left',
      textAlign: 'left',
      overlapHeader: true,
      overlayOpacity: 45,
    });
  });

  test('fotos: hasta 8, sin las vacías; solo la de celular sirve para todos los anchos', () => {
    const slides = [
      { image_url: 'https://x/1.jpg', alt: 'Terraza' },
      { image_url: '', image_url_mobile: '' },
      { image_url_mobile: 'https://x/m.jpg' },
      { image_url: 'javascript:alert(1)' },
      ...Array.from({ length: 10 }, (_, i) => ({ image_url: `https://x/${i}.jpg` })),
    ];
    const r = normalizarPortadaEditorial({ slides });
    expect(r.fotos).toHaveLength(MAX_FOTOS_PORTADA);
    expect(r.fotos[0]).toEqual({ imageUrl: 'https://x/1.jpg', imageUrlMobile: '', alt: 'Terraza' });
    expect(r.fotos[1]).toEqual({ imageUrl: 'https://x/m.jpg', imageUrlMobile: 'https://x/m.jpg', alt: '' });
  });

  test('botones: hasta 3 con texto y enlace', () => {
    const buttons = [
      { label: 'Reservar mesa', url: '/reservas-mesa' },
      { label: 'Sin enlace' },
      { label: 'Ver carta', url: '/carta', variant: 'outline' },
      { label: 'Sedes', url: '/#sedes' },
      { label: 'Cuarto', url: '/x' },
    ];
    const r = normalizarPortadaEditorial({ buttons });
    expect(r.botones.map((b) => b.label)).toEqual(['Reservar mesa', 'Ver carta', 'Sedes']);
    expect(r.botones).toHaveLength(MAX_BOTONES_PORTADA);
    expect(r.botones[1].variant).toBe('outline');
  });

  test('valores fuera de la regla vuelven al default', () => {
    const r = normalizarPortadaEditorial({ subtitle_style: 'bold', interval_ms: 50, transition: 'spin', content_position: 'arriba', overlay_opacity: 300, eyebrow: '  MEDELLÍN · CAFÉ  ' });
    expect(r).toMatchObject({ subtitleStyle: 'normal', intervalMs: 6000, transition: 'fade', contentPosition: 'middle-left', overlayOpacity: 45, eyebrow: 'MEDELLÍN · CAFÉ' });
    expect(normalizarPortadaEditorial({ subtitle_style: 'italic', show_arrows: 'true' })).toMatchObject({ subtitleStyle: 'italic', showArrows: true });
  });
});

describe('Historia · Capítulos (lámina 13)', () => {
  const items = [
    { step: 1, label: 'El origen', title: 'Una finca en la montaña', description: 'Texto', image_url: 'https://x/a.png', image_alt: 'Cafeto' },
    { step: '2019', title: 'Una puerta abierta' },
    { title: '', description: '' },
  ];

  test('numera solo 01, 02… según el orden y salta los capítulos vacíos', () => {
    const r = normalizarHistoriaCapitulos({ items });
    expect(r.capitulos.map((c) => c.numero)).toEqual(['01', '02']);
    expect(r.capitulos[0]).toMatchObject({ label: 'El origen', imageUrl: 'https://x/a.png', imageAlt: 'Cafeto' });
  });

  test('con «Numerar solo» apagado usa el número que escribió el dueño', () => {
    expect(normalizarHistoriaCapitulos({ items, show_numbers: false }).capitulos.map((c) => c.numero)).toEqual(['1', '2019']);
  });

  test('defaults: título, animación y entrada al hacer scroll encendidas; hasta 6 capítulos', () => {
    const r = normalizarHistoriaCapitulos({ items: Array.from({ length: 9 }, (_, i) => ({ title: `C${i}` })) });
    expect(r).toMatchObject({ title: 'Nuestra historia', showNumbers: true, hoverMotion: true, revealOnScroll: true, proporcionImagen: '16/10' });
    expect(r.capitulos).toHaveLength(MAX_CAPITULOS);
  });
});

describe('Carta · Línea de puntos (lámina 14)', () => {
  test('sin contenido: los defaults de la lámina (sin fotos, dos columnas)', () => {
    expect(normalizarCartaPuntos(undefined)).toEqual(DEFAULT_CARTA_PUNTOS);
    expect(DEFAULT_CARTA_PUNTOS).toMatchObject({ showOptions: true, showBranchSelector: true, counterLabel: 'preparaciones', tabsStyle: 'italic', leaderStyle: 'dots', showPhotos: false, columns: 2 });
  });

  test('sedes: ids enteros sin repetir', () => {
    expect(normalizarCartaPuntos({ branch_ids: [3, '4', 3, -1, 'x', 0] }).branchIds).toEqual([3, 4]);
  });

  test('el selector de sede no sale en la página de una sede ni con una sola sede', () => {
    const carta = normalizarCartaPuntos({});
    expect(selectorSedeVisible(carta, { esPaginaDeSede: false, sedes: 2 })).toBe(true);
    expect(selectorSedeVisible(carta, { esPaginaDeSede: true, sedes: 2 })).toBe(false);
    expect(selectorSedeVisible(carta, { esPaginaDeSede: false, sedes: 1 })).toBe(false);
    expect(selectorSedeVisible(normalizarCartaPuntos({ show_branch_selector: false }), { esPaginaDeSede: false, sedes: 3 })).toBe(false);
  });

  test('contador', () => {
    expect(textoContador('Café', 12, 'preparaciones')).toBe('Café · 12 preparaciones');
  });
});

describe('Reserva · Plano de mesas (lámina 15)', () => {
  test('sin contenido: directo al ERP, mesa opcional y zonas de la sede', () => {
    expect(normalizarReservaPlano({})).toEqual(DEFAULT_RESERVA_PLANO);
    expect(DEFAULT_RESERVA_PLANO).toMatchObject({ bookingMode: 'erp', tableOptional: true, zones: [], alsoRegister: true, mobilePlan: 'sheet' });
  });

  test('zonas: textos sin repetir (sin distinguir mayúsculas)', () => {
    expect(normalizarReservaPlano({ zones: ['Salón', 'salón', ' Terraza ', '', 7] }).zones).toEqual(['Salón', 'Terraza']);
  });

  test('E1: sin modo guardado, ERP si la sede tiene reservas activas; WhatsApp si no', () => {
    expect(resolverModoReserva({}, { reservasActivas: true })).toBe('erp');
    expect(resolverModoReserva({}, { reservasActivas: false })).toBe('whatsapp');
    expect(resolverModoReserva({ booking_mode: 'erp' }, { reservasActivas: false })).toBe('erp');
    expect(resolverModoReserva({ booking_mode: 'otro' }, { reservasActivas: true })).toBe('erp');
  });

  test('sin mesas con posición no hay plano (cae a «Pasos»)', () => {
    expect(tienePlano([{ position_x: null, position_y: 3 }])).toBe(false);
    expect(tienePlano([{ position_x: 0, position_y: 0 }])).toBe(true);
  });

  test('E4: las 3 mesas libres más parecidas (misma zona, capacidad cercana, que alcancen)', () => {
    const libres = [
      { id: 'a', name: 'Mesa 2', zone: 'Terraza', capacity: 4 },
      { id: 'b', name: 'Mesa 3', zone: 'Salón', capacity: 6 },
      { id: 'c', name: 'Mesa 10', zone: 'Salón', capacity: 4 },
      { id: 'd', name: 'Mesa 4', zone: 'Salón', capacity: 2 },
      { id: 'e', name: 'Mesa 5', zone: 'Salón', capacity: 4 },
      { id: 'x', name: 'Mesa 9', zone: 'Salón', capacity: 4 },
    ];
    const r = mesasMasParecidas({ id: 'x', zone: 'Salón', capacity: 4 }, libres, 4);
    expect(r.map((m) => m.id)).toEqual(['e', 'c', 'b']);
  });

  test('mensaje de WhatsApp armado (lámina 05 · A)', () => {
    expect(
      mensajeReservaWhatsapp({
        sede: 'Sede Laureles',
        fecha: 'sábado 17 de octubre',
        hora: '10:30 a. m.',
        personas: 4,
        nombre: 'Laura Gómez',
        telefono: '+57 300 000 0000',
        mesa: 'Mesa 9',
        zona: 'Salón',
        notas: 'cumpleaños',
      }),
    ).toBe('Hola, quiero reservar la Mesa 9 (Salón) en Sede Laureles el sábado 17 de octubre a las 10:30 a. m. para 4 personas. A nombre de Laura Gómez · +57 300 000 0000. Notas: cumpleaños');
    expect(mensajeReservaWhatsapp({ sede: 'Centro', fecha: 'hoy', hora: '8:00 p. m.', personas: 1, nombre: 'Ana' })).toBe(
      'Hola, quiero reservar una mesa en Centro el hoy a las 8:00 p. m. para 1 persona. A nombre de Ana.',
    );
  });
});
