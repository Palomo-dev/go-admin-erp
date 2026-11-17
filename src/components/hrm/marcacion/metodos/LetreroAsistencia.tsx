'use client';

/**
 * Letrero para imprimir (Figma 20.27.10, A4): avisa en la entrada de la sede
 * cómo se registra la asistencia y qué se guarda (Ley 1581 de 2012). Fuera del
 * shell de /app. El nombre de la organización y el de la sede salen en tiempo
 * de ejecución (sesión y `GET /api/hrm/marcacion/metodos?sede=`); los iconos
 * son los métodos activos de la sede.
 *
 * El QR de «Política de datos» de la Figma se omite: ningún dato que ya llegue
 * al navegador trae la URL de la política de la organización.
 */
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LocateFixed, Nfc, Printer, ScanQrCode, X, type LucideIcon } from 'lucide-react';
import { EmptyState, Skeleton, clasesBoton } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import type { MetodoM0 } from '@/lib/hrm/marcacion/metodos';
import { useCarga } from '../../estructura/comun';
import { metodosLetrero, type RespuestaMetodos } from './metodosVista';

const ICONO: Record<MetodoM0, LucideIcon> = {
  celular_ubicacion: LocateFixed,
  qr: ScanQrCode,
  nfc_etiqueta: Nfc,
};

const BLOQUES = ['queGuardamos', 'foto', 'huellaRostro', 'voluntario', 'derechos'] as const;

/** A4 sin márgenes del navegador; la barra de acciones no se imprime y los fondos sí. */
const ESTILOS_IMPRESION = `
@page { size: A4; margin: 0; }
@media print {
  html, body { background: #ffffff !important; }
  .letrero-acciones { display: none !important; }
  .letrero-hoja { box-shadow: none !important; border: 0 !important; margin: 0 !important; width: 210mm !important; min-height: 297mm !important; }
  .letrero-hoja * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function LetreroAsistencia() {
  const t = useTranslations('hrmMarcacionMetodos.letrero');
  const tm = useTranslations('hrmMarcacionMetodos.metodos');
  const params = useSearchParams();
  const sede = Number(params?.get('sede') ?? '');
  const url = Number.isInteger(sede) && sede > 0 ? `/api/hrm/marcacion/metodos?sede=${sede}` : '/api/hrm/marcacion/metodos';
  const { carga, recargar } = useCarga<RespuestaMetodos>(url);
  const { organization, isLoading: cargandoOrg } = useOrganization();
  const impreso = useRef(false);

  const listo = carga.estado === 'listo' && !cargandoOrg;

  // Se abrió desde «Descargar letrero para imprimir»: el diálogo del navegador sale solo, una vez.
  useEffect(() => {
    if (!listo || impreso.current) return;
    impreso.current = true;
    const id = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(id);
  }, [listo]);

  if (carga.estado === 'sinPermiso') {
    return (
      <main className="mx-auto max-w-xl p-6">
        <EmptyState variante="forbidden" titulo={t('sinPermiso')} />
      </main>
    );
  }
  if (carga.estado === 'error' || carga.estado === 'noExiste') {
    return (
      <main className="mx-auto max-w-xl p-6">
        <EmptyState variante="error" titulo={t('error')} onReintentar={() => void recargar()} />
      </main>
    );
  }

  const datos = carga.estado === 'listo' ? carga.datos : null;
  const nombreOrg = organization?.name ? String(organization.name) : '';
  const encabezado = [nombreOrg, datos?.sede.nombre].filter(Boolean).join(' · ');
  const metodos = datos ? metodosLetrero(datos.metodos) : [];

  return (
    <div className="min-h-screen bg-subtle py-6 print:bg-white print:py-0">
      <style>{ESTILOS_IMPRESION}</style>
      <div className="letrero-acciones mx-auto mb-4 flex w-full max-w-[210mm] items-center justify-end gap-2 px-4">
        <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => window.close()}>
          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('cerrar')}
        </button>
        <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => window.print()} disabled={!listo}>
          <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('imprimir')}
        </button>
      </div>

      <main
        className="letrero-hoja mx-auto flex w-full max-w-[210mm] flex-col gap-7 border border-slate-200 bg-white p-8 text-slate-900 shadow-sm sm:min-h-[297mm] sm:p-14"
        aria-busy={!listo || undefined}
      >
        {listo && datos ? (
          <>
            <p className="text-sm font-medium leading-5 text-slate-600">{encabezado}</p>
            <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.4px]">{t('titulo')}</h1>
            {metodos.length > 0 && (
              <ul className="flex flex-wrap gap-4" aria-label={t('metodos')}>
                {metodos.map((m) => {
                  const Icono = ICONO[m];
                  return (
                    <li key={m} className="flex flex-col items-center gap-2">
                      <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <Icono className="size-7" strokeWidth={1.5} />
                      </span>
                      <span className="max-w-[96px] text-center text-xs font-medium leading-4 text-slate-600">{tm(`${m}.corto`)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {BLOQUES.map((b) => (
              <section key={b} className="flex flex-col gap-1.5">
                <h2 className="text-base font-semibold leading-[22px]">{t(`bloques.${b}.titulo`)}</h2>
                <p className="text-sm leading-5 text-slate-600">{t(`bloques.${b}.texto`)}</p>
              </section>
            ))}
            <p className="mt-auto text-[13px] leading-[18px] text-slate-400">
              {nombreOrg ? t('responsable', { organizacion: nombreOrg }) : t('responsableSinNombre')}
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-6">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-14 w-64" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
      </main>
    </div>
  );
}
