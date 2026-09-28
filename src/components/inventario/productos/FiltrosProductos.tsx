"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  FilterChips,
  FilterPanel,
  FormField,
  ListToolbar,
  SearchInput,
  SegmentedControl,
  useEsEscritorio,
  type ListadoServidor,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import {
  chipsFiltros,
  ESTADOS_PRODUCTO,
  OPCIONES_IMAGEN,
  OPCIONES_ORDEN,
  OPCIONES_STOCK,
  OPCIONES_TIPO,
} from './catalogoVista';

/**
 * Buscador único + «Filtros» + chips del catálogo (PATRONES §3, Figma
 * «Catálogo de productos · filtros»). Sustituye a los dos buscadores, los dos
 * filtros de estado y los dos «Limpiar» de antes:
 *
 * - El buscador es híbrido: filtra al instante lo ya cargado
 *   (`onBusquedaRapida`) y a los 400 ms refina en el servidor (URL `q`).
 * - Categoría y estado van a la RPC; imagen, tipo, stock, variantes y
 *   modificadores se aplican en el navegador sobre lo cargado.
 * - La sucursal no es un filtro: es el selector del header.
 */
export interface FiltrosProductosProps {
  listado: ListadoServidor;
  onBusquedaRapida: (texto: string) => void;
  /** El servidor está respondiendo a la búsqueda (puntito, no esqueleto). */
  buscando?: boolean;
  /** Resultados con los filtros actuales, para «Ver N productos» (móvil). */
  totalResultados: number;
}

const TODOS = 'todos';

const FiltrosProductos: React.FC<FiltrosProductosProps> = ({ listado, onBusquedaRapida, buscando, totalResultados }) => {
  const t = useTranslations('productos.filtros');
  const entero = useFormatoEntero();
  const { organization } = useOrganization();
  const escritorio = useEsEscritorio();
  const [categorias, setCategorias] = useState<{ id: number; name: string }[]>([]);
  const f = listado.filtros;

  useEffect(() => {
    if (!organization?.id) return;
    let vigente = true;
    supabase
      .from('categories')
      .select('id, name')
      .eq('organization_id', organization.id)
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('Error al cargar categorías:', error.message);
        if (vigente) setCategorias(data ?? []);
      });
    return () => {
      vigente = false;
    };
  }, [organization?.id]);

  const opcionesCategoria: SearchSelectOption[] = useMemo(
    () => categorias.map((c) => ({ value: String(c.id), label: c.name })),
    [categorias],
  );

  const chips = useMemo(
    () => chipsFiltros(f, (id) => categorias.find((c) => String(c.id) === id)?.name, t),
    [f, categorias, t],
  );

  const setFiltro = (clave: string, valor: string | null) => listado.setFiltro(clave, valor && valor !== TODOS ? valor : null);
  const ordenActual = OPCIONES_ORDEN.findIndex(
    (o) => o.campo === listado.orden?.campo && o.direccion === listado.orden?.direccion,
  );

  return (
    <ListToolbar
      busqueda={
        <SearchInput
          value={listado.busqueda}
          onChange={listado.setBusqueda}
          onValueChange={onBusquedaRapida}
          placeholder={t('buscar.placeholder')}
          etiqueta={t('buscar.etiqueta')}
          cargando={buscando}
        />
      }
      filtros={
        <FilterPanel
          conteo={listado.filtrosActivos}
          onLimpiar={listado.limpiarFiltros}
          textoVerResultados={t('verResultados', { count: totalResultados, n: entero(totalResultados) })}
          nota={t('nota')}
        >
          {!escritorio && (
            <FormField etiqueta={t('ordenarPor')}>
              {(campo) => (
                <Select
                  value={ordenActual >= 0 ? String(ordenActual) : '0'}
                  onValueChange={(v) => {
                    const o = OPCIONES_ORDEN[Number(v)];
                    if (o) listado.setOrden({ campo: o.campo, direccion: o.direccion });
                  }}
                >
                  <SelectTrigger id={campo.id} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPCIONES_ORDEN.map((o, i) => (
                      <SelectItem key={`${o.campo}-${o.direccion}`} value={String(i)}>
                        {t(`orden.${o.campo}_${o.direccion}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          )}

          <FormField etiqueta={t('categoria')}>
            {() => (
              <SearchSelect
                options={opcionesCategoria}
                value={f.categoria ?? TODOS}
                onValueChange={(v) => setFiltro('categoria', v)}
                placeholder={t('todas')}
                searchPlaceholder={t('buscarCategoria')}
                emptyText={t('sinCategorias')}
                noneLabel={t('todas')}
                noneValue={TODOS}
                className="h-10"
              />
            )}
          </FormField>

          <FormField etiqueta={t('estado')} ayuda={f.estado ? undefined : t('estadoAyuda')}>
            {(campo) => (
              <Select value={f.estado ?? TODOS} onValueChange={(v) => setFiltro('estado', v)}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>{t('todos')}</SelectItem>
                  {ESTADOS_PRODUCTO.map((e) => (
                    <SelectItem key={e.valor} value={e.valor}>
                      {t(`estados.${e.valor}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField etiqueta={t('imagen.etiqueta')}>
            {(campo) => (
              <SegmentedControl
                aria-labelledby={campo.idEtiqueta}
                anchoCompleto
                valor={f.imagen ?? TODOS}
                onValorChange={(v) => setFiltro('imagen', v)}
                opciones={[{ valor: TODOS, etiqueta: t('todas') }, ...OPCIONES_IMAGEN.map((o) => ({ valor: o.valor, etiqueta: t(`imagen.${o.valor}`) }))]}
              />
            )}
          </FormField>

          <FormField etiqueta={t('tipo.etiqueta')}>
            {(campo) => (
              <SegmentedControl
                aria-labelledby={campo.idEtiqueta}
                anchoCompleto
                valor={f.tipo ?? TODOS}
                onValorChange={(v) => setFiltro('tipo', v)}
                opciones={[{ valor: TODOS, etiqueta: t('todos') }, ...OPCIONES_TIPO.map((o) => ({ valor: o.valor, etiqueta: t(`tipo.${o.valor}`) }))]}
              />
            )}
          </FormField>

          <FormField etiqueta={t('stock.etiqueta')} ayuda={t('stockAyuda')}>
            {(campo) => (
              <Select value={f.stock ?? TODOS} onValueChange={(v) => setFiltro('stock', v)}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>{t('todos')}</SelectItem>
                  {OPCIONES_STOCK.map((o) => (
                    <SelectItem key={o.valor} value={o.valor}>
                      {t(`stock.${o.valor}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <Checkbox
                checked={!!f.variantes}
                onCheckedChange={(v) => setFiltro('variantes', v === true ? 'si' : null)}
                className="size-[18px] rounded"
              />
              {t('chips.variantes')}
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <Checkbox
                checked={!!f.modificadores}
                onCheckedChange={(v) => setFiltro('modificadores', v === true ? 'si' : null)}
                className="size-[18px] rounded"
              />
              {t('chips.modificadores')}
            </label>
          </div>
        </FilterPanel>
      }
      chips={
        <FilterChips
          chips={chips}
          onQuitar={(clave) => listado.setFiltro(clave, null)}
          onLimpiarTodo={listado.limpiarTodo}
        />
      }
    />
  );
};

export default FiltrosProductos;
