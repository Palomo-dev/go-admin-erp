/**
 * Descarga de un reporte contable. Excel con la librería ya del repo y PDF
 * en horizontal para que quepan las columnas del balance.
 */

export interface ColumnaReporte {
  titulo: string;
  valor: (fila: Record<string, string | number>) => string | number;
}

export async function descargarExcel(
  nombre: string,
  filas: Record<string, string | number>[],
): Promise<void> {
  const XLSX = await import('xlsx');
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
  XLSX.writeFile(libro, nombre.endsWith('.xlsx') ? nombre : `${nombre}.xlsx`);
}

export async function descargarPdf(
  nombre: string,
  titulo: string,
  columnas: string[],
  filas: (string | number)[][],
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: columnas.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(12);
  doc.text(titulo, 40, 36);
  autoTable(doc, {
    head: [columnas],
    body: filas,
    startY: 52,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 120] },
  });
  doc.save(nombre.endsWith('.pdf') ? nombre : `${nombre}.pdf`);
}
