/**
 * Después de crear el sitio con la plantilla, intenta la versión de IA.
 * Solo reemplaza si el hash del body sigue siendo el generado: un texto
 * editado no se toca. No cobra. Sin OPENAI_API_KEY no hace nada.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { DOCUMENTOS_LEGALES, type ClaveLegal } from '@/lib/website/configuracionSitio';
import { guardarBorrador, listarSitios, obtenerBorrador } from '@/lib/services/website/siteDocumentService';
import { ajustarMenusLegales, colocarDocumentoLegal, paginaPorClave } from '@/lib/website/legales/documentoLegal';
import { generarDocumentoLegal } from '@/lib/website/legales/generarDocumentoLegal';
import { fueEditado } from '@/lib/website/legales/plantillasLegales';

export async function mejorarLegalesPendientes(supabase: SupabaseClient, orgId: number, branchId: number | null): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;
  const sitio = (await listarSitios(supabase, orgId)).find((s) => s.branchId === branchId);
  if (!sitio) return;
  const borrador = await obtenerBorrador(supabase, orgId, sitio.id);
  let doc = borrador.documento;
  const ahora = new Date().toISOString();
  let cambio = false;
  const muestra = await generarDocumentoLegal(orgId, 'terminos', { modo: 'auto', cobrar: false, supabase, branchId });
  const claves = DOCUMENTOS_LEGALES.map((d) => d.clave).filter((c) => c !== 'envios' || muestra.incluyeEnvios);
  for (const clave of claves) {
    const pagina = paginaPorClave(doc.paginas, clave);
    const bloque = pagina?.secciones.find((s) => s.tipo === 'text_block');
    if (bloque && fueEditado(bloque.contenido)) continue;
    const generado = clave === 'terminos' ? muestra : await generarDocumentoLegal(orgId, clave as ClaveLegal, { modo: 'auto', cobrar: false, supabase, branchId });
    if (generado.origen !== 'ia') continue;
    const puesto = colocarDocumentoLegal(doc, clave, generado, ahora, () => crypto.randomUUID(), { forzar: false });
    if (puesto.accion === 'omitida') continue;
    doc = puesto.documento;
    cambio = true;
  }
  if (!cambio) return;
  const menu = ajustarMenusLegales(doc, () => crypto.randomUUID());
  const validado = validarDocumentoSitio(menu.documento);
  if (!validado.ok) return;
  const vigente = await obtenerBorrador(supabase, orgId, sitio.id);
  if (vigente.version !== borrador.version) return;
  await guardarBorrador(supabase, orgId, sitio.id, validado.documento as DocumentoSitio, vigente.version);
}
