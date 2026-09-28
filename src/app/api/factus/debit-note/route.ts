/**
 * API Route: nota débito electrónica
 * POST /api/factus/debit-note
 *
 * DESHABILITADA (2026-09-23) hasta que exista la nota débito como documento.
 * La versión anterior enviaba a Factus los `items` crudos del body, en el
 * formato v1, con el CUFE vacío si faltaba, y guardaba el job contra la
 * factura original: no había un documento de nota débito que numerar,
 * contabilizar ni reenviar. Ninguna pantalla la llamaba y en la base hay 0
 * notas débito. Cuando se modele (ver docs/design/FINANZAS-DOCUMENTOS-FIGMA.md
 * §4.4), se envía por la cola (`colaFacturacion`) como la factura y la nota
 * crédito, con las credenciales de la organización.
 */

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';

export const POST = withOrg(async () => {
  return NextResponse.json(
    {
      error: 'La nota débito electrónica todavía no está disponible.',
      code: 'DEBIT_NOTE_NOT_AVAILABLE',
    },
    { status: 501 },
  );
});
