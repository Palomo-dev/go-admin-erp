'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { HojaRotulosA4 } from '@/components/logistica/rotulo/HojaRotulosA4';
import { RotuloEnvio } from '@/components/logistica/rotulo/RotuloEnvio';
import { leerTrabajoRotulos } from '@/components/logistica/rotulo/trabajoRotulos';
import { hojasA4, ROTULO_MM, TERMICA_MM, type TrabajoRotulos } from '@/lib/logistica/rotuloEnvio';

/**
 * Página de impresión de guías de Logística (fuera del shell de /app) — Figma «21 Logística»
 * 3226:15989. El PDF a tamaño real del formato elegido: 10 × 15 cm (uno por página), térmica de
 * 80 mm (72 mm útiles, una página por tiquete) o A4 con cuatro rótulos al 97 % y líneas de corte.
 *
 * El hook `useImpresionLogistica` deja el trabajo ya resuelto en el almacenamiento local y abre
 * esta página. Aquí solo se maqueta con `@page`, se esperan barras y logos y se abre el diálogo
 * de impresión del navegador (que también guarda PDF). No lee la base de datos.
 */
const PX_A_MM = 25.4 / 96;

function PaginaGuias() {
  const t = useTranslations('logistica.rotulo.pagina');
  const params = useSearchParams();
  const id = params?.get('trabajo') ?? '';
  const [trabajo, setTrabajo] = useState<TrabajoRotulos | null | undefined>(undefined);
  const [altoTermica, setAltoTermica] = useState<number | null>(null);
  const zona = useRef<HTMLElement>(null);
  const listas = useRef(0);
  const [barrasListas, setBarrasListas] = useState(false);
  const impreso = useRef(false);

  useEffect(() => {
    setTrabajo(leerTrabajoRotulos(id));
  }, [id]);

  const formato = trabajo?.formato ?? '10x15';
  const esperadas = trabajo?.rotulos.length ?? 0;

  const intentarImprimir = useCallback(() => {
    if (impreso.current) return;
    impreso.current = true;
    // Un cuadro para que el navegador pinte las barras antes del diálogo.
    requestAnimationFrame(() => setTimeout(() => window.print(), 150));
  }, []);

  useEffect(() => {
    if (!trabajo) return;
    document.title = t('tituloDocumento', { count: trabajo.rotulos.length, numero: trabajo.rotulos[0]?.guideNumber ?? '' });
    // Si alguna barra o logo no avisa, no se bloquea la impresión.
    const tope = setTimeout(() => setBarrasListas(true), 3000);
    return () => clearTimeout(tope);
  }, [trabajo, t]);

  // Térmica: una página por tiquete, tan alta como el tiquete más alto (el rollo no tiene alto fijo).
  useEffect(() => {
    if (!trabajo || formato !== '80mm' || !barrasListas || !zona.current) return;
    const altos = Array.from(zona.current.querySelectorAll<HTMLElement>('[data-rotulo-formato="80mm"]')).map((n) => n.getBoundingClientRect().height);
    setAltoTermica(Math.ceil(Math.max(60 / PX_A_MM, ...altos) * PX_A_MM) + 2);
  }, [trabajo, formato, barrasListas]);

  useEffect(() => {
    if (!barrasListas || !trabajo) return;
    if (formato === '80mm' && altoTermica == null) return;
    intentarImprimir();
  }, [barrasListas, trabajo, formato, altoTermica, intentarImprimir]);

  const alListo = useCallback(() => {
    listas.current += 1;
    if (listas.current >= esperadas) setBarrasListas(true);
  }, [esperadas]);

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

  const pagina =
    formato === 'a4'
      ? 'size: A4; margin: 0;'
      : formato === '80mm'
        ? `size: ${TERMICA_MM.ancho}mm ${altoTermica ?? 200}mm; margin: 0;`
        : `size: ${ROTULO_MM.ancho}mm ${ROTULO_MM.alto}mm; margin: 0;`;

  return (
    <>
      <style>{`
        @page { ${pagina} }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          /* Solo los rótulos: avisos globales del layout (instalar app, toasts) no salen en papel. */
          body * { visibility: hidden !important; }
          .zona-impresion, .zona-impresion * { visibility: visible !important; }
          .zona-impresion { position: absolute; left: 0; top: 0; }
          .pagina-guia { box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; break-inside: avoid; }
          .pagina-guia:last-child { break-after: auto; page-break-after: auto; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold text-fg">{t('titulo')}</h1>
          <p className="text-xs text-fg-secondary">
            {formato === 'a4'
              ? t('resumenA4', { count: trabajo.rotulos.length, hojas: hojasA4(trabajo.rotulos).length })
              : formato === '80mm'
                ? t('resumenTermica', { count: trabajo.rotulos.length })
                : t('resumen', { count: trabajo.rotulos.length })}
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
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover"
        >
          <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('imprimir')}
        </button>
      </header>
      <main ref={zona} className="zona-impresion flex flex-col items-center gap-6 bg-subtle py-6 print:block print:gap-0 print:bg-white print:p-0">
        {formato === 'a4'
          ? hojasA4(trabajo.rotulos).map((hoja, i) => <HojaRotulosA4 key={i} rotulos={hoja} className="pagina-guia shadow-md" onListo={alListo} />)
          : trabajo.rotulos.map((r, i) => (
              // Cada posición es una copia fija del trabajo (puede repetir el mismo envío).
              <div key={i} className="pagina-guia shadow-md" style={formato === '80mm' && altoTermica ? { height: `${altoTermica}mm`, background: '#fff' } : undefined}>
                <RotuloEnvio textos={r} formato={formato === '80mm' ? '80mm' : '10x15'} onListo={alListo} />
              </div>
            ))}
      </main>
    </>
  );
}

export default function ImprimirGuiasPage() {
  return (
    <Suspense fallback={null}>
      <PaginaGuias />
    </Suspense>
  );
}
