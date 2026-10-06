'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { datosImportadosDe, type DatoImportado } from '@/lib/crm/importacionLeads/datosFicha';

/**
 * Datos que trajo el archivo de importación y no tienen columna propia en la
 * ficha (departamento, país, web, cargo, fuentes, columnas adicionales…).
 * Lo usan la ficha del cliente (pestaña «Información») y el detalle del lead.
 * No pinta nada si la ficha no viene de una importación.
 */
export interface DatosImportadosLeadProps {
  /** `metadata.importacion` de la ficha. */
  importacion: unknown;
  /** `metadata.lead` (trae `valor_estimado` y, en un cliente ya existente, `importacion`). */
  lead?: unknown;
  /** Hoja lateral: etiquetas más angostas y sin el pie de origen largo. */
  compacto?: boolean;
}

export function DatosImportadosLead({ importacion, lead, compacto = false }: DatosImportadosLeadProps) {
  const t = useTranslations('crm.datosImportados');
  const idioma = useLocale();
  const { formatDate, formatPlain } = useFormatDate();
  const datos = datosImportadosDe(importacion, lead);
  if (!datos || (datos.datos.length === 0 && datos.adicionales.length === 0 && datos.descartados.length === 0)) return null;

  const importe = (monto: number, moneda: string | null) => {
    if (!moneda) return new Intl.NumberFormat(idioma).format(monto);
    try {
      return new Intl.NumberFormat(idioma, { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(monto);
    } catch {
      return `${new Intl.NumberFormat(idioma).format(monto)} ${moneda}`;
    }
  };

  const valor = (d: DatoImportado) => {
    switch (d.tipo) {
      case 'texto':
        return <span className="whitespace-pre-wrap break-words">{d.valor}</span>;
      case 'fecha':
        return formatPlain(d.valor) || d.valor;
      case 'importe':
        return importe(d.monto, d.moneda);
      case 'lista':
        return d.valores.join(' · ');
      case 'enlaces':
        return (
          <span className="flex flex-col gap-0.5">
            {d.valores.map((u) => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-w-0 items-center gap-1 text-brand hover:underline">
                <span className="truncate">{u.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                <ExternalLink aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
              </a>
            ))}
          </span>
        );
    }
  };

  const columnas = compacto ? 'grid-cols-[120px_1fr]' : 'grid-cols-1 sm:grid-cols-[200px_1fr]';
  const fila = (clave: string, etiqueta: string, contenido: React.ReactNode) => (
    <div key={clave} className={`grid ${columnas} gap-x-2 gap-y-0.5 text-[13px]`}>
      <dt className="text-fg-muted">{etiqueta}</dt>
      <dd className="min-w-0 text-fg">{contenido}</dd>
    </div>
  );
  const subtitulo = 'text-xs font-semibold uppercase tracking-wide text-fg-muted';
  const o = datos.origen;
  const origen = [
    o.lote && t('origen.lote', { lote: o.lote }),
    o.archivo && !compacto && t('origen.archivo', { archivo: o.archivo }),
    o.fila !== null && t('origen.fila', { fila: o.fila }),
    o.idExterno && t('origen.idExterno', { id: o.idExterno }),
    o.importadoEn && t('origen.importadoEn', { fecha: formatDate(o.importadoEn) }),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      {datos.datos.length > 0 && <dl className="flex flex-col gap-1.5">{datos.datos.map((d) => fila(d.clave, t(`campos.${d.clave}`), valor(d)))}</dl>}
      {datos.adicionales.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className={subtitulo}>{t('adicionales')}</h4>
          <dl className="flex flex-col gap-1.5">
            {datos.adicionales.map((a) => fila(`adicional-${a.columna}`, a.columna, <span className="whitespace-pre-wrap break-words">{a.valor}</span>))}
          </dl>
        </div>
      )}
      {datos.descartados.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className={subtitulo}>{t('descartados')}</h4>
          <p className="text-xs text-fg-muted">{t('descartadosAyuda')}</p>
          <dl className="flex flex-col gap-1.5">
            {datos.descartados.map((d) => fila(`descartado-${d.campo}`, t.has(`campos.${d.campo}`) ? t(`campos.${d.campo}`) : d.campo, d.valor))}
          </dl>
        </div>
      )}
      {origen.length > 0 && <p className="text-xs text-fg-muted">{origen.join(' · ')}</p>}
    </div>
  );
}
