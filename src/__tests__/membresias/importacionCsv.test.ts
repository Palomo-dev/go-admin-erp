/**
 * Importación CSV de clases y reservas (docs/design/MEMBRESIAS-FASE-1-2.md §13): lectura,
 * normalización y validación por fila en el navegador (src/lib/services/membresias/importacionCsv.ts).
 *
 * Lo que depende de la base (miembro, clase, instructor, sede, cupo, duplicadas ya guardadas) lo
 * valida la RPC y se probó en seco con el MCP (DO … RAISE; ver §13). Aquí: formato, fechas y horas
 * de pared, valores de las CHECK, duplicadas dentro del archivo, tope de filas, plantilla y la
 * lectura real de un CSV con el lector compartido del importador de productos.
 */
import {
  COLUMNAS_CLASES,
  COLUMNAS_RESERVAS,
  ERRORES_FILA,
  MAX_FILAS_IMPORTACION,
  combinarReporte,
  documentoComparable,
  filasParaServidor,
  inicioPrevisto,
  leerClases,
  leerReservas,
  mapearCabecera,
  normalizarEstadoClase,
  normalizarEstadoReserva,
  normalizarFecha,
  normalizarHora,
  normalizarNivel,
  normalizarOrigen,
  plantillaCsv,
  resumenReporte,
} from '@/lib/services/membresias/importacionCsv';
import { decodificarCsv, leerMatriz } from '@/lib/inventario/importacion/lector';
import { esquemaImportarClases, esquemaImportarReservas } from '@/lib/services/membresias/esquemasImportacion';

const CAB_CLASES = ['Título', 'Tipo', 'Sede', 'Instructor', 'Fecha', 'Hora', 'Duración', 'Capacidad', 'Sala', 'Nivel', 'Estado'];
const CAB_RESERVAS = ['documento', 'correo', 'clase', 'fecha', 'hora', 'sede', 'estado', 'origen', 'notas'];

describe('normalizadores de celda', () => {
  it('fecha: ISO y día primero, sin pasar por la zona del navegador', () => {
    expect(normalizarFecha('2026-10-05')).toBe('2026-10-05');
    expect(normalizarFecha('2026/10/5')).toBe('2026-10-05');
    expect(normalizarFecha('05/10/2026')).toBe('2026-10-05');
    expect(normalizarFecha('5-10-2026')).toBe('2026-10-05');
    expect(normalizarFecha(' 31.12.2026 ')).toBe('2026-12-31');
  });

  it('fecha: días que no existen y formatos ambiguos son inválidos', () => {
    expect(normalizarFecha('2026-02-30')).toBeNull();
    expect(normalizarFecha('31/04/2026')).toBeNull();
    expect(normalizarFecha('2026-13-01')).toBeNull();
    expect(normalizarFecha('10/05/26')).toBeNull();
    expect(normalizarFecha('mañana')).toBeNull();
    expect(normalizarFecha('')).toBeNull();
    expect(normalizarFecha('2028-02-29')).toBe('2028-02-29');
  });

  it('hora: 24 h, segundos, am/pm y «19h30»', () => {
    expect(normalizarHora('7:00')).toBe('07:00');
    expect(normalizarHora('07:05:00')).toBe('07:05');
    expect(normalizarHora('6:30 pm')).toBe('18:30');
    expect(normalizarHora('6:30 p. m.')).toBe('18:30');
    expect(normalizarHora('12:15 a.m.')).toBe('00:15');
    expect(normalizarHora('12 pm')).toBe('12:00');
    expect(normalizarHora('19h30')).toBe('19:30');
  });

  it('hora: fuera de rango o sin minutos ni sufijo es inválida', () => {
    expect(normalizarHora('24:00')).toBeNull();
    expect(normalizarHora('07:60')).toBeNull();
    expect(normalizarHora('13:00 pm')).toBeNull();
    expect(normalizarHora('7')).toBeNull();
    expect(normalizarHora('siete')).toBeNull();
  });

  it('niveles, estados y orígenes en los idiomas de la interfaz → valores de las CHECK de la base', () => {
    expect(normalizarNivel('Principiante')).toBe('beginner');
    expect(normalizarNivel('avanzado')).toBe('advanced');
    expect(normalizarNivel('Todos los niveles')).toBe('all_levels');
    expect(normalizarNivel('experto')).toBe('invalido');
    expect(normalizarNivel('')).toBeNull();
    expect(normalizarEstadoClase('Programada')).toBe('active');
    expect(normalizarEstadoClase('completada')).toBe('completed');
    expect(normalizarEstadoClase('cancelada')).toBe('invalido');
    expect(normalizarEstadoReserva('Asistió')).toBe('checked_in');
    expect(normalizarEstadoReserva('no asistió')).toBe('no_show');
    expect(normalizarEstadoReserva('reservada')).toBe('booked');
    expect(normalizarEstadoReserva('attended')).toBe('checked_in');
    expect(normalizarOrigen('Recepción')).toBe('staff');
    expect(normalizarOrigen('kiosco')).toBe('kiosk');
    expect(normalizarOrigen('teléfono')).toBe('invalido');
  });

  it('los valores normalizados son exactamente los que aceptan las CHECK de la base', () => {
    const niveles = new Set(['beginner', 'intermediate', 'advanced', 'all_levels']);
    const estadosReserva = new Set(['booked', 'checked_in', 'no_show', 'cancelled']);
    const origenes = new Set(['app', 'web', 'staff', 'kiosk']);
    for (const v of ['principiante', 'basico', 'intermedio', 'avanzado', 'todos', 'beginner', 'all levels']) {
      expect(niveles.has(String(normalizarNivel(v)))).toBe(true);
    }
    for (const v of ['reservada', 'asistio', 'no show', 'cancelada', 'checked_in']) {
      expect(estadosReserva.has(String(normalizarEstadoReserva(v)))).toBe(true);
    }
    for (const v of ['recepcion', 'app', 'web', 'kiosco']) expect(origenes.has(String(normalizarOrigen(v)))).toBe(true);
  });

  it('documento comparable: «1.020.304» y «1020304» son el mismo', () => {
    expect(documentoComparable('1.020.304')).toBe('1020304');
    expect(documentoComparable(' x-99 88 ')).toBe('X9988');
  });
});

describe('cabecera', () => {
  it('reconoce alias en es/en/fr/pt sin tildes ni mayúsculas e ignora columnas extra', () => {
    const m = mapearCabecera(['TITLE', 'Instructor Email', 'Date', 'Heure', 'Cupo', 'Color'], COLUMNAS_CLASES);
    expect(m.indices).toMatchObject({ titulo: 0, instructor: 1, fecha: 2, hora: 3, capacidad: 4 });
    expect(m.faltantes).toEqual([]);
    expect(m.ignoradas).toEqual(['Color']);
  });

  it('informa las columnas obligatorias que faltan', () => {
    const lectura = leerClases([['titulo', 'fecha'], ['Yoga', '2026-10-05']]);
    expect(lectura.error).toBe('faltan_columnas');
    expect(lectura.faltantes).toEqual(['instructor', 'hora']);
    const r = leerReservas([['documento', 'fecha', 'hora']]);
    expect(r.error).toBe('faltan_columnas');
    expect(r.faltantes).toEqual(['clase']);
  });

  it('archivo vacío o sin filas de datos', () => {
    expect(leerClases([]).error).toBe('sin_cabecera');
    expect(leerClases([[null, ''], []]).error).toBe('sin_cabecera');
    expect(leerClases([CAB_CLASES, [null, null]]).error).toBe('sin_filas');
  });
});

describe('clases: filas buenas y malas', () => {
  const matriz = [
    [],
    CAB_CLASES,
    ['Yoga matutino', 'yoga', 'Principal', 'Ana@Ejemplo.com', '05/10/2026', '7:00', '60', '15', 'Salón 1', 'principiante', 'programada'],
    ['', 'yoga', '', 'no-es-correo', '30/02/2026', '25:00', '1000', '0', '', 'experto', 'cancelada'],
    ['Spinning', '', '', 'ana@ejemplo.com', '2026-10-06', '6:30 pm', '', '', '', '', ''],
    [null, null, null, null, null, null, null, null, null, null, null],
    ['yoga matutino', '', 'principal', 'ana@ejemplo.com', '2026-10-05', '07:00', '45', '', '', '', ''],
  ];
  const lectura = leerClases(matriz);

  it('lee todas las filas con datos (salta las vacías) y conserva el número de fila del archivo', () => {
    expect(lectura.error).toBeNull();
    expect(lectura.filas.map((f) => f.datos.fila)).toEqual([3, 4, 5, 7]);
  });

  it('fila buena: normalizada a lo que guarda la base', () => {
    const f = lectura.filas[0];
    expect(f.errores).toEqual([]);
    expect(f.datos).toMatchObject({
      titulo: 'Yoga matutino',
      instructor: 'ana@ejemplo.com',
      fecha: '2026-10-05',
      hora: '07:00',
      duracion: 60,
      capacidad: 15,
      nivel: 'beginner',
      estado: 'active',
    });
    expect(lectura.filas[2].errores).toEqual([]);
    expect(lectura.filas[2].datos).toMatchObject({ hora: '18:30', duracion: null, capacidad: null, nivel: null, estado: null });
  });

  it('fila mala: todos sus errores, con códigos que la interfaz traduce', () => {
    const f = lectura.filas[1];
    expect(f.errores).toEqual(
      expect.arrayContaining([
        'titulo_requerido',
        'correo_invalido',
        'fecha_invalida',
        'hora_invalida',
        'duracion_invalida',
        'capacidad_invalida',
        'nivel_invalido',
        'estado_invalido',
      ]),
    );
    for (const c of f.errores) expect(ERRORES_FILA).toContain(c);
  });

  it('duplicada en el archivo: mismo título, sede, fecha y hora (sin distinguir mayúsculas ni formato)', () => {
    expect(lectura.filas[3].errores).toEqual(['duplicada_en_archivo']);
  });

  it('solo las filas sin errores locales van a la base, con su número de fila', () => {
    const enviar = filasParaServidor(lectura);
    expect(enviar.map((f) => f.fila)).toEqual([3, 5]);
    expect(esquemaImportarClases.safeParse({ filas: enviar, soloValidar: true }).success).toBe(true);
  });
});

describe('reservas: filas buenas, malas y duplicadas', () => {
  const lectura = leerReservas([
    CAB_RESERVAS,
    ['1.020.304', '', 'Yoga matutino', '2026-10-05', '07:00', '', 'asistió', 'Recepción', 'Migrada'],
    ['', 'MIEMBRO@EJEMPLO.COM', 'Spinning', '06/10/2026', '6:30 pm', 'Principal', '', '', ''],
    ['', '', '', 'ayer', '', '', 'quizás', 'fax', ''],
    ['1020304', '', 'yoga matutino', '05/10/2026', '7:00', '', '', '', ''],
    ['', 'correo-malo', 'Pilates', '2026-10-07', '08:00', '', '', '', ''],
  ]);

  it('fila buena: documento o correo, clase, fecha y hora normalizadas', () => {
    expect(lectura.filas[0].errores).toEqual([]);
    expect(lectura.filas[0].datos).toMatchObject({ documento: '1.020.304', estado: 'checked_in', origen: 'staff', fecha: '2026-10-05', hora: '07:00' });
    expect(lectura.filas[1].errores).toEqual([]);
    expect(lectura.filas[1].datos).toMatchObject({ correo: 'miembro@ejemplo.com', fecha: '2026-10-06', hora: '18:30', estado: null });
  });

  it('fila mala: miembro, clase, fecha, hora, estado y origen', () => {
    expect(lectura.filas[2].errores).toEqual(
      expect.arrayContaining(['miembro_requerido', 'clase_requerida', 'fecha_invalida', 'hora_requerida', 'estado_invalido', 'origen_invalido']),
    );
    expect(lectura.filas[4].errores).toEqual(['correo_invalido']);
  });

  it('duplicada: el mismo documento escrito distinto, la misma clase y la misma hora', () => {
    expect(lectura.filas[3].errores).toEqual(['duplicada_en_archivo']);
  });

  it('el cuerpo para la ruta pasa el esquema (sin organización: sale de la sesión)', () => {
    const enviar = filasParaServidor(lectura);
    expect(enviar).toHaveLength(2);
    expect(esquemaImportarReservas.safeParse({ filas: enviar }).success).toBe(true);
    expect(esquemaImportarReservas.safeParse({ filas: [{ ...enviar[0], organization_id: 999 }] }).success).toBe(false);
  });
});

describe('fechas en la zona de la organización (vista previa)', () => {
  it('la misma fecha y hora de pared es un instante distinto en cada zona, independiente de TZ del proceso', () => {
    expect(new Date(inicioPrevisto('2026-10-05', '07:00', 'America/Bogota')!).toISOString()).toBe('2026-10-05T12:00:00.000Z');
    expect(new Date(inicioPrevisto('2026-10-05', '07:00', 'Europe/Madrid')!).toISOString()).toBe('2026-10-05T05:00:00.000Z');
    expect(inicioPrevisto('2026-10-05', '07:00', 'America/Bogota')).toMatch(/-05:00$/);
  });

  it('una clase a las 23:30 de Bogotá sigue siendo del día 5 (no se corre al 6 por UTC)', () => {
    const iso = inicioPrevisto(normalizarFecha('05/10/2026'), normalizarHora('11:30 pm'), 'America/Bogota')!;
    expect(iso.startsWith('2026-10-05T23:30')).toBe(true);
    expect(new Date(iso).toISOString()).toBe('2026-10-06T04:30:00.000Z');
  });

  it('sin fecha u hora no hay inicio', () => {
    expect(inicioPrevisto(null, '07:00', 'America/Bogota')).toBeNull();
  });
});

describe('tope de filas', () => {
  it(`más de ${MAX_FILAS_IMPORTACION} filas: error de archivo, no se envía nada`, () => {
    const filas = Array.from({ length: MAX_FILAS_IMPORTACION + 1 }, (_, i) => ['Clase', 'a@b.co', '2026-10-05', `${String(i % 24).padStart(2, '0')}:00`]);
    const l = leerClases([['titulo', 'instructor', 'fecha', 'hora'], ...filas]);
    expect(l.error).toBe('demasiadas_filas');
    expect(esquemaImportarClases.safeParse({ filas: filas.map((_, i) => ({ fila: i + 2, titulo: 'x' })) }).success).toBe(false);
  });
});

describe('reporte combinado con la vista previa de la base', () => {
  it('une por número de fila; las filas con errores locales conservan solo esos', () => {
    const lectura = leerReservas([
      CAB_RESERVAS,
      ['1020304', '', 'Yoga', '2026-10-05', '07:00', '', '', '', ''],
      ['', '', 'Yoga', '2026-10-05', '07:00', '', '', '', ''],
      ['55501', '', 'Yoga', '2026-10-05', '07:00', '', '', '', ''],
    ]);
    const reporte = combinarReporte(lectura, [
      { fila: 2, errores: [], inicio: '2026-10-05T12:00:00+00:00', miembro: 'Ana Pérez', clase: 'Yoga' },
      { fila: 4, errores: ['clase_sin_cupo'], inicio: '2026-10-05T12:00:00+00:00', miembro: 'Luis Gómez', clase: 'Yoga' },
    ]);
    expect(reporte.map((r) => r.errores)).toEqual([[], ['miembro_requerido'], ['clase_sin_cupo']]);
    expect(reporte[0]).toMatchObject({ miembro: 'Ana Pérez', inicio: '2026-10-05T12:00:00+00:00' });
    expect(resumenReporte(reporte)).toEqual({ total: 3, validas: 1, conError: 2 });
  });

  it('sin respuesta de la base aún: solo los errores locales', () => {
    const lectura = leerClases([['titulo', 'instructor', 'fecha', 'hora'], ['Yoga', 'a@b.co', '2026-10-05', '07:00']]);
    expect(combinarReporte(lectura, null)).toEqual([{ fila: 2, errores: [], inicio: null, miembro: null, clase: null }]);
  });
});

describe('plantilla y lectura real del CSV', () => {
  it.each(['clases', 'reservas'] as const)('la plantilla de %s se vuelve a leer sin errores de formato', (tipo) => {
    const csv = plantillaCsv(tipo);
    expect(csv.startsWith('﻿')).toBe(true);
    const buffer = new TextEncoder().encode(csv).buffer as ArrayBuffer;
    const matriz = leerMatriz(buffer, `plantilla-${tipo}.csv`);
    const lectura = tipo === 'clases' ? leerClases(matriz) : leerReservas(matriz);
    expect(lectura.error).toBeNull();
    expect(lectura.filas.length).toBe(2);
    expect(lectura.filas.every((f) => f.errores.length === 0)).toBe(true);
    const columnas = tipo === 'clases' ? COLUMNAS_CLASES : COLUMNAS_RESERVAS;
    expect(Object.keys(mapearCabecera(matriz[0], columnas).indices)).toHaveLength(columnas.length);
  });

  it('CSV de Excel en Windows-1252 con «;»: las tildes llegan bien y las fechas no se convierten', () => {
    const texto = 'título;instructor;fecha;hora\r\nYoga en el salón;a@b.co;05/10/2026;07:00\r\n';
    const bytes = Uint8Array.from(Array.from(texto, (c) => ({ í: 0xed, ó: 0xf3 })[c as 'í' | 'ó'] ?? c.charCodeAt(0)));
    expect(decodificarCsv(bytes.buffer)).toContain('título');
    const lectura = leerClases(leerMatriz(bytes.buffer, 'clases.csv'));
    expect(lectura.error).toBeNull();
    expect(lectura.filas[0].datos).toMatchObject({ titulo: 'Yoga en el salón', fecha: '2026-10-05', hora: '07:00' });
  });
});

describe('textos en los cuatro idiomas', () => {
  const idiomas = ['es', 'en', 'fr', 'pt'] as const;
  it.each(idiomas)('%s: cada código de error de fila y de archivo tiene su texto', (idioma) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require(`../../../messages/${idioma}.json`) as { membresias: { importar: { errores: Record<string, string>; erroresArchivo: Record<string, string> } } };
    for (const c of ERRORES_FILA) expect(m.membresias.importar.errores[c]).toEqual(expect.any(String));
    for (const c of ['sin_cabecera', 'faltan_columnas', 'sin_filas', 'demasiadas_filas', 'formato', 'tamano', 'lectura', 'validar']) {
      expect(m.membresias.importar.erroresArchivo[c]).toEqual(expect.any(String));
    }
  });
});
