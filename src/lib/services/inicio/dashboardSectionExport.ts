'use client';

/**
 * Helper base para exportar secciones del dashboard unificado a CSV y PDF.
 *
 * Diseño profesional: header con logo + nombre de organización + título de
 * sección + periodo, KPIs en cards, y tabla de datos consolidados.
 *
 * Reutiliza jsPDF + jspdf-autotable (ya usados en pdfExportService) y
 * papaparse para CSV. No depende de pdfExportService para mantener
 * desacoplado el dashboard unificado del módulo de reportes.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface SectionKPI {
  /** Etiqueta del KPI (ej: "Ventas hoy") */
  label: string;
  /** Valor formateado como string (ej: "$1.234,50", "12 clientes") */
  value: string;
  /** Variación opcional (ej: "+5,2%") */
  delta?: string;
  /** Clasificación para color en PDF: ingreso (verde), egreso (rojo), neutro (gris) */
  kind?: 'ingreso' | 'egreso' | 'neutro';
}

export interface SectionColumn {
  /** Key del campo en las filas */
  key: string;
  /** Header de la columna a mostrar */
  label: string;
  /** Alineación: 'left' | 'center' | 'right' (default: left) */
  align?: 'left' | 'center' | 'right';
}

export interface SectionDataRow {
  [key: string]: string | number | null | undefined;
}

export interface SectionExportData {
  /** Título de la sección (ej: "Dashboard Finanzas") */
  titulo: string;
  /** Subtítulo / periodo (ej: "Últimos 30 días") */
  periodo: string;
  /** KPIs a mostrar en la cabecera */
  kpis: SectionKPI[];
  /** Columnas de la tabla consolidada */
  columnas: SectionColumn[];
  /** Filas de la tabla consolidada */
  filas: SectionDataRow[];
}

export interface ExportOrganizationInfo {
  name: string;
  legalName?: string;
  nit?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
}

// ─── Constantes de layout PDF ────────────────────────────────────────────────

const PAGE_MARGIN = 14;
const HEADER_HEIGHT = 26;

// ─── Utilidades internas ─────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50) || 'organizacion';
}

function formatDateForFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
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

/**
 * Descarga un Blob como archivo en el navegador.
 * Usa setTimeout antes de revocar el object URL para evitar que
 * el navegador cancele la descarga en navegadores asíncronos (Chrome).
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Dar tiempo al navegador a iniciar la descarga antes de revocar
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── PDF: header + KPIs + tabla ──────────────────────────────────────────────

function drawHeader(
  doc: jsPDF,
  org: ExportOrganizationInfo,
  titulo: string,
  periodo: string,
  logoDataUrl: string | null,
): void {
  const pageW = doc.internal.pageSize.getWidth();

  // Logo
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, 8, 18, 14);
    } catch {
      // Si el logo falla, continuar sin él
    }
  }

  // Nombre organización
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(org.legalName || org.name, PAGE_MARGIN + 22, 13);

  // NIT + ciudad
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const orgMeta = [
    org.nit ? `NIT: ${org.nit}` : null,
    org.city ? org.city : null,
    org.phone ? `Tel: ${org.phone}` : null,
  ].filter(Boolean).join('  ·  ');
  if (orgMeta) doc.text(orgMeta, PAGE_MARGIN + 22, 18);

  // Título sección + periodo (alineado a la derecha)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(titulo, pageW - PAGE_MARGIN, 13, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(periodo, pageW - PAGE_MARGIN, 19, { align: 'right' });

  // Línea separadora
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, HEADER_HEIGHT, pageW - PAGE_MARGIN, HEADER_HEIGHT);
}

function drawKPIs(doc: jsPDF, kpis: SectionKPI[], startY: number): number {
  if (!kpis.length) return startY;

  const pageW = doc.internal.pageSize.getWidth();
  const usableW = pageW - PAGE_MARGIN * 2;
  const gap = 3;
  const cardH = 16;
  let y = startY + 2;
  let x = PAGE_MARGIN;

  // Si hay más de 4 KPIs, dibujar en filas de 4
  const filas = Math.ceil(kpis.length / 4);
  for (let fila = 0; fila < filas; fila++) {
    const inicio = fila * 4;
    const fin = Math.min(inicio + 4, kpis.length);
    const kpisFila = kpis.slice(inicio, fin);
    const cardsFila = kpisFila.length;
    const cardWFila = (usableW - gap * (cardsFila - 1)) / cardsFila;
    x = PAGE_MARGIN;

    for (const kpi of kpisFila) {
      // Fondo card
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, cardWFila, cardH, 1.5, 1.5, 'F');

      // Borde izquierdo de color según kind
      const color: [number, number, number] = kpi.kind === 'ingreso'
        ? [34, 197, 94]
        : kpi.kind === 'egreso'
          ? [239, 68, 68]
          : [148, 163, 184];
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(x, y, 0.8, cardH, 'F');

      // Label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label.toUpperCase(), x + 3, y + 5);

      // Value
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(kpi.value, x + 3, y + 11);

      // Delta
      if (kpi.delta) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.delta, x + 3, y + 14.5);
      }

      x += cardWFila + gap;
    }

    y += cardH + gap;
  }

  return y + 2;
}

function drawFooter(doc: jsPDF): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  const currentPage = doc.getCurrentPageInfo().pageNumber;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN, pageH - 10, pageW - PAGE_MARGIN, pageH - 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generado el ${new Date().toLocaleString('es')}`,
    PAGE_MARGIN,
    pageH - 6,
  );
  doc.text(
    `Página ${currentPage} de ${totalPages}`,
    pageW - PAGE_MARGIN,
    pageH - 6,
    { align: 'right' },
  );
}

// ─── API pública ─────────────────────────────────────────────────────────────

export const dashboardSectionExport = {
  /**
   * Exporta los datos de una sección del dashboard a CSV.
   * Incluye cabecera con título/periodo, KPIs y tabla consolidada.
   */
  exportToCSV(data: SectionExportData, orgName: string): void {
    const lines: string[][] = [];

    // Cabecera
    lines.push([data.titulo]);
    lines.push([data.periodo]);
    lines.push([`Organización: ${orgName}`]);
    lines.push([`Generado: ${new Date().toLocaleString('es')}`]);
    lines.push([]);

    // KPIs
    if (data.kpis.length) {
      lines.push(['KPIs']);
      lines.push(['Indicador', 'Valor', 'Variación']);
      data.kpis.forEach((k) => {
        lines.push([k.label, k.value, k.delta ?? '']);
      });
      lines.push([]);
    }

    // Tabla consolidada
    if (data.columnas.length && data.filas.length) {
      lines.push(['Detalle']);
      lines.push(data.columnas.map((c) => c.label));
      data.filas.forEach((fila) => {
        lines.push(data.columnas.map((c) => String(fila[c.key] ?? '')));
      });
    }

    const csv = Papa.unparse(lines);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const filename = `${sanitizeFilename(orgName)}_${sanitizeFilename(data.titulo)}_${formatDateForFilename()}.csv`;
    downloadBlob(blob, filename);
  },

  /**
   * Exporta los datos de una sección del dashboard a PDF profesional.
   * Header con logo + org + título, KPIs en cards, tabla consolidada con
   * autoTable, footer con paginación.
   */
  async exportToPDF(
    data: SectionExportData,
    org: ExportOrganizationInfo,
  ): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Cargar logo si existe
    let logoDataUrl: string | null = null;
    if (org.logoUrl) {
      logoDataUrl = await loadImageAsDataUrl(org.logoUrl);
    }

    drawHeader(doc, org, data.titulo, data.periodo, logoDataUrl);

    let y = HEADER_HEIGHT + 4;

    // KPIs
    if (data.kpis.length) {
      y = drawKPIs(doc, data.kpis, y);
    }

    // Tabla consolidada
    if (data.columnas.length && data.filas.length) {
      const head = [data.columnas.map((c) => c.label)];
      const body = data.filas.map((fila) =>
        data.columnas.map((c) => String(fila[c.key] ?? '')),
      );

      autoTable(doc, {
        startY: y,
        head,
        body,
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 2,
          lineColor: [226, 232, 240],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: Object.fromEntries(
          data.columnas.map((c, i) => [
            i,
            { halign: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left' },
          ]),
        ),
        didDrawPage: () => {
          drawFooter(doc);
        },
      });
    } else {
      drawFooter(doc);
    }

    // Footer en todas las páginas (incluida la primera si no hubo tabla)
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(doc);
    }

    const filename = `${sanitizeFilename(org.name)}_${sanitizeFilename(data.titulo)}_${formatDateForFilename()}.pdf`;
    doc.save(filename);
  },
};
