'use client';

/**
 * Buscador y filtros de «Mis canales»: los mismos de la lista anterior
 * (`ChannelsList` del respaldo `backup/antes-chat-roles-2026-11-13`): nombre,
 * tipo de canal y estado. Con el patrón de listas del kit: `ListToolbar` con
 * `SearchInput`, `FilterPanel` y chips de los filtros activos.
 */
import { useTranslations } from 'next-intl';
import { FilterChips, FilterPanel, FormField, ListToolbar, SearchInput, SegmentedControl, type ChipFiltro } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ChannelType } from '@/lib/services/chatChannelsService';
import { FILTROS_CANALES_VACIOS, TIPOS_CANAL, filtrosActivos, type EstadoFiltroCanal, type FiltrosCanales as Filtros } from './canalesLogica';

const TODOS = '__todos__';

export function FiltrosCanales({ filtros, onCambio, resultados }: { filtros: Filtros; onCambio: (f: Filtros) => void; resultados: number }) {
  const t = useTranslations('chatModulo.canales');
  const limpiar = () => onCambio({ ...FILTROS_CANALES_VACIOS, busqueda: filtros.busqueda });

  const chips: ChipFiltro[] = [];
  if (filtros.tipo) chips.push({ clave: 'tipo', etiqueta: t('filtros.chipTipo', { valor: t(`tipos.${filtros.tipo}`) }) });
  if (filtros.estado) chips.push({ clave: 'estado', etiqueta: t('filtros.chipEstado', { valor: t(`filtros.estados.${filtros.estado}`) }) });

  return (
    <ListToolbar
      busqueda={
        <SearchInput
          value={filtros.busqueda}
          // Los canales ya están cargados: se filtra en cada tecla (onValueChange).
          onValueChange={(busqueda) => onCambio({ ...filtros, busqueda })}
          onChange={(busqueda) => busqueda !== filtros.busqueda && onCambio({ ...filtros, busqueda })}
          placeholder={t('filtros.buscar')}
          etiqueta={t('filtros.buscar')}
          atajo={false}
        />
      }
      filtros={
        <FilterPanel conteo={filtrosActivos(filtros)} onLimpiar={limpiar} nota={t('filtros.nota')} textoVerResultados={t('filtros.verN', { n: resultados })}>
          <FormField etiqueta={t('filtros.tipo')}>
            {(c) => (
              <Select value={filtros.tipo ?? TODOS} onValueChange={(v) => onCambio({ ...filtros, tipo: v === TODOS ? null : (v as ChannelType) })}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 rounded-lg border-line-strong bg-surface text-sm text-fg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>{t('filtros.todosLosTipos')}</SelectItem>
                  {TIPOS_CANAL.map((tp) => (
                    <SelectItem key={tp} value={tp}>
                      {t(`tipos.${tp}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('filtros.estado')}>
            {(c) => (
              <SegmentedControl
                aria-labelledby={c.idEtiqueta}
                anchoCompleto
                valor={filtros.estado ?? 'todos'}
                onValorChange={(v) => onCambio({ ...filtros, estado: v === 'todos' ? null : (v as EstadoFiltroCanal) })}
                opciones={[
                  { valor: 'todos', etiqueta: t('filtros.estados.todos') },
                  { valor: 'active', etiqueta: t('filtros.estados.active') },
                  { valor: 'inactive', etiqueta: t('filtros.estados.inactive') },
                ]}
              />
            )}
          </FormField>
        </FilterPanel>
      }
      chips={chips.length > 0 ? <FilterChips chips={chips} onQuitar={(clave) => onCambio({ ...filtros, [clave]: null })} onLimpiarTodo={limpiar} /> : undefined}
    />
  );
}
