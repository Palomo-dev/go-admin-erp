'use client';

import { useTranslations } from 'next-intl';
import { FormField, SegmentedControl, type ChipFiltro, type ListadoServidor, type OrdenListado } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OpcionesFiltroClientes } from '@/lib/services/clientesListadoService';

/**
 * Campos del FilterPanel de Clientes (Figma CAT-FILTROS): Tipo, Estado,
 * Cartera, Rol, Etiqueta y Municipio. Rol, etiqueta y municipio salen del
 * catálogo de la organización (fn_clientes_opciones_filtro), no de la página
 * cargada. En móvil va además «Ordenar por» (en escritorio se ordena desde
 * las cabeceras de la tabla).
 */
const TODOS = '__todos__';

/** Traductor del namespace `clientes.listado`. */
export type TraductorFiltros = (clave: string, valores?: Record<string, string | number>) => string;

/** Valor del filtro (en la URL) → clave de `clientes.listado.chips.valores`. */
const CLAVE_TIPO: Record<string, string> = { persona: 'persona', empresa: 'empresa' };
const CLAVE_SALDO: Record<string, string> = { con_saldo: 'conSaldo', sin_saldo: 'sinSaldo', vencido: 'vencido' };
const CLAVE_ESTADO: Record<string, string> = { inactivos: 'inactivos', todos: 'todos' };

export const OPCIONES_ORDEN: { valor: string; clave: string; orden: OrdenListado }[] = [
  { valor: 'nombre_asc', clave: 'nombreAsc', orden: { campo: 'nombre', direccion: 'asc' } },
  { valor: 'nombre_desc', clave: 'nombreDesc', orden: { campo: 'nombre', direccion: 'desc' } },
  { valor: 'ultima_compra_desc', clave: 'ultimaCompraDesc', orden: { campo: 'ultima_compra', direccion: 'desc' } },
  { valor: 'ultima_compra_asc', clave: 'ultimaCompraAsc', orden: { campo: 'ultima_compra', direccion: 'asc' } },
  { valor: 'saldo_desc', clave: 'saldoDesc', orden: { campo: 'saldo', direccion: 'desc' } },
  { valor: 'saldo_asc', clave: 'saldoAsc', orden: { campo: 'saldo', direccion: 'asc' } },
  { valor: 'ventas_desc', clave: 'ventasDesc', orden: { campo: 'ventas', direccion: 'desc' } },
  { valor: 'creado_desc', clave: 'creadoDesc', orden: { campo: 'creado', direccion: 'desc' } },
];

/**
 * Chips de los filtros activos, con la etiqueta legible de cada valor.
 * `t` es `useTranslations('clientes.listado')`.
 */
export function chipsClientes(filtros: Record<string, string>, opciones: OpcionesFiltroClientes, t: TraductorFiltros): ChipFiltro[] {
  const valor = (mapa: Record<string, string>, v: string) => (mapa[v] ? t(`chips.valores.${mapa[v]}`) : v);
  const chips: ChipFiltro[] = [];
  if (filtros.tipo) chips.push({ clave: 'tipo', etiqueta: t('chips.tipo', { valor: valor(CLAVE_TIPO, filtros.tipo) }) });
  if (filtros.estado) chips.push({ clave: 'estado', etiqueta: t('chips.estado', { valor: valor(CLAVE_ESTADO, filtros.estado) }) });
  if (filtros.saldo) chips.push({ clave: 'saldo', etiqueta: t('chips.cartera', { valor: valor(CLAVE_SALDO, filtros.saldo) }) });
  if (filtros.rol) {
    const r = opciones.roles.find((o) => o.valor === filtros.rol);
    chips.push({ clave: 'rol', etiqueta: t('chips.rol', { valor: r?.etiqueta ?? filtros.rol }) });
  }
  if (filtros.etiqueta) chips.push({ clave: 'etiqueta', etiqueta: t('chips.etiqueta', { valor: filtros.etiqueta }) });
  if (filtros.municipio) {
    const m = opciones.municipios.find((o) => o.valor === filtros.municipio);
    chips.push({ clave: 'municipio', etiqueta: t('chips.municipio', { valor: m?.etiqueta ?? t('chips.municipioSeleccionado') }) });
  }
  return chips;
}

function SelectFiltro({
  etiqueta,
  valor,
  onCambio,
  opciones,
  textoTodos,
}: {
  etiqueta: string;
  valor: string | undefined;
  onCambio: (v: string | null) => void;
  opciones: readonly { valor: string; etiqueta?: string; cantidad?: number }[];
  textoTodos: string;
}) {
  return (
    <FormField etiqueta={etiqueta}>
      {(c) => (
        <Select value={valor ?? TODOS} onValueChange={(v) => onCambio(v === TODOS ? null : v)}>
          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 rounded-lg border-line-strong bg-surface text-sm text-fg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={TODOS}>{textoTodos}</SelectItem>
            {opciones.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.etiqueta ?? o.valor}
                {o.cantidad !== undefined ? ` (${o.cantidad})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export function CamposFiltroClientes({
  listado,
  opciones,
  conOrden,
}: {
  listado: ListadoServidor;
  opciones: OpcionesFiltroClientes;
  conOrden: boolean;
}) {
  const t = useTranslations('clientes.listado');
  const f = listado.filtros;
  const ordenActual =
    OPCIONES_ORDEN.find((o) => o.orden.campo === listado.orden?.campo && o.orden.direccion === listado.orden?.direccion)?.valor ??
    'nombre_asc';

  return (
    <>
      <FormField etiqueta={t('filtros.tipo')}>
        {(c) => (
          <SegmentedControl
            aria-labelledby={c.idEtiqueta}
            anchoCompleto
            valor={f.tipo ?? 'todos'}
            onValorChange={(v) => listado.setFiltro('tipo', v === 'todos' ? null : v)}
            opciones={[
              { valor: 'todos', etiqueta: t('filtros.todos') },
              { valor: 'persona', etiqueta: t('filtros.persona') },
              { valor: 'empresa', etiqueta: t('filtros.empresa') },
            ]}
          />
        )}
      </FormField>

      <FormField etiqueta={t('filtros.estado')}>
        {(c) => (
          <SegmentedControl
            aria-labelledby={c.idEtiqueta}
            anchoCompleto
            valor={f.estado ?? 'activos'}
            onValorChange={(v) => listado.setFiltro('estado', v === 'activos' ? null : v)}
            opciones={[
              { valor: 'activos', etiqueta: t('filtros.activos') },
              { valor: 'inactivos', etiqueta: t('filtros.inactivos') },
              { valor: 'todos', etiqueta: t('filtros.todos') },
            ]}
          />
        )}
      </FormField>

      <SelectFiltro
        etiqueta={t('filtros.cartera')}
        valor={f.saldo}
        onCambio={(v) => listado.setFiltro('saldo', v)}
        textoTodos={t('filtros.todosSaldos')}
        opciones={[
          { valor: 'con_saldo', etiqueta: t('filtros.conSaldoPendiente') },
          { valor: 'sin_saldo', etiqueta: t('filtros.sinSaldoPendiente') },
          { valor: 'vencido', etiqueta: t('filtros.conCarteraVencida') },
        ]}
      />
      <SelectFiltro
        etiqueta={t('filtros.rol')}
        valor={f.rol}
        onCambio={(v) => listado.setFiltro('rol', v)}
        textoTodos={t('filtros.todosRoles')}
        opciones={opciones.roles}
      />
      <SelectFiltro
        etiqueta={t('filtros.etiqueta')}
        valor={f.etiqueta}
        onCambio={(v) => listado.setFiltro('etiqueta', v)}
        textoTodos={t('filtros.todasEtiquetas')}
        opciones={opciones.etiquetas}
      />
      <SelectFiltro
        etiqueta={t('filtros.municipio')}
        valor={f.municipio}
        onCambio={(v) => listado.setFiltro('municipio', v)}
        textoTodos={t('filtros.todosMunicipios')}
        opciones={opciones.municipios}
      />

      {conOrden && (
        <FormField etiqueta={t('filtros.ordenarPor')}>
          {(c) => (
            <Select
              value={ordenActual}
              onValueChange={(v) => listado.setOrden(OPCIONES_ORDEN.find((o) => o.valor === v)?.orden ?? null)}
            >
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 rounded-lg border-line-strong bg-surface text-sm text-fg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPCIONES_ORDEN.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    {t(`orden.${o.clave}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
    </>
  );
}
