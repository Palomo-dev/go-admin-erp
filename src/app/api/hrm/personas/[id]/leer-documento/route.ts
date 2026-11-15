/**
 * POST /api/hrm/personas/[id]/leer-documento
 *   { accion: 'leer', documento_id }      → campos propuestos por la IA (cobra solo si la lectura sirve)
 *   { accion: 'confirmar', documento_id, valores: { campo: valor } }
 *                                          → guarda SOLO los campos que la persona confirmó
 *
 * La auditoría dice «propuesto por IA, confirmado por …» (decisión 13): la
 * edición de identificación deja su fila y además una con `origen: propuesto_por_ia`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { leerDocumentoConIa, CAMPOS_LECTURA, type CampoLectura } from '@/lib/services/hrm/lecturaDocumentoIa.server';
import { guardarDatosSensibles } from '@/lib/services/hrm/datosSensiblesService.server';
import { registrarConfirmacionIa } from '@/lib/services/hrm/personasService.server';
import { parametroDeRuta, responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, contextoDePeticion, esFechaPlana, esUuid } from '@/lib/services/hrm/tipos';
import { esTipoDocumento, normalizarNumeroDocumento } from '@/lib/hrm/personas/catalogo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function partir(texto: string): [string, string | null] {
  const partes = texto.trim().split(/\s+/);
  return [partes[0] ?? '', partes.slice(1).join(' ') || null];
}

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const persona = await parametroDeRuta(routeParams, 'id');
    const b = await readOrgBody<{ accion?: unknown; documento_id?: unknown; valores?: unknown }>(ctx, req, {
      route: 'hrm/personas/leer-documento',
    });
    const peticion = contextoDePeticion(req);
    const documento = typeof b?.documento_id === 'string' ? b.documento_id : '';
    if (!esUuid(documento)) throw new HrmError(400, 'documento_invalido');

    if (b.accion === 'leer') {
      return NextResponse.json(await leerDocumentoConIa(ctx, persona, documento, peticion), { headers: SIN_CACHE });
    }
    if (b.accion !== 'confirmar' || !b.valores || typeof b.valores !== 'object') throw new HrmError(400, 'accion_invalida');

    const v = b.valores as Partial<Record<CampoLectura, unknown>>;
    const confirmados = CAMPOS_LECTURA.filter((c) => typeof v[c] === 'string' && (v[c] as string).trim() !== '');
    if (confirmados.length === 0) throw new HrmError(422, 'sin_campos');
    const identificacion: Record<string, string> = {};
    for (const c of confirmados) {
      const valor = (v[c] as string).trim().slice(0, 120);
      if (c === 'doc_type') {
        if (!esTipoDocumento(valor)) throw new HrmError(422, 'tipo_documento_invalido');
        identificacion.doc_type = valor;
      } else if (c === 'doc_number') identificacion.doc_number = normalizarNumeroDocumento(valor);
      else if (c === 'birth_date' || c === 'doc_issue_date') {
        if (!esFechaPlana(valor)) throw new HrmError(422, 'fecha_invalida');
        identificacion[c] = valor;
      } else if (c === 'doc_issue_place') identificacion.doc_issue_place = valor;
    }
    if (Object.keys(identificacion).length > 0) {
      await guardarDatosSensibles(ctx, persona, 'identificacion', { identificacion }, peticion);
    }
    if (confirmados.includes('nombres') || confirmados.includes('apellidos')) {
      const cambio: Record<string, string | null> = {};
      if (confirmados.includes('nombres')) [cambio.first_name, cambio.second_name] = partir(String(v.nombres));
      if (confirmados.includes('apellidos')) [cambio.last_name, cambio.second_last_name] = partir(String(v.apellidos));
      const { data, error } = await ctx.supabase
        .from('hr_people')
        .update({ ...cambio, updated_by: ctx.userId })
        .eq('id', persona)
        .eq('organization_id', ctx.organizationId)
        .select('id')
        .maybeSingle();
      if (error || !data) throw new HrmError(403, 'sin_permiso');
    }
    await registrarConfirmacionIa(ctx, persona, confirmados, documento, peticion);
    return NextResponse.json({ ok: true, campos: confirmados }, { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'leer-documento');
  }
});
