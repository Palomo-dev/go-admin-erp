'use client';

import { useTranslations } from 'next-intl';
import { Bell, CalendarClock, MoreHorizontal, Plus, Receipt, Sparkles, TriangleAlert, Users } from 'lucide-react';
import { AvatarIniciales, KbdButton, RowActionsMenu, type AccionFila } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { textoDuracion } from '../cuenta/cuentaMesaLogica';
import { CLASES_ESTADO, type VistaMesaPlano } from './estadoMesaPlano';

/**
 * Resumen de una mesa al tocarla en el plano (popover, Figma 870:103527 «Mesa 5»)
 * y en el celular (hoja, 870:582569): estado, comensales y tiempo, importe y
 * productos, plato listo, mesero y las acciones (Ver cuenta, Pedir cuenta, ⋯).
 */
export interface ResumenMesaPlanoProps {
  vista: VistaMesaPlano;
  formatear: (n: number) => string;
  /** Título con la zona («Mesa 5 · Salón principal», en la hoja). */
  conZona?: boolean;
  /** Hoja del celular: botones apilados a lo ancho y «Agregar productos». */
  apilado?: boolean;
  acciones: readonly AccionFila[];
  onPrincipal: () => void;
  onPedirCuenta?: () => void;
  onAgregar?: () => void;
  onMarcarLista?: () => void;
  /** Hoja del celular: «⋯ Más acciones» abre la hoja de acciones. */
  onMasAcciones?: () => void;
}

export function ResumenMesaPlano({ vista, formatear, conZona, apilado, acciones, onPrincipal, onPedirCuenta, onAgregar, onMarcarLista, onMasAcciones }: ResumenMesaPlanoProps) {
  const t = useTranslations('posMesasPlano.resumen');
  const te = useTranslations('posMesasPlano.mesa');
  const clases = CLASES_ESTADO[vista.estado];
  const abierta = vista.estado === 'ocupada' || vista.estado === 'por_cobrar';
  const titulo = conZona && vista.zona ? t('tituloZona', { mesa: vista.nombre, zona: vista.zona }) : vista.nombre;

  const principal =
    vista.estado === 'libre' || vista.estado === 'reservada' ? t('abrir') : vista.estado === 'por_limpiar' ? t('marcarLista') : t('verCuenta');
  const alPrincipal = vista.estado === 'por_limpiar' && onMarcarLista ? onMarcarLista : onPrincipal;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-lg font-semibold text-fg">{titulo}</h3>
        <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full border bg-surface px-2 text-xs font-semibold', clases.borde, clases.texto)}>
          {vista.estado === 'ocupada' && <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />}
          {te(`estados.${vista.estado}`)}
        </span>
      </div>

      <ul className="flex flex-col gap-2 text-sm text-fg">
        {abierta && (
          <li className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
            {t('comensales', { n: vista.comensales, cap: vista.capacidad, tiempo: textoDuracion(vista.minutos) })}
          </li>
        )}
        {abierta && (
          <li className="flex items-center gap-2 tabular-nums">
            <Receipt aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
            {t('importe', { importe: formatear(vista.importe), n: vista.productos })}
          </li>
        )}
        {vista.estado === 'libre' && (
          <li className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
            {t('capacidad', { n: vista.capacidad })}
          </li>
        )}
        {vista.estado === 'reservada' && (
          <li className="flex items-center gap-2">
            <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-info-text" strokeWidth={1.5} />
            {t('reserva', { nombre: vista.reservaNombre ?? '', hora: vista.reservaHora ?? '' })}
          </li>
        )}
        {vista.estado === 'por_limpiar' && (
          <li className="flex items-center gap-2 text-fg-secondary">
            <Sparkles aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
            {t('porLimpiar')}
          </li>
        )}
        {vista.platosListos > 0 && (
          <li className="flex items-center gap-2 text-brand">
            <Bell aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
            {te('platoListo', { n: vista.platosListos })}
          </li>
        )}
        {vista.abandonada && abierta && (
          <li className="flex items-center gap-2 text-danger-text">
            <TriangleAlert aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
            {te('abandonada')}
          </li>
        )}
        {vista.mesero && abierta && (
          <li className="flex items-center gap-2 text-fg-secondary">
            <AvatarIniciales nombre={vista.mesero} tamano="sm" />
            {t('mesero', { nombre: vista.mesero })}
          </li>
        )}
      </ul>

      {apilado ? (
        <div className="flex flex-col gap-2">
          <KbdButton variante="primario" tamano="lg" onClick={alPrincipal} className="w-full">
            {principal}
          </KbdButton>
          {abierta && onAgregar && (
            <KbdButton variante="secundario" tamano="lg" icono={Plus} onClick={onAgregar} className="w-full">
              {t('agregar')}
            </KbdButton>
          )}
          {vista.estado === 'ocupada' && onPedirCuenta && (
            <KbdButton variante="secundario" tamano="lg" icono={Receipt} onClick={onPedirCuenta} className="w-full">
              {t('pedirCuenta')}
            </KbdButton>
          )}
          {acciones.length > 0 && onMasAcciones && (
            <KbdButton variante="fantasma" tamano="lg" icono={MoreHorizontal} onClick={onMasAcciones} className="w-full">
              {t('masAcciones')}
            </KbdButton>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <KbdButton variante="primario" tamano="sm" onClick={alPrincipal}>
            {principal}
          </KbdButton>
          {vista.estado === 'ocupada' && onPedirCuenta && (
            <KbdButton variante="secundario" tamano="sm" icono={Receipt} onClick={onPedirCuenta}>
              {t('pedirCuenta')}
            </KbdButton>
          )}
          {acciones.length > 0 && <RowActionsMenu acciones={acciones} titulo={vista.nombre} orientacion="horizontal" tamano="sm" />}
        </div>
      )}
    </div>
  );
}
