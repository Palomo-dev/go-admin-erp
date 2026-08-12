// ============================================================
// pdfExportService — Exportación PDF empresarial B/N
// Plantilla única para reportes individuales y cierre consolidado
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReportData, ReporteColumna, PeriodoCierre } from './types';

// ---- Tipos ----

export interface OrganizationInfo {
  id: number;
  name: string;
  legalName?: string;
  nit?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  state?: string;
  country?: string;
}

export interface CierreConsolidado {
  periodo: PeriodoCierre;
  reportes: ReportData[];
  org: OrganizationInfo;
  docNum?: string;
  usuario?: string;
}

// ---- Utilidades internas ----

/** Carga una imagen desde URL como data-URL para insertar en el PDF */
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Hash simple FNV-1a para verificación de integridad del documento */
function simpleHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/** Clasifica un KPI como ingreso, egreso o neutro según su título */
function clasificarKPI(titulo: string): 'ingreso' | 'egreso' | 'neutro' {
  const t = titulo.toLowerCase();
  const ingresoKeys = ['ingreso', 'venta', 'cobro', 'recaudo', 'facturación', 'revenue', 'entrada'];
  const egresoKeys = ['egreso', 'gasto', 'costo', 'pago', 'compra', 'nómina', 'salida', 'devolución'];
  if (ingresoKeys.some((k) => t.includes(k))) return 'ingreso';
  if (egresoKeys.some((k) => t.includes(k))) return 'egreso';
  return 'neutro';
}

/** Encuentra el valor máximo y mínimo en un array de filas para una columna */
function findMaxMin(filas: Record<string, unknown>[], key: string): { max: number; min: number; maxIdx: number; minIdx: number } | null {
  const nums = filas.map((f) => Number(f[key])).filter((n) => !isNaN(n));
  if (!nums.length) return null;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  return {
    max,
    min,
    maxIdx: nums.indexOf(max),
    minIdx: nums.indexOf(min),
  };
}

// ---- Constantes de estilo (escala de grises estricto) ----

const COLORS = {
  black: [0, 0, 0] as [number, number, number],
  dark: [17, 17, 17] as [number, number, number],
  gray: [68, 68, 68] as [number, number, number],
  mid: [136, 136, 136] as [number, number, number],
  light: [204, 204, 204] as [number, number, number],
  veryLight: [238, 238, 238] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const FONT = 'helvetica';
const PAGE_MARGIN = 14;
const HEADER_HEIGHT = 38;

// ---- Formateadores ----

const fmtMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
});

const fmtNumero = new Intl.NumberFormat('es-CO');

function formatCelda(valor: unknown, tipo: ReporteColumna['tipo']): string {
  if (valor === null || valor === undefined) return '—';
  if (tipo === 'moneda') return fmtMoneda.format(Number(valor) || 0);
  if (tipo === 'porcentaje') return `${Number(valor).toFixed(1)}%`;
  if (tipo === 'numero') return fmtNumero.format(Number(valor) || 0);
  if (tipo === 'fecha') {
    const d = new Date(String(valor));
    return d.toLocaleDateString('es-CO');
  }
  return String(valor);
}

function formatDateRange(periodo: PeriodoCierre): string {
  const ini = new Date(periodo.fechaInicio + 'T12:00:00').toLocaleDateString('es-CO');
  const fin = new Date(periodo.fechaFin + 'T12:00:00').toLocaleDateString('es-CO');
  return `${ini} – ${fin}`;
}

function sanitizeFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

// ---- Header empresarial ----

function drawHeader(
  doc: jsPDF,
  org: OrganizationInfo,
  tituloReporte: string,
  periodo: PeriodoCierre,
  usuario?: string,
): void {
  const pageW = doc.internal.pageSize.getWidth();

  // Línea superior fina
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN, 12, pageW - PAGE_MARGIN, 12);

  // Nombre organización
  doc.setFont(FONT, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.black);
  doc.text(org.name || 'Organización', PAGE_MARGIN, 20);

  // NIT · Ciudad
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  const subLine = [org.nit && `NIT ${org.nit}`, org.city].filter(Boolean).join(' · ');
  if (subLine) doc.text(subLine, PAGE_MARGIN, 25);

  // Título del reporte
  doc.setFont(FONT, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.dark);
  doc.text(tituloReporte, PAGE_MARGIN, 31);

  // Período
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  doc.text(`Período: ${formatDateRange(periodo)}`, PAGE_MARGIN, 36);

  // Fecha de generación (alineada a la derecha)
  const ahora = new Date();
  const fechaGen = ahora.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const genText = `Generado: ${fechaGen}${usuario ? ` por ${usuario}` : ''}`;
  doc.text(genText, pageW - PAGE_MARGIN, 36, { align: 'right' });

  // Línea separadora
  doc.setDrawColor(...COLORS.light);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, HEADER_HEIGHT, pageW - PAGE_MARGIN, HEADER_HEIGHT);
}

// ---- Footer con número de página ----

function drawFooter(doc: jsPDF): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pageNum = doc.getCurrentPageInfo().pageNumber;
  const totalPages = doc.getNumberOfPages();

  doc.setDrawColor(...COLORS.light);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, pageH - 12, pageW - PAGE_MARGIN, pageH - 12);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.mid);
  doc.text(`Página ${pageNum} de ${totalPages}`, PAGE_MARGIN, pageH - 7);
  doc.text('GO Admin ERP', pageW / 2, pageH - 7, { align: 'center' });
  doc.text(
    'Documento generado automáticamente — uso interno',
    pageW - PAGE_MARGIN,
    pageH - 7,
    { align: 'right' },
  );
}

// ---- KPIs como pequeñas cajas ----

function drawKPIs(doc: jsPDF, kpis: ReportData['kpis'], startY: number): number {
  if (!kpis.length) return startY;

  const pageW = doc.internal.pageSize.getWidth();
  const usableW = pageW - PAGE_MARGIN * 2;
  const gap = 3;
  const cardW = (usableW - gap * (kpis.length - 1)) / Math.min(kpis.length, 6);
  const cardH = 16;
  let y = startY;

  // Si hay más de 6 KPIs, usar 2 filas
  const primeraFila = kpis.slice(0, 6);
  const segundaFila = kpis.slice(6);

  y = drawKPIRow(doc, primeraFila, y, cardW, cardH, gap);
  if (segundaFila.length) {
    y = drawKPIRow(doc, segundaFila, y + 2, cardW, cardH, gap);
  }

  return y + 4;
}

function drawKPIRow(
  doc: jsPDF,
  kpis: ReportData['kpis'],
  y: number,
  cardW: number,
  cardH: number,
  gap: number,
): number {
  kpis.forEach((kpi, i) => {
    const x = PAGE_MARGIN + i * (cardW + gap);

    doc.setDrawColor(...COLORS.light);
    doc.setLineWidth(0.3);
    doc.setFillColor(...COLORS.veryLight);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    const titulo = kpi.titulo.length > 22 ? kpi.titulo.slice(0, 20) + '…' : kpi.titulo;
    doc.text(titulo, x + 2, y + 5);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.black);
    const valor = formatValorKPI(kpi.valor, kpi.formato);
    doc.text(valor, x + 2, y + 12);
  });

  return y + cardH;
}

function formatValorKPI(valor: string | number, formato?: 'moneda' | 'numero' | 'porcentaje'): string {
  if (typeof valor === 'string') return valor;
  if (formato === 'moneda') return fmtMoneda.format(valor);
  if (formato === 'porcentaje') return `${valor}%`;
  return fmtNumero.format(valor);
}

// ---- Tabla de reporte ----

function drawTabla(doc: jsPDF, data: ReportData, startY: number): number {
  const { columnas, filas, totales } = data;

  if (!filas.length) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.mid);
    doc.text('Sin datos en este período', PAGE_MARGIN, startY + 6);
    return startY + 10;
  }

  const head = [columnas.map((c) => c.titulo)];

  const body = filas.map((fila) =>
    columnas.map((col) => formatCelda(fila[col.key], col.tipo)),
  );

  // Fila de totales
  if (totales) {
    body.push(columnas.map((col) => formatCelda(totales[col.key], col.tipo)));
  }

  const colStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
  columnas.forEach((col, idx) => {
    const align = col.alinear === 'right' ? 'right' : col.alinear === 'center' ? 'center' : 'left';
    colStyles[idx] = { halign: align };
  });

  autoTable(doc, {
    startY,
    head,
    body,
    theme: 'grid',
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    styles: {
      font: FONT,
      fontSize: 8,
      cellPadding: 2,
      textColor: COLORS.dark,
      lineColor: COLORS.light,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLORS.black,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: COLORS.veryLight,
    },
    // Última fila = totales → negrita
    didParseCell: (hookData) => {
      if (totales && hookData.row.index === body.length - 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.lineWidth = 0.5;
        hookData.cell.styles.lineColor = COLORS.black;
      }
    },
    showHead: 'everyPage',
    columnStyles: colStyles,
  });

  // @ts-expect-error — autoTable inyecta lastAutoTable
  return doc.lastAutoTable.finalY + 4;
}

// ---- Helpers para cierre consolidado profesional ----

interface CategoriaGrupo {
  categoria: string;
  nombre: string;
  items: ReportData[];
}

const NOMBRES_CATEGORIA: Record<string, string> = {
  financiero: 'Financiero',
  operativo: 'Operativo',
  contable: 'Contable',
  comercial: 'Comercial',
  personas: 'Talento Humano',
  sistema: 'Sistema',
};

function agruparPorCategoria(reportes: ReportData[]): CategoriaGrupo[] {
  const grupos: Record<string, ReportData[]> = {};
  reportes.forEach((r) => {
    // Inferir categoría desde el módulo
    const cat = inferirCategoria(r.modulo);
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push(r);
  });
  return Object.entries(grupos).map(([categoria, items]) => ({
    categoria,
    nombre: NOMBRES_CATEGORIA[categoria] ?? categoria,
    items,
  }));
}

function inferirCategoria(modulo: string): string {
  const modFinanciero = ['finance', 'finanzas', 'pos', 'inventario', 'parking', 'pms', 'transporte'];
  const modComercial = ['crm', 'clientes', 'chat'];
  const modPersonas = ['hrm'];
  const modSistema = ['organizations', 'roles', 'integraciones'];
  const modContable = ['contabilidad', 'facturas'];
  const modOperativo = ['pm', 'calendario', 'timeline', 'notificaciones'];

  const m = modulo.toLowerCase();
  if (modFinanciero.some((x) => m.includes(x))) return 'financiero';
  if (modComercial.some((x) => m.includes(x))) return 'comercial';
  if (modPersonas.some((x) => m.includes(x))) return 'personas';
  if (modSistema.some((x) => m.includes(x))) return 'sistema';
  if (modContable.some((x) => m.includes(x))) return 'contable';
  if (modOperativo.some((x) => m.includes(x))) return 'operativo';
  return 'operativo';
}

function consolidarTotales(items: ReportData[]): Record<string, unknown> | undefined {
  if (!items.length) return undefined;
  const base = items[0].totales;
  if (!base) return undefined;
  const resultado: Record<string, unknown> = {};
  Object.keys(base).forEach((key) => {
    const suma = items.reduce((acc, r) => {
      const val = r.totales?.[key];
      if (typeof val === 'number') return acc + val;
      return acc;
    }, 0);
    resultado[key] = suma;
  });
  return resultado;
}

function drawPortada(
  doc: jsPDF,
  org: OrganizationInfo,
  periodo: PeriodoCierre,
  ahora: Date,
  docNum: string,
  usuario: string | undefined,
  totalReportes: number,
  logoDataUrl: string | null,
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Watermark diagonal
  doc.saveGraphicsState();
  doc.setGState(new (doc as unknown as { GState: new (opts: { opacity: number }) => unknown }).GState({ opacity: 0.06 }));
  doc.setFont(FONT, 'bold');
  doc.setFontSize(60);
  doc.setTextColor(...COLORS.black);
  const cx = pageW / 2;
  const cy = pageH / 2;
  doc.text('CONFIDENCIAL', cx, cy, { align: 'center', angle: 45 });
  doc.restoreGraphicsState();

  // Banda superior negra
  doc.setFillColor(...COLORS.black);
  doc.rect(0, 0, pageW, 55, 'F');

  // Logo (si disponible)
  let logoX = PAGE_MARGIN;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, 8, 18, 18);
      logoX = PAGE_MARGIN + 22;
    } catch {
      // Si falla el logo, continuar sin él
    }
  }

  // Nombre organización
  doc.setFont(FONT, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.white);
  doc.text(org.legalName || org.name || 'Organización', logoX, 20);

  // Razón social si es diferente
  if (org.legalName && org.legalName !== org.name) {
    doc.setFontSize(9);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLORS.light);
    doc.text(org.name, logoX, 27);
  }

  // NIT · Ciudad · Dirección
  doc.setFontSize(9);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...COLORS.light);
  const infoLines = [
    [org.nit && `NIT ${org.nit}`, org.city, org.state].filter(Boolean).join(' · '),
    [org.address, org.phone && `Tel: ${org.phone}`].filter(Boolean).join(' · '),
    org.email,
  ].filter(Boolean) as string[];

  let infoY = 33;
  infoLines.forEach((line) => {
    doc.text(line, logoX, infoY);
    infoY += 5;
  });

  // Etiqueta confidencial
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mid);
  doc.text('Documento confidencial — Uso interno', PAGE_MARGIN, 52);

  // Título principal
  doc.setFont(FONT, 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.black);
  doc.text('Cierre Consolidado', PAGE_MARGIN, 82);

  // Subtítulo con tipo
  doc.setFont(FONT, 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.gray);
  doc.text(periodo.etiqueta, PAGE_MARGIN, 90);

  // Línea decorativa
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(1.2);
  doc.line(PAGE_MARGIN, 94, pageW - PAGE_MARGIN, 94);

  // Metadatos en bloque
  let y = 106;
  const labelX = PAGE_MARGIN + 4;
  const valueX = PAGE_MARGIN + 55;

  const metadatos: [string, string][] = [
    ['N° Documento', docNum],
    ['Período', formatDateRange(periodo)],
    ['Tipo de cierre', periodo.etiqueta],
    ['Reportes incluidos', String(totalReportes)],
    ['Fecha de generación', ahora.toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })],
    ['Generado por', usuario || 'Sistema'],
  ];

  // Fondo del bloque de metadatos
  doc.setFillColor(...COLORS.veryLight);
  doc.roundedRect(PAGE_MARGIN, y - 4, pageW - PAGE_MARGIN * 2, metadatos.length * 8 + 4, 2, 2, 'F');

  metadatos.forEach(([label, value]) => {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.gray);
    doc.text(label, labelX, y);

    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLORS.dark);
    doc.text(value, valueX, y);
    y += 8;
  });

  // Pie de portada
  doc.setDrawColor(...COLORS.light);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, pageH - 30, pageW - PAGE_MARGIN, pageH - 30);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.mid);
  doc.text('GO Admin ERP — Sistema de Gestión Empresarial', pageW / 2, pageH - 22, { align: 'center' });
  doc.text('Este documento fue generado automáticamente y compila información de todos los módulos activos.', pageW / 2, pageH - 16, { align: 'center' });
  doc.text(`Hash: ${simpleHash(docNum + periodo.fechaInicio + periodo.fechaFin)}`, pageW / 2, pageH - 10, { align: 'center' });
}

function drawResumenEjecutivo(
  doc: jsPDF,
  org: OrganizationInfo,
  reportes: ReportData[],
  periodo: PeriodoCierre,
  pageW: number,
  pageH: number,
): void {
  // Header
  drawHeader(doc, org, 'Resumen Ejecutivo', periodo);

  let y = HEADER_HEIGHT + 6;
  const usableW = pageW - PAGE_MARGIN * 2;

  // ====== BLOQUE FINANCIERO: INGRESOS / EGRESOS / UTILIDAD ======
  const allKpis = reportes.flatMap((r) => r.kpis);
  const kpisNumericos = allKpis.filter((k) => typeof k.valor === 'number' && k.formato === 'moneda');

  let totalIngresos = 0;
  let totalEgresos = 0;
  kpisNumericos.forEach((k) => {
    const tipo = clasificarKPI(k.titulo);
    if (tipo === 'ingreso') totalIngresos += Number(k.valor);
    else if (tipo === 'egreso') totalEgresos += Number(k.valor);
  });
  const utilidadNeta = totalIngresos - totalEgresos;
  const margen = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

  // Semáforo
  const semaforo = margen >= 20 ? 'POSITIVO' : margen >= 0 ? 'NEUTRO' : 'ALERTA';
  const semaforoColor = margen >= 20 ? [34, 139, 34] as [number, number, number]
    : margen >= 0 ? [200, 160, 0] as [number, number, number]
    : [200, 30, 30] as [number, number, number];

  // Caja financiera principal
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.5);
  doc.setFillColor(...COLORS.white);
  doc.roundedRect(PAGE_MARGIN, y, usableW, 42, 2, 2, 'FD');

  // Línea divisoria horizontal
  doc.setDrawColor(...COLORS.light);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN + 4, y + 20, pageW - PAGE_MARGIN - 4, y + 20);

  // Ingresos
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.gray);
  doc.text('INGRESOS TOTALES', PAGE_MARGIN + 6, y + 8);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(34, 100, 34);
  doc.text(fmtMoneda.format(totalIngresos), PAGE_MARGIN + 6, y + 16);

  // Egresos
  const midX = pageW / 2;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.gray);
  doc.text('EGRESOS TOTALES', midX + 6, y + 8);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(180, 40, 40);
  doc.text(fmtMoneda.format(totalEgresos), midX + 6, y + 16);

  // Utilidad
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.gray);
  doc.text('UTILIDAD NETA', PAGE_MARGIN + 6, y + 28);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...semaforoColor);
  doc.text(fmtMoneda.format(utilidadNeta), PAGE_MARGIN + 6, y + 36);

  // Margen + Semáforo
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  doc.text(`Margen: ${margen.toFixed(1)}%`, midX + 6, y + 28);

  // Círculo semáforo
  doc.setFillColor(...semaforoColor);
  doc.circle(midX + 50, y + 31, 3, 'F');
  doc.setFont(FONT, 'bold');
  doc.setFontSize(8);
  doc.text(semaforo, midX + 56, y + 33);

  y += 48;

  // ====== GRÁFICO DE BARRAS ASCII: TOP 5 KPIs MONETARIOS ======
  const topKpis = kpisNumericos
    .sort((a, b) => Math.abs(Number(b.valor)) - Math.abs(Number(a.valor)))
    .slice(0, 5);

  if (topKpis.length) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.text('Indicadores Principales', PAGE_MARGIN, y);
    y += 5;

    const maxVal = Math.max(...topKpis.map((k) => Math.abs(Number(k.valor))), 1);
    const barMaxW = usableW - 70;

    topKpis.forEach((kpi) => {
      const val = Math.abs(Number(kpi.valor));
      const barW = Math.max((val / maxVal) * barMaxW, 2);
      const tipo = clasificarKPI(kpi.titulo);
      const barColor = tipo === 'ingreso' ? [34, 100, 34] as [number, number, number]
        : tipo === 'egreso' ? [180, 40, 40] as [number, number, number]
        : COLORS.mid;

      // Etiqueta
      doc.setFont(FONT, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.gray);
      const titulo = kpi.titulo.length > 28 ? kpi.titulo.slice(0, 26) + '…' : kpi.titulo;
      doc.text(titulo, PAGE_MARGIN, y + 3);

      // Barra
      doc.setFillColor(...barColor);
      doc.rect(PAGE_MARGIN + 45, y, barW, 4, 'F');

      // Valor
      doc.setFont(FONT, 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...COLORS.dark);
      doc.text(formatValorKPI(kpi.valor, kpi.formato), PAGE_MARGIN + 47 + barW, y + 3);

      y += 7;
    });
    y += 2;
  }

  // ====== KPIs NUMÉRICOS DESTACADOS (grid) ======
  const kpisDestacados = allKpis.filter((k) => typeof k.valor === 'number').slice(0, 8);
  if (kpisDestacados.length) {
    const cols = 4;
    const cardW = (usableW - 3 * (cols - 1)) / cols;
    const cardH = 16;
    const filas = Math.ceil(kpisDestacados.length / cols);

    for (let fila = 0; fila < filas; fila++) {
      if (y + cardH > pageH - 20) break;
      const items = kpisDestacados.slice(fila * cols, (fila + 1) * cols);
      items.forEach((kpi, i) => {
        const x = PAGE_MARGIN + i * (cardW + 3);
        const tipo = clasificarKPI(kpi.titulo);
        const borderColor = tipo === 'ingreso' ? [34, 100, 34] as [number, number, number]
          : tipo === 'egreso' ? [180, 40, 40] as [number, number, number]
          : COLORS.light;

        doc.setDrawColor(...borderColor);
        doc.setLineWidth(0.4);
        doc.setFillColor(...COLORS.white);
        doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'FD');

        doc.setFont(FONT, 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...COLORS.gray);
        const titulo = kpi.titulo.length > 20 ? kpi.titulo.slice(0, 18) + '…' : kpi.titulo;
        doc.text(titulo, x + 2, y + 5);

        doc.setFont(FONT, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.black);
        doc.text(formatValorKPI(kpi.valor, kpi.formato), x + 2, y + 12);
      });
      y += cardH + 3;
    }
  }

  y += 4;

  // ====== TABLA RESUMEN: KPIs POR MÓDULO ======
  const kpiRows = allKpis.map((k) => {
    const reporteOrigen = reportes.find((r) => r.kpis.includes(k));
    const tipo = clasificarKPI(k.titulo);
    return {
      modulo: reporteOrigen?.modulo ?? '—',
      reporte: reporteOrigen?.titulo ?? '—',
      kpi: k.titulo,
      valor: formatValorKPI(k.valor, k.formato),
      tipo,
    };
  });

  if (kpiRows.length && y < pageH - 40) {
    autoTable(doc, {
      startY: y,
      head: [['Módulo', 'Reporte', 'Indicador', 'Tipo', 'Valor']],
      body: kpiRows.map((r) => [
        r.modulo,
        r.reporte,
        r.kpi,
        r.tipo === 'ingreso' ? '▲ Ingreso' : r.tipo === 'egreso' ? '▼ Egreso' : '— Neutro',
        r.valor,
      ]),
      theme: 'striped',
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      styles: {
        font: FONT,
        fontSize: 7,
        cellPadding: 2,
        textColor: COLORS.dark,
        lineColor: COLORS.light,
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: COLORS.black,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: COLORS.veryLight },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 'auto' },
        3: { cellWidth: 20, halign: 'center' },
        4: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
      },
    });
  }
}

function drawIndice(
  doc: jsPDF,
  secciones: { titulo: string; categoria: string; page: number }[],
  totalPaginas: number,
  pageW: number,
  pageH: number,
): void {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.black);
  doc.text('Índice de Contenidos', PAGE_MARGIN, 28);

  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.8);
  doc.line(PAGE_MARGIN, 32, pageW - PAGE_MARGIN, 32);

  // Entradas fijas
  const entradas: { titulo: string; page: number }[] = [
    { titulo: 'Portada', page: 1 },
    { titulo: 'Resumen Ejecutivo', page: 2 },
    { titulo: 'Índice de Contenidos', page: 3 },
  ];

  secciones.forEach((s) => entradas.push({ titulo: s.titulo, page: s.page }));
  entradas.push({ titulo: 'Totales Consolidados', page: totalPaginas });

  let y = 42;
  entradas.forEach((e, i) => {
    // Número
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.text(String(i + 1), PAGE_MARGIN, y);

    // Título
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLORS.dark);
    doc.text(e.titulo, PAGE_MARGIN + 8, y);

    // Línea punteada
    doc.setDrawColor(...COLORS.light);
    doc.setLineWidth(0.2);
    const tituloW = doc.getTextWidth(e.titulo);
    const pageStr = String(e.page);
    const pageW2 = doc.getTextWidth(pageStr);
    const lineStart = PAGE_MARGIN + 8 + tituloW + 2;
    const lineEnd = pageW - PAGE_MARGIN - pageW2 - 2;
    if (lineEnd > lineStart) {
      doc.setLineDashPattern([0.5, 1], 0);
      doc.line(lineStart, y - 1, lineEnd, y - 1);
      doc.setLineDashPattern([], 0);
    }

    // Página
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...COLORS.gray);
    doc.text(pageStr, pageW - PAGE_MARGIN, y, { align: 'right' });

    y += 8;
  });
}

function drawSectionHeader(doc: jsPDF, nombre: string, count: number): void {
  const pageW = doc.internal.pageSize.getWidth();

  // Banda de sección
  doc.setFillColor(...COLORS.black);
  doc.rect(0, 0, pageW, 40, 'F');

  doc.setFont(FONT, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.white);
  doc.text(nombre, PAGE_MARGIN, 20);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.light);
  doc.text(`${count} ${count === 1 ? 'reporte' : 'reportes'} en esta sección`, PAGE_MARGIN, 28);

  doc.setDrawColor(...COLORS.light);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, 44, pageW - PAGE_MARGIN, 44);
}

function drawTotalesConsolidados(
  doc: jsPDF,
  org: OrganizationInfo,
  reportes: ReportData[],
  periodo: PeriodoCierre,
  pageW: number,
  pageH: number,
): void {
  // Header
  drawHeader(doc, org, 'Totales Consolidados', periodo);

  let y = HEADER_HEIGHT + 6;
  const usableW = pageW - PAGE_MARGIN * 2;

  // ====== CLASIFICAR TOTALES POR TIPO ======
  interface TotalItem {
    modulo: string;
    titulo: string;
    valor: number;
    tipo: 'ingreso' | 'egreso' | 'neutro';
    columna: string;
  }

  const totalesClasificados: TotalItem[] = [];
  reportes.forEach((r) => {
    if (!r.totales) return;
    r.columnas.forEach((col) => {
      if (col.tipo !== 'moneda' && col.tipo !== 'numero') return;
      const val = Number(r.totales?.[col.key]);
      if (isNaN(val) || val === 0) return;
      const tipo = clasificarKPI(`${r.titulo} ${col.titulo}`);
      totalesClasificados.push({
        modulo: r.modulo,
        titulo: `${r.titulo} — ${col.titulo}`,
        valor: val,
        tipo,
        columna: col.key,
      });
    });
  });

  const ingresos = totalesClasificados.filter((t) => t.tipo === 'ingreso');
  const egresos = totalesClasificados.filter((t) => t.tipo === 'egreso');
  const otros = totalesClasificados.filter((t) => t.tipo === 'neutro');

  const sumIngresos = ingresos.reduce((s, t) => s + t.valor, 0);
  const sumEgresos = egresos.reduce((s, t) => s + t.valor, 0);
  const utilidadNeta = sumIngresos - sumEgresos;

  // ====== ESTADO DE RESULTADOS RESUMIDO ======
  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);
  doc.text('Estado de Resultados Resumido', PAGE_MARGIN, y);
  y += 6;

  const erRows: string[][] = [];
  if (ingresos.length) {
    erRows.push(['INGRESOS', '', '']);
    ingresos.forEach((t) => erRows.push(['  ' + t.titulo, t.modulo, fmtMoneda.format(t.valor)]));
    erRows.push(['Total Ingresos', '', fmtMoneda.format(sumIngresos)]);
  }
  if (egresos.length) {
    erRows.push(['EGRESOS', '', '']);
    egresos.forEach((t) => erRows.push(['  ' + t.titulo, t.modulo, fmtMoneda.format(t.valor)]));
    erRows.push(['Total Egresos', '', fmtMoneda.format(sumEgresos)]);
  }
  erRows.push(['', '', '']);
  erRows.push(['UTILIDAD NETA DEL PERÍODO', '', fmtMoneda.format(utilidadNeta)]);

  if (erRows.length > 1) {
    autoTable(doc, {
      startY: y,
      head: [['Concepto', 'Módulo', 'Valor']],
      body: erRows,
      theme: 'plain',
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      styles: {
        font: FONT,
        fontSize: 8,
        cellPadding: 1.5,
        textColor: COLORS.dark,
      },
      headStyles: {
        fillColor: COLORS.black,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 30 },
        2: { halign: 'right', cellWidth: 35, fontStyle: 'bold' },
      },
      didParseCell: (hookData) => {
        const text = String(hookData.cell.raw ?? '');
        if (text === 'INGRESOS' || text === 'EGRESOS') {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fontSize = 9;
        }
        if (text.startsWith('Total ') || text === 'UTILIDAD NETA DEL PERÍODO') {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.lineWidth = { top: 0.5 };
          hookData.cell.styles.lineColor = COLORS.black;
        }
        if (text === 'UTILIDAD NETA DEL PERÍODO') {
          hookData.cell.styles.fontSize = 10;
        }
      },
    });
    // @ts-expect-error — autoTable inyecta lastAutoTable
    y = doc.lastAutoTable.finalY + 8;
  } else {
    doc.setFont(FONT, 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.mid);
    doc.text('No hay totales numéricos para consolidar en este período.', PAGE_MARGIN, y);
    y += 12;
  }

  // ====== INDICADORES FINANCIEROS ======
  if (sumIngresos > 0) {
    const margenBruto = (utilidadNeta / sumIngresos) * 100;
    const ratio = sumEgresos > 0 ? sumIngresos / sumEgresos : 0;

    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.text('Indicadores Financieros', PAGE_MARGIN, y);
    y += 6;

    const indicadores: [string, string][] = [
      ['Margen Neto', `${margenBruto.toFixed(1)}%`],
      ['Razón Ingresos/Egresos', ratio > 0 ? ratio.toFixed(2) : 'N/A'],
      ['Total Reportes Procesados', String(reportes.length)],
      ['Total Registros', String(reportes.reduce((s, r) => s + r.filas.length, 0))],
    ];

    indicadores.forEach(([label, value]) => {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.gray);
      doc.text(label, PAGE_MARGIN, y);
      doc.setFont(FONT, 'bold');
      doc.setTextColor(...COLORS.dark);
      doc.text(value, pageW - PAGE_MARGIN, y, { align: 'right' });
      y += 6;
    });
    y += 4;
  }

  // ====== OTROS TOTALES NO CLASIFICADOS ======
  if (otros.length && y < pageH - 60) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.text('Otros Totales por Reporte', PAGE_MARGIN, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [['Módulo', 'Reporte', 'Total']],
      body: otros.map((t) => [t.modulo, t.titulo, fmtMoneda.format(t.valor)]),
      theme: 'grid',
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      styles: {
        font: FONT,
        fontSize: 7,
        cellPadding: 2,
        textColor: COLORS.dark,
        lineColor: COLORS.light,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: COLORS.gray,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: COLORS.veryLight },
      columnStyles: {
        0: { cellWidth: 25, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
        2: { halign: 'right', cellWidth: 35, fontStyle: 'bold' },
      },
    });
  }
}

// ---- Página de Firmas y Verificación ----

function drawPaginaFirmas(
  doc: jsPDF,
  org: OrganizationInfo,
  periodo: PeriodoCierre,
  docNum: string,
  usuario: string | undefined,
  reportes: ReportData[],
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  drawHeader(doc, org, 'Firmas y Verificación', periodo);

  let y = HEADER_HEIGHT + 10;

  // Hash de verificación
  const dataString = JSON.stringify({
    docNum,
    periodo: periodo.fechaInicio + periodo.fechaFin,
    reportes: reportes.length,
    totales: reportes.map((r) => r.totales),
  });
  const hash = simpleHash(dataString);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  doc.text('Código de verificación de integridad:', PAGE_MARGIN, y);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.black);
  doc.text(hash, PAGE_MARGIN + 60, y);
  y += 4;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mid);
  doc.text(`Documento N° ${docNum} — Generado: ${new Date().toLocaleString('es-CO')}`, PAGE_MARGIN, y);
  y += 16;

  // Nota legal
  doc.setFont(FONT, 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  const notaLegal = 'Este documento constituye un registro interno de cierre contable y operativo. ' +
    'Los datos aquí presentados fueron generados automáticamente a partir de los módulos activos ' +
    'del sistema y representan fielmente la información registrada en el período indicado. ' +
    'La veracidad de los datos es responsabilidad de los usuarios que los ingresaron.';
  const notaLines = doc.splitTextToSize(notaLegal, pageW - PAGE_MARGIN * 2);
  doc.text(notaLines, PAGE_MARGIN, y);
  y += notaLines.length * 4 + 16;

  // Líneas de firma
  const firmaWidth = (pageW - PAGE_MARGIN * 2 - 20) / 2;

  // Firma 1: Responsable
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, y, PAGE_MARGIN + firmaWidth, y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.dark);
  doc.text('Responsable del Cierre', PAGE_MARGIN, y + 6);
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mid);
  doc.text(usuario || '_______________________', PAGE_MARGIN, y + 11);
  doc.text('Fecha: _______________', PAGE_MARGIN, y + 16);

  // Firma 2: Contador / Gerente
  const firma2X = PAGE_MARGIN + firmaWidth + 20;
  doc.line(firma2X, y, firma2X + firmaWidth, y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.dark);
  doc.text('Contador / Gerente', firma2X, y + 6);
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mid);
  doc.text('_______________________', firma2X, y + 11);
  doc.text('Fecha: _______________', firma2X, y + 16);

  // Sello
  y += 40;
  doc.setDrawColor(...COLORS.light);
  doc.setLineWidth(0.5);
  doc.roundedRect(PAGE_MARGIN, y, 50, 30, 2, 2);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mid);
  doc.text('Sello de la Empresa', PAGE_MARGIN + 25, y + 15, { align: 'center' });

  // Info empresa
  if (org.legalName || org.nit) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.gray);
    if (org.legalName) doc.text(org.legalName, PAGE_MARGIN + 60, y + 10);
    if (org.nit) doc.text(`NIT: ${org.nit}`, PAGE_MARGIN + 60, y + 16);
    if (org.address) doc.text(org.address, PAGE_MARGIN + 60, y + 22);
    if (org.city) doc.text(org.city, PAGE_MARGIN + 60, y + 28);
  }
}

// ---- API pública ----

export const pdfExportService = {
  /**
   * Genera y descarga el PDF de un reporte individual.
   * Archivo: {org}_{reporte-id}_{periodo}.pdf
   */
  descargarReporte(reporte: ReportData, org: OrganizationInfo, comparisonData?: ReportData): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    drawHeader(doc, org, reporte.titulo, reporte.periodo);

    let y = HEADER_HEIGHT + 4;

    // KPIs
    if (reporte.kpis.length) {
      y = drawKPIs(doc, reporte.kpis, y);
    }

    // KPIs de comparación
    if (comparisonData?.kpis.length) {
      doc.setFont(FONT, 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.gray);
      doc.text(`Comparación: ${comparisonData.periodo.etiqueta}`, PAGE_MARGIN, y);
      y += 4;
      y = drawKPIs(doc, comparisonData.kpis, y);
    }

    // Tabla
    drawTabla(doc, reporte, y);

    // Tabla de comparación en nueva página
    if (comparisonData && comparisonData.filas.length) {
      doc.addPage();
      drawHeader(doc, org, `${reporte.titulo} — Comparación`, comparisonData.periodo);
      drawTabla(doc, comparisonData, HEADER_HEIGHT + 4);
    }

    // Footer en todas las páginas
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(doc);
    }

    const filename = `${sanitizeFilename(org.name)}_${reporte.id}_${reporte.periodo.fechaInicio}${comparisonData ? '_comparacion' : ''}.pdf`;
    doc.save(filename);
  },

  /**
   * Genera y descarga el PDF maestro de cierre consolidado.
   * Diseño profesional unificado: portada + resumen ejecutivo + índice +
   * secciones agrupadas por categoría + totales consolidados + firmas.
   */
  async descargarCierreConsolidado(cierre: CierreConsolidado): Promise<void> {
    const { periodo, reportes, org } = cierre;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const ahora = new Date();
    const docNum = cierre.docNum || `CIERRE-${periodo.tipo.toUpperCase()}-${periodo.fechaInicio.replace(/-/g, '')}-001`;
    const usuario = cierre.usuario;

    // Cargar logo si existe
    let logoDataUrl: string | null = null;
    if (org.logoUrl) {
      logoDataUrl = await loadImageAsDataUrl(org.logoUrl);
    }

    // Agrupar reportes por categoría
    const categorias = agruparPorCategoria(reportes);

    // ====== PÁGINA 1: PORTADA ======
    drawPortada(doc, org, periodo, ahora, docNum, usuario, reportes.length, logoDataUrl);

    // ====== PÁGINA 2: RESUMEN EJECUTIVO ======
    doc.addPage();
    drawResumenEjecutivo(doc, org, reportes, periodo, pageW, pageH);

    // ====== PÁGINA 3: ÍNDICE ======
    const indicePageNum = doc.getNumberOfPages() + 1;
    doc.addPage();
    const seccionPageMap: { titulo: string; categoria: string; page: number }[] = [];

    // ====== SECCIONES POR CATEGORÍA ======
    categorias.forEach(({ categoria, nombre, items }) => {
      doc.addPage();
      seccionPageMap.push({ titulo: nombre, categoria, page: doc.getNumberOfPages() });

      // Header de sección
      drawSectionHeader(doc, nombre, items.length);

      let y = 52;

      // Análisis de la sección: encontrar KPI más relevante
      const allKpis = items.flatMap((r) => r.kpis);
      const kpisMoneda = allKpis.filter((k) => k.formato === 'moneda' && typeof k.valor === 'number');
      const kpisNum = allKpis.filter((k) => typeof k.valor === 'number');

      // Comentario analítico de la sección
      if (kpisMoneda.length) {
        const mayor = kpisMoneda.reduce((a, b) => (Number(a.valor) > Number(b.valor) ? a : b));
        doc.setFont(FONT, 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.gray);
        const analisis = `El indicador más relevante de esta sección es "${mayor.titulo}" con ${formatValorKPI(mayor.valor, mayor.formato)}. ` +
          `Se procesaron ${items.length} reporte${items.length > 1 ? 's' : ''} con un total de ${items.reduce((s, r) => s + r.filas.length, 0)} registros.`;
        const analisisLines = doc.splitTextToSize(analisis, pageW - PAGE_MARGIN * 2);
        doc.text(analisisLines, PAGE_MARGIN, y);
        y += analisisLines.length * 4 + 4;
      }

      // KPIs consolidados de todos los reportes de esta categoría
      if (allKpis.length) {
        y = drawKPIs(doc, allKpis.slice(0, 6), y);
        if (allKpis.length > 6) {
          y = drawKPIs(doc, allKpis.slice(6, 12), y);
        }
      }

      // Tabla consolidada: unir todos los reportes de la categoría
      if (items.length === 1) {
        y = drawTabla(doc, items[0], y);
      } else {
        // Verificar si las columnas son compatibles
        const mismasColumnas = items.every((r) =>
          JSON.stringify(r.columnas.map((c) => c.key)) ===
          JSON.stringify(items[0].columnas.map((c) => c.key))
        );

        if (mismasColumnas && items[0].filas.length > 0) {
          // Fusionar filas de todos los reportes
          const consolidado: ReportData = {
            ...items[0],
            titulo: `${nombre} — Consolidado`,
            filas: items.flatMap((r) => r.filas),
            totales: consolidarTotales(items),
            kpis: [],
          };
          y = drawTabla(doc, consolidado, y);

          // Análisis max/min en tabla consolidada
          const primeraColNum = items[0].columnas.find((c) => c.tipo === 'moneda' || c.tipo === 'numero');
          if (primeraColNum) {
            const maxMin = findMaxMin(consolidado.filas, primeraColNum.key);
            if (maxMin && y + 12 < pageH - 20) {
              doc.setFont(FONT, 'normal');
              doc.setFontSize(7);
              doc.setTextColor(...COLORS.mid);
              doc.text(
                `▲ Máx: ${formatCelda(maxMin.max, primeraColNum.tipo)}  |  ▼ Mín: ${formatCelda(maxMin.min, primeraColNum.tipo)}`,
                PAGE_MARGIN, y,
              );
              y += 6;
            }
          }
        } else {
          // Tablas separadas dentro de la misma página
          items.forEach((r) => {
            if (r.filas.length === 0) return;
            if (y > pageH - 60) {
              doc.addPage();
              y = 20;
            }
            // Sub-título del reporte
            doc.setFont(FONT, 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...COLORS.dark);
            doc.text(r.titulo, PAGE_MARGIN, y);
            y += 4;
            y = drawTabla(doc, r, y);

            // Análisis max/min
            const colNum = r.columnas.find((c) => c.tipo === 'moneda' || c.tipo === 'numero');
            if (colNum && y + 10 < pageH - 20) {
              const maxMin = findMaxMin(r.filas, colNum.key);
              if (maxMin) {
                doc.setFont(FONT, 'normal');
                doc.setFontSize(7);
                doc.setTextColor(...COLORS.mid);
                doc.text(
                  `▲ Máx: ${formatCelda(maxMin.max, colNum.tipo)}  |  ▼ Mín: ${formatCelda(maxMin.min, colNum.tipo)}`,
                  PAGE_MARGIN, y,
                );
                y += 6;
              }
            }
            y += 3;
          });
        }
      }
    });

    // ====== PÁGINA: TOTALES CONSOLIDADOS ======
    doc.addPage();
    drawTotalesConsolidados(doc, org, reportes, periodo, pageW, pageH);

    // ====== PÁGINA: FIRMAS Y VERIFICACIÓN ======
    doc.addPage();
    drawPaginaFirmas(doc, org, periodo, docNum, usuario, reportes);

    // ====== ACTUALIZAR ÍNDICE CON NÚMEROS DE PÁGINA ======
    const totalPaginas = doc.getNumberOfPages();
    doc.setPage(indicePageNum);
    drawIndice(doc, seccionPageMap, totalPaginas, pageW, pageH);

    // ====== FOOTER EN TODAS LAS PÁGINAS ======
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      drawFooter(doc);
    }

    const filename = `${sanitizeFilename(org.name)}_cierre-consolidado_${periodo.fechaInicio}.pdf`;
    doc.save(filename);
  },
};
