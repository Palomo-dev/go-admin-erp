/**
 * Modelo de dibujo del encabezado y el pie (`dibujoShell.ts`, Figma «16 Sitio web» › «Plantillas ·
 * encabezado y pie en la galería, la vista previa y «Usar»»): cada composición se dibuja
 * distinto, las 32 plantillas del catálogo tienen su dibujo (las que no tienen lámina, el de su
 * giro, igual que `shellDePlantilla`), las opciones ausentes valen lo que el sitio de hoy, y la
 * línea corta y el texto alternativo nombran lo que distingue a cada una.
 */
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { construirCatalogo, type PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { TEMPLATE_PRESETS } from '@/lib/website/contrato/presetsPlantillas';
import type { Giro } from '@/components/sitio-web/paginas/plantillasPagina';
import { COMPOSICIONES_FOOTER, COMPOSICIONES_HEADER } from '@/lib/website/v2/mapeoAjustes';
import { SHELL_POR_PLANTILLA, SHELL_RESPALDO_GIRO, shellDePlantilla } from '@/lib/website/v2/shellPorPlantilla';
import {
  barraCelular,
  coloresDibujo,
  dibujoDePlantilla,
  dibujoDelDocumentoConEstilo,
  dibujoEncabezado,
  dibujoPie,
  dibujoShell,
  entradaDePlantilla,
  entradaDelDocumento,
  rasgoPrincipalEncabezado,
  rasgoPrincipalPie,
  rasgosShell,
  textoCorto,
  type DibujoShell,
} from '@/lib/website/v2/dibujoShell';

const CATALOGO = construirCatalogo(TEMPLATE_PRESETS);
const dibujo = (p: PlantillaCatalogo) => dibujoDePlantilla({ id: p.id, giro: p.giro as Giro, estilo: p.estilo });
const porId = (id: string) => CATALOGO.plantillas.find((p) => p.id === id)!;
const encabezado = (composicion: string, opciones: Record<string, unknown> = {}, botones: string[] = []) => dibujoEncabezado({ composicion, opciones, botones });
const pie = (composicion: string, opciones: Record<string, unknown> = {}) => dibujoPie({ composicion, opciones, menus: [{ clave: 'legal' }] });

describe('cada composición produce un dibujo distinto', () => {
  test('encabezado: default, logo al centro, centrado, mínimo y megamenú', () => {
    const dibujos = {
      default: encabezado('default'),
      logoCentro: encabezado('default', { logo_position: 'center' }),
      centered: encabezado('centered'),
      minimal: encabezado('minimal'),
      mega: encabezado('mega', { mega_menu_columns: 5 }),
    };
    expect(dibujos.default).toMatchObject({ logo: 'izquierda', menu: 'linea', megamenu: null });
    expect(dibujos.logoCentro).toMatchObject({ logo: 'centro', menu: 'partido' });
    expect(dibujos.centered).toMatchObject({ logo: 'centro', menu: 'fila' });
    expect(dibujos.minimal).toMatchObject({ logo: 'izquierda', menu: 'oculto' });
    expect(dibujos.mega).toMatchObject({ menu: 'categorias', megamenu: { columnas: 5 } });
    const firmas = Object.values(dibujos).map((d) => `${d.logo}/${d.menu}/${d.megamenu?.columnas ?? 0}`);
    expect(new Set(firmas).size).toBe(firmas.length);
  });

  test('pie: las cinco composiciones del contrato son distintas', () => {
    const composiciones = COMPOSICIONES_FOOTER.map((c) => pie(c).composicion);
    expect(composiciones).toEqual([...COMPOSICIONES_FOOTER]);
    expect(new Set(composiciones).size).toBe(COMPOSICIONES_FOOTER.length);
  });

  test('una composición que no está en el contrato se dibuja como la clásica', () => {
    expect(encabezado('inventada').composicion).toBe('default');
    expect(pie('inventado').composicion).toBe('default');
    expect(COMPOSICIONES_HEADER).toContain(encabezado('transparent').composicion);
  });
});

describe('las 32 plantillas tienen miniatura', () => {
  test('el catálogo trae 32 plantillas y todas tienen dibujo válido', () => {
    expect(CATALOGO.plantillas).toHaveLength(32);
    for (const p of CATALOGO.plantillas) {
      const d = dibujo(p);
      expect(COMPOSICIONES_HEADER).toContain(d.encabezado.composicion);
      expect(COMPOSICIONES_FOOTER).toContain(d.pie.composicion);
      expect(d.colores.fondo).toBe(p.estilo.fondo);
      expect(d.colores.acento).toBe(p.estilo.acento);
      expect(d.fuenteTitulos).toBe(p.estilo.fuenteTitulos);
    }
  });

  test('las plantillas sin lámina usan la de su giro, igual que shellDePlantilla', () => {
    const sinLamina = CATALOGO.plantillas.filter((p) => !SHELL_POR_PLANTILLA[p.id] && p.id !== 'parking_tech');
    expect(sinLamina.map((p) => p.id).sort()).toEqual(['parking_modern', 'parking_premium', 'parking_urban', 'transport_classic', 'transport_corporate', 'transport_dynamic', 'transport_eco']);
    for (const p of sinLamina) {
      const giro = p.giro as Giro;
      expect(shellDePlantilla(p.id, giro)).toBe(SHELL_RESPALDO_GIRO[giro]);
      expect(dibujo(p)).toEqual(dibujoShell(entradaDePlantilla(SHELL_RESPALDO_GIRO[giro]), p.estilo, giro));
    }
    // Parking Tech tiene alias a la lámina B (mínimo con cupos).
    expect(dibujo(porId('parking_tech')).encabezado.composicion).toBe('minimal');
  });

  test('las 8 de restaurante se distinguen entre sí por su encabezado o su pie', () => {
    const restaurante = CATALOGO.plantillas.filter((p) => p.giro === 'restaurante');
    expect(restaurante).toHaveLength(8);
    const firma = (d: DibujoShell) => JSON.stringify([d.encabezado.logo, d.encabezado.menu, d.encabezado.botones.length, d.encabezado.barraSuperior, d.encabezado.acciones, d.pie.composicion, d.pie.bloques]);
    expect(new Set(restaurante.map((p) => firma(dibujo(p)))).size).toBe(8);
  });
});

describe('fiel a la lámina de cada plantilla', () => {
  test('Noir Omakase: logo al centro, barra superior con sede, «Reservar mesa», pie centrado con WhatsApp', () => {
    const d = dibujo(porId('noir_omakase'));
    expect(d.encabezado).toMatchObject({ logo: 'centro', menu: 'partido', acciones: ['idioma'] });
    expect(d.encabezado.barraSuperior?.[0]).toBe('sede');
    expect(d.encabezado.botones).toEqual([{ texto: 'Reservar mesa', corto: 'Reservar', variante: 'solido' }]);
    expect(d.pie).toMatchObject({ composicion: 'centered', firma: false, menus: [{ clave: 'legal' }] });
    expect(d.pie.bloques).toContain('whatsapp');
    expect(d.barraCelular).toEqual(['reservar', 'como_llegar', 'llamar']);
  });

  test('Velvet Lounge: dos botones y pie en 3 columnas con boletín «Agenda de eventos»', () => {
    const d = dibujo(porId('velvet_lounge'));
    expect(d.encabezado.botones.map((b) => [b.texto, b.variante])).toEqual([['Reservar', 'solido'], ['Eventos', 'contorno']]);
    expect(d.pie).toMatchObject({ composicion: 'three_columns', boletinTitulo: 'Agenda de eventos' });
  });

  test('Retail Moderno: megamenú de 4 columnas con barra de búsqueda; pie con boletín y medios de pago', () => {
    const d = dibujo(porId('retail_modern'));
    expect(d.encabezado).toMatchObject({ composicion: 'mega', megamenu: { columnas: 4 }, botones: [] });
    expect(d.encabezado.acciones).toEqual(['barraBusqueda', 'cuenta', 'carrito']);
    expect(d.pie.bloques).toEqual(expect.arrayContaining(['boletin', 'pagos']));
    expect(d.pie.bloques).not.toContain('contacto');
    expect(d.barraCelular).toEqual(['whatsapp', 'llamar', 'como_llegar']);
  });

  test('Hotel Lujo: barra de reserva y pie con mapa', () => {
    const d = dibujo(porId('hotel_luxury'));
    expect(d.encabezado.barraReserva).toBe(true);
    expect(d.pie.bloques).toEqual(expect.arrayContaining(['mapa', 'pagos']));
  });

  test('Carta QR: menú con la carta y sin barra del celular', () => {
    const d = dibujo(porId('carta_qr'));
    expect(d.encabezado.menuCarta).toBe(true);
    expect(d.barraCelular).toEqual([]);
  });
});

describe('opciones y defaults (los del sitio de hoy)', () => {
  test('sin opciones: carrito, cuenta y búsqueda en icono; pie con horario, contacto, redes y firma', () => {
    const e = encabezado('default');
    expect(e.acciones).toEqual(['buscar', 'cuenta', 'carrito']);
    expect(e.barraSuperior).toBeNull();
    const p = pie('default');
    expect(p.bloques).toEqual(['horario', 'contacto', 'redes']);
    expect(p.firma).toBe(true);
    expect(p.celular).toBe('acordeon');
  });

  test('una opción inválida vale su default', () => {
    expect(encabezado('mega', { mega_menu_columns: 'muchas' }).megamenu).toEqual({ columnas: 4 });
    expect(encabezado('default', { search_style: 'bar' }).acciones).toContain('barraBusqueda');
  });

  test('textoCorto: abrevia lo largo por la primera palabra; deja lo corto', () => {
    expect(textoCorto('Reservar mesa')).toBe('Reservar');
    expect(textoCorto('Pedir a domicilio')).toBe('Pedir');
    expect(textoCorto('Cómo llegar')).toBe('Cómo llegar');
    expect(textoCorto('Pedir ya')).toBe('Pedir ya');
  });

  test('barra del celular: «auto» solo en restaurante (con Pedir si hay carrito); lista tal cual; «ninguna» vacía', () => {
    expect(barraCelular({ show_header_cart: false }, 'restaurante')).toEqual(['reservar', 'como_llegar', 'llamar']);
    // El carrito viene activo por defecto (sitio de hoy): sin opciones, Pedir va primero.
    expect(barraCelular({}, 'restaurante')).toEqual(['pedir', 'reservar', 'como_llegar', 'llamar']);
    expect(barraCelular({}, 'transporte')).toEqual([]);
    expect(barraCelular({ mobile_bottom_bar: ['agendar', 'whatsapp'] }, 'servicios')).toEqual(['agendar', 'whatsapp']);
    expect(barraCelular({ mobile_bottom_bar: 'ninguna' }, 'restaurante')).toEqual([]);
  });

  test('pie «tema»: más oscuro que el fondo en plantillas oscuras y un tono distinto en claras', () => {
    const oscuro = coloresDibujo({ modo: 'dark', fondo: '#0E0E0E', texto: '#F2EDE4', acento: '#C8A97E' }, { footer_background: 'tema' });
    expect(oscuro.fondoPie).toBe('#080808');
    expect(oscuro.textoPie).toBe('#F2EDE4');
    const claro = coloresDibujo({ modo: 'light', fondo: '#FFFFFF', texto: '#111111', acento: '#3B82F6' }, { footer_background: 'tema' });
    expect(claro.fondoPie).not.toBe('#FFFFFF');
    expect(coloresDibujo({ modo: 'light', fondo: '#FFFFFF', texto: '#111111', acento: '#3B82F6' }, {}).fondoPie).toBe('#111827');
  });
});

describe('rasgos: la línea corta y el texto alternativo', () => {
  test('la línea nombra la composición y lo distintivo del pie', () => {
    expect(rasgoPrincipalEncabezado(dibujo(porId('editorial_marfil')).encabezado)).toEqual({ clave: 'encabezado.centered' });
    expect(rasgoPrincipalPie(dibujo(porId('editorial_marfil')).pie)).toEqual({ clave: 'pie.three_columnsCon1', claves: { a: 'bloqueCorto.mapa' } });
    expect(rasgoPrincipalEncabezado(dibujo(porId('retail_modern')).encabezado).clave).toBe('encabezado.mega');
    expect(rasgoPrincipalEncabezado(dibujo(porId('hotel_luxury')).encabezado).clave).toBe('encabezado.reserva');
    expect(rasgoPrincipalEncabezado(dibujo(porId('velvet_lounge')).encabezado).clave).toBe('encabezado.dosBotones');
    // Horario, contacto y redes vienen por defecto: no distinguen.
    expect(rasgoPrincipalPie(pie('minimal'))).toEqual({ clave: 'pie.minimal' });
  });

  test('todos los rasgos: encabezado, pie y barra del celular, sin repetir el megamenú', () => {
    const r = rasgosShell(dibujo(porId('retail_modern')));
    expect(r.encabezado[0]).toEqual({ clave: 'rasgo.megaColumnas', valores: { n: 4 } });
    expect(r.encabezado.filter((x) => x.clave.includes('mega'))).toHaveLength(1);
    expect(r.encabezado).toContainEqual({ clave: 'rasgo.barraSuperiorCon', lista: ['barra.envio', 'barra.telefono', 'barra.correo'] });
    expect(r.pie).toContainEqual({ clave: 'rasgo.menus', valores: { n: 3 } });
    expect(r.celular).toEqual({ clave: 'rasgo.barraCelular', lista: ['celular.whatsapp', 'celular.llamar', 'celular.como_llegar'] });
  });
});

describe('«Solo estilo»: el shell del borrador con los colores de la plantilla', () => {
  function documento(): DocumentoSitio {
    const r = validarDocumentoSitio({
      schemaVersion: 1,
      identidad: { nombre: { mode: 'value', value: 'Mi empresa S.A.S.' } },
      tema: { plantillaBase: { mode: 'value', value: 'restaurant_rustic' }, modo: { mode: 'value', value: 'light' }, colores: {}, tipografia: {} },
      seo: {},
      contenido: {},
      shell: {
        header: { composicion: 'split', menuPrincipalId: 'm-1', opciones: { header_cta_text: 'Pedir', header_cta_url: '/menu', header_cta2_text: 'Sin enlace' } },
        footer: { composicion: 'minimal', menuIds: ['m-2'], opciones: { footer_show_map: true } },
      },
      menus: [
        { id: 'm-1', nombre: 'Principal', items: [{ id: 'i-1', etiqueta: 'Inicio', tipo: 'page', paginaId: 'p-inicio' }, { id: 'i-2', etiqueta: 'Carta', tipo: 'custom', url: '/menu' }] },
        { id: 'm-2', nombre: 'Enlaces del pie', items: [] },
      ],
      paginas: [{ id: 'p-inicio', slug: 'home', tipo: 'home', titulo: 'Inicio', publicada: true, secciones: [] }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errores));
    return r.documento;
  }

  test('conserva su composición, sus botones con enlace y sus menús; toma los colores de la plantilla', () => {
    const doc = documento();
    const entrada = entradaDelDocumento(doc);
    expect(entrada.encabezado.botones).toEqual(['Pedir', '']);
    expect(entrada.encabezado.enlaces).toBe(2);
    expect(entrada.pie.menus).toEqual([{ nombre: 'Enlaces del pie' }]);
    const noir = porId('noir_omakase');
    const d = dibujoDelDocumentoConEstilo(doc, noir.estilo, 'restaurante');
    expect(d.encabezado).toMatchObject({ composicion: 'split', logo: 'centro', menu: 'partido' });
    expect(d.encabezado.botones.map((b) => b.texto)).toEqual(['Pedir']);
    expect(d.pie).toMatchObject({ composicion: 'minimal' });
    expect(d.pie.bloques).toContain('mapa');
    expect(d.colores.acento).toBe(noir.estilo.acento);
    // Distinto del de la plantilla: «Solo estilo» no trae su encabezado ni su pie.
    expect(d.encabezado).not.toEqual(dibujo(noir).encabezado);
  });
});
