/**
 * Reglas del Resumen del sitio web (Figma A/02a-02i) y del avance del asistente
 * (A/03): lista de lanzamiento, estado de la página, alertas, KPIs, cambios
 * recientes, dirección real y parches de onboarding. Puro: sin base ni red.
 */
import {
  RUTA_ASISTENTE,
  armarCambios,
  cambiosDesdeEventos,
  calcularAlertas,
  calcularConversion,
  calcularLanzamiento,
  decidirEstado,
  diasParaVencer,
  direccionSitio,
  tienePasarela,
  variacionVisitas,
  type EntradaLanzamiento,
} from '../resumenSitio';
import {
  aplicarParcheOnboarding,
  giroDesdeTipo,
  leerOnboarding,
  objetivosPorDefecto,
  pasoDesdeParametro,
} from '../onboardingSitio';
import { cuandoRelativo, formatoPorcentaje, listaNatural, partesVariacion } from '@/components/sitio-web/resumen/formatoResumen';
import { colorDeAcento, filasHorario } from '@/components/sitio-web/resumen/asistente/logicaAsistente';

const AHORA = new Date('2026-10-06T15:00:00Z');

function entrada(parcial: Partial<EntradaLanzamiento> = {}): EntradaLanzamiento {
  return {
    giro: 'restaurante',
    primeraVez: false,
    plantillaId: 'restaurant_modern',
    plantillaNombre: 'Moderno',
    estiloElegido: true,
    datos: { logo: true, nombre: true, contacto: true, sedePrincipal: 'Sede Centro' },
    inventario: { productos: 42, categorias: 6 },
    pasarela: false,
    dominio: { propio: 'www.tumarca.co', opcion: null },
    publicacion: { publicado: true, cambios: 3 },
    ...parcial,
  };
}

describe('calcularLanzamiento (A/02a «5 de 7»)', () => {
  test('restaurante listo: 7 pasos, pagos es el actual y publicar pendiente', () => {
    const pasos = calcularLanzamiento(entrada());
    expect(pasos.map((p) => p.id)).toEqual(['plantilla', 'estilo', 'datos', 'carta', 'pagos', 'dominio', 'publicar']);
    expect(pasos.filter((p) => p.estado === 'listo')).toHaveLength(5);
    expect(pasos.find((p) => p.id === 'pagos')).toMatchObject({ estado: 'actual', href: '/app/sitio-web/ventas' });
    expect(pasos.find((p) => p.id === 'publicar')).toMatchObject({
      estado: 'pendiente',
      href: null,
      detalle: { clave: 'lanzamiento.publicarCambios', valores: { n: 3 } },
    });
    expect(pasos.find((p) => p.id === 'carta')?.detalle).toEqual({ clave: 'lanzamiento.cartaListo', valores: { productos: 42, categorias: 6 } });
    expect(pasos.find((p) => p.id === 'datos')?.detalle).toEqual({ clave: 'lanzamiento.datosListoSede', valores: { sede: 'Sede Centro' } });
  });

  test('tienda usa catálogo; otros giros no tienen ese paso', () => {
    expect(calcularLanzamiento(entrada({ giro: 'tienda' })).some((p) => p.id === 'catalogo')).toBe(true);
    const hotel = calcularLanzamiento(entrada({ giro: 'hotel' }));
    expect(hotel).toHaveLength(6);
    expect(hotel.some((p) => p.id === 'carta' || p.id === 'catalogo')).toBe(false);
  });

  test('primera vez (A/02b): «0 de 7», todo lleva al asistente y pagos es opcional', () => {
    const pasos = calcularLanzamiento(
      entrada({
        primeraVez: true,
        plantillaId: null,
        estiloElegido: false,
        inventario: { productos: 0, categorias: 0 },
        dominio: { propio: null, opcion: null },
        publicacion: { publicado: false, cambios: 0 },
      }),
    );
    expect(pasos.filter((p) => p.estado === 'listo')).toHaveLength(0);
    expect(pasos[0]).toMatchObject({ id: 'plantilla', estado: 'actual', href: `${RUTA_ASISTENTE}?paso=2` });
    expect(pasos.find((p) => p.id === 'datos')).toMatchObject({ estado: 'pendiente', href: `${RUTA_ASISTENTE}?paso=4`, detalle: { clave: 'lanzamiento.datosPorConfirmar' } });
    expect(pasos.find((p) => p.id === 'carta')?.href).toBe('/app/sitio-web/carta');
    expect(pasos.find((p) => p.id === 'pagos')?.detalle.clave).toBe('lanzamiento.pagosOpcional');
    expect(pasos.find((p) => p.id === 'publicar')?.href).toBe(`${RUTA_ASISTENTE}?paso=6`);
  });

  test('primera vez con datos confirmados en el asistente: el paso queda listo', () => {
    const pasos = calcularLanzamiento(entrada({ primeraVez: true, datos: { logo: true, nombre: true, contacto: true, sedePrincipal: null, confirmados: true } }));
    expect(pasos.find((p) => p.id === 'datos')?.estado).toBe('listo');
  });

  test('falta logo o contacto: detalle que dice qué hacer', () => {
    expect(calcularLanzamiento(entrada({ datos: { logo: false, nombre: true, contacto: true, sedePrincipal: null } })).find((p) => p.id === 'datos')?.detalle.clave).toBe(
      'lanzamiento.datosFaltaLogo',
    );
    expect(calcularLanzamiento(entrada({ datos: { logo: true, nombre: true, contacto: false, sedePrincipal: null } })).find((p) => p.id === 'datos')?.detalle.clave).toBe(
      'lanzamiento.datosFaltaContacto',
    );
  });

  test('dominio gratis confirmado cuenta como hecho; publicado al día también', () => {
    const pasos = calcularLanzamiento(entrada({ dominio: { propio: null, opcion: 'gratis' }, publicacion: { publicado: true, cambios: 0 }, pasarela: true }));
    expect(pasos.every((p) => p.estado === 'listo')).toBe(true);
    expect(pasos.find((p) => p.id === 'dominio')?.detalle.clave).toBe('lanzamiento.dominioGratis');
  });
});

describe('decidirEstado', () => {
  test('primera vez solo sin revisión, sin asistente terminado y sin tráfico', () => {
    expect(decidirEstado({ revisionPublicada: false, onboardingCompletado: false, sitioConTrafico: false })).toBe('primera_vez');
  });
  test('un sitio legacy con tráfico, o sin acceso para saberlo, NO es primera vez', () => {
    expect(decidirEstado({ revisionPublicada: false, onboardingCompletado: false, sitioConTrafico: true })).toBe('listo');
    expect(decidirEstado({ revisionPublicada: false, onboardingCompletado: false, sitioConTrafico: null })).toBe('listo');
  });
  test('revisión publicada o asistente terminado → listo', () => {
    expect(decidirEstado({ revisionPublicada: true, onboardingCompletado: false, sitioConTrafico: false })).toBe('listo');
    expect(decidirEstado({ revisionPublicada: false, onboardingCompletado: true, sitioConTrafico: false })).toBe('listo');
  });
});

describe('calcularAlertas (orden peligro > advertencia > información)', () => {
  const base = { domain_type: 'custom_domain', is_active: true };
  test('mal configurado, por vencer y sin pasarela, ordenadas', () => {
    const alertas = calcularAlertas({
      dominios: [
        { ...base, id: 'd1', host: 'www.tumarca.co', status: 'verified', metadata: { expires_at: '2026-10-18T00:00:00Z', auto_renew: false } },
        { ...base, id: 'd2', host: 'tienda.tumarca.co', status: 'failed' },
      ],
      pasarela: false,
      venderEnLinea: true,
      ahora: AHORA,
    });
    expect(alertas.map((a) => a.tono)).toEqual(['peligro', 'advertencia', 'informacion']);
    expect(alertas[0]).toMatchObject({ titulo: { valores: { host: 'tienda.tumarca.co' } }, accion: { href: '/app/sitio-web/dominios/d2' } });
    expect(alertas[1].titulo).toEqual({ clave: 'alertas.venceTitulo', valores: { host: 'www.tumarca.co', n: 12 } });
    expect(alertas[2].accion.href).toBe('/app/sitio-web/ventas');
  });

  test('sin fecha de vencimiento no se inventa la alerta; con renovación automática tampoco', () => {
    const alertas = calcularAlertas({
      dominios: [
        { ...base, id: 'a', host: 'a.co', status: 'verified', metadata: { auto_renew: false } },
        { ...base, id: 'b', host: 'b.co', status: 'verified', metadata: { expires_at: '2026-10-08T00:00:00Z', auto_renew: true } },
      ],
      pasarela: true,
      venderEnLinea: true,
      ahora: AHORA,
    });
    expect(alertas).toEqual([]);
  });

  test('ignora subdominios del sistema y dominios inactivos; vercel no verificado es peligro', () => {
    const alertas = calcularAlertas({
      dominios: [
        { id: 's', host: 'tu-marca.goadmin.io', domain_type: 'system_subdomain', status: 'failed', is_active: true },
        { ...base, id: 'i', host: 'viejo.co', status: 'failed', is_active: false },
        { ...base, id: 'v', host: 'nuevo.co', status: 'verified', vercel_state: { verified: false } },
      ],
      pasarela: false,
      venderEnLinea: false,
      ahora: AHORA,
    });
    expect(alertas.map((a) => a.id)).toEqual(['dominio-mal-v']);
  });

  test('diasParaVencer prefiere la columna expires_at', () => {
    expect(diasParaVencer({ ...base, id: 'x', host: 'x.co', status: 'verified', expires_at: '2026-10-07T15:00:00Z' }, AHORA)).toBe(1);
    expect(diasParaVencer({ ...base, id: 'x', host: 'x.co', status: 'verified', metadata: { expires_at: 'no-es-fecha' } }, AHORA)).toBeNull();
  });
});

describe('KPIs', () => {
  test('conversión = (pedidos + reservas) / visitas, acotada; sin visitas, null', () => {
    expect(calcularConversion(30, 7, 1284)).toBeCloseTo(37 / 1284);
    expect(calcularConversion(5, null, 0)).toBeNull();
    expect(calcularConversion(10, 0, 5)).toBe(1);
  });
  test('variación de visitas frente a la semana anterior', () => {
    expect(variacionVisitas(1284, 1146)).toBeCloseTo(12.04, 1);
    expect(variacionVisitas(10, 0)).toBeNull();
    expect(variacionVisitas(null, 10)).toBeNull();
  });
  test('formatos es-CO: «2,9 %» y «+12»', () => {
    expect(formatoPorcentaje(0.029, 'es-CO').replace(/\s/g, ' ')).toBe('2,9 %');
    expect(partesVariacion(12.04, 'es-CO')).toEqual({ signo: '+', valor: '12' });
    expect(partesVariacion(-3.6, 'es-CO')).toEqual({ signo: '−', valor: '4' });
  });
});

describe('armarCambios (A/02a «Cambios recientes»)', () => {
  test('borrador con cambios primero, luego publicaciones; máximo 4', () => {
    const cambios = armarCambios({
      revisiones: [
        { id: 'r2', numero: 2, nota: null, publicadaEn: '2026-10-03T23:40:00Z', autor: 'Ana', cambios: 4 },
        { id: 'r1', numero: 1, nota: 'Lanzamiento', publicadaEn: '2026-10-01T14:05:00Z', autor: 'Ana', cambios: null },
        { id: 'r0', numero: 0, nota: null, publicadaEn: '2026-09-01T14:05:00Z', autor: null, cambios: null },
        { id: 'rx', numero: 9, nota: null, publicadaEn: '2026-08-01T14:05:00Z', autor: null, cambios: 1 },
      ],
      borrador: { actualizadoEn: '2026-10-06T15:12:00Z', autor: 'Ana', cambiosSinPublicar: 3, areas: [{ tipo: 'pagina', id: 'p1', titulo: 'Inicio', accion: 'editada' }] },
    });
    expect(cambios.map((c) => c.id)).toEqual(['borrador', 'r2', 'r1', 'r0']);
    expect(cambios[0].texto).toEqual({ clave: 'cambios.editoPagina', valores: { pagina: 'Inicio' } });
    expect(cambios[1].texto).toEqual({ clave: 'cambios.publicoN', valores: { n: 4 } });
    expect(cambios[2].texto).toEqual({ clave: 'cambios.publicoNota', valores: { nota: 'Lanzamiento' } });
    expect(cambios[3].texto).toEqual({ clave: 'cambios.publicoVersion', valores: { n: 0 } });
  });
  test('un borrador sin cambios pendientes no aparece', () => {
    expect(armarCambios({ revisiones: [], borrador: { actualizadoEn: '2026-10-06T15:12:00Z', autor: null, cambiosSinPublicar: 0, areas: [] } })).toEqual([]);
  });
});

describe('cambiosDesdeEventos (registro de cambios pendiente)', () => {
  test('detalle por edición y por publicación; ignora formas raras', () => {
    const c = cambiosDesdeEventos([
      { id: 'e1', tipo: 'borrador_guardado', resumen: { paginas: [{ id: 'p', titulo: 'Inicio' }], areas: ['tema'] }, creadoEn: '2026-10-06T15:12:00Z', autor: 'Ana' },
      { id: 'e2', tipo: 'borrador_guardado', resumen: { paginas: [], areas: ['tema'] }, creadoEn: '2026-10-05T22:30:00Z', autor: null },
      { id: 'e3', tipo: 'publicado', resumen: { paginas: [{ id: 'p', titulo: 'Inicio' }], areas: ['tema', 'menus', 'x'], revision_number: 2 }, creadoEn: '2026-10-03T23:40:00Z', autor: 'Ana' },
      { id: 'e4', tipo: 'publicado', resumen: 'roto', creadoEn: '2026-10-01T14:05:00Z', autor: null },
      { id: 'e5', tipo: 'restaurado', resumen: {}, creadoEn: '2026-09-01T14:05:00Z', autor: null },
    ]);
    expect(c.map((x) => [x.tipo, x.texto])).toEqual([
      ['borrador', { clave: 'cambios.editoPagina', valores: { pagina: 'Inicio' } }],
      ['borrador', { clave: 'cambios.edito_tema' }],
      ['publicado', { clave: 'cambios.publicoN', valores: { n: 3 } }],
      ['publicado', { clave: 'cambios.publicoVersion', valores: { n: 1 } }],
    ]);
  });
});

describe('direccionSitio y pasarela', () => {
  const dominios = [
    { id: 'p', host: 'www.tumarca.co', domain_type: 'custom_domain', status: 'verified', is_primary: true, is_active: true },
    { id: 'o', host: 'tumarca.com', domain_type: 'custom_domain', status: 'verified', is_primary: false, is_active: true },
  ];
  test('dominio principal verificado y «también responde en» el subdominio', () => {
    expect(direccionSitio(dominios, 'tu-marca', null)).toEqual({
      host: 'www.tumarca.co',
      url: 'https://www.tumarca.co',
      subdominioHost: 'tu-marca.goadmin.io',
      hostEsPropio: true,
    });
  });
  test('primary_domain_id del sitio manda si sigue verificado', () => {
    expect(direccionSitio(dominios, 'tu-marca', 'o').host).toBe('tumarca.com');
    expect(direccionSitio([{ ...dominios[1], status: 'failed' }], 'tu-marca', 'o').host).toBe('tu-marca.goadmin.io');
  });
  test('sin dominio propio: el subdominio, sin «también responde»', () => {
    expect(direccionSitio([], 'tu-marca', null)).toEqual({ host: 'tu-marca.goadmin.io', url: 'https://tu-marca.goadmin.io', subdominioHost: null, hostEsPropio: false });
    expect(direccionSitio([], null, null).url).toBeNull();
  });
  test('pasarela = método activo, visible en el sitio y conectado a una integración', () => {
    expect(tienePasarela([{ integration_connection_id: null, show_on_website: true, is_active: true }])).toBe(false);
    expect(tienePasarela([{ integration_connection_id: 'c', show_on_website: false, is_active: true }])).toBe(false);
    expect(tienePasarela([{ integration_connection_id: 'c', show_on_website: true, is_active: null }])).toBe(true);
  });
});

describe('onboarding del asistente', () => {
  test('leerOnboarding descarta campo a campo lo inválido', () => {
    expect(leerOnboarding({ giro: 'restaurante', pasoActual: 99, objetivos: ['carta', 'x'], pasos: { plantilla: 'p', dominio: 'otro' } })).toEqual({
      giro: 'restaurante',
      pasos: { plantilla: 'p' },
    });
    expect(leerOnboarding(null)).toEqual({});
    expect(leerOnboarding([1])).toEqual({});
  });
  test('el parche se funde por clave en pasos y rechaza campos desconocidos (incluida la organización)', () => {
    const r = aplicarParcheOnboarding({ giro: 'tienda', pasos: { plantilla: 'a' } }, { pasos: { estilo: 'b' }, pasoActual: 4 });
    expect(r).toEqual({ ok: true, onboarding: { giro: 'tienda', pasoActual: 4, pasos: { plantilla: 'a', estilo: 'b' } } });
    expect(aplicarParcheOnboarding({}, { organization_id: 7 }).ok).toBe(false);
    expect(aplicarParcheOnboarding({}, { pasoActual: 0 }).ok).toBe(false);
  });
  test('giro desde type_id y objetivos por defecto', () => {
    expect([1, 2, 3, 4, 5, 6, 7, null].map((n) => giroDesdeTipo(n))).toEqual(['restaurante', 'hotel', 'tienda', 'servicios', 'gimnasio', 'otro', 'otro', 'otro']);
    expect(objetivosPorDefecto('restaurante')).toEqual(['reservas', 'carta', 'pedidos', 'buscadores']);
    expect(objetivosPorDefecto('tienda')).toContain('venta_en_linea');
  });
  test('paso desde ?paso=', () => {
    expect(pasoDesdeParametro('3')).toBe(3);
    expect(pasoDesdeParametro('7')).toBe(1);
    expect(pasoDesdeParametro('x')).toBe(1);
    expect(pasoDesdeParametro(null)).toBe(1);
  });
});

describe('formatos y lógica del asistente', () => {
  test('cuandoRelativo en la zona de la organización (Bogotá)', () => {
    expect(cuandoRelativo('2026-10-06T15:12:00Z', 'America/Bogota', 'es-CO', AHORA)).toMatchObject({ tipo: 'hoy' });
    expect(cuandoRelativo('2026-10-06T03:00:00Z', 'America/Bogota', 'es-CO', AHORA)).toMatchObject({ tipo: 'ayer' });
    expect(cuandoRelativo('2026-10-03T23:40:00Z', 'America/Bogota', 'es-CO', AHORA).tipo).toBe('fecha');
  });
  test('listaNatural', () => {
    const y = (l: string, u: string) => `${l} y ${u}`;
    expect(listaNatural(['Inicio', 'Carta', 'estilo del sitio'], y)).toBe('Inicio, Carta y estilo del sitio');
    expect(listaNatural(['Inicio'], y)).toBe('Inicio');
    expect(listaNatural([], y)).toBe('');
  });
  test('horario de la sede agrupado por días consecutivos', () => {
    const filas = filasHorario({
      monday: { open: '12:00', close: '22:00' },
      tuesday: { open: '12:00', close: '22:00' },
      wednesday: { open: '12:00', close: '22:00' },
      thursday: { open: '12:00', close: '22:00' },
      friday: { open: '12:00', close: '22:00' },
      saturday: { open: '12:00', close: '23:00' },
      sunday: { closed: true },
    });
    expect(filas).toEqual([
      { desde: 'monday', hasta: 'friday', abre: '12:00', cierra: '22:00' },
      { desde: 'saturday', hasta: 'saturday', abre: '12:00', cierra: '23:00' },
      { desde: 'sunday', hasta: 'sunday', abre: null, cierra: null },
    ]);
    expect(filasHorario(null)).toEqual([]);
  });
  test('color de acento del logo: ignora blancos, negros y grises', () => {
    const px = [255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255, 200, 40, 40, 255, 201, 41, 41, 255];
    expect(colorDeAcento(px)).toBe('#C92929');
    expect(colorDeAcento([255, 255, 255, 255])).toBeNull();
  });
});
