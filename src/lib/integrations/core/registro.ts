/**
 * Registro de adaptadores de logística por código de proveedor (`integration_providers.code`).
 *
 * `estado` dice qué puede hacer hoy la organización con ese proveedor:
 * - disponible:        adaptador implementado; «Probar conexión» llama al proveedor.
 * - en_construccion:   hay doc oficial y el adaptador se está construyendo: se pueden guardar las
 *                      credenciales, pero la prueba responde NotConfiguredError.
 * - doc_pendiente:     sin doc oficial: igual que en_construccion, a la espera de la doc.
 * - proximamente:      no se puede conectar (fase posterior).
 * Un proveedor de entregas que no está en el registro (Rappi, iFood, Uber Eats…) no se puede
 * conectar: «Próximamente».
 *
 * Sin dependencias de servidor: lo usa también el catálogo de conexiones en el navegador.
 */
import { dropshippingPendiente, transportadoraPendiente, SIN_CAPACIDADES_DROPSHIPPING, SIN_CAPACIDADES_TRANSPORTADORA } from './adaptadores/pendientes';
import type { Adaptador } from './tipos';

export type EstadoAdaptador = 'disponible' | 'en_construccion' | 'doc_pendiente' | 'proximamente';

export interface EntradaRegistro {
  code: string;
  nombre: string;
  estado: EstadoAdaptador;
  /** Qué falta para el siguiente estado (se muestra en la UI). */
  nota: string;
  /** Las transportadoras crean su fila en transport_carriers al conectar. */
  creaTransportadora: boolean;
  /** `transport_carriers.api_provider` (CHECK) para las transportadoras. */
  apiProvider?: 'coordinadora' | 'servientrega' | 'envia' | 'interrapidisimo';
  crear: () => Adaptador;
}

const ENTRADAS: EntradaRegistro[] = [
  {
    code: 'coordinadora',
    nombre: 'Coordinadora',
    estado: 'en_construccion',
    nota: 'Se puede guardar la conexión. La prueba contra el sandbox llega con el adaptador (Fase 2).',
    creaTransportadora: true,
    apiProvider: 'coordinadora',
    crear: () => ({
      tipo: 'transportadora',
      adaptador: transportadoraPendiente('coordinadora', 'Coordinadora',
        { quote: true, createLabel: true, labelPdf: true, track: true, webhook: false, cancel: true, cod: true, pickup: true },
        'El adaptador de Coordinadora todavía no está disponible: se construye contra su sandbox oficial (Fase 2). Tus credenciales quedan guardadas.'),
    }),
  },
  {
    code: 'servientrega',
    nombre: 'Servientrega',
    estado: 'en_construccion',
    nota: 'Se puede guardar la conexión. Generación de guías llega con el adaptador (Fase 2); cotización y rastreo, con la doc de Servientrega.',
    creaTransportadora: true,
    apiProvider: 'servientrega',
    crear: () => ({
      tipo: 'transportadora',
      adaptador: transportadoraPendiente('servientrega', 'Servientrega',
        { quote: false, createLabel: true, labelPdf: true, track: false, webhook: false, cancel: true, cod: false, pickup: false },
        'El adaptador de Servientrega todavía no está disponible (Fase 2). Tus credenciales quedan guardadas.'),
    }),
  },
  {
    code: 'envia',
    nombre: 'Envía Colvanes',
    estado: 'doc_pendiente',
    nota: 'Esperando la documentación y el sandbox del web service de Envía Colvanes.',
    creaTransportadora: true,
    apiProvider: 'envia',
    crear: () => ({
      tipo: 'transportadora',
      adaptador: transportadoraPendiente('envia', 'Envía Colvanes', SIN_CAPACIDADES_TRANSPORTADORA,
        'Envía Colvanes todavía no entregó la documentación de su web service. Tus credenciales quedan guardadas para cuando llegue.'),
    }),
  },
  {
    code: 'interrapidisimo',
    nombre: 'Interrapidísimo',
    estado: 'doc_pendiente',
    nota: 'Esperando la documentación oficial de cliente crédito.',
    creaTransportadora: true,
    apiProvider: 'interrapidisimo',
    crear: () => ({
      tipo: 'transportadora',
      adaptador: transportadoraPendiente('interrapidisimo', 'Interrapidísimo', SIN_CAPACIDADES_TRANSPORTADORA,
        'Interrapidísimo todavía no entregó la documentación de su API de cliente crédito.'),
    }),
  },
  {
    code: 'dropi',
    nombre: 'Dropi',
    estado: 'proximamente',
    nota: 'Dropshipping (Fase 5). Requiere que TI de Dropi habilite el dominio y una IP de salida fija.',
    creaTransportadora: false,
    crear: () => ({
      tipo: 'dropshipping',
      adaptador: dropshippingPendiente('dropi', 'Dropi', SIN_CAPACIDADES_DROPSHIPPING, 'La integración con Dropi llega en la fase de dropshipping.'),
    }),
  },
  {
    code: 'effi',
    nombre: 'Effi',
    estado: 'proximamente',
    nota: 'Dropshipping (Fase 5). Requiere la documentación de la API de Effi y la llave del usuario principal.',
    creaTransportadora: false,
    crear: () => ({
      tipo: 'dropshipping',
      adaptador: dropshippingPendiente('effi', 'Effi', SIN_CAPACIDADES_DROPSHIPPING, 'La integración con Effi llega en la fase de dropshipping.'),
    }),
  },
];

const POR_CODIGO = new Map(ENTRADAS.map((e) => [e.code, e]));

export function entradaRegistro(code: string): EntradaRegistro | null {
  return POR_CODIGO.get(code) ?? null;
}

export function codigosRegistrados(): string[] {
  return ENTRADAS.map((e) => e.code);
}

/**
 * ¿Se puede iniciar una conexión con este proveedor de entregas? Solo si está en el registro y no
 * es «proximamente», y el proveedor no está marcado `coming_soon` en la base.
 */
export function puedeConectarLogistica(code: string, metadataProveedor?: { status?: unknown } | null): boolean {
  const entrada = entradaRegistro(code);
  if (!entrada || entrada.estado === 'proximamente') return false;
  return metadataProveedor?.status !== 'coming_soon';
}

/** Motivo para mostrar en el catálogo cuando no se puede conectar. */
export function motivoNoConectable(code: string): string {
  return entradaRegistro(code)?.nota ?? 'Próximamente: todavía no hay integración con este proveedor.';
}
