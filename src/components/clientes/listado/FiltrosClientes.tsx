'use client';

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

export const ETIQUETA_TIPO: Record<string, string> = { persona: 'Persona', empresa: 'Empresa' };
export const ETIQUETA_SALDO: Record<string, string> = {
  con_saldo: 'Con saldo',
  sin_saldo: 'Sin saldo',
  vencido: 'Vencido',
};
export const ETIQUETA_ESTADO: Record<string, string> = { inactivos: 'Inactivos', todos: 'Todos' };

export const OPCIONES_ORDEN: { valor: string; etiqueta: string; orden: OrdenListado }[] = [
  { valor: 'nombre_asc', etiqueta: 'Nombre (A–Z)', orden: { campo: 'nombre', direccion: 'asc' } },
  { valor: 'nombre_desc', etiqueta: 'Nombre (Z–A)', orden: { campo: 'nombre', direccion: 'desc' } },
  { valor: 'ultima_compra_desc', etiqueta: 'Última compra (más reciente)', orden: { campo: 'ultima_compra', direccion: 'desc' } },
  { valor: 'ultima_compra_asc', etiqueta: 'Última compra (más antigua)', orden: { campo: 'ultima_compra', direccion: 'asc' } },
  { valor: 'saldo_desc', etiqueta: 'Mayor saldo', orden: { campo: 'saldo', direccion: 'desc' } },
  { valor: 'saldo_asc', etiqueta: 'Menor saldo', orden: { campo: 'saldo', direccion: 'asc' } },
  { valor: 'ventas_desc', etiqueta: 'Más ventas', orden: { campo: 'ventas', direccion: 'desc' } },
  { valor: 'creado_desc', etiqueta: 'Más recientes', orden: { campo: 'creado', direccion: 'desc' } },
];

/** Chips de los filtros activos, con la etiqueta legible de cada valor. */
export function chipsClientes(filtros: Record<string, string>, opciones: OpcionesFiltroClientes): ChipFiltro[] {
  const chips: ChipFiltro[] = [];
  if (filtros.tipo) chips.push({ clave: 'tipo', etiqueta: `Tipo: ${ETIQUETA_TIPO[filtros.tipo] ?? filtros.tipo}` });
  if (filtros.estado) chips.push({ clave: 'estado', etiqueta: `Estado: ${ETIQUETA_ESTADO[filtros.estado] ?? filtros.estado}` });
  if (filtros.saldo) chips.push({ clave: 'saldo', etiqueta: `Cartera: ${ETIQUETA_SALDO[filtros.saldo] ?? filtros.saldo}` });
  if (filtros.rol) {
    const r = opciones.roles.find((o) => o.valor === filtros.rol);
    chips.push({ clave: 'rol', etiqueta: `Rol: ${r?.etiqueta ?? filtros.rol}` });
  }
  if (filtros.etiqueta) chips.push({ clave: 'etiqueta', etiqueta: `Etiqueta: ${filtros.etiqueta}` });
  if (filtros.municipio) {
    const m = opciones.municipios.find((o) => o.valor === filtros.municipio);
    chips.push({ clave: 'municipio', etiqueta: `Municipio: ${m?.etiqueta ?? 'seleccionado'}` });
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
  const f = listado.filtros;
  const ordenActual =
    OPCIONES_ORDEN.find((o) => o.orden.campo === listado.orden?.campo && o.orden.direccion === listado.orden?.direccion)?.valor ??
    'nombre_asc';

  return (
    <>
      <FormField etiqueta="Tipo">
        {(c) => (
          <SegmentedControl
            aria-labelledby={c.idEtiqueta}
            anchoCompleto
            valor={f.tipo ?? 'todos'}
            onValorChange={(v) => listado.setFiltro('tipo', v === 'todos' ? null : v)}
            opciones={[
              { valor: 'todos', etiqueta: 'Todos' },
              { valor: 'persona', etiqueta: 'Persona' },
              { valor: 'empresa', etiqueta: 'Empresa' },
            ]}
          />
        )}
      </FormField>

      <FormField etiqueta="Estado">
        {(c) => (
          <SegmentedControl
            aria-labelledby={c.idEtiqueta}
            anchoCompleto
            valor={f.estado ?? 'activos'}
            onValorChange={(v) => listado.setFiltro('estado', v === 'activos' ? null : v)}
            opciones={[
              { valor: 'activos', etiqueta: 'Activos' },
              { valor: 'inactivos', etiqueta: 'Inactivos' },
              { valor: 'todos', etiqueta: 'Todos' },
            ]}
          />
        )}
      </FormField>

      <SelectFiltro
        etiqueta="Cartera"
        valor={f.saldo}
        onCambio={(v) => listado.setFiltro('saldo', v)}
        textoTodos="Todos los saldos"
        opciones={[
          { valor: 'con_saldo', etiqueta: 'Con saldo pendiente' },
          { valor: 'sin_saldo', etiqueta: 'Sin saldo pendiente' },
          { valor: 'vencido', etiqueta: 'Con cartera vencida' },
        ]}
      />
      <SelectFiltro etiqueta="Rol" valor={f.rol} onCambio={(v) => listado.setFiltro('rol', v)} textoTodos="Todos los roles" opciones={opciones.roles} />
      <SelectFiltro
        etiqueta="Etiqueta"
        valor={f.etiqueta}
        onCambio={(v) => listado.setFiltro('etiqueta', v)}
        textoTodos="Todas las etiquetas"
        opciones={opciones.etiquetas}
      />
      <SelectFiltro
        etiqueta="Municipio"
        valor={f.municipio}
        onCambio={(v) => listado.setFiltro('municipio', v)}
        textoTodos="Todos los municipios"
        opciones={opciones.municipios}
      />

      {conOrden && (
        <FormField etiqueta="Ordenar por">
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
                    {o.etiqueta}
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
