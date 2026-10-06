/**
 * Errores de las RPC de reservas de mesa → clave de i18n para el equipo.
 *
 * Las RPC (`create_restaurant_reservation`, `cancel_restaurant_reservation`,
 * `pos_reserva_sentar`, migraciones D1 y D4) lanzan mensajes con prefijo
 * (`AFORO:`, `MESA:`…), códigos cortos (`mesa_ocupada`…) o frases fijas sin
 * tildes. Aquí se convierten en una clave de `posReservasMesas.errores` con sus
 * valores (`{n}`), para que la interfaz los muestre en el idioma del usuario
 * (`useMensajeErrorReserva`). Módulo puro: lo usan el servicio y las pruebas.
 */

export interface ErrorRpc {
  message?: string | null;
  code?: string | null;
}

/** Clave de `posReservasMesas.errores` + valores para interpolar. */
export interface ErrorReservaInterpretado {
  clave: string;
  valores?: Record<string, number | string>;
}

/** Prefijo de la base → clave genérica. */
const PREFIJOS: Record<string, string> = {
  AFORO: 'aforo',
  MESA: 'mesa',
  SEDE: 'sede',
  ORIGEN: 'origen',
  PERSONAS: 'personas',
  CONTACTO: 'contacto',
  ZONA: 'zona',
  ANTICIPACION: 'anticipacion',
  FUERA_DE_HORARIO: 'fueraDeHorario',
  DESHABILITADA: 'deshabilitada',
  PASADA: 'pasada',
};

/** Código corto de la base → clave. */
const CODIGOS: Record<string, string> = {
  mesa_ocupada: 'mesaOcupada',
  mesa_de_otra_sede: 'mesaDeOtraSede',
  mesa_no_encontrada: 'mesaNoEncontrada',
  reserva_no_encontrada: 'reservaNoEncontrada',
  reserva_no_sentable: 'reservaNoSentable',
  sin_acceso_sucursal: 'sinAccesoSucursal',
  SESION_REQUERIDA: 'sesionRequerida',
};

/** Detalle de la base (sin tildes, con números) → clave específica. */
const DETALLES: ReadonlyArray<{ patron: RegExp; clave: string; conNumero?: boolean }> = [
  { patron: /minimo de personas es (\d+)/i, clave: 'personasMinimo', conNumero: true },
  { patron: /maximo de personas es (\d+)/i, clave: 'personasMaximo', conNumero: true },
  { patron: /celular es obligatorio/i, clave: 'celularObligatorio' },
  { patron: /correo es obligatorio/i, clave: 'correoObligatorio' },
  { patron: /nombre es obligatorio/i, clave: 'nombreObligatorio' },
  { patron: /hasta (\d+) dias/i, clave: 'anticipacionMaxDias', conNumero: true },
  { patron: /al menos (\d+) minutos/i, clave: 'anticipacionMinMinutos', conNumero: true },
  { patron: /menos de (\d+) horas/i, clave: 'cancelarMenosDeHoras', conNumero: true },
  { patron: /mesa ya tiene una reserva/i, clave: 'mesaConReserva' },
  { patron: /cupo de la franja/i, clave: 'aforoFranja' },
  { patron: /ya esta cancelada/i, clave: 'yaCancelada' },
  { patron: /completada o sentada/i, clave: 'noCancelableSentada' },
  { patron: /no se presento/i, clave: 'noCancelableNoShow' },
  { patron: /reserva no encontrada/i, clave: 'reservaNoEncontrada' },
];

/** Interpreta el error de la RPC. `null` si no hay error. */
export function interpretarErrorReserva(error: ErrorRpc | null | undefined): ErrorReservaInterpretado | null {
  const texto = (error?.message ?? '').trim();
  if (!texto) return null;
  if (error?.code === 'PGRST202') return { clave: 'migracionPendiente' };
  if (CODIGOS[texto]) return { clave: CODIGOS[texto] };
  for (const d of DETALLES) {
    const m = d.patron.exec(texto);
    if (m) return d.conNumero ? { clave: d.clave, valores: { n: Number(m[1]) } } : { clave: d.clave };
  }
  const prefijo = /^([A-Z_]+):/.exec(texto);
  if (prefijo && PREFIJOS[prefijo[1]]) return { clave: PREFIJOS[prefijo[1]] };
  return { clave: 'desconocido' };
}

/** Texto en español (registros y pruebas); la interfaz usa `useMensajeErrorReserva`. */
const ES: Record<string, string> = {
  aforo: 'No hay mesa libre para esa hora.',
  aforoFranja: 'El cupo de esa franja está completo.',
  mesa: 'La mesa no pertenece a la sede de la reserva.',
  mesaConReserva: 'La mesa ya tiene una reserva en ese horario.',
  sede: 'Elige una sede concreta para la reserva.',
  origen: 'Inicia sesión de nuevo para crear la reserva.',
  personas: 'El número de personas no está permitido en esta sede.',
  personasMinimo: 'El número mínimo de personas es {n}.',
  personasMaximo: 'El número máximo de personas es {n}.',
  contacto: 'Falta un dato de contacto obligatorio.',
  celularObligatorio: 'El celular es obligatorio.',
  correoObligatorio: 'El correo es obligatorio.',
  nombreObligatorio: 'El nombre es obligatorio.',
  zona: 'La zona elegida no admite reservas.',
  anticipacion: 'Fuera del plazo permitido.',
  anticipacionMaxDias: 'Solo se reserva con hasta {n} días de anticipación.',
  anticipacionMinMinutos: 'Reserva con al menos {n} minutos de anticipación.',
  cancelarMenosDeHoras: 'No se puede cancelar con menos de {n} horas de anticipación.',
  fueraDeHorario: 'La hora está fuera del horario de reservas.',
  deshabilitada: 'Las reservas en línea están apagadas en esta sede.',
  pasada: 'La hora de la reserva ya pasó.',
  yaCancelada: 'La reserva ya está cancelada.',
  noCancelableSentada: 'No se puede cancelar una reserva sentada o completada.',
  noCancelableNoShow: 'No se puede cancelar una reserva marcada como «No se presentó».',
  mesaOcupada: 'La mesa ya tiene una cuenta abierta. Libérala o elige otra.',
  mesaDeOtraSede: 'La mesa es de otra sede.',
  mesaNoEncontrada: 'La mesa ya no existe.',
  reservaNoEncontrada: 'La reserva ya no existe.',
  reservaNoSentable: 'Solo se sientan reservas pendientes o confirmadas.',
  sinAccesoSucursal: 'No tienes acceso a esta sede.',
  sesionRequerida: 'Inicia sesión de nuevo.',
  migracionPendiente: 'Falta aplicar la migración de reservas en la base de datos. Avísale a soporte.',
};

/** Mensaje en español (para `Error.message`, registros y pruebas). */
export function mensajeErrorReserva(error: ErrorRpc | null | undefined, porDefecto = 'No se pudo completar la acción.'): string {
  const i = interpretarErrorReserva(error);
  if (!i) return porDefecto;
  if (i.clave === 'desconocido') return (error?.message ?? '').trim() || porDefecto;
  const plantilla = ES[i.clave] ?? porDefecto;
  return plantilla.replace('{n}', String(i.valores?.n ?? ''));
}

/** Código del prefijo (`AFORO`, `MESA`…) o null. */
export function codigoErrorReserva(error: ErrorRpc | null | undefined): string | null {
  const m = /^([A-Z_]+):/.exec((error?.message ?? '').trim());
  return m && PREFIJOS[m[1]] ? m[1] : null;
}

/** Claves que la interfaz debe tener en `posReservasMesas.errores` (lo comprueba la prueba de i18n). */
export const CLAVES_ERROR_RESERVA: readonly string[] = [...Object.keys(ES), 'generico'];

/** ¿La función RPC no existe aún (migración sin aplicar)? */
export function esFuncionInexistente(error: ErrorRpc | null | undefined): boolean {
  return error?.code === 'PGRST202';
}

/** ¿La columna no existe aún (PostgREST PGRST204 o Postgres 42703)? */
export function esColumnaInexistente(error: ErrorRpc | null | undefined): boolean {
  return error?.code === 'PGRST204' || error?.code === '42703';
}
