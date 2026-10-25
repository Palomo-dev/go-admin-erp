import { formatoCelda, type DocumentoInforme } from './catalogo';

/** El paquete comparte exactamente las tablas y notas que presenta la pantalla. */
export async function exportarInformesPDF(documentos: DocumentoInforme[], nombre: string, encabezado: string[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  for (const [indice, documento] of documentos.entries()) {
    if (indice > 0) pdf.addPage();
    let y = 15;
    const escribir = (texto: string, tamano = 10) => {
      pdf.setFontSize(tamano);
      const lineas = pdf.splitTextToSize(texto, 267) as string[];
      for (const linea of lineas) {
        if (y > 190) { pdf.addPage(); y = 15; }
        pdf.text(linea, 15, y);
        y += tamano === 14 ? 7 : 5;
      }
      y += 3;
    };
    escribir(documento.titulo, 14);
    encabezado.forEach((texto) => escribir(texto));
    documento.textos?.forEach((texto) => escribir(texto));
    documento.avisos?.forEach((texto) => escribir(`Observación: ${texto}`));
    for (const tabla of documento.tablas) {
      if (y > 170) { pdf.addPage(); y = 15; }
      escribir(tabla.titulo);
      autoTable(pdf, {
        startY: y,
        head: [tabla.columnas.map((columna) => columna.titulo)],
        body: tabla.filas.map((fila) => tabla.columnas.map((columna) => formatoCelda(fila[columna.clave], columna.formato))),
        styles: { fontSize: 8, cellPadding: 2 },
        margin: { left: 15, right: 15, top: 15, bottom: 15 },
      });
      y = (pdf as typeof pdf & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    }
  }
  pdf.save(`${nombre}.pdf`);
}

export async function exportarInformesExcel(documentos: DocumentoInforme[], nombre: string, encabezado: string[]) {
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  const usados = new Set<string>();
  for (const documento of documentos) {
    const datos: (string | number | null)[][] = [[documento.titulo], ...encabezado.map((texto) => [texto]), ...(documento.textos ?? []).map((texto) => [texto])];
    for (const tabla of documento.tablas) {
      datos.push([], [tabla.titulo], tabla.columnas.map((columna) => columna.titulo));
      for (const fila of tabla.filas) datos.push(tabla.columnas.map((columna) => {
        const valor = fila[columna.clave] ?? null;
        // Pesos enteros en el archivo, conservando cantidad/costo unitario donde corresponde.
        return typeof valor === 'number' && columna.formato === 'pesos' ? Math.round(valor) : valor;
      }));
    }
    for (const aviso of documento.avisos ?? []) datos.push([`Observación: ${aviso}`]);
    const base = documento.titulo.replace(/[\\/?*\[\]:]/g, '').slice(0, 27);
    let hoja = base;
    let i = 1;
    while (usados.has(hoja)) hoja = `${base} ${i++}`;
    usados.add(hoja);
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(datos), hoja);
  }
  XLSX.writeFile(libro, `${nombre}.xlsx`);
}
