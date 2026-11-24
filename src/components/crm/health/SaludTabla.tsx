'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { clasesBoton } from '@/components/kit/botonClases';
import { nombreUsuario } from '@/components/crm/acciones/catalogosCrmLogica';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { cn } from '@/utils/Utils';
import { AnilloPuntaje } from './AnilloPuntaje';
import { TONO_BANDA, type AccionSalud, type FilaSalud } from './saludLogica';
import { useTextosSalud } from './useTextosSalud';

/**
 * Tabla «lista priorizada» (Figma 1415:971): Cliente (nombre + «contacto ·
 * responsable»), Puntaje (anillo + número + banda), Cambio 30 d, Por qué,
 * Ingresos 12 m y Acción sugerida. La fila abre el detalle (1424:17).
 */
export interface SaludTablaProps {
  filas: readonly FilaSalud[];
  usuarios: readonly OpcionUsuario[];
  atenuada?: boolean;
  onAccion: (accion: AccionSalud, fila: FilaSalud) => void;
}

const CELDA = 'px-3 py-2.5 align-middle';
const TH = 'h-10 whitespace-nowrap px-3 text-left text-xs font-medium text-fg-secondary';

export function CambioPuntos({ cambio, sinDatos }: { cambio: number | null; sinDatos: string }) {
  if (cambio === null) return <span className="text-[13px] text-fg-muted" title={sinDatos}>—<span className="sr-only">{sinDatos}</span></span>;
  const Icono = cambio < 0 ? ArrowDown : ArrowUp;
  const texto = cambio === 0 ? '0' : `${cambio < 0 ? '−' : '+'}${Math.abs(cambio)}`;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[13px] font-medium tabular-nums', cambio < 0 ? 'text-danger-text' : cambio > 0 ? 'text-success-text' : 'text-fg-secondary')}>
      {cambio !== 0 && <Icono aria-hidden="true" className="size-3.5" strokeWidth={2} />}
      {texto}
    </span>
  );
}

export function SaludTabla({ filas, usuarios, atenuada, onAccion }: SaludTablaProps) {
  const { t, formatear, textoMotivos } = useTextosSalud();
  const router = useRouter();
  return (
    <div className={cn('overflow-hidden rounded-xl border border-line bg-surface', atenuada && 'opacity-60')}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse">
          <caption className="sr-only">{t('tabla.titulo')}</caption>
          <thead>
            <tr className="border-b border-line bg-subtle">
              <th scope="col" className={cn(TH, 'w-[240px] pl-4')}>{t('tabla.cliente')}</th>
              <th scope="col" className={cn(TH, 'w-[162px]')}>{t('tabla.puntaje')}</th>
              <th scope="col" className={cn(TH, 'w-[112px]')}>{t('tabla.cambio')}</th>
              <th scope="col" className={TH}>{t('tabla.porque')}</th>
              <th scope="col" className={cn(TH, 'w-[142px]')}>{t('tabla.ingresos')}</th>
              <th scope="col" className={cn(TH, 'w-[186px] pr-4')}>{t('tabla.accion')}</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const responsable = nombreUsuario(usuarios, f.responsableId);
              const sub = [f.contacto, responsable ?? t('tabla.sinResponsable')].filter(Boolean).join(' · ');
              const href = `/app/crm/salud/${f.id}`;
              return (
                <tr key={f.id} className="cursor-pointer border-b border-line bg-surface last:border-b-0 hover:bg-hover" onClick={() => router.push(href)}>
                  <td className={cn(CELDA, 'pl-4')}>
                    <span className="flex min-w-0 flex-col">
                      <Link href={href} onClick={(e) => e.stopPropagation()} className="truncate text-sm font-medium text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm">
                        {f.nombre}
                      </Link>
                      <span className="truncate text-xs text-fg-muted">{sub}</span>
                    </span>
                  </td>
                  <td className={CELDA}>
                    <span className="flex items-center gap-2">
                      <AnilloPuntaje score={f.score} band={f.band} tamano={28} />
                      <span className="text-[17px] font-semibold tabular-nums text-fg">{f.score}</span>
                      <Badge tono={TONO_BANDA[f.band]} tamano="sm">{t(`banda.${f.band}`)}</Badge>
                    </span>
                  </td>
                  <td className={CELDA}><CambioPuntos cambio={f.cambio} sinDatos={t('tabla.sinCambio')} /></td>
                  <td className={cn(CELDA, 'text-[13px] leading-[18px] text-fg-secondary')}>
                    <span className="line-clamp-2">{textoMotivos(f.motivos, f.resultado)}</span>
                  </td>
                  <td className={cn(CELDA, 'text-sm font-medium tabular-nums text-fg')}>{formatear(f.ingresos)}</td>
                  <td className={cn(CELDA, 'pr-4')}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (f.accion) onAccion(f.accion, f);
                        else router.push(href);
                      }}
                      className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                    >
                      {t(`accion.${f.accion ?? 'ver'}`)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Esqueleto de la tabla (Figma 1424:841136: seis filas de 48 px). */
export function SaludTablaCargando() {
  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-line bg-surface p-px" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-12 animate-pulse bg-subtle motion-reduce:animate-none" />)}
    </div>
  );
}
