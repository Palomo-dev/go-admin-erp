'use client';

/**
 * Tarjeta de un servicio del catálogo (85-00): logo, nombre, estado honesto, descripción corta y
 * una acción: «Ver» (tiene conexión), «Conectar» (abre la ficha) o «Ir a …» (servicio de GO Admin).
 * Un servicio «En construcción» muestra por qué y su ficha dice qué falta: nunca finge.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { StatusBadge } from '@/components/kit';
import type { ItemCatalogo } from '@/lib/services/integrations/conexiones/catalogoConexiones';
import { LogoServicio } from '../logos';
import { TONO_ESTADO_CATALOGO, accionDeTarjeta } from '../presentacion';

const ENLACE = 'inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded';

export function TarjetaServicio({ item, nombre, onAbrirFicha }: { item: ItemCatalogo; nombre: string; onAbrirFicha: (i: ItemCatalogo) => void }) {
  const t = useTranslations('integracionesConexiones');
  const accion = accionDeTarjeta(item);
  const descripcion = t.has(`servicios.${item.id}.descripcion`) ? t(`servicios.${item.id}.descripcion`) : t('catalogo.descripcionGenerica');

  return (
    <article className="flex w-full flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-label={nombre}>
      <div className="flex items-start gap-3">
        <LogoServicio id={item.id} />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <h3 className="truncate text-sm font-semibold text-fg">{nombre}</h3>
          <StatusBadge estado={item.estado} etiqueta={t(`estados.catalogo.${item.estado}`)} tono={TONO_ESTADO_CATALOGO[item.estado]} />
        </div>
      </div>
      <p className="text-sm text-fg-secondary">{descripcion}</p>
      {item.estado === 'en_construccion' && item.motivo && (
        <p className="text-xs text-fg-muted">{t(`motivos.${item.motivo}`)}</p>
      )}
      <div className="mt-auto">
        {accion === 'ver' && item.conexionPrincipal && (
          <Link href={`/app/integraciones/conexiones/${item.conexionPrincipal}`} className={ENLACE}>
            {t('catalogo.ver')}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
        {accion === 'ir' && item.enlace && (
          <Link href={item.enlace} className={ENLACE}>
            {t(`servicios.${item.id}.irA`)}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
        {accion === 'conectar' && (
          <button type="button" className={ENLACE} onClick={() => onAbrirFicha(item)} aria-label={t('catalogo.conectarA', { nombre })}>
            {t('catalogo.conectar')}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}
