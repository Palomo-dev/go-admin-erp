'use client';

import { useTranslations } from 'next-intl';
import { Archive, ArchiveRestore, Monitor, Pencil, Plus, Scale } from 'lucide-react';
import { EmptyState, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import type { BasculaConfigurada } from '@/lib/services/basculasService';
import { PROTOCOLOS_BASCULA, type ProtocoloBascula } from '@/lib/pos/bascula/tipos';

/**
 * Configuración › POS › «Básculas» (Figma K1 listo · K1b vacío · K1c cargando ·
 * K1d error · K7 sin permiso · K8 móvil; FilaBascula conectada · sin-conexión ·
 * sin-probar). Solo pinta: los datos y las acciones llegan de `BasculasSection`.
 */
export type EstadoBasculasVista = 'cargando' | 'error' | 'sinPermiso' | 'listo';

export interface BasculasVistaProps {
  estado: EstadoBasculasVista;
  basculas: BasculaConfigurada[];
  /** Báscula elegida en este navegador por sucursal («En este equipo»). */
  preferidas?: Record<number, string | null>;
  formatearFecha: (valor: string) => string;
  onNueva: () => void;
  onEditar: (b: BasculaConfigurada) => void;
  onArchivar: (b: BasculaConfigurada) => void;
  onReactivar: (b: BasculaConfigurada) => void;
  onUsarEnEsteEquipo: (b: BasculaConfigurada) => void;
  onReintentar: () => void;
}

export function BasculasVista(props: BasculasVistaProps) {
  const t = useTranslations('posBascula.config');
  const { estado, basculas } = props;

  const nombreProtocolo = (p: string) =>
    (PROTOCOLOS_BASCULA as readonly string[]).includes(p) ? t(`protocolos.${p as ProtocoloBascula}`) : p;

  const accionNueva =
    estado === 'listo' && basculas.length > 0 ? (
      <button type="button" onClick={props.onNueva} className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('nueva')}
      </button>
    ) : undefined;

  return (
    <Tarjeta titulo={t('titulo')} descripcion={t('descripcion')} icono={Scale} accion={accionNueva} id="pos-basculas">
      {estado === 'cargando' && (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">{t('cargando')}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      )}

      {estado === 'error' && (
        <EmptyState variante="error" compacto titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={props.onReintentar} />
      )}

      {estado === 'sinPermiso' && (
        <EmptyState variante="forbidden" compacto titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />
      )}

      {estado === 'listo' && basculas.length === 0 && (
        <EmptyState
          variante="empty"
          compacto
          icono={Scale}
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          accion={{ etiqueta: t('nueva'), onClick: props.onNueva, icono: Plus }}
        />
      )}

      {estado === 'listo' && basculas.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line" aria-label={t('titulo')}>
          {basculas.map((b) => {
            const enEsteEquipo = props.preferidas?.[b.branch_id] === b.id;
            const prueba = !b.is_active
              ? { estado: 'inactive', etiqueta: t('estados.archivada'), tono: 'neutro' as const }
              : b.last_test_ok === true
                ? { estado: 'active', etiqueta: t('estados.probada'), tono: 'exito' as const }
                : b.last_test_ok === false
                  ? { estado: 'error', etiqueta: t('estados.fallo'), tono: 'peligro' as const }
                  : { estado: 'pending', etiqueta: t('estados.sinProbar'), tono: 'advertencia' as const };
            const detalle = [
              b.branch_name,
              t(`transportes.${b.transport === 'desktop_serial' ? 'desktop_serial' : 'web_serial'}`),
              nombreProtocolo(b.protocol),
              b.device_hint,
              b.pos_terminal_name ? t('caja', { caja: b.pos_terminal_name }) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={b.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-bascula={b.id}>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-fg">{b.name}</span>
                    <StatusBadge estado={prueba.estado} etiqueta={prueba.etiqueta} tono={prueba.tono} />
                    {enEsteEquipo && b.is_active && (
                      <StatusBadge estado="info" etiqueta={t('enEsteEquipo')} tono="marca" icono={Monitor} />
                    )}
                  </div>
                  <span className="truncate text-xs text-fg-secondary">{detalle}</span>
                  {b.last_test_at && (
                    <span className="text-xs text-fg-muted">{t('ultimaPrueba', { fecha: props.formatearFecha(b.last_test_at) })}</span>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {b.is_active ? (
                    <>
                      {!enEsteEquipo && (
                        <button type="button" onClick={() => props.onUsarEnEsteEquipo(b)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                          <Monitor aria-hidden="true" className="size-4" strokeWidth={1.5} />
                          {t('usarEnEsteEquipo')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => props.onEditar(b)}
                        className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                        aria-label={t('editarNombre', { nombre: b.name })}
                      >
                        <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        {t('editar')}
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onArchivar(b)}
                        className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                        aria-label={t('archivarNombre', { nombre: b.name })}
                      >
                        <Archive aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        {t('archivar')}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => props.onReactivar(b)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                      <ArchiveRestore aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('reactivar')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}
