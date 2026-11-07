/**
 * Bandeja de envíos a la DIAN: lógica pura (estado visible, acciones, filtros
 * de servidor, normalización sin JSON crudo ni proveedor, línea de tiempo).
 *
 * Caracterización: las acciones que ofrece la bandeja son EXACTAMENTE las que
 * aceptan las rutas que ya existían (`REINTENTABLES` y `CANCELABLES` de
 * `/api/factus/jobs`, retenido para `liberar`). Si alguien cambia una lista
 * sin la otra, la UI ofrecería un botón que el servidor rechaza con 409.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  COLA_CANCELABLE,
  COLA_REINTENTABLE,
  accionesEnvio,
  estadoEnvio,
  filtrosEstado,
  filtrosVista,
  limpiarBusqueda,
  lineaDeTiempo,
  mensajesDeRespuesta,
  normalizarJob,
  proximoPaso,
  repartoLote,
  respuestaVisible,
  sinProveedor,
  tasaExito,
  type FilaEnvio,
  type JobCrudo,
} from '@/lib/finanzas/facturacionElectronica/bandejaLogica';

const TODOS = { crear: true, anular: true, aprobar: true };
const NINGUNO = { crear: false, anular: false, aprobar: false };

function fila(p: Partial<FilaEnvio> = {}): FilaEnvio {
  return {
    id: 'job-1',
    tipo: 'invoice',
    documentoId: 'fv-1',
    numero: 'FV-1',
    tercero: 'Cliente de prueba',
    terceroDoc: '900123456',
    terceroId: 'c-1',
    total: 100,
    moneda: 'COP',
    sucursalId: 1,
    estadoCola: 'pending',
    retenido: false,
    motivoRetencion: null,
    intentos: 0,
    maxIntentos: 5,
    proximoIntento: null,
    errorCodigo: null,
    errorMensaje: null,
    mensajesDian: [],
    codigoUnico: null,
    numeroDian: null,
    creado: '2026-11-01T15:00:00Z',
    actualizado: '2026-11-01T15:00:00Z',
    procesado: null,
    fechaDocumento: '2026-11-01',
    ...p,
  };
}

describe('estado que ve la persona', () => {
  test.each([
    [{ estadoCola: 'pending', retenido: true }, 'retenido'],
    [{ estadoCola: 'pending', intentos: 0 }, 'en_cola'],
    [{ estadoCola: 'pending', intentos: 2 }, 'reintento'],
    [{ estadoCola: 'processing' }, 'procesando'],
    [{ estadoCola: 'sent' }, 'enviado'],
    [{ estadoCola: 'accepted' }, 'aceptado'],
    [{ estadoCola: 'rejected' }, 'rechazado'],
    [{ estadoCola: 'failed' }, 'error'],
    [{ estadoCola: 'cancelled' }, 'cancelado'],
  ] as const)('%j → %s', (p, esperado) => {
    expect(estadoEnvio(fila(p as Partial<FilaEnvio>))).toBe(esperado);
  });

  test('un retenido con intentos sigue siendo retenido (la retención manda)', () => {
    expect(estadoEnvio(fila({ estadoCola: 'pending', retenido: true, intentos: 3 }))).toBe('retenido');
  });

  test('próximo paso', () => {
    expect(proximoPaso('retenido')).toBe('confirmar');
    expect(proximoPaso('rechazado')).toBe('corregir');
    expect(proximoPaso('reintento')).toBe('reintento_programado');
    expect(proximoPaso('aceptado')).toBe('ninguno');
  });
});

describe('acciones = guardas de las rutas que ya existían (caracterización)', () => {
  const ruta = readFileSync(join(process.cwd(), 'src/app/api/factus/jobs/route.ts'), 'utf8');
  const lista = (nombre: string) =>
    JSON.parse((new RegExp(`const ${nombre} = (\\[[^\\]]*\\])`).exec(ruta)?.[1] ?? '[]').replace(/'/g, '"')) as string[];

  test('reintentar y cancelar usan las mismas listas que /api/factus/jobs', () => {
    expect([...COLA_REINTENTABLE].sort()).toEqual(lista('REINTENTABLES').sort());
    expect([...COLA_CANCELABLE].sort()).toEqual(lista('CANCELABLES').sort());
  });

  test('aceptado: solo descargar; nunca reintentar ni cancelar', () => {
    const a = accionesEnvio(fila({ estadoCola: 'accepted' }), TODOS, true);
    expect(a).toMatchObject({ descargar: true, reintentar: false, cancelar: false, enviarHoy: false });
  });

  test('retenido: enviar hoy solo con servicio activo y permiso de aprobar; cancelar con finance.void', () => {
    const f = fila({ estadoCola: 'pending', retenido: true });
    expect(accionesEnvio(f, TODOS, true)).toMatchObject({ enviarHoy: true, cancelar: true, reintentar: false, motivoEnviarHoy: null });
    expect(accionesEnvio(f, TODOS, false)).toMatchObject({ enviarHoy: false, motivoEnviarHoy: 'servicio_inactivo' });
    expect(accionesEnvio(f, { ...TODOS, aprobar: false }, true)).toMatchObject({ enviarHoy: false, motivoEnviarHoy: 'sin_permiso' });
  });

  test('rechazado y fallido se reintentan con finance.create; sin permisos, nada', () => {
    expect(accionesEnvio(fila({ estadoCola: 'rejected' }), TODOS, true).reintentar).toBe(true);
    expect(accionesEnvio(fila({ estadoCola: 'failed' }), TODOS, true)).toMatchObject({ reintentar: true, cancelar: true });
    expect(accionesEnvio(fila({ estadoCola: 'failed' }), NINGUNO, true)).toMatchObject({ reintentar: false, cancelar: false, enviarHoy: false });
  });

  test('lote: reparte retenidos, reintentables y cancelables', () => {
    const r = repartoLote(
      [fila({ id: 'a', estadoCola: 'pending', retenido: true }), fila({ id: 'b', estadoCola: 'rejected' }), fila({ id: 'c', estadoCola: 'accepted' })],
      TODOS,
      true,
    );
    expect(r.retenidos.map((f) => f.id)).toEqual(['a']);
    expect(r.reintentables.map((f) => f.id)).toEqual(['b']);
    expect(r.cancelables.map((f) => f.id)).toEqual(['a']);
  });
});

describe('filtros de servidor', () => {
  test('vista «Por atender» = retenidos + rechazados + fallidos', () => {
    expect(filtrosVista('atender')).toEqual([{ op: 'or', val: 'and(status.eq.pending,hold_reason.not.is.null),status.in.(rejected,failed)' }]);
    expect(filtrosVista('aceptados')).toEqual([{ op: 'eq', col: 'status', val: 'accepted' }]);
    expect(filtrosVista('todos')).toEqual([]);
  });

  test('retenido, en cola y reintento se distinguen por hold_reason y attempt_count', () => {
    expect(filtrosEstado('retenido')).toEqual([{ op: 'eq', col: 'status', val: 'pending' }, { op: 'not_null', col: 'hold_reason' }]);
    expect(filtrosEstado('en_cola')).toContainEqual({ op: 'eq', col: 'attempt_count', val: 0 });
    expect(filtrosEstado('reintento')).toContainEqual({ op: 'gt', col: 'attempt_count', val: 0 });
  });

  test('la búsqueda no rompe la sintaxis de PostgREST', () => {
    expect(limpiarBusqueda('FV-1,status.eq.accepted)')).toBe('FV-1 status.eq.accepted');
    expect(limpiarBusqueda('%_*')).toBeNull();
    expect(limpiarBusqueda('a')).toBeNull();
    expect(limpiarBusqueda('x'.repeat(100))?.length).toBe(60);
  });
});

describe('normalización: sin JSON crudo ni nombre del proveedor', () => {
  const crudo: JobCrudo = {
    id: 'j1',
    document_type: 'credit_note',
    invoice_id: 'nc-1',
    status: 'rejected',
    attempt_count: 1,
    max_attempts: 5,
    error_code: 'factus_http_422',
    error_message: 'Factus respondió 422 en el job',
    response_payload: { data: { errors: { cliente: ['El NIT del cliente no es válido'] }, number: 'NC7' } },
    cufe: null,
    created_at: '2026-11-01T15:00:00Z',
    updated_at: '2026-11-01T15:05:00Z',
    request_payload: { secreto: 'no debe salir' },
    invoice: [{ id: 'nc-1', number: 'NC-0007', total: '1138830', currency: 'COP', branch_id: 3, customer_id: 'c-9', customer: { company_name: 'Distribuidora Ejemplo S.A.S.', doc_number: '900123456' } }],
  } as JobCrudo & { request_payload: unknown };

  test('arma la fila con el documento, el tercero y los mensajes de la DIAN', () => {
    const f = normalizarJob(crudo);
    expect(f).toMatchObject({
      tipo: 'credit_note',
      numero: 'NC-0007',
      tercero: 'Distribuidora Ejemplo S.A.S.',
      terceroDoc: '900123456',
      total: 1138830,
      sucursalId: 3,
      estadoCola: 'rejected',
      mensajesDian: ['El NIT del cliente no es válido'],
      numeroDian: 'NC7',
    });
    expect(f.errorMensaje).toBe('proveedor respondió 422 en el envío');
    // `errorCodigo` es un código interno (solo lo ve «Detalles técnicos» con finance.approve); lo demás, sin proveedor ni JSON.
    const { errorCodigo: _codigo, ...visible } = f;
    expect(_codigo).toBe('factus_http_422');
    expect(JSON.stringify(visible)).not.toMatch(/secreto|factus|request_payload|response_payload/i);
  });

  test('documento soporte: el tercero es el proveedor (sin llave foránea, por mapa)', () => {
    const f = normalizarJob(
      { id: 'j2', document_type: 'support_document', support_document_id: 'ds-1', status: 'accepted', created_at: 'x', support_document: { number: 'DS12', supplier_id: 4, total: 5 } },
      new Map([[4, { nombre: 'Juan Pérez', nit: '71234567' }]]),
    );
    expect(f).toMatchObject({ documentoId: 'ds-1', numero: 'DS12', tercero: 'Juan Pérez', terceroDoc: '71234567', terceroId: '4' });
  });

  test('mensajesDeRespuesta y sinProveedor', () => {
    expect(mensajesDeRespuesta({ message: 'Factus: error' })).toEqual(['proveedor: error']);
    expect(mensajesDeRespuesta(null)).toEqual([]);
    expect(sinProveedor('El job de FACTUS falló')).toBe('El envío de proveedor falló');
  });
});

describe('respuesta en lenguaje humano', () => {
  test.each([
    [{ estadoCola: 'pending', retenido: true }, 'retenido'],
    [{ estadoCola: 'failed', errorCodigo: 'servicio_no_activo' }, 'servicioNoActivo'],
    [{ estadoCola: 'pending', intentos: 1, errorCodigo: 'factus_sin_respuesta' }, 'sinRespuesta'],
    [{ estadoCola: 'pending', intentos: 1, errorCodigo: 'factus_http_503' }, 'sinRespuesta'],
    [{ estadoCola: 'rejected', errorCodigo: 'factus_http_422', mensajesDian: ['NIT inválido'] }, 'rechazo'],
    [{ estadoCola: 'failed', errorCodigo: 'datos_incompletos', errorMensaje: 'Sin rango' }, 'datosIncompletos'],
  ] as const)('%j → %s', (p, clave) => {
    expect(respuestaVisible(fila(p as Partial<FilaEnvio>)).clave).toBe(clave);
  });

  test('un rechazo muestra lo que dijo la DIAN', () => {
    expect(respuestaVisible(fila({ estadoCola: 'rejected', errorCodigo: 'factus_http_422', mensajesDian: ['NIT inválido'] })).texto).toBe('NIT inválido');
  });
});

describe('línea de tiempo', () => {
  test('retenido: creado → retenido → espera confirmación', () => {
    const p = lineaDeTiempo(fila({ estadoCola: 'pending', retenido: true }), []);
    expect(p.map((x) => x.tipo)).toEqual(['creado', 'retenido', 'pendiente']);
    expect(p[2].pendiente).toBe(true);
  });

  test('rechazado con eventos: usa los eventos en orden y no repite el resultado', () => {
    const p = lineaDeTiempo(fila({ estadoCola: 'rejected', intentos: 1 }), [
      { id: 'e2', event_type: 'rejected', event_message: 'Factus: NIT inválido', created_at: '2026-11-01T15:06:00Z' },
      { id: 'e1', event_type: 'sent', event_message: null, created_at: '2026-11-01T15:05:00Z' },
    ]);
    expect(p.map((x) => x.tipo)).toEqual(['creado', 'enviado', 'rechazado']);
    expect(p[2].detalle).toBe('proveedor: NIT inválido');
  });

  test('aceptado sin eventos: se infiere del estado', () => {
    expect(lineaDeTiempo(fila({ estadoCola: 'accepted', procesado: '2026-11-02T10:00:00Z' }), []).map((x) => x.tipo)).toEqual(['creado', 'aceptado']);
  });

  test('liberado: el evento de autorización aparece como «liberado»', () => {
    const p = lineaDeTiempo(fila({ estadoCola: 'pending' }), [
      { id: 'e', event_type: 'notification', event_message: 'Envío autorizado: se emitirá con la fecha del día', created_at: 'x' },
    ]);
    expect(p.map((x) => x.tipo)).toEqual(['creado', 'retenido', 'liberado', 'pendiente']);
  });
});

test('tasa de éxito del mes', () => {
  expect(tasaExito({ aceptadosMes: 0, rechazadosMes: 0, erroresMes: 0 })).toBeNull();
  expect(tasaExito({ aceptadosMes: 1284, rechazadosMes: 18, erroresMes: 0 })).toBe(98.6);
});
