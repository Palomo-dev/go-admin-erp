'use client';

/**
 * Cliente del navegador de `/api/website/carta-sede` para el constructor de la carta: la MISMA
 * ruta y el mismo servicio que la pantalla «Carta por sede» (`cartaSedeService`). Precio web,
 * agotado (con «hasta») y oculto se escriben en `website_branch_products`; el precio base lo
 * resuelve el servicio desde Inventario y la sede. Aquí no se calcula ningún precio.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  CambioProducto,
  ProductoCartaSede,
  RespuestaListadoCartaSede,
  ResultadoEscrituraCartaSede,
} from '@/lib/services/website/cartaSede';

const RUTA = '/api/website/carta-sede';
/** Páginas de 50 que se piden por categoría (≈ 500 platos). */
const MAX_PAGINAS = 10;

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function error(res: Response): Promise<Error> {
  const cuerpo = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(cuerpo.error || `HTTP ${res.status}`);
}

export interface DatosSede {
  productos: Map<number, ProductoCartaSede>;
  puedeEditar: boolean;
  hoy: string;
}

/** Precio vigente y ajuste de la sede de los platos de esas categorías. */
export async function leerCartaDeSede(branchId: number, categorias: number[]): Promise<DatosSede> {
  const productos = new Map<number, ProductoCartaSede>();
  let puedeEditar = false;
  let hoy = '';
  for (const categoria of categorias.slice(0, 100)) {
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const q = new URLSearchParams({ branch_id: String(branchId), category_id: String(categoria), pagina: String(pagina) });
      const res = await fetch(`${RUTA}?${q.toString()}`, { credentials: 'same-origin', headers: cabeceras() });
      if (!res.ok) throw await error(res);
      const datos = (await res.json()) as RespuestaListadoCartaSede;
      puedeEditar = datos.puedeEditar;
      hoy = datos.hoy;
      datos.productos.forEach((p) => productos.set(p.id, p));
      if (pagina * datos.tamano >= datos.total) break;
    }
  }
  return { productos, puedeEditar, hoy };
}

export async function guardarCartaDeSede(branchId: number, cambios: CambioProducto[]): Promise<ResultadoEscrituraCartaSede> {
  const res = await fetch(RUTA, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify({ tipo: 'productos', branch_id: branchId, cambios }),
  });
  if (!res.ok) throw await error(res);
  return (await res.json()) as ResultadoEscrituraCartaSede;
}
