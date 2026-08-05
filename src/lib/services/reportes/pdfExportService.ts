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
  nit?: string;
  city?: string;
  logoUrl?: string;
}

export interface CierreConsolidado {
  periodo: PeriodoCierre;
  reportes: ReportData[];
  org: OrganizationInfo;
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

// ---- API pública ----

export const pdfExportService = {
  /**
   * Genera y descarga el PDF de un reporte individual.
   * Archivo: {org}_{reporte-id}_{periodo}.pdf
   */
  descargarReporte(reporte: ReportData, org: OrganizationInfo, usuario?: string): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    drawHeader(doc, org, reporte.titulo, reporte.periodo, usuario);

    let y = HEADER_HEIGHT + 4;

    // KPIs
    if (reporte.kpis.length) {
      y = drawKPIs(doc, reporte.kpis, y);
    }

    // Tabla
    drawTabla(doc, reporte, y);

    // Footer en todas las páginas
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(doc);
    }

    const filename = `${sanitizeFilename(org.name)}_${reporte.id}_${reporte.periodo.fechaInicio}.pdf`;
    doc.save(filename);
  },

  /**
   * Genera y descarga el PDF maestro de cierre consolidado.
   * Portada B/N + índice + una sección por reporte.
   */
  descargarCierreConsolidado(cierre: CierreConsolidado, usuario?: string): void {
    const { periodo, reportes, org } = cierre;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // ---- Portada ----
    doc.setFillColor(...COLORS.black);
    doc.rect(0, 0, pageW, 40, 'F');

    doc.setFont(FONT, 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...COLORS.white);
    doc.text(org.name || 'Organización', PAGE_MARGIN, 20);

    doc.setFontSize(10);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLORS.light);
    const subLine = [org.nit && `NIT ${org.nit}`, org.city].filter(Boolean).join(' · ');
    if (subLine) doc.text(subLine, PAGE_MARGIN, 27);

    doc.setFontSize(16);
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...COLORS.black);
    doc.text('Cierre Consolidado', PAGE_MARGIN, 60);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.gray);
    doc.text(`Período: ${formatDateRange(periodo)}`, PAGE_MARGIN, 67);
    doc.text(`Tipo: ${periodo.etiqueta}`, PAGE_MARGIN, 72);

    const ahora = new Date();
    doc.text(
      `Generado: ${ahora.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}${usuario ? ` por ${usuario}` : ''}`,
      PAGE_MARGIN,
      77,
    );

    // Índice
    doc.setFont(FONT, 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.dark);
    doc.text('Índice de Reportes', PAGE_MARGIN, 90);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.gray);
    reportes.forEach((r, i) => {
      const y = 96 + i * 5;
      if (y > pageH - 20) return;
      doc.text(`${i + 1}. ${r.titulo}`, PAGE_MARGIN + 4, y);
      doc.text(`(${r.modulo})`, pageW - PAGE_MARGIN, y, { align: 'right' });
    });

    drawFooter(doc);

    // ---- Una página por reporte ----
    reportes.forEach((reporte) => {
      doc.addPage();
      drawHeader(doc, org, reporte.titulo, periodo, usuario);

      let y = HEADER_HEIGHT + 4;

      if (reporte.kpis.length) {
        y = drawKPIs(doc, reporte.kpis, y);
      }

      drawTabla(doc, reporte, y);
      drawFooter(doc);
    });

    // Footer en todas las páginas
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(doc);
    }

    const filename = `${sanitizeFilename(org.name)}_cierre-consolidado_${periodo.fechaInicio}.pdf`;
    doc.save(filename);
  },
};
