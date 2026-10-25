/**
 * Equivalencias de la plantilla. No reescriben asientos ya hechos:
 * la corrección histórica es un comprobante RC en un período abierto.
 */

export interface EquivalenciaPlantilla {
  codigoActual: string;
  significadoActual: string;
  codigoCorrecto: string;
  nombreCorrecto: string;
  nota: string;
}

export const EQUIVALENCIAS_PLANTILLA: readonly EquivalenciaPlantilla[] = [
  {
    codigoActual: '4105',
    significadoActual: 'Agricultura, ganadería, caza y silvicultura',
    codigoCorrecto: '4135',
    nombreCorrecto: 'Comercio al por mayor y al por menor',
    nota: '4105 conserva el nombre oficial del PUC. El comercio de la plantilla va a 4135.',
  },
  {
    codigoActual: '6105',
    significadoActual: 'Costo de ventas agropecuario',
    codigoCorrecto: '61350501',
    nombreCorrecto: 'Costo de ventas de mercancías (auxiliar de 6135; hoteles y restaurantes: 61400501)',
    nota: '6105 se llama Agricultura, ganadería, caza y silvicultura. No es el costo del comercio.',
  },
  {
    codigoActual: '2405',
    significadoActual: 'No existe en el PUC',
    codigoCorrecto: '24080501',
    nombreCorrecto: 'IVA generado 19% (auxiliar de 2408; descontable 24081001, al 5% 24080502/24081002)',
    nota: 'La 2404 es impuesto de renta.',
  },
  {
    codigoActual: '2105',
    significadoActual: 'Bancos nacionales (obligaciones financieras)',
    codigoCorrecto: '22050501',
    nombreCorrecto: 'Proveedores nacionales (auxiliar de 2205)',
    nota: 'Se mezcló deuda financiera con proveedores.',
  },
  {
    codigoActual: '1405',
    significadoActual: 'Materias primas',
    codigoCorrecto: '1435',
    nombreCorrecto: 'Mercancías no fabricadas por la empresa',
    nota: '',
  },
  {
    codigoActual: '1405-01',
    significadoActual: 'Formato no válido (guion)',
    codigoCorrecto: '14350501',
    nombreCorrecto: 'Auxiliar numérico',
    nota: 'La sede es un centro de costo, no una cuenta por sede.',
  },
];

export const TIPO_DOCUMENTO_RECLASIFICACION = 'RC';

export function equivalenciaDe(codigoActual: string): EquivalenciaPlantilla {
  const fila = EQUIVALENCIAS_PLANTILLA.find((item) => item.codigoActual === codigoActual.trim());
  if (!fila) throw new Error('Ese código no está en la reclasificación de la plantilla');
  return fila;
}

export interface LineaReclasificacion {
  cuenta: string;
  lado: 'debito' | 'credito';
  centavos: number;
}

export interface PlanReclasificacion {
  tipoDocumento: 'RC';
  asientoOriginalId: string;
  periodoAbierto: true;
  lineas: LineaReclasificacion[];
}

/**
 * Arma el comprobante de reclasificación. No modifica el asiento original
 * ni un período ya declarado.
 */
export function planearReclasificacion(input: {
  periodoAbierto: boolean;
  asientoOriginalId: string;
  codigoActual: string;
  valor: number;
  saldo: 'debito' | 'credito';
}): PlanReclasificacion {
  if (!input.periodoAbierto) {
    throw new Error('No se tocan períodos ya declarados');
  }
  const referencia = input.asientoOriginalId.trim();
  if (!referencia) throw new Error('La reclasificación referencia el asiento original');
  const equivalencia = equivalenciaDe(input.codigoActual);
  const centavos = Math.round(input.valor * 100);
  if (!Number.isFinite(centavos) || centavos <= 0) throw new Error('El valor a reclasificar va en positivo');
  const origen = equivalencia.codigoActual;
  const destino = equivalencia.codigoCorrecto;
  const debitarOrigen = input.saldo === 'credito';
  return {
    tipoDocumento: TIPO_DOCUMENTO_RECLASIFICACION,
    asientoOriginalId: referencia,
    periodoAbierto: true,
    lineas: [
      { cuenta: origen, lado: debitarOrigen ? 'debito' : 'credito', centavos },
      { cuenta: destino, lado: debitarOrigen ? 'credito' : 'debito', centavos },
    ],
  };
}
