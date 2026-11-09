'use client';

/**
 * Campos del `FilterPanel` («Filtros») de Integraciones › Conexiones, por pestaña. Los valores
 * viven en la URL (`useListadoServidor`), como en Clientes o Anticipos; aquí solo se dibujan los
 * controles con las piezas del kit (FormField + Select de ui, SegmentedControl, CampoFecha).
 */
import { useTranslations } from 'next-intl';
import { FormField, SegmentedControl, type ListadoServidor } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ConexionResumen } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { ORDEN_GRUPOS } from './presentacion';
import {
  ESTADOS_CATALOGO_FILTRO,
  ESTADOS_CONEXION_FILTRO,
  ESTADOS_EVENTO_FILTRO,
  ESTADOS_LLAVE_FILTRO,
  PERIODOS_FILTRO,
  SENTIDOS_FILTRO,
  type Pestana,
} from './filtrosConexiones';

const TODOS = '__todos__';

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
  opciones: readonly { valor: string; etiqueta: string }[];
  textoTodos: string;
}) {
  return (
    <FormField etiqueta={etiqueta}>
      {(c) => (
        <Select value={valor && opciones.some((o) => o.valor === valor) ? valor : TODOS} onValueChange={(v) => onCambio(v === TODOS ? null : v)}>
          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 rounded-lg border-line-strong bg-surface text-sm text-fg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={TODOS}>{textoTodos}</SelectItem>
            {opciones.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export interface FiltrosConexionesProps {
  tab: Pestana;
  listado: ListadoServidor;
  conexiones: readonly ConexionResumen[];
  nombreConexion: (id: string) => string;
}

export function CamposFiltroConexiones({ tab, listado, conexiones, nombreConexion }: FiltrosConexionesProps) {
  const t = useTranslations('integracionesConexiones');
  const f = listado.filtros;
  const grupos = ORDEN_GRUPOS.map((g) => ({ valor: g, etiqueta: t(`grupos.${g}.chip`) }));

  if (tab === 'catalogo') {
    return (
      <>
        <SelectFiltro etiqueta={t('filtros.grupo')} valor={f.grupo} onCambio={(v) => listado.setFiltro('grupo', v)} opciones={grupos} textoTodos={t('filtros.todos')} />
        <SelectFiltro
          etiqueta={t('filtros.estado')}
          valor={f.estado}
          onCambio={(v) => listado.setFiltro('estado', v)}
          opciones={ESTADOS_CATALOGO_FILTRO.map((e) => ({ valor: e, etiqueta: t(`estados.catalogo.${e}`) }))}
          textoTodos={t('filtros.todos')}
        />
      </>
    );
  }

  if (tab === 'mis') {
    return (
      <>
        <SelectFiltro
          etiqueta={t('filtros.estado')}
          valor={f.estado}
          onCambio={(v) => listado.setFiltro('estado', v)}
          opciones={ESTADOS_CONEXION_FILTRO.map((e) => ({ valor: e, etiqueta: t(`estados.conexion.${e}`) }))}
          textoTodos={t('filtros.todos')}
        />
        <SelectFiltro etiqueta={t('filtros.grupo')} valor={f.grupo} onCambio={(v) => listado.setFiltro('grupo', v)} opciones={grupos} textoTodos={t('filtros.todos')} />
        <FormField etiqueta={t('filtros.atencion')}>
          {(c) => (
            <SegmentedControl
              aria-labelledby={c.idEtiqueta}
              anchoCompleto
              valor={f.atencion === '1' ? 'si' : 'todas'}
              onValorChange={(v) => listado.setFiltro('atencion', v === 'si' ? '1' : null)}
              opciones={[
                { valor: 'todas', etiqueta: t('filtros.todas') },
                { valor: 'si', etiqueta: t('filtros.atencionSolo') },
              ]}
            />
          )}
        </FormField>
      </>
    );
  }

  if (tab === 'actividad') {
    return (
      <>
        <SelectFiltro
          etiqueta={t('filtros.conexion')}
          valor={f.conexion}
          onCambio={(v) => listado.actualizar({ filtros: { ...sinRapidos(f), ...(v ? { conexion: v } : {}) } })}
          opciones={conexiones.map((c) => ({ valor: c.id, etiqueta: nombreConexion(c.id) }))}
          textoTodos={t('filtros.todasConexiones')}
        />
        <SelectFiltro
          etiqueta={t('filtros.resultado')}
          valor={f.estado}
          onCambio={(v) => listado.actualizar({ filtros: { ...f, errores: '', ...(v ? { estado: v } : { estado: '' }) } })}
          opciones={ESTADOS_EVENTO_FILTRO.map((e) => ({ valor: e, etiqueta: t(`filtros.valores.estadoEvento.${e}`) }))}
          textoTodos={t('filtros.todos')}
        />
        <FormField etiqueta={t('filtros.sentido')}>
          {(c) => (
            <SegmentedControl
              aria-labelledby={c.idEtiqueta}
              anchoCompleto
              valor={f.sentido && (SENTIDOS_FILTRO as readonly string[]).includes(f.sentido) ? f.sentido : 'todos'}
              onValorChange={(v) => listado.setFiltro('sentido', v === 'todos' ? null : v)}
              opciones={[
                { valor: 'todos', etiqueta: t('filtros.todos') },
                ...SENTIDOS_FILTRO.map((s) => ({ valor: s, etiqueta: t(`actividad.sentido.${s}`) })),
              ]}
            />
          )}
        </FormField>
        <FormField etiqueta={t('filtros.periodo')}>
          {(c) => (
            <SegmentedControl
              aria-labelledby={c.idEtiqueta}
              anchoCompleto
              valor={f.periodo && (PERIODOS_FILTRO as readonly string[]).includes(f.periodo) ? f.periodo : 'todo'}
              onValorChange={(v) => listado.setFiltro('periodo', v === 'todo' ? null : v)}
              opciones={[
                { valor: 'todo', etiqueta: t('filtros.todos') },
                ...PERIODOS_FILTRO.map((p) => ({ valor: p, etiqueta: t(`filtros.valores.periodo.${p}`) })),
              ]}
            />
          )}
        </FormField>
        {/* 85-57: casillas finas. «Con reintentos» no se ofrece: `integration_events` no guarda intentos. */}
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t('filtros.origen')}</legend>
          <CasillaFiltro etiqueta={t('filtros.soloWebhooks')} marcada={f.webhooks === '1'} onCambio={(v) => listado.setFiltro('webhooks', v ? '1' : null)} />
          <CasillaFiltro etiqueta={t('filtros.soloPruebas')} marcada={f.pruebas === '1'} onCambio={(v) => listado.setFiltro('pruebas', v ? '1' : null)} />
        </fieldset>
      </>
    );
  }

  return (
    <FormField etiqueta={t('filtros.estadoLlaves')}>
      {(c) => (
        <SegmentedControl
          aria-labelledby={c.idEtiqueta}
          anchoCompleto
          valor={f.estado && (ESTADOS_LLAVE_FILTRO as readonly string[]).includes(f.estado) ? f.estado : 'todas'}
          onValorChange={(v) => listado.setFiltro('estado', v === 'todas' ? null : v)}
          opciones={[
            { valor: 'todas', etiqueta: t('filtros.todas') },
            ...ESTADOS_LLAVE_FILTRO.map((e) => ({ valor: e, etiqueta: t(`filtros.valores.estadoLlave.${e}`) })),
          ]}
        />
      )}
    </FormField>
  );
}

function CasillaFiltro({ etiqueta, marcada, onCambio }: { etiqueta: string; marcada: boolean; onCambio: (v: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-fg">
      <input type="checkbox" className="size-4 accent-brand-action" checked={marcada} onChange={(e) => onCambio(e.target.checked)} />
      {etiqueta}
    </label>
  );
}

/** Los chips rápidos de Actividad (errores, hoy, conexión) son excluyentes con el filtro de conexión. */
function sinRapidos(f: Record<string, string>): Record<string, string> {
  const copia = { ...f };
  delete copia.conexion;
  delete copia.errores;
  delete copia.periodo;
  return copia;
}
