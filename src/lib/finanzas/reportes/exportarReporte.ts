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

/** Documento de texto con espacio para firmar. Las firmas las ponen sus titulares. */
export async function descargarPdfDocumento(
  nombre: string,
  encabezado: string,
  titulo: string,
  parrafos: string[],
  firmas: string[],
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth() - 96;
  let y = 64;
  doc.setFontSize(10);
  doc.text(encabezado, 48, y);
  y += 28;
  doc.setFontSize(14);
  doc.text(titulo, 48, y);
  y += 28;
  doc.setFontSize(11);
  for (const parrafo of parrafos) {
    const lineas = doc.splitTextToSize(parrafo, ancho) as string[];
    doc.text(lineas, 48, y);
    y += lineas.length * 15 + 12;
  }
  y += 60;
  doc.setFontSize(9);
  for (const firma of firmas) {
    doc.line(48, y, 288, y);
    doc.text(doc.splitTextToSize(firma, ancho) as string[], 48, y + 12);
    y += 72;
  }
  doc.save(nombre.endsWith('.pdf') ? nombre : `${nombre}.pdf`);
}
