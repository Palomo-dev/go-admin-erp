/**
 * Errores tipados de las integraciones de logística (transportadoras y dropshipping).
 *
 * Cada error lleva un `codigo` estable (para la UI y los registros), si se puede reintentar y un
 * mensaje para la persona usuaria. Nunca llevan secretos: el detalle técnico va en `detalle`, ya
 * redactado por quien lo arma.
 */

export type CodigoErrorIntegracion =
  | 'NOT_CONFIGURED'
  | 'AUTH'
  | 'VALIDATION'
  | 'COVERAGE'
  | 'OUT_OF_STOCK'
  | 'RATE_LIMIT'
  | 'PROVIDER_UNAVAILABLE';

export class IntegrationError extends Error {
  readonly codigo: CodigoErrorIntegracion;
  /** ¿Tiene sentido reintentar la MISMA operación más tarde? */
  readonly reintentable: boolean;
  /** Texto para mostrar en la UI. */
  readonly mensajeUsuario: string;
  readonly proveedor: string;
  readonly detalle?: Record<string, unknown>;

  constructor(opts: {
    codigo: CodigoErrorIntegracion;
    proveedor: string;
    mensajeUsuario: string;
    reintentable?: boolean;
    detalle?: Record<string, unknown>;
    causa?: unknown;
  }) {
    super(`[${opts.proveedor}] ${opts.codigo}: ${opts.mensajeUsuario}`);
    this.name = new.target.name;
    this.codigo = opts.codigo;
    this.proveedor = opts.proveedor;
    this.mensajeUsuario = opts.mensajeUsuario;
    this.reintentable = opts.reintentable ?? false;
    this.detalle = opts.detalle;
    if (opts.causa !== undefined) (this as { cause?: unknown }).cause = opts.causa;
  }
}

/** Falta la documentación oficial, el adaptador o las credenciales. Nunca se simula una respuesta. */
export class NotConfiguredError extends IntegrationError {
  constructor(proveedor: string, mensajeUsuario: string, detalle?: Record<string, unknown>) {
    super({ codigo: 'NOT_CONFIGURED', proveedor, mensajeUsuario, detalle });
  }
}

/** Credenciales rechazadas por el proveedor. */
export class AuthError extends IntegrationError {
  constructor(proveedor: string, mensajeUsuario = 'El proveedor rechazó las credenciales.', detalle?: Record<string, unknown>) {
    super({ codigo: 'AUTH', proveedor, mensajeUsuario, detalle });
  }
}

/** Datos del envío inválidos (dirección, ciudad DANE, peso, teléfono…). */
export class ValidationError extends IntegrationError {
  readonly campos: string[];
  constructor(proveedor: string, mensajeUsuario: string, campos: string[] = [], detalle?: Record<string, unknown>) {
    super({ codigo: 'VALIDATION', proveedor, mensajeUsuario, detalle });
    this.campos = campos;
  }
}

/** El proveedor no cubre ese origen/destino o servicio. */
export class CoverageError extends IntegrationError {
  constructor(proveedor: string, mensajeUsuario: string, detalle?: Record<string, unknown>) {
    super({ codigo: 'COVERAGE', proveedor, mensajeUsuario, detalle });
  }
}

/** Dropshipping: el proveedor no tiene stock del producto o variante. */
export class OutOfStockError extends IntegrationError {
  constructor(proveedor: string, mensajeUsuario: string, detalle?: Record<string, unknown>) {
    super({ codigo: 'OUT_OF_STOCK', proveedor, mensajeUsuario, detalle });
  }
}

/** Límite de peticiones del proveedor. */
export class RateLimitError extends IntegrationError {
  readonly reintentarEnMs?: number;
  constructor(proveedor: string, reintentarEnMs?: number, detalle?: Record<string, unknown>) {
    super({ codigo: 'RATE_LIMIT', proveedor, mensajeUsuario: 'El proveedor limitó las peticiones; se reintenta más tarde.', reintentable: true, detalle });
    this.reintentarEnMs = reintentarEnMs;
  }
}

/** El proveedor no respondió (red, timeout, 5xx). */
export class ProviderUnavailableError extends IntegrationError {
  constructor(proveedor: string, mensajeUsuario = 'El proveedor no respondió. Intenta de nuevo en unos minutos.', detalle?: Record<string, unknown>, causa?: unknown) {
    super({ codigo: 'PROVIDER_UNAVAILABLE', proveedor, mensajeUsuario, reintentable: true, detalle, causa });
  }
}

export function esErrorIntegracion(err: unknown): err is IntegrationError {
  return err instanceof IntegrationError;
}

/** Respuesta JSON segura para la UI a partir de cualquier error (sin filtrar detalles internos). */
export function errorParaUI(err: unknown): { codigo: CodigoErrorIntegracion | 'INTERNAL'; mensaje: string; reintentable: boolean } {
  if (esErrorIntegracion(err)) return { codigo: err.codigo, mensaje: err.mensajeUsuario, reintentable: err.reintentable };
  return { codigo: 'INTERNAL', mensaje: 'Error interno. Revisa el registro de la integración.', reintentable: false };
}
