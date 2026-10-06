/**
 * Contrato de `/api/sitio-web/dominios/**` (Figma B/07-01…07-28). Lo comparten
 * el servidor (`dominiosSitioService`) y el navegador (`useDominiosSitio`): un
 * solo tipo, así que un campo que cambie en un lado no compila en el otro.
 *
 * Sin React ni Supabase: se importa desde rutas, servicios y componentes.
 */
import type { EstadoDominio } from '../ui/estadoDominio';
import type { EstadoRegistroDns } from '../ui/DnsRecordRow';
import type { ProveedorDns } from '../ui/ProviderGuideTabs';

export type { EstadoDominio, EstadoRegistroDns, ProveedorDns };

/** Columna «Tipo» de la lista: comprado aquí, alias www, propio (externo) o subdominio GO Admin. */
export type TipoDominio = 'comprado' | 'alias_www' | 'propio' | 'subdominio';

/** Columna «SSL». `no_aplica` se pinta «—». */
export type EstadoSsl = 'emitido' | 'pendiente' | 'no_aplica';

/**
 * Columna «Renovación». Las fechas y precios son `null` cuando la base aún no
 * los tiene (columnas `expires_at` y `renewal_price` pendientes): nunca se inventan.
 */
export type Renovacion =
  | { tipo: 'automatica'; venceEn: string | null; precio: number | null; moneda: string | null }
  | { tipo: 'apagada'; venceEn: string | null; precio: number | null; moneda: string | null }
  | { tipo: 'incluida'; con: string }
  | { tipo: 'proveedor' }
  | { tipo: 'no_vence' };

/** Motivo legible de un dominio mal configurado (línea secundaria de la fila). */
export type MotivoError = 'a_otro_servidor' | 'registros_incorrectos' | null;

export interface DominioSitio {
  id: string;
  host: string;
  tipo: TipoDominio;
  estado: EstadoDominio;
  /** Días que faltan para vencer; `null` si no se conoce la fecha. */
  diasParaVencer: number | null;
  principal: boolean;
  activo: boolean;
  /** Host al que redirige (alias www → apex, o el principal). */
  redirigeA: string | null;
  codigoRedireccion: number | null;
  ssl: EstadoSsl;
  renovacion: Renovacion;
  /** Última verificación (timestamptz). */
  revisadoEn: string | null;
  verificadoEn: string | null;
  /** Fecha de compra si se compró con GO Admin (timestamptz). */
  compradoEn: string | null;
  motivoError: MotivoError;
}

export type TipoAlertaDominio = 'vence_sin_renovar' | 'vencido';

/** Aviso en pantalla (B/07-24). Calculado en el servidor con `alertasDominios`. */
export interface AlertaDominio {
  id: string;
  dominioId: string;
  host: string;
  tipo: TipoAlertaDominio;
  tono: 'advertencia' | 'peligro';
  dias: number | null;
  /** Si la renovación se puede encender desde aquí (dominio comprado con GO Admin). */
  puedeActivarRenovacion: boolean;
}

export interface PermisosDominios {
  /** `website.domains` (o administrador): ver, conectar, verificar, quitar. */
  gestionar: boolean;
  /** Lo que exige hoy `/api/domains/purchase`: comprar genera un cobro. */
  comprar: boolean;
}

/** Datos del titular precargados desde `organizations` (B/07-14). */
export interface TitularDominio {
  nombre: string;
  correo: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  departamento: string;
  codigoPostal: string;
  /** ISO 3166-1 alfa-2. */
  pais: string;
}

export interface RespuestaDominios {
  subdominio: string | null;
  /** `<subdominio>.goadmin.io`. */
  hostSubdominio: string | null;
  /** La dirección que abre el sitio: principal verificado o subdominio (`direccionSitio`). */
  hostPublico: string | null;
  dominios: DominioSitio[];
  alertas: AlertaDominio[];
  permisos: PermisosDominios;
  /**
   * El servidor puede añadir dominios al proyecto de sitios y leer su
   * configuración DNS (Vercel). Sin ella, la verificación es solo de propiedad (TXT).
   */
  conexionAutomatica: boolean;
  /** Solo con `permisos.comprar`. */
  titular: TitularDominio | null;
  /**
   * Sede de `?sede=<id>` resuelta en el servidor con la organización de la
   * sesión (Sedes en la web y el asistente llegan así). `null` si no se pidió
   * o si no es de esta organización.
   */
  sede: SedeDominio | null;
}

/** Sede a la que se conecta un dominio (B/07-26). */
export interface SedeDominio {
  id: number;
  nombre: string;
}

export interface RegistroDns {
  tipo: 'A' | 'CNAME' | 'TXT';
  /** Nombre relativo a la zona, como se escribe en el panel del proveedor («@», «www», «_vercel»). */
  nombre: string;
  valor: string;
  estado: EstadoRegistroDns;
  /** Lo que respondió el DNS cuando no coincide. */
  encontrado: string | null;
}

/** Resultado de verificar (B/07-08…07-12). */
export type ResultadoVerificacion = 'activo' | 'verificando' | 'mal_configurado' | 'en_uso' | 'propagando';

export interface RespuestaVerificacion {
  dominio: DominioSitio;
  resultado: ResultadoVerificacion;
  registros: RegistroDns[];
  revisadoEn: string;
  /** Resolutores públicos que ya ven los registros correctos (B/07-12). */
  propagacion: { vistos: number; total: number } | null;
  /** Mensaje del servidor cuando la verificación es solo de propiedad. */
  mensaje: string | null;
}

export interface RespuestaConectar {
  dominio: DominioSitio;
  registros: RegistroDns[];
  proveedor: ProveedorDns;
  conexionAutomatica: boolean;
}

export interface RedireccionDominio {
  host: string;
  hacia: string;
}

export interface RespuestaDetalleDominio {
  dominio: DominioSitio;
  registros: RegistroDns[];
  proveedor: ProveedorDns;
  redirecciones: RedireccionDominio[];
  /** Regla de ICANN: 60 días desde la compra. `null` si no se compró aquí. */
  transferencia: { puede: boolean; disponibleEn: string | null } | null;
  hostSubdominio: string | null;
  permisos: PermisosDominios;
  conexionAutomatica: boolean;
}

/** Códigos de error de la API que la interfaz traduce a una pantalla (B/07-11, 07-05…). */
export type CodigoErrorDominio =
  | 'sin_permiso'
  | 'no_existe'
  | 'host_invalido'
  | 'en_otra_organizacion'
  | 'ya_conectado'
  | 'subdominio_sistema'
  | 'subdominio_invalido'
  | 'subdominio_en_uso'
  | 'no_verificado'
  | 'no_comprado'
  | 'muy_reciente'
  | 'no_disponible'
  | 'demasiados_intentos'
  | 'error_interno';
