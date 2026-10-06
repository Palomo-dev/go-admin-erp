/**
 * GET /api/sitio-web/carta/qr.pdf?branch_id&por=mesa|zona&modo=pedir|ver&clave=
 * Hoja imprimible de la Carta QR (Figma B/13-03 «Así se imprime (A6, 4 por
 * hoja)»): cada código en un cuarto de A4 con el nombre del sitio, la mesa o
 * zona, la sede y la dirección corta. Con `clave`, solo ese código.
 *
 * Se arma en el servidor con los datos de la sesión (mesas de
 * `restaurant_tables` de la organización) y el codificador QR local
 * (`codificarQr`): ninguna URL ni dato sale hacia un tercero.
 */
import { jsPDF } from 'jspdf';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { codificarQr } from '@/lib/documents/qr';
import { elementosQr, type QrModo, type QrPor } from '@/lib/website/carta';
import { mesasQr, respuestaErrorCarta } from '@/lib/website/carta.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RUTA = 'sitio-web/carta/qr.pdf';
const A4 = { ancho: 210, alto: 297 };
const TINTA: [number, number, number] = [15, 23, 42];
const PIZARRA: [number, number, number] = [71, 85, 105];

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const q = new URL(request.url).searchParams;
    const sedeId = Number(q.get('branch_id'));
    const por: QrPor = q.get('por') === 'zona' ? 'zona' : 'mesa';
    const modo: QrModo = q.get('modo') === 'ver' ? 'ver' : 'pedir';
    const clave = q.get('clave');
    const datos = await mesasQr(ctx, Number.isInteger(sedeId) && sedeId > 0 ? sedeId : null);
    const sede = datos.sedes.find((s) => s.id === datos.sedeId)?.nombre ?? '';
    const todos = elementosQr(datos.mesas, { por, modo, urlGeneral: datos.urlGeneral, sede, sinZona: 'Sin zona' });
    const elementos = clave ? todos.filter((e) => e.clave === clave) : todos;
    if (elementos.length === 0) {
      return Response.json({ error: 'No hay códigos para imprimir en esta sede.', codigo: 'sin_mesas' }, { status: 404 });
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const celda = { ancho: A4.ancho / 2, alto: A4.alto / 2 };
    elementos.forEach((e, i) => {
      if (i > 0 && i % 4 === 0) doc.addPage();
      const col = i % 2;
      const fila = Math.floor((i % 4) / 2);
      const x0 = col * celda.ancho;
      const y0 = fila * celda.alto;
      // Guías de corte.
      doc.setDrawColor(226, 232, 240);
      doc.rect(x0 + 4, y0 + 4, celda.ancho - 8, celda.alto - 8);

      const matriz = codificarQr(e.url, 'M');
      const lado = 70;
      const modulo = lado / matriz.tamano;
      const qx = x0 + (celda.ancho - lado) / 2;
      const qy = y0 + 22;
      doc.setFillColor(...TINTA);
      matriz.modulos.forEach((filaModulos, y) =>
        filaModulos.forEach((oscuro, x) => {
          if (oscuro) doc.rect(qx + x * modulo, qy + y * modulo, modulo, modulo, 'F');
        }),
      );

      const centro = x0 + celda.ancho / 2;
      doc.setTextColor(...TINTA);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(e.titulo, centro, qy + lado + 12, { align: 'center', maxWidth: celda.ancho - 16 });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...PIZARRA);
      doc.text(e.detalle, centro, qy + lado + 19, { align: 'center', maxWidth: celda.ancho - 16 });
      doc.setFontSize(9);
      doc.text(e.url.replace(/^https?:\/\//, ''), centro, qy + lado + 25, { align: 'center', maxWidth: celda.ancho - 16 });
      doc.setTextColor(...TINTA);
      doc.setFontSize(12);
      doc.text(modo === 'pedir' && por === 'mesa' ? 'Escanea para ver la carta y pedir' : 'Escanea para ver la carta', centro, qy + lado + 34, {
        align: 'center',
      });
    });

    const bytes = doc.output('arraybuffer');
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="carta-qr${clave ? '' : '-todas'}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});
