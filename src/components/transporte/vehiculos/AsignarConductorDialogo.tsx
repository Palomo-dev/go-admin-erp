'use client';

/**
 * Catálogo común › Asignar conductor (Figma «23 Transporte» 2972:21658). Reemplaza a
 * `AssignDriverDialog`: solo se puede elegir a quien tiene usuario en GO Admin
 * (`vehicles.current_driver_id` → auth.users), está activo y tiene licencia vigente de una
 * categoría que sirve para el tipo de vehículo (`evaluarConductor`); avisa la licencia por vencer
 * y permite «Quitar conductor». Los que no sirven se ven atenuados con el motivo.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, UserMinus } from 'lucide-react';
import { AvatarIniciales, Dialogo, EmptyState, SearchInput, StatusBadge } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { Vehicle } from '@/lib/services/transportService';
import type { PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import { CARGO_EXTERNO, claveCargo } from '@/lib/transporte/catalogoComun';
import { CATEGORIAS_POR_TIPO, evaluarConductor } from '@/lib/transporte/formulariosCatalogo';
import { cn } from '@/utils/Utils';

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface AsignarConductorDialogoProps {
  vehiculo: Vehicle | null;
  personas: readonly PersonaCatalogo[];
  guardando: boolean;
  onCerrar: () => void;
  onAsignar: (persona: PersonaCatalogo | null) => void;
}

export function AsignarConductorDialogo({ vehiculo, personas, guardando, onCerrar, onAsignar }: AsignarConductorDialogoProps) {
  const t = useTranslations('catalogoComun.dialogos.asignar');
  const tc = useTranslations('catalogoComun.comun');
  const tp = useTranslations('catalogoComun.conductores');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const { getToday, formatPlain } = useFormatDate();
  const hoy = getToday();
  const [busqueda, setBusqueda] = useState('');
  const actualId = vehiculo?.current_driver_id ?? null;
  const [elegido, setElegido] = useState<string | null>(null);

  const tipo = vehiculo?.vehicle_type ?? 'other';
  const categorias = CATEGORIAS_POR_TIPO[tipo] ?? null;
  const tipoTexto = tTipos.has(tipo) ? tTipos(tipo) : tipo;

  const candidatos = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return personas
      .filter((p) => !q || [p.nombre, p.documento ?? '', p.licenciaNumero ?? ''].some((x) => normalizar(x).includes(q)))
      .map((p) => ({ p, e: evaluarConductor(p, tipo, hoy), actual: !!p.userId && p.userId === actualId }))
      .sort((a, b) => Number(b.actual) - Number(a.actual) || Number(b.e.apto) - Number(a.e.apto) || a.p.nombre.localeCompare(b.p.nombre, 'es'));
  }, [personas, busqueda, tipo, hoy, actualId]);

  const seleccion = elegido ?? actualId;
  const personaElegida = personas.find((p) => p.userId === seleccion) ?? null;
  const cambia = !!personaElegida && seleccion !== actualId;

  const cargo = (p: PersonaCatalogo) => {
    const c = claveCargo(p);
    return c === CARGO_EXTERNO ? tc('externo') : p.cargo ?? tp('sinCargo');
  };
  const licencia = (p: PersonaCatalogo, dias: number | null, porVencer: boolean) => {
    if (!p.licenciaCategoria || !p.licenciaVence) return t('sinLicencia');
    return porVencer && dias !== null ? t('licenciaVenceEn', { categoria: p.licenciaCategoria, count: dias }) : t('licenciaVence', { categoria: p.licenciaCategoria, fecha: formatPlain(p.licenciaVence) });
  };

  return (
    <Dialogo
      abierto={!!vehiculo}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('titulo', { placa: vehiculo?.plate ?? '' })}
      descripcion={categorias ? t('descripcion', { tipo: tipoTexto.toLowerCase(), categorias: categorias.join(', ') }) : t('descripcionSinLicencia')}
      ancho={560}
      primario={{ etiqueta: t('asignar'), onClick: () => personaElegida && onAsignar(personaElegida), cargando: guardando, deshabilitada: !cambia, motivo: t('eligeUno') }}
      secundarios={actualId ? [{ etiqueta: t('quitar'), onClick: () => onAsignar(null), deshabilitada: guardando }] : undefined}
    >
      <div className="flex flex-col gap-3">
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} atajo={false} />
        {candidatos.length === 0 ? (
          <EmptyState compacto variante={busqueda ? 'search' : 'empty'} titulo={busqueda ? t('sinResultados') : t('sinPersonas')} />
        ) : (
          <div role="radiogroup" aria-label={t('titulo', { placa: vehiculo?.plate ?? '' })} className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {candidatos.map(({ p, e, actual }) => {
              const marcado = !!p.userId && p.userId === seleccion;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  disabled={!e.apto}
                  onClick={() => p.userId && setElegido(p.userId)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    marcado ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                    !e.apto && 'cursor-not-allowed opacity-60 hover:bg-surface',
                  )}
                >
                  <AvatarIniciales nombre={p.nombre || '—'} tamano="md" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-fg">{p.nombre || '—'}</span>
                    <span className="truncate text-[13px] text-fg-secondary">{[cargo(p), licencia(p, e.dias, e.porVencer)].join(' · ')}</span>
                  </span>
                  {actual ? (
                    <StatusBadge estado="actual" tono="informacion" apariencia="contorno" etiqueta={t('actual')} />
                  ) : !e.apto && e.motivo ? (
                    <StatusBadge estado={e.motivo} tono="neutro" etiqueta={t(`motivos.${e.motivo}`)} />
                  ) : e.porVencer ? (
                    <StatusBadge estado="por_vencer" tono="advertencia" apariencia="contorno" etiqueta={t('porVencer')} />
                  ) : marcado ? (
                    <Check aria-hidden="true" className="size-4 text-brand" strokeWidth={2} />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        {actualId && !personas.some((p) => p.userId === actualId) && (
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <UserMinus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('actualDesconocido')}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
