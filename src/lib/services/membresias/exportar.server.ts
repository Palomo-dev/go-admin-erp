/**
 * Exportar listados de Membresías (§12.3) — lado del servidor.
 *
 * Reutiliza las MISMAS lecturas que las pantallas (`listarMembresias`, `listarMiembros`,
 * `listarPagos`) con los filtros que llegan de la URL, así que el archivo respeta la búsqueda y los
 * filtros vigentes; recorre las páginas hasta `MAX_FILAS_EXPORTACION`. Organización de la sesión
 * (`ctx`, de `withOrg`) y permiso `memberships.view` resuelto en el servidor.
 */
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { defaultLocale, isValidLocale, type Locale } from '@/i18n/config';
import { localeIntl } from '@/components/kit/idioma';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { todayInTz } from '@/lib/utils/dateCore';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { construirCsv, MAX_FILAS_EXPORTACION, nombreArchivo, type Traductor } from './exportarCsv';
import { exigir, listarMembresias, listarMiembros, listarPagos, zonaDe, type FiltrosMembresias } from './membresias.server';
import type { MembresiaFila, MiembroFila, PagoFila, TipoExportacion } from './tipos';

const POR_PAGINA = 100;

export interface FiltrosExportacion {
  membresias?: Omit<FiltrosMembresias, 'pagina' | 'porPagina' | 'soloFilas'>;
  miembros?: { q?: string; estado?: 'todos' | 'con_vigente' | 'sin_vigente' };
  pagos?: { desde?: string; hasta?: string };
}

export interface ArchivoExportado {
  nombre: string;
  contenido: string;
  filas: number;
  /** true si el listado tenía más filas que `MAX_FILAS_EXPORTACION`. */
  truncado: boolean;
}

async function traductor(idioma: string | null | undefined): Promise<{ t: Traductor; locale: Locale }> {
  const locale: Locale = idioma && isValidLocale(idioma) ? idioma : defaultLocale;
  const mod = (await import(`../../../../messages/${locale}.json`)) as { default?: AbstractIntlMessages } & AbstractIntlMessages;
  const messages = (mod.default ?? mod) as AbstractIntlMessages;
  const t = createTranslator({ locale, messages }) as unknown as Traductor;
  return { t, locale };
}

/** Recorre las páginas de una lectura hasta el tope. */
async function todas<T>(leer: (pagina: number) => Promise<{ filas: T[]; total: number }>): Promise<{ filas: T[]; total: number }> {
  const filas: T[] = [];
  let total = 0;
  for (let pagina = 1; filas.length < MAX_FILAS_EXPORTACION; pagina += 1) {
    const r = await leer(pagina);
    total = r.total;
    filas.push(...r.filas);
    if (r.filas.length < POR_PAGINA || filas.length >= r.total) break;
  }
  return { filas: filas.slice(0, MAX_FILAS_EXPORTACION), total };
}

export async function exportarListado(
  ctx: ServerOrgContext,
  tipo: TipoExportacion,
  filtros: FiltrosExportacion,
  idioma?: string | null,
): Promise<ArchivoExportado> {
  await exigir(ctx, 'ver');
  const [zona, moneda, { t, locale }] = await Promise.all([
    zonaDe(ctx),
    resolveOrgCurrency(ctx.supabase, ctx.organizationId),
    traductor(idioma),
  ]);

  let datos: { filas: MembresiaFila[] | MiembroFila[] | PagoFila[]; total: number };
  if (tipo === 'membresias') {
    datos = await todas((pagina) =>
      listarMembresias(ctx, { ...(filtros.membresias ?? {}), pagina, porPagina: POR_PAGINA, soloFilas: true }),
    );
  } else if (tipo === 'miembros') {
    datos = await todas((pagina) => listarMiembros(ctx, { ...(filtros.miembros ?? {}), pagina, porPagina: POR_PAGINA }));
  } else {
    datos = await todas((pagina) => listarPagos(ctx, { ...(filtros.pagos ?? {}), pagina, porPagina: POR_PAGINA, soloFilas: true }));
  }

  const contenido = construirCsv(tipo, datos.filas, { t, zona, locale: localeIntl(locale), moneda: moneda.code });
  return {
    nombre: nombreArchivo(tipo, todayInTz(zona), t),
    contenido,
    filas: datos.filas.length,
    truncado: datos.total > datos.filas.length,
  };
}
