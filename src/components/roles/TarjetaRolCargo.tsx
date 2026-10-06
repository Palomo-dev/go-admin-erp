'use client';

/**
 * TarjetaRolCargo (Figma «Roles y permisos — componentes»): «rol + cargo = lo
 * que puede hacer». Horizontal en escritorio, vertical en móvil o en una
 * columna lateral. Los números los calcula el servidor.
 */
import { useTranslations } from 'next-intl';
import { Briefcase, ShieldCheck, UserCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface TarjetaRolCargoProps {
  rol: { nombre: string; total: number };
  cargo: { nombre: string; suma: number } | null;
  /** Quién (persona o «Quien tenga este cargo») y cuántos permisos efectivos. */
  resultado: { nombre: string; total: number };
  orientacion?: 'horizontal' | 'vertical';
  className?: string;
}

function Caja({
  icono: Icono,
  etiqueta,
  titulo,
  descripcion,
  tono,
}: {
  icono: LucideIcon;
  etiqueta: string;
  titulo: string;
  descripcion: string;
  tono: 'neutro' | 'marca' | 'exito';
}) {
  const clases = {
    neutro: 'border-line bg-subtle',
    marca: 'border-line-brand bg-brand-tint',
    exito: 'border-line-success bg-success-subtle',
  }[tono];
  const icono = { neutro: 'text-fg-secondary', marca: 'text-brand', exito: 'text-success-text' }[tono];
  return (
    <div className={cn('flex min-w-0 flex-1 items-start gap-3 rounded-xl border p-3', clases)}>
      <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface', icono)}>
        <Icono aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{etiqueta}</span>
        <span className="text-sm font-semibold text-fg">{titulo}</span>
        <span className="text-xs text-fg-secondary">{descripcion}</span>
      </span>
    </div>
  );
}

export function TarjetaRolCargo({ rol, cargo, resultado, orientacion = 'horizontal', className }: TarjetaRolCargoProps) {
  const t = useTranslations('roles.tarjeta');
  const vertical = orientacion === 'vertical';
  const signo = (s: string, etiqueta: string) => (
    <span className={cn('shrink-0 text-lg font-semibold text-fg-muted', vertical ? 'pl-1' : 'self-center')} aria-label={etiqueta}>
      {s}
    </span>
  );
  return (
    <div
      className={cn('flex gap-2 rounded-2xl border border-line bg-surface p-3', vertical ? 'flex-col' : 'flex-col md:flex-row md:items-stretch', className)}
      data-orientacion={orientacion}
    >
      <Caja icono={ShieldCheck} etiqueta={t('rol')} titulo={t('rolTitulo', { rol: rol.nombre, n: rol.total })} descripcion={t('rolDesc')} tono="neutro" />
      {signo('+', t('mas'))}
      {cargo ? (
        <Caja
          icono={Briefcase}
          etiqueta={t('cargo')}
          titulo={t('cargoTitulo', { cargo: cargo.nombre, n: cargo.suma })}
          descripcion={t('cargoDesc')}
          tono="marca"
        />
      ) : (
        <Caja icono={Briefcase} etiqueta={t('cargo')} titulo={t('sinCargo')} descripcion={t('sinCargoDesc')} tono="marca" />
      )}
      {signo('=', t('igual'))}
      <Caja
        icono={UserCheck}
        etiqueta={t('puede')}
        titulo={t('puedeTitulo', { persona: resultado.nombre, n: resultado.total })}
        descripcion={t('puedeDesc')}
        tono="exito"
      />
    </div>
  );
}
