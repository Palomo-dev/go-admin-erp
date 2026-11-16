'use client';

/**
 * Piezas compartidas de Asistencia, Horas extra y recargos y Novedades (Figma
 * 20.10–20.12), armadas con el kit: celda de persona, insignias de estado, horas
 * en la zona de la sede y el período que se lee de la URL.
 */
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AvatarIniciales } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { periodoQuincena, type PersonaAsistencia, type TonoEstado } from './asistenciaLogica';

export const RUTA_ASISTENCIA = '/app/hrm/asistencia';
export const RUTA_NOVEDADES = '/app/hrm/novedades';
export const RUTA_TOPES = '/app/hrm/asistencia/horas-extra';
export const RUTA_TURNOS = '/app/hrm/turnos';

export function rutaHoja(vinculo: string, desde: string, hasta: string): string {
  return `${RUTA_ASISTENCIA}/${vinculo}?desde=${desde}&hasta=${hasta}`;
}
export function rutaHoras(vinculo: string, desde: string, hasta: string): string {
  return `${RUTA_ASISTENCIA}/${vinculo}/horas?desde=${desde}&hasta=${hasta}`;
}
export function rutaTurno(vinculo: string, fecha: string, desde: string, hasta: string): string {
  return `${RUTA_ASISTENCIA}/${vinculo}/horas/${fecha}?desde=${desde}&hasta=${hasta}`;
}

/** Hora de un instante en la zona de la sede («6:02 a. m.»), en el idioma activo. */
export function useHora(zona: string | null | undefined) {
  const locale = useLocaleIntl();
  return useCallback(
    (iso: string | null | undefined): string => {
      if (!iso || !zona) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat(locale, {
        timeZone: zona,
        hour: 'numeric',
        minute: '2-digit',
      }).format(d);
    },
    [locale, zona]
  );
}

/** Hora de pared `HH:mm` de un instante en la zona de la sede (valor del `CampoHora`). */
export function horaDePared(iso: string | null | undefined, zona: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const h = p.find((x) => x.type === 'hour')?.value ?? '00';
  const m = p.find((x) => x.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

/**
 * Días calendario (`date`, sin zona): «dom 15», «lunes 16 de nov.», «1 – 15 nov. 2026».
 * Se formatean al mediodía UTC con `timeZone: 'UTC'`, así el día no se corre.
 */
export function useDias() {
  const locale = useLocaleIntl();
  return useMemo(() => {
    const fecha = (dia: string) => {
      const [a, m, d] = dia.split('-').map(Number);
      return new Date(Date.UTC(a, m - 1, d, 12));
    };
    const fmt = (dia: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o }).format(fecha(dia));
    const capital = (s: string) => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
    return {
      /** «Dom 15» */
      corto: (dia: string) => capital(`${fmt(dia, { weekday: 'short' }).replace(/\.$/, '')} ${fmt(dia, { day: 'numeric' })}`),
      /** «lunes 16 de nov.» */
      largo: (dia: string) => fmt(dia, { weekday: 'long', day: 'numeric', month: 'short' }),
      /** «16 nov.» */
      diaMes: (dia: string) => fmt(dia, { day: 'numeric', month: 'short' }),
      /** «16 nov. 2026» */
      completo: (dia: string) => fmt(dia, { day: 'numeric', month: 'short', year: 'numeric' }),
      /** «1 – 15 nov. 2026» / «28 oct. – 3 nov. 2026» */
      rango: (desde: string, hasta: string) =>
        new Intl.DateTimeFormat(locale, {
          timeZone: 'UTC',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).formatRange(fecha(desde), fecha(hasta)),
      /** «9 – 15 nov.» */
      rangoCorto: (desde: string, hasta: string) =>
        new Intl.DateTimeFormat(locale, {
          timeZone: 'UTC',
          day: 'numeric',
          month: 'short',
        }).formatRange(fecha(desde), fecha(hasta)),
    };
  }, [locale]);
}

/** Sede elegida en el header (`null` = todas las suyas). PATRONES §9: el único filtro de sede. */
export function useSedeActiva(): number | null {
  return useBranchOpcional()?.branchFilter ?? null;
}

export function conSede(url: string, sede: number | null): string {
  return sede === null ? url : `${url}${url.includes('?') ? '&' : '?'}sede=${sede}`;
}

/** Período de la URL (`desde`/`hasta`) o la quincena de hoy en la zona de la organización. */
export function usePeriodo() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const porDefecto = periodoQuincena(hoy);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const d = sp?.get('desde') ?? '';
  const h = sp?.get('hasta') ?? '';
  const valido = re.test(d) && re.test(h) && d <= h;
  const desde = valido ? d : porDefecto.desde;
  const hasta = valido ? h : porDefecto.hasta;
  const cambiar = useCallback(
    (r: { desde: string; hasta: string }) => {
      const q = new URLSearchParams(sp?.toString() ?? '');
      q.set('desde', r.desde);
      q.set('hasta', r.hasta);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [sp, router, pathname]
  );
  return { desde, hasta, hoy, cambiar };
}

/** Persona en una celda: avatar con iniciales, nombre y «cargo · área». */
export function CeldaPersona({ p, sinAvatar = false }: { p: Pick<PersonaAsistencia, 'nombre' | 'cargo' | 'area'>; sinAvatar?: boolean }) {
  const detalle = [p.cargo, p.area].filter(Boolean).join(' · ');
  return (
    <div className="flex min-w-0 items-center gap-3">
      {!sinAvatar && <AvatarIniciales nombre={p.nombre} tamano="sm" />}
      <div className="min-w-0">
        <p className="truncate font-medium text-fg">{p.nombre}</p>
        {detalle && <p className="truncate text-xs text-fg-secondary">{detalle}</p>}
      </div>
    </div>
  );
}

/** Insignia de estado de RR. HH. con la escala del manual (SISTEMA-BADGES §1). */
export function InsigniaEstado({ tono, children, tamano = 'sm' }: { tono: TonoEstado; children: string; tamano?: 'sm' | 'md' }) {
  return (
    <Badge tono={tono} apariencia="suave" tamano={tamano}>
      {children}
    </Badge>
  );
}

/** «Lista para nómina»: marca · suave · candado (decisión 5, SISTEMA-BADGES adenda 2026-11-16). */
export function InsigniaListaNomina({ children, tamano = 'sm' }: { children: string; tamano?: 'sm' | 'md' }) {
  return (
    <Badge uso="lista_nomina" tamano={tamano}>
      {children}
    </Badge>
  );
}
