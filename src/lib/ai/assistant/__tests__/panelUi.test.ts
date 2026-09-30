/**
 * GO Asistente — lógica pura del panel de escritorio (Figma «GO Asistente —
 * escritorio (propuesta)», `667:34452`) y de los enlaces «Ver <entidad>».
 *
 * Lo que se prueba es lo que decide el panel sin navegador: atajo, modo, fase
 * del turno, qué aviso toca a cada código, cuándo se puede reintentar, la
 * estimación de respuestas con el saldo, la agrupación del historial en la
 * zona de la organización y que los enlaces apunten a fichas que existen.
 */

import fs from 'fs';
import path from 'path';
import {
  accionAtajo,
  agruparPorFecha,
  avisoPermiteReintentar,
  avisoPorCodigo,
  CLAVE_MODO,
  esAtajoAsistente,
  faseDelTurno,
  grupoDeFecha,
  guardarModo,
  iconoSugerencia,
  leerModo,
  minutosRestantes,
  opcionPorTecla,
  pasoTerminado,
  requiereDobleConfirmacion,
  respuestasEstimadas,
} from '../panelUi';
import { enlaceEntidad, RUTAS_DETALLE, tipoEnlazable } from '../entityLinks';
import { promedioPorRespuesta } from '../credits';

describe('modo del panel (acoplado 400 / ampliado 720)', () => {
  const almacen = (inicial: Record<string, string> = {}) => {
    const datos = { ...inicial };
    return { getItem: (k: string) => datos[k] ?? null, setItem: (k: string, v: string) => { datos[k] = v; }, datos };
  };

  it('por defecto acoplado, y recuerda el ampliado', () => {
    const a = almacen();
    expect(leerModo(a)).toBe('acoplado');
    guardarModo(a, 'ampliado');
    expect(a.datos[CLAVE_MODO]).toBe('ampliado');
    expect(leerModo(a)).toBe('ampliado');
  });

  it('un valor raro, sin almacenamiento o un accesor que lanza: acoplado y sin romper', () => {
    expect(leerModo(almacen({ [CLAVE_MODO]: 'gigante' }))).toBe('acoplado');
    expect(leerModo(null)).toBe('acoplado');
    const roto = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(leerModo(roto)).toBe('acoplado');
    expect(() => guardarModo(roto, 'ampliado')).not.toThrow();
  });
});

describe('atajo Ctrl/⌘+J', () => {
  it('reconoce Ctrl+J y ⌘+J por la tecla física (teclados no QWERTY incluidos)', () => {
    expect(esAtajoAsistente({ key: 'j', code: 'KeyJ', ctrlKey: true })).toBe(true);
    expect(esAtajoAsistente({ key: 'j', code: 'KeyJ', metaKey: true })).toBe(true);
    // Otra distribución: la letra impresa cambia, la tecla física no.
    expect(esAtajoAsistente({ key: 'ж', code: 'KeyJ', ctrlKey: true })).toBe(true);
  });

  it('no confunde Ctrl+K (buscador), la J sola ni Ctrl+Shift+J', () => {
    expect(esAtajoAsistente({ key: 'k', code: 'KeyK', ctrlKey: true })).toBe(false);
    expect(esAtajoAsistente({ key: 'j', code: 'KeyJ' })).toBe(false);
    expect(esAtajoAsistente({ key: 'J', code: 'KeyJ', ctrlKey: true, shiftKey: true })).toBe(false);
  });

  it('cerrado abre; abierto con el foco fuera enfoca; con el foco dentro cierra', () => {
    expect(accionAtajo({ abierto: false, focoDentro: false })).toBe('abrir');
    expect(accionAtajo({ abierto: true, focoDentro: false })).toBe('enfocar');
    expect(accionAtajo({ abierto: true, focoDentro: true })).toBe('cerrar');
  });
});

describe('fase del turno (pensando / consultando / escribiendo)', () => {
  it('sin nada, pensando; con pasos, consultando; con texto, escribiendo', () => {
    expect(faseDelTurno([], '')).toBe('pensando');
    expect(faseDelTurno([{ name: 'buscar_productos', label: 'Buscando…' }], '')).toBe('consultando');
    expect(faseDelTurno([{ name: 'buscar_productos', label: 'Buscando…' }], 'Estos')).toBe('escribiendo');
  });

  it('un paso termina con su tool_end (resultado u ok), no antes', () => {
    expect(pasoTerminado({ name: 'x', label: 'x' })).toBe(false);
    expect(pasoTerminado({ name: 'x', label: 'x', summary: '12' })).toBe(true);
    expect(pasoTerminado({ name: 'x', label: 'x', ok: false })).toBe(true);
  });
});

describe('avisos', () => {
  it('cada código lleva a su aviso', () => {
    expect(avisoPorCodigo('NO_CREDITS')).toBe('sin_creditos');
    expect(avisoPorCodigo('UNAUTHENTICATED')).toBe('sesion');
    expect(avisoPorCodigo('RATE_LIMITED')).toBe('limite');
    for (const c of ['FORBIDDEN_TOOL', 'no_permission', 'module_inactive', 'level_off', 'ORG_FORBIDDEN']) {
      expect(avisoPorCodigo(c)).toBe('sin_permiso');
    }
    expect(avisoPorCodigo('STREAM_INCOMPLETE')).toBe('error');
    expect(avisoPorCodigo(undefined)).toBe('error');
  });

  it('«Reintentar» solo donde reintentar puede servir', () => {
    expect(avisoPermiteReintentar('error')).toBe(true);
    expect(avisoPermiteReintentar('limite')).toBe(true);
    // Sin créditos, sin permiso o sin sesión, reintentar falla igual (y podría cobrar).
    expect(avisoPermiteReintentar('sin_creditos')).toBe(false);
    expect(avisoPermiteReintentar('sin_permiso')).toBe(false);
    expect(avisoPermiteReintentar('sesion')).toBe(false);
    expect(avisoPermiteReintentar('creditos_bajos')).toBe(false);
  });
});

describe('créditos: cuántas respuestas alcanzan', () => {
  it('usa el promedio real de la organización', () => {
    expect(respuestasEstimadas(18, 4.74)).toBe(3);
    expect(respuestasEstimadas(49, 5)).toBe(9);
    expect(respuestasEstimadas(0, 5)).toBe(0);
  });

  it('sin promedio fiable no inventa un número', () => {
    expect(respuestasEstimadas(18, null)).toBeNull();
    expect(respuestasEstimadas(18, 0)).toBeNull();
    expect(respuestasEstimadas(18, Number.NaN)).toBeNull();
  });

  it('el promedio exige al menos 3 cobros y descarta los vacíos', () => {
    expect(promedioPorRespuesta([{ credits_consumed: 4 }, { credits_consumed: 6 }])).toBeNull();
    expect(promedioPorRespuesta([{ credits_consumed: 4 }, { credits_consumed: 6 }, { credits_consumed: 5 }, { credits_consumed: null }, { credits_consumed: 0 }])).toBe(5);
    expect(promedioPorRespuesta([{ credits_consumed: 4 }, { credits_consumed: 5 }, { credits_consumed: 5 }])).toBe(4.7);
  });
});

describe('deshacer y caducidad', () => {
  const ahora = Date.parse('2026-09-29T15:00:00Z');
  it('minutos restantes redondeando hacia arriba; 0 si ya pasó; null si no hay fecha', () => {
    expect(minutosRestantes('2026-09-29T15:12:00Z', ahora)).toBe(12);
    expect(minutosRestantes('2026-09-29T15:00:30Z', ahora)).toBe(1);
    expect(minutosRestantes('2026-09-29T14:59:00Z', ahora)).toBe(0);
    expect(minutosRestantes(null, ahora)).toBeNull();
    expect(minutosRestantes('mañana', ahora)).toBeNull();
  });

  it('el riesgo alto repite el resumen antes de ejecutar (§6.2); el medio no', () => {
    expect(requiereDobleConfirmacion('high')).toBe(true);
    expect(requiereDobleConfirmacion('medium')).toBe(false);
    expect(requiereDobleConfirmacion(undefined)).toBe(false);
  });
});

describe('pregunta A/B/C por teclado', () => {
  const opciones = [{ key: 'A', label: 'Persona natural' }, { key: 'B', label: 'Empresa' }, { key: 'C', label: 'No sé' }];
  it('la letra elige, sin distinguir mayúsculas', () => {
    expect(opcionPorTecla({ key: 'b' }, opciones)?.label).toBe('Empresa');
    expect(opcionPorTecla({ key: 'C' }, opciones)?.label).toBe('No sé');
  });
  it('con modificadores no (Ctrl+C sigue copiando) y una letra sin opción tampoco', () => {
    expect(opcionPorTecla({ key: 'c', ctrlKey: true }, opciones)).toBeNull();
    expect(opcionPorTecla({ key: 'a', metaKey: true }, opciones)).toBeNull();
    expect(opcionPorTecla({ key: 'z' }, opciones)).toBeNull();
    expect(opcionPorTecla({ key: 'Enter' }, opciones)).toBeNull();
  });
});

describe('historial agrupado en la zona de la organización', () => {
  const zona = 'America/Bogota';
  // 2026-09-29 21:00 en Bogotá = 2026-09-30 02:00 UTC.
  const ahora = new Date('2026-09-30T02:00:00Z');

  it('a las 20:30 de Bogotá sigue siendo «hoy», aunque en UTC ya sea mañana', () => {
    expect(grupoDeFecha('2026-09-30T01:30:00Z', zona, ahora)).toBe('hoy');
    expect(grupoDeFecha('2026-09-29T13:00:00Z', zona, ahora)).toBe('hoy');
  });

  it('ayer, esta semana y anteriores', () => {
    expect(grupoDeFecha('2026-09-29T02:00:00Z', zona, ahora)).toBe('ayer'); // 28 sep 21:00 Bogotá
    expect(grupoDeFecha('2026-09-25T15:00:00Z', zona, ahora)).toBe('semana');
    expect(grupoDeFecha('2026-09-10T15:00:00Z', zona, ahora)).toBe('anteriores');
    expect(grupoDeFecha(null, zona, ahora)).toBe('anteriores');
    expect(grupoDeFecha('no-es-fecha', zona, ahora)).toBe('anteriores');
  });

  it('agrupa en orden fijo y conserva el orden de llegada dentro de cada grupo', () => {
    const hilos = [
      { id: 'a', t: '2026-09-29T20:00:00Z' },
      { id: 'b', t: '2026-09-10T15:00:00Z' },
      { id: 'c', t: '2026-09-29T15:00:00Z' },
      { id: 'd', t: '2026-09-29T02:00:00Z' },
    ];
    const grupos = agruparPorFecha(hilos, (h) => h.t, zona, ahora);
    expect(grupos.map((g) => g.grupo)).toEqual(['hoy', 'ayer', 'anteriores']);
    expect(grupos[0].elementos.map((h) => h.id)).toEqual(['a', 'c']);
  });
});

describe('icono de cada sugerencia', () => {
  it('se elige por lo que pide, sin tildes ni mayúsculas', () => {
    expect(iconoSugerencia('¿Cómo van las ventas de hoy frente a ayer?')).toBe('ventas');
    expect(iconoSugerencia('¿Qué productos se están quedando sin stock?')).toBe('inventario');
    expect(iconoSugerencia('¿Qué clientes tienen facturas vencidas?')).toBe('facturas');
    expect(iconoSugerencia('Crea un cliente nuevo')).toBe('clientes');
    expect(iconoSugerencia('Sube este listado de productos')).toBe('archivo');
    expect(iconoSugerencia('¿Cómo configuro los métodos de pago?')).toBe('configuracion');
    expect(iconoSugerencia('Hola')).toBe('general');
  });
});

describe('«Ver <entidad>» en la tarjeta completada', () => {
  const uuid = '3f2b8c1e-0a4d-4e7b-9c21-5d6e7f8a9b0c';

  it('la ficha de cada tipo, con uuid o entero', () => {
    expect(enlaceEntidad({ type: 'customer', id: uuid })).toBe(`/app/clientes/${uuid}`);
    expect(enlaceEntidad({ type: 'purchase_order', id: 42 })).toBe('/app/inventario/ordenes-compra/42');
    expect(tipoEnlazable('customer')).toBe('customer');
    expect(tipoEnlazable('bulk_load')).toBeNull();
  });

  it('manda la url del servidor si es interna; nunca una externa ni un id sospechoso', () => {
    expect(enlaceEntidad({ type: 'invoice_sales', id: 9, url: '/app/finanzas/facturas-venta/9' })).toBe('/app/finanzas/facturas-venta/9');
    expect(enlaceEntidad({ type: 'customer', id: uuid, url: 'https://otro.sitio/x' })).toBe(`/app/clientes/${uuid}`);
    expect(enlaceEntidad({ type: 'customer', id: uuid, url: '//otro.sitio/x' })).toBe(`/app/clientes/${uuid}`);
    expect(enlaceEntidad({ type: 'customer', id: '../../admin' })).toBeNull();
    expect(enlaceEntidad({ type: 'customer', id: '0' })).toBeNull();
    expect(enlaceEntidad({ type: 'bulk_load', id: 3 })).toBeNull();
    expect(enlaceEntidad(null)).toBeNull();
  });

  it('cada ruta de detalle existe de verdad en la app (carpeta [id])', () => {
    for (const [tipo, ruta] of Object.entries(RUTAS_DETALLE)) {
      const carpeta = path.join(process.cwd(), 'src', 'app', ...ruta.split('/').filter(Boolean), '[id]');
      expect({ tipo, existe: fs.existsSync(path.join(carpeta, 'page.tsx')) }).toEqual({ tipo, existe: true });
    }
  });
});
