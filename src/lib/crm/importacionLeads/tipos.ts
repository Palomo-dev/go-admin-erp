/**
 * Tipos compartidos del importador de leads (navegador, servidor y tests).
 */

import type { CampoSimple } from './campos';

/** Fila tal como la manda el asistente al servidor: valores de texto por campo. */
export interface FilaLeadEntrada {
  /** Número de fila en el archivo (1 = primera fila de la hoja). */
  fila: number;
  campos: Partial<Record<CampoSimple, string>>;
  /** Columnas mapeadas a «Fuente» (URLs de evidencia). */
  fuente?: string[];
  /** Columnas mapeadas a «Etiquetas» (se separan además por `;` y `,`). */
  etiquetas?: string[];
  /** Columnas mapeadas a «Teléfono adicional». */
  telefonosAdicionales?: string[];
  /** Columnas mapeadas a «Correo adicional». */
  correosAdicionales?: string[];
  /** Columnas sin campo propio («Dato adicional»): encabezado del archivo + valor, tal cual. */
  adicionales?: DatoAdicional[];
}

export interface DatoAdicional {
  /** Encabezado de la columna en el archivo («Columna 7» si no tenía). */
  columna: string;
  valor: string;
}

/** Valores que vinieron en el archivo pero no pasaron la normalización: se guardan crudos, no se tiran. */
export type CampoDescartable = 'telefono' | 'correo' | 'nit' | 'web' | 'valor' | 'telefonoAdicional' | 'correoAdicional';

export type TipoClienteImportacion = 'company' | 'person';

export interface OpcionesImportacionLeads {
  /** Nombre del lote (tanda). Clave de idempotencia junto al id externo. */
  lote: string;
  tipoCliente: TipoClienteImportacion;
  /** ISO 4217 del campo «Valor» (p. ej. 'USD' si la cabecera lo dice). `null` = moneda base de la organización. */
  monedaValor: string | null;
  /** ISO 3166-1 alfa-2 para completar teléfonos nacionales (por defecto 'CO'). */
  pais: string;
  /** Nombre del archivo, solo para la trazabilidad en `metadata.importacion.archivo`. */
  archivo?: string | null;
}

/** Código + parámetros: el texto lo pone la interfaz (`leadsImportar.mensajes.*`). */
export interface MensajeImportacion {
  codigo: string;
  params?: Record<string, string | number>;
}

/** Datos ya normalizados de una fila (lo que se escribirá si pasa la validación). */
export interface FilaLeadNormalizada {
  fila: number;
  idExterno: string | null;
  nombre: string;
  razonSocial: string | null;
  contacto: string | null;
  nit: string | null;
  dv: number | null;
  /** E.164 con «+» (`+573001234567`). */
  telefono: string | null;
  tipoTelefono: string | null;
  correo: string | null;
  web: string | null;
  direccion: string | null;
  barrio: string | null;
  ciudad: string | null;
  departamento: string | null;
  zona: string | null;
  sector: string | null;
  subsector: string | null;
  /** Prioridad tal como vino (para la etiqueta). */
  prioridad: string | null;
  /** Banda ICP derivada de la prioridad (A/B/C) o `null`. */
  icpBand: 'A' | 'B' | 'C' | null;
  plan: string | null;
  valor: number | null;
  verificacion: string | null;
  fechaVerificacion: string | null;
  fuentes: string[];
  horario: string | null;
  notas: string | null;
  etiquetas: string[];
  /** Lo que el archivo decía del RNE (solo informativo: nunca da por verificado un número). */
  rneArchivo: string | null;
  pais: string | null;
  /** Cargo de la persona de contacto. */
  cargo: string | null;
  /** Etapa o estado del lead según el archivo (informativo: el ciclo de vida lo pone el alta). */
  etapa: string | null;
  /** Fecha del archivo (captura/registro) como texto; un serial de Excel se pasa a AAAA-MM-DD. */
  fecha: string | null;
  /** E.164 cuando el número es válido; si no, el texto tal cual (no se tira). */
  telefonosAdicionales: string[];
  correosAdicionales: string[];
  /** Valores de «Fuente» que no son URL (p. ej. «Feria», «Instagram»). */
  fuentesTexto: string[];
  adicionales: DatoAdicional[];
  descartados: Partial<Record<CampoDescartable, string>>;
}

export interface FilaLeadValidada {
  fila: number;
  datos: FilaLeadNormalizada | null;
  errores: MensajeImportacion[];
  avisos: MensajeImportacion[];
}

/** Decisión del servidor para una fila. */
export type AccionFilaLead = 'crear' | 'ligar' | 'omitir' | 'error';

export type MotivoOmision = 'duplicado_archivo' | 'lead_abierto' | 'ya_importado' | 'duplicado_bd';

export interface ClienteExistenteRef {
  id: string;
  nombre: string | null;
  /** Por qué coincide: teléfono, NIT, correo o id externo del mismo lote. */
  por: 'telefono' | 'nit' | 'correo' | 'id_externo';
}

export interface ResultadoFilaLead {
  fila: number;
  nombre: string;
  telefono: string | null;
  accion: AccionFilaLead;
  motivo?: MotivoOmision;
  /** Fila del archivo con la que se duplica (motivo `duplicado_archivo`). */
  duplicadaDe?: number;
  cliente?: ClienteExistenteRef;
  errores: MensajeImportacion[];
  avisos: MensajeImportacion[];
  /** Solo en `importar`: ids creados. */
  customerId?: string;
  leadId?: string;
}

export interface ResumenImportacionLeads {
  total: number;
  crear: number;
  ligar: number;
  omitir: number;
  error: number;
  /** Filas que quedan marcadas con RNE pendiente (todas las que se escriben). */
  rnePendiente: number;
  rneExcluido: number;
}

/** Estado RNE que se deja en `customers.metadata.importacion.rne` y en el lead. */
export type EstadoRneImportacion = 'pendiente' | 'excluido';

/** Cómo se escribe el valor del lead en la organización (lo resuelve el servidor una vez por petición). */
export interface PoliticaMoneda {
  /** Moneda a escribir en `opportunities.currency` (`null` = la base, la pone el trigger). */
  moneda: string | null;
  /** Multiplicador sobre el valor del archivo (1 si no hay conversión). */
  tasa: number;
  /** Moneda del archivo cuando se convirtió (o cuando no se pudo convertir). */
  origen: string | null;
  fechaTasa: string | null;
  /** La moneda del archivo no es de la organización y no hay tasa: el importe queda en 0. */
  sinTasa: boolean;
}
