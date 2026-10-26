/**
 * Contratos del paquete de estados financieros. La cifra vive en el motor;
 * la base solo entrega movimientos ya contabilizados y la configuración.
 */

export const IDS_INFORME = [
  'situacion-financiera',
  'resultados-integral',
  'cambios-patrimonio',
  'flujo-indirecto',
  'notas-estados',
  'certificacion-estados',
  'libro-mayor',
  'auxiliar-cuenta',
  'auxiliar-centro',
  'inventarios-balances',
  'conciliacion-inventario',
  'kardex',
  'indicadores',
  'punto-equilibrio',
  'formulario-300',
  'formulario-350',
  'ica-municipal',
  'reteica',
  'exogena',
  'certificado-220',
  'certificado-retenciones',
  'conciliacion-fiscal',
  'informe-gestion',
  'registro-accionistas',
  'pila',
] as const;

export type IdInforme = (typeof IDS_INFORME)[number];

export function esIdInforme(valor: string): valor is IdInforme {
  return (IDS_INFORME as readonly string[]).includes(valor);
}

export const INFORMES_BORRADOR: ReadonlySet<IdInforme> = new Set([
  'formulario-300',
  'formulario-350',
  'ica-municipal',
  'reteica',
  'exogena',
  'certificado-220',
  'certificado-retenciones',
  'conciliacion-fiscal',
  'informe-gestion',
  'registro-accionistas',
  'pila',
]);

export interface Movimiento {
  asientoId: number;
  fecha: string;
  cuenta: string;
  debito: number;
  credito: number;
  sucursalId: number | null;
  centroId: string | null;
  terceroNit: string;
  terceroNombre: string;
  source: string;
}

export type PresentacionNiif = 'corriente' | 'no_corriente' | 'segun_plazo';
export type ComportamientoCosto = 'fijo' | 'variable';

export interface Cuenta {
  codigo: string;
  nombre: string;
  nivel: number;
  naturaleza: 'debito' | 'credito' | null;
  presentacion: PresentacionNiif | null;
  plazoMeses: number | null;
  esOri: boolean;
  equivalenteEfectivo: boolean;
  comportamiento: ComportamientoCosto | null;
  esMovimiento: boolean | null;
}

export interface PerfilEstados {
  grupo: 2 | 3;
  cambiosPatrimonio: boolean;
  periodoIva: 'bimestral' | 'cuatrimestral';
  responsableIva: boolean;
  actividad: string;
  municipioIca: string;
  tarifaIca: number;
  exclusionesIca: string;
  exclusionesIcaValor: number;
  representanteNombre: string;
  representanteDocumento: string;
  contadorNombre: string;
  contadorCedula: string;
  contadorTarjeta: string;
  revisorNombre: string;
  revisorTarjeta: string;
  incluirDictamen: boolean;
  notas: Record<string, string>;
  informeGestion: string;
  entidad: string;
  nit: string;
  digitosNota: 4 | 6;
}

export const PERFIL_DEFECTO: PerfilEstados = {
  grupo: 2,
  cambiosPatrimonio: true,
  periodoIva: 'bimestral',
  responsableIva: true,
  actividad: '',
  municipioIca: '',
  tarifaIca: 0,
  exclusionesIca: '',
  exclusionesIcaValor: 0,
  representanteNombre: '',
  representanteDocumento: '',
  contadorNombre: '',
  contadorCedula: '',
  contadorTarjeta: '',
  revisorNombre: '',
  revisorTarjeta: '',
  incluirDictamen: false,
  notas: {},
  informeGestion: '',
  entidad: '',
  nit: '',
  digitosNota: 4,
};

export type TipoKardex = 'entrada' | 'salida' | 'ajuste' | 'traslado';

export interface MovimientoKardex {
  fecha: string;
  documento: string;
  source: string;
  direction: 'in' | 'out';
  cantidad: number;
  costoUnitario: number;
  sucursalId: number;
  productoId: string;
  orden: number;
}

export interface LineaIva {
  origen: 'venta' | 'compra' | 'pos' | 'devolucion';
  tarifa: number;
  base: number;
  iva: number;
  excluido: boolean;
}

export interface FilaNomina {
  nombre: string;
  documento: string;
  devengado: number;
  retencion: number;
  saludTrabajador: number;
  pensionTrabajador: number;
  saludEmpleador: number;
  pensionEmpleador: number;
  arl: number;
  parafiscales: number;
}

export interface TopeExogena {
  formato: string;
  tope: number;
}

export interface Accionista {
  id: string;
  nombre: string;
  documento: string;
  acciones: number;
  valorNominal: number;
  porcentaje: number;
  fechaIngreso: string;
}

export interface AjusteFiscal {
  id: string;
  concepto: string;
  tipo: 'adicion' | 'deduccion';
  valor: number;
  formulario: '2516' | '2517';
}

export interface LineaContribucion {
  producto: string;
  linea: string;
  ventas: number;
  costoVariable: number;
  unidades: number;
}

export interface EntradaInforme {
  desde: string;
  hasta: string;
  movimientos: Movimiento[];
  cuentas: Cuenta[];
  perfil: PerfilEstados;
  kardex: MovimientoKardex[];
  iva: LineaIva[];
  nomina: FilaNomina[];
  topes: TopeExogena[];
  topesConfigurados: boolean;
  accionistas: Accionista[];
  ajustesFiscales: AjusteFiscal[];
  contribucion: LineaContribucion[];
  cuenta: string | null;
  nombresCentro: Record<string, string>;
  nombresSucursal: Record<string, string>;
}

export interface ColumnaInforme {
  key: string;
  titulo: string;
  tipo: 'texto' | 'moneda' | 'porcentaje' | 'numero';
}

export interface FilaInforme {
  id: string;
  [key: string]: string | number | null;
}

export interface KpiInforme {
  titulo: string;
  valor: number;
  formato: 'moneda' | 'numero' | 'porcentaje';
}

export interface InformeResultado {
  id: IdInforme;
  titulo: string;
  borrador: boolean;
  oculto: boolean;
  motivoOculto: string | null;
  columnas: ColumnaInforme[];
  filas: FilaInforme[];
  diferencia: number | null;
  lectura: string[];
  kpis: KpiInforme[];
}

export const TITULOS_INFORME: Record<IdInforme, string> = {
  'situacion-financiera': 'Estado de situación financiera',
  'resultados-integral': 'Estado de resultados integral',
  'cambios-patrimonio': 'Estado de cambios en el patrimonio',
  'flujo-indirecto': 'Flujo de efectivo indirecto',
  'notas-estados': 'Notas a los estados financieros',
  'certificacion-estados': 'Certificación de estados financieros',
  'libro-mayor': 'Libro mayor y balances',
  'auxiliar-cuenta': 'Auxiliar por cuenta',
  'auxiliar-centro': 'Auxiliar por centro de costo',
  'inventarios-balances': 'Libro de inventarios y balances',
  'conciliacion-inventario': 'Conciliación de inventario',
  kardex: 'Kárdex por producto y sede',
  indicadores: 'Indicadores financieros',
  'punto-equilibrio': 'Punto de equilibrio',
  'formulario-300': 'Formulario 300',
  'formulario-350': 'Formulario 350',
  'ica-municipal': 'ICA municipal',
  reteica: 'ReteICA practicado',
  exogena: 'Información exógena',
  'certificado-220': 'Certificado de ingresos y retenciones',
  'certificado-retenciones': 'Certificado de retenciones a proveedores',
  'conciliacion-fiscal': 'Conciliación fiscal',
  'informe-gestion': 'Informe de gestión',
  'registro-accionistas': 'Registro de accionistas',
  pila: 'PILA',
};
