export const INFORMES_CONTABLES = [
  { id: 'situacion-financiera', titulo: 'Estado de situación financiera', descripcion: 'Activos, pasivos y patrimonio al corte, con comparativo.' },
  { id: 'resultados-integral', titulo: 'Estado de resultados integral', descripcion: 'Ingresos, costos, gastos y otro resultado integral.' },
  { id: 'cambios-patrimonio', titulo: 'Estado de cambios en el patrimonio', descripcion: 'Movimiento de los grupos 31 a 38 y conciliación con el balance.' },
  { id: 'flujo-indirecto', titulo: 'Flujo de efectivo indirecto', descripcion: 'Operación, inversión y financiación; conciliación con efectivo y equivalentes.' },
  { id: 'notas-estados', titulo: 'Notas a los estados financieros', descripcion: 'Plantilla de la organización y detalle comparativo de cada rubro.' },
  { id: 'certificacion', titulo: 'Certificación de estados financieros', descripcion: 'Artículo 37 de la Ley 222 de 1995 y dictamen opcional.' },
  { id: 'mayor-consolidado', titulo: 'Libro mayor y balances', descripcion: 'Todas las cuentas, saldos iniciales, débitos, créditos y saldos finales.' },
  { id: 'auxiliar-cuenta', titulo: 'Auxiliar por cuenta', descripcion: 'Detalle de asientos contabilizados y saldo corrido.' },
  { id: 'auxiliar-centro', titulo: 'Auxiliar por centro de costo', descripcion: 'Cuenta, centro de costo y tercero, con saldo corrido.' },
  { id: 'inventarios-balances', titulo: 'Libro de inventarios y balances', descripcion: 'Clases 1, 2 y 3 al corte y conciliación del inventario con 1435 por sede.' },
  { id: 'kardex-sede', titulo: 'Kárdex por producto y sede', descripcion: 'Entradas, salidas, ajustes y traslados con promedio ponderado.' },
  { id: 'indicadores', titulo: 'Indicadores financieros', descripcion: 'Liquidez, endeudamiento, márgenes, rentabilidad y rotación.' },
  { id: 'punto-equilibrio', titulo: 'Punto de equilibrio', descripcion: 'Costos fijos, variables y margen de contribución.' },
  { id: 'formulario-300', titulo: 'Formulario 300 · Borrador', descripcion: 'IVA por tarifa histórica de factura y periodicidad configurada.' },
  { id: 'formulario-350', titulo: 'Formulario 350 · Borrador', descripcion: 'Retenciones de renta e IVA por concepto, base y tarifa.' },
  { id: 'ica-municipal', titulo: 'ICA municipal · Borrador', descripcion: 'Actividad, municipio, exclusiones y anticipos recibidos.' },
  { id: 'reteica', titulo: 'ReteICA practicado · Borrador', descripcion: 'Declaración municipal aparte de las retenciones practicadas.' },
  { id: 'exogena', titulo: 'Información exógena · Borrador', descripcion: 'Formatos 1001 y 1005 a 1009, con topes por año.' },
  { id: 'certificado-220', titulo: 'Certificado 220 · Borrador', descripcion: 'Ingresos y retenciones de empleados, desde la nómina.' },
  { id: 'retenciones-proveedores', titulo: 'Certificado de retenciones a proveedores', descripcion: 'Selecciona proveedor y periodo para preparar, expedir y descargar el certificado existente.' },
  { id: 'conciliacion-fiscal', titulo: 'Conciliación fiscal 2516/2517 · Borrador', descripcion: 'Diferencias entre saldos contables y saldos fiscales revisados.' },
  { id: 'informe-gestion', titulo: 'Informe de gestión · Borrador', descripcion: 'Texto de la administración y cifras del periodo.' },
  { id: 'registro-accionistas', titulo: 'Registro de accionistas · Borrador', descripcion: 'Titulares, acciones, valor nominal y fecha de inscripción.' },
  { id: 'pila', titulo: 'PILA · Borrador', descripcion: 'Datos de aportes desde nómina para revisión del contador.' },
] as const;

export const IDS_BORRADORES_TRIBUTARIOS = ['formulario-300', 'formulario-350', 'ica-municipal', 'reteica', 'exogena', 'certificado-220', 'conciliacion-fiscal', 'informe-gestion', 'registro-accionistas', 'pila'] as const;

export type IdInformeContable = typeof INFORMES_CONTABLES[number]['id'];

export const CONTROL_INFORME = 'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50';

export function esInformeContable(id: string): id is IdInformeContable {
  return INFORMES_CONTABLES.some((informe) => informe.id === id);
}

export interface ColumnaInforme {
  clave: string;
  titulo: string;
  formato?: 'texto' | 'pesos' | 'numero' | 'porcentaje';
}

export interface TablaInforme {
  titulo: string;
  columnas: ColumnaInforme[];
  filas: Record<string, string | number | null>[];
}

export interface DocumentoInforme {
  titulo: string;
  textos?: string[];
  tablas: TablaInforme[];
  avisos?: string[];
}

export function formatoCelda(valor: string | number | null | undefined, formato?: ColumnaInforme['formato']): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor !== 'number') return valor;
  if (!Number.isFinite(valor)) return '—';
  if (formato === 'porcentaje') return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(valor)} %`;
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: formato === 'numero' ? 4 : 0 }).format(valor);
}
