'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { HojaEtiquetas } from '@/components/kit';
import {
  CLAVE_TRABAJO_ETIQUETAS,
  contarPaginas,
  distribuirEnPaginas,
  esTrabajoValido,
  plantillaPorId,
  tamanoPagina,
  type TrabajoImpresionEtiquetas,
} from '@/lib/utils/etiquetasImpresion';

/**
 * Página de impresión de etiquetas de producto (fuera del shell de /app).
 *
 * El diálogo «Imprimir etiquetas» deja el trabajo ya resuelto en el
 * almacenamiento local (textos, precios con la moneda de la organización,
 * códigos) y abre esta página. Aquí solo se maqueta con `@page` al tamaño de
 * la hoja o del rollo, se esperan las barras (JsBarcode, sin red) y, si se
 * pidió, se abre el diálogo de impresión del navegador (que también guarda
 * PDF). No lee la base de datos.
 */
function PaginaEtiquetas() {
  const t = useTranslations('inventarioEtiquetas.pagina');
  const td = useTranslations('inventarioEtiquetas.doc');
  const params = useSearchParams();
  const id = params?.get('trabajo') ?? '';
  const [trabajo, setTrabajo] = useState<TrabajoImpresionEtiquetas | null | undefined>(undefined);
  const listas = useRef(0);
  const impreso = useRef(false);

  useEffect(() => {
    try {
      const crudo = id ? localStorage.getItem(`${CLAVE_TRABAJO_ETIQUETAS}${id}`) : null;
      const leido: unknown = crudo ? JSON.parse(crudo) : null;
      setTrabajo(esTrabajoValido(leido) ? leido : null);
    } catch {
      setTrabajo(null);
    }
  }, [id]);

  const plantilla = plantillaPorId(trabajo?.plantillaId);
  const paginas = useMemo(
    () => (trabajo ? distribuirEnPaginas(trabajo.etiquetas, plantilla, trabajo.inicio) : []),
    [trabajo, plantilla],
  );
  const esperadas = trabajo?.campos.codigo ? trabajo.etiquetas.length : 0;
  const pagina = tamanoPagina(plantilla);

  const imprimir = useCallback(() => window.print(), []);

  const intentarImprimir = useCallback(() => {
    if (impreso.current || !trabajo?.imprimirAlAbrir) return;
    impreso.current = true;
    // Un cuadro para que el navegador pinte las barras antes del diálogo.
    requestAnimationFrame(() => setTimeout(() => window.print(), 150));
  }, [trabajo]);

  useEffect(() => {
    if (!trabajo) return;
    document.title = t('tituloDocumento', { n: trabajo.etiquetas.length });
    if (esperadas === 0) intentarImprimir();
    // Si alguna barra no avisa (código inválido), no se bloquea la impresión.
    const tope = setTimeout(intentarImprimir, 2500);
    return () => clearTimeout(tope);
  }, [trabajo, esperadas, intentarImprimir, t]);

  const alListo = useCallback(() => {
    listas.current += 1;
    if (listas.current >= esperadas) intentarImprimir();
  }, [esperadas, intentarImprimir]);

  if (trabajo === undefined) return null;

  if (trabajo === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3">
          <h1 className="text-lg font-semibold text-fg">{t('sinTrabajoTitulo')}</h1>
          <p className="text-sm text-fg-secondary">{t('sinTrabajo')}</p>
          <button
            type="button"
            onClick={() => window.close()}
            className="h-10 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover"
          >
            {t('cerrar')}
          </button>
        </div>
      </main>
    );
  }

  const hojas = contarPaginas(trabajo.etiquetas.length, plantilla, trabajo.inicio);

  return (
    <>
      <style>{`
        @page { size: ${pagina.anchoMm}mm ${pagina.altoMm}mm; margin: 0; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          /* Solo las hojas: avisos globales del layout (instalar app, toasts) no salen en papel. */
          body * { visibility: hidden !important; }
          .zona-impresion, .zona-impresion * { visibility: visible !important; }
          .zona-impresion { position: absolute; left: 0; top: 0; }
          .hoja-etiquetas { box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; }
          .hoja-etiquetas:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold text-fg">{t('titulo')}</h1>
          <p className="text-xs text-fg-secondary">
            {t('resumen', {
              n: trabajo.etiquetas.length,
              hojas,
              plantilla: t(`plantillas.${plantilla.id}`),
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('cerrar')}
        </button>
        <button
          type="button"
          onClick={imprimir}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover"
        >
          <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('imprimir')}
        </button>
      </header>
      <main className="zona-impresion flex flex-col items-center gap-6 bg-subtle py-6 print:block print:bg-white print:p-0">
        {paginas.map((celdas, i) => (
          <HojaEtiquetas
            // Cada hoja es una posición fija del trabajo.
            key={i}
            className="hoja-etiquetas shadow-md"
            plantilla={plantilla}
            celdas={celdas}
            campos={trabajo.campos}
            textoSinCodigo={td('sinCodigo')}
            textoInvalido={td('codigoInvalido')}
            onEtiquetaLista={alListo}
          />
        ))}
      </main>
    </>
  );
}

export default function ImprimirEtiquetasPage() {
  return (
    <Suspense fallback={null}>
      <PaginaEtiquetas />
    </Suspense>
  );
}
