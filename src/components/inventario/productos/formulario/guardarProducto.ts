import { supabase } from '@/lib/supabase/config';
import { getBucketName } from '@/lib/supabase/imageUtils';
import { generarCodigosFaltantes } from '@/lib/services/codigosBarrasService';
import { avisarCambioCatalogo } from '@/lib/services/website/avisarCambioCatalogo';
import {
  aErrorProducto,
  ErrorProducto,
  productoService,
  type ModoFormularioProducto,
  type ResultadoGuardarProducto,
} from '@/lib/services/productoService';
import {
  construirPayload,
  rutaImagenProducto,
  type EstadoFormularioProducto,
} from '../logica/formularioProducto';

/**
 * Guardado del formulario único de producto:
 *
 * 1. revisión de códigos de barras (producto y variantes);
 * 2. subida de las imágenes nuevas y copia de las del original al duplicar
 *    (nunca se reutiliza el storage_path de otro producto);
 * 3. una sola RPC transaccional (`fn_producto_guardar`);
 * 4. si falla, se borra lo que se subió en el paso 2;
 * 5. si va bien, se borran del storage las imágenes quitadas, se numeran los
 *    códigos de las variantes (no heredan el del padre) y se avisa a la tienda.
 */

const BUCKET = 'product-images';

export interface RevisionCodigos {
  (organizationId: number, codigos: readonly (string | null | undefined)[], excluirIds?: number[]): Promise<{
    titulo: string;
    mensaje: string;
  } | null>;
}

export interface EntradaGuardado {
  organizacionId: number;
  estado: EstadoFormularioProducto;
  modo: ModoFormularioProducto;
  /** Editar: id del producto. */
  productId?: number;
  revisarCodigos: RevisionCodigos;
}

export type ResultadoGuardado =
  | { ok: true; resultado: ResultadoGuardarProducto; avisoCodigos: boolean }
  | { ok: false; tipo: 'codigos'; titulo: string; mensaje: string }
  | { ok: false; tipo: 'subida'; detalle: string }
  | { ok: false; tipo: 'rpc'; error: ErrorProducto };

const esUrlExterna = (ruta: string) => /^https?:\/\//i.test(ruta);

function aleatorio(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function borrarRutas(rutas: readonly string[]): Promise<void> {
  const porBucket = new Map<string, string[]>();
  for (const r of rutas) {
    if (!r || esUrlExterna(r)) continue;
    const b = getBucketName(r);
    porBucket.set(b, [...(porBucket.get(b) ?? []), r]);
  }
  await Promise.all(
    Array.from(porBucket.entries()).map(async ([bucket, lista]) => {
      try {
        await supabase.storage.from(bucket).remove(lista);
      } catch {
        // Un archivo huérfano no debe tumbar el guardado: se reporta en consola.
        console.warn('No se pudieron borrar del storage:', lista);
      }
    }),
  );
}

/** Copia una imagen del original a una ruta nueva del bucket de productos. */
async function copiarImagen(organizacionId: number, origen: string): Promise<string> {
  const destino = rutaImagenProducto(organizacionId, origen, aleatorio());
  const bucketOrigen = getBucketName(origen);
  if (bucketOrigen === BUCKET) {
    const { error } = await supabase.storage.from(BUCKET).copy(origen, destino);
    if (error) throw error;
    return destino;
  }
  // Otro bucket: copy no cruza buckets, se descarga y se sube.
  const { data, error } = await supabase.storage.from(bucketOrigen).download(origen);
  if (error || !data) throw error ?? new Error('descarga_vacia');
  const subida = await supabase.storage.from(BUCKET).upload(destino, data, { contentType: data.type || undefined });
  if (subida.error) throw subida.error;
  return destino;
}

export async function guardarProducto({
  organizacionId,
  estado,
  modo,
  productId,
  revisarCodigos,
}: EntradaGuardado): Promise<ResultadoGuardado> {
  // 1. Códigos de barras: formato, repetidos en el formulario y en la organización.
  const excluir =
    modo === 'editar' && productId
      ? [productId, ...estado.variantes.map((v) => v.id).filter((id): id is number => typeof id === 'number')]
      : [];
  const problema = await revisarCodigos(
    organizacionId,
    [estado.barcode, ...(estado.tiene_variantes ? estado.variantes.map((v) => v.barcode) : [])],
    excluir,
  );
  if (problema) return { ok: false, tipo: 'codigos', titulo: problema.titulo, mensaje: problema.mensaje };

  // 2. Imágenes nuevas y copias.
  const subidas: string[] = [];
  const rutas: Record<string, string> = {};
  try {
    for (const img of estado.imagenes) {
      if (img.id && modo === 'editar') continue;
      if (img.file && !img.storage_path) {
        const ruta = rutaImagenProducto(organizacionId, img.file.name, aleatorio());
        const { error } = await supabase.storage.from(BUCKET).upload(ruta, img.file, {
          contentType: img.file.type || undefined,
        });
        if (error) throw error;
        subidas.push(ruta);
        rutas[img.clave] = ruta;
      } else if (img.copiar_de) {
        if (esUrlExterna(img.copiar_de)) {
          rutas[img.clave] = img.copiar_de;
        } else {
          const ruta = await copiarImagen(organizacionId, img.copiar_de);
          subidas.push(ruta);
          rutas[img.clave] = ruta;
        }
      }
    }
  } catch (e) {
    await borrarRutas(subidas);
    return { ok: false, tipo: 'subida', detalle: e instanceof Error ? e.message : String(e) };
  }

  // 3. Una sola transacción.
  let resultado: ResultadoGuardarProducto;
  try {
    resultado = await productoService.guardar(
      organizacionId,
      construirPayload(estado, modo, { productId, rutas }),
    );
  } catch (e) {
    // 4. Nada quedó guardado: fuera lo que se subió.
    await borrarRutas(subidas);
    return {
      ok: false,
      tipo: 'rpc',
      error: e instanceof ErrorProducto ? e : aErrorProducto(e as { message?: string }),
    };
  }

  // 5. Después de guardar.
  await borrarRutas(resultado.imagenes_quitadas);
  let avisoCodigos = false;
  if (estado.tiene_variantes && estado.barcode.trim() && resultado.variantes.length > 0) {
    try {
      await generarCodigosFaltantes(organizacionId, [resultado.id], true);
    } catch (e) {
      // El producto ya quedó guardado; los códigos se pueden generar después.
      console.error('No se pudieron generar los códigos de las variantes:', e);
      avisoCodigos = true;
    }
  }
  avisarCambioCatalogo();
  return { ok: true, resultado, avisoCodigos };
}
