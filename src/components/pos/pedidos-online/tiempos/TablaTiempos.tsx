'use client';

/**
 * Tabla «Tipo de entrega · Alistar o preparar · Entrega» (Figma T1 3011:36563 y el diálogo por
 * sede T3 3011:239316). Cada tiempo es número + unidad; «Recoger en la tienda» no tiene entrega
 * («No aplica»). Una sola pieza para la pestaña y el diálogo de la sede.
 */
import { useTranslations } from 'next-intl';
import { CampoNumero } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import {
  TIPOS_TIEMPO,
  UNIDADES_TIEMPO,
  VALOR_MAXIMO,
  type Tiempo,
  type TiemposResueltos,
  type TipoTiempo,
  type UnidadTiempo,
} from '@/lib/pos/pedidosWeb/tiemposPedidos';

export type ValoresTabla = Record<TipoTiempo, TiemposResueltos>;

interface CampoTiempoProps {
  id: string;
  tiempo: Tiempo;
  minimo: number;
  etiquetaValor: string;
  etiquetaUnidad: string;
  deshabilitado?: boolean;
  onCambiar: (t: Tiempo) => void;
}

function CampoTiempo({ id, tiempo, minimo, etiquetaValor, etiquetaUnidad, deshabilitado, onCambiar }: CampoTiempoProps) {
  const t = useTranslations('pedidosOnlineTiempos');
  return (
    <div className="flex items-center gap-2">
      <CampoNumero
        id={id}
        aria-label={etiquetaValor}
        valor={tiempo.valor}
        // Vacío mientras se escribe: se queda el último número válido.
        onValorChange={(v) => v !== null && onCambiar({ ...tiempo, valor: Math.min(Math.max(Math.round(v), minimo), VALOR_MAXIMO) })}
        decimales={0}
        minimo={minimo}
        maximo={VALOR_MAXIMO}
        disabled={deshabilitado}
        className="w-14 shrink-0"
      />
      <Select value={tiempo.unidad} onValueChange={(u) => onCambiar({ ...tiempo, unidad: u as UnidadTiempo })} disabled={deshabilitado}>
        <SelectTrigger aria-label={etiquetaUnidad} className="h-10 w-[104px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNIDADES_TIEMPO.map((u) => (
            <SelectItem key={u} value={u}>
              {t(`unidades.${u}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface Props {
  /** Prefijo de los ids (la pestaña y el diálogo pueden convivir). */
  idPrefijo: string;
  valores: ValoresTabla;
  onCambiar: (tipo: TipoTiempo, campo: 'alistar' | 'entrega', tiempo: Tiempo) => void;
  deshabilitado?: boolean;
  /** La pestaña muestra la descripción de cada tipo; el diálogo de la sede, no. */
  conDescripcion?: boolean;
}

export function TablaTiempos({ idPrefijo, valores, onCambiar, deshabilitado, conDescripcion = false }: Props) {
  const t = useTranslations('pedidosOnlineTiempos');
  const columnas = 'sm:grid sm:grid-cols-[minmax(0,1fr)_170px_170px] sm:items-center sm:gap-4';
  return (
    <div role="table" aria-label={t('porDefecto.titulo')} className="flex flex-col">
      <div role="row" className={cn('hidden border-y border-line py-2 text-xs font-medium text-fg-secondary', columnas)}>
        <span role="columnheader">{t('tabla.tipo')}</span>
        <span role="columnheader">{t('tabla.alistar')}</span>
        <span role="columnheader">{t('tabla.entrega')}</span>
      </div>
      {TIPOS_TIEMPO.map((tipo) => {
        const v = valores[tipo];
        const nombre = t(`tipos.${tipo}.titulo`);
        return (
          <div role="row" key={tipo} className={cn('flex flex-col gap-2 border-b border-line py-3', columnas)}>
            <div role="cell" className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-fg">{nombre}</span>
              {conDescripcion && <span className="text-[13px] leading-[18px] text-fg-secondary">{t(`tipos.${tipo}.descripcion`)}</span>}
            </div>
            <div role="cell" className="flex flex-col gap-1">
              <span className="text-xs text-fg-secondary sm:hidden">{t('tabla.alistar')}</span>
              <CampoTiempo
                id={`${idPrefijo}-${tipo}-alistar`}
                tiempo={v.alistar}
                minimo={1}
                etiquetaValor={t('tabla.valor', { campo: t('tabla.alistar'), tipo: nombre })}
                etiquetaUnidad={t('tabla.unidad', { campo: t('tabla.alistar'), tipo: nombre })}
                deshabilitado={deshabilitado}
                onCambiar={(x) => onCambiar(tipo, 'alistar', x)}
              />
            </div>
            <div role="cell" className="flex flex-col gap-1">
              <span className="text-xs text-fg-secondary sm:hidden">{t('tabla.entrega')}</span>
              {v.entrega ? (
                <CampoTiempo
                  id={`${idPrefijo}-${tipo}-entrega`}
                  tiempo={v.entrega}
                  minimo={0}
                  etiquetaValor={t('tabla.valor', { campo: t('tabla.entrega'), tipo: nombre })}
                  etiquetaUnidad={t('tabla.unidad', { campo: t('tabla.entrega'), tipo: nombre })}
                  deshabilitado={deshabilitado}
                  onCambiar={(x) => onCambiar(tipo, 'entrega', x)}
                />
              ) : (
                <span className="flex h-10 items-center rounded-md bg-subtle px-3 text-sm text-fg-muted">{t('tabla.noAplica')}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
