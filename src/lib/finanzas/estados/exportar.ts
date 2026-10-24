/**
 * Excel y PDF de un informe, y un solo PDF con el paquete de estados.
 * Los pesos ya vienen enteros del motor.
 */

import { descargarExcel, descargarPdf } from '@/lib/finanzas/reportes/exportarReporte';
import type { InformeResultado } from './tipos';

function celda(valor: string | number | null | undefined): string | number {
  if (valor == null || valor === '') return '';
  return valor;
}

function filasPlanas(informe: InformeResultado): Record<string, string | number>[] {
  return informe.filas.map((fila) => {
    const plana: Record<string, string | number> = {};
    for (const columna of informe.columnas) plana[columna.titulo] = celda(fila[columna.key] as string | number | null);
    return plana;
  });
}

export async function exportarExcel(informe: InformeResultado): Promise<void> {
  await descargarExcel(informe.titulo, filasPlanas(informe));
}

export async function exportarPdf(informe: InformeResultado): Promise<void> {
  await descargarPdf(
    informe.titulo,
    informe.titulo,
    informe.columnas.map((c) => c.titulo),
    informe.filas.map((fila) => informe.columnas.map((c) => celda(fila[c.key] as string | number | null))),
  );
}

export async function exportarPaquete(informes: InformeResultado[], entidad: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  informes.forEach((informe, indice) => {
    if (indice > 0) doc.addPage();
    doc.setFontSize(11);
    doc.text(entidad || 'Estados financieros', 40, 32);
    doc.setFontSize(14);
    doc.text(informe.titulo, 40, 52);
    autoTable(doc, {
      head: [informe.columnas.map((c) => c.titulo)],
      body: informe.filas.map((fila) => informe.columnas.map((c) => celda(fila[c.key] as string | number | null))),
      startY: 68,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 120] },
    });
    const lectura = informe.lectura.filter(Boolean).join(' ');
    if (lectura) {
      const ultimo = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80;
      doc.setFontSize(9);
      doc.text(doc.splitTextToSize(lectura, 760), 40, ultimo + 18);
    }
  });
  doc.save('estados-financieros.pdf');
}
