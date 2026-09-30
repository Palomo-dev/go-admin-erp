'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Pagination } from '@/components/kit/Pagination';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { OpportunityRowMenu } from '@/components/crm/kit/OpportunityRowMenu';
import { diaRelativo, diasDesde, fechaCortaInstante, fechaCortaPlana, horaEnZona, yaPaso } from '@/components/crm/kit/fechasCrm';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { nombreUsuario } from '@/components/crm/acciones/catalogosCrmLogica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import type { OrdenOportunidades } from './filtrosLogica';
import { permisosFila, type OportunidadApi, type PermisosPantalla } from './oportunidadLogica';
import type { useAccionesOportunidad } from './useAccionesOportunidad';

/**
 * Tabla de oportunidades (Figma 768:459368 vista Tabla del Pipeline y
 * 773:23160 lista de Oportunidades): selección por página, orden en el
 * servidor, «Lead» en las heredadas (D2), próximo contacto en rojo si venció
 * (día de la organización) y menú «⋯» (`OpportunityRowMenu`).
 */
export interface TablaOportunidadesProps {
  filas: readonly OportunidadApi[];
  cargando: boolean;
  usuarios: readonly OpcionUsuario[];
  usuarioId: string | null;
  permisos: PermisosPantalla;
  acciones: ReturnType<typeof useAccionesOportunidad>;
  seleccion: ReadonlySet<string>;
  onSeleccion: (id: string) => void;
  onSeleccionPagina: () => void;
  onAbrir: (id: string) => void;
  orden: OrdenOportunidades;
  ascendente: boolean;
  onOrden: (orden: OrdenOportunidades) => void;
  /** La lista muestra «Cierre»; la vista Tabla del Pipeline no. */
  conCierre?: boolean;
  pagina: number;
  tamano: number;
  total: number;
  onPagina: (p: number) => void;
  onTamano: (n: number) => void;
  ahora?: Date;
}

export function TablaOportunidades(p: TablaOportunidadesProps) {
  const t = useTranslations('crm.oportunidad.tabla');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const ahora = p.ahora ?? new Date();
  const ids = p.filas.map((f) => f.id);
  const marcadas = ids.filter((i) => p.seleccion.has(i)).length;
  const casilla = marcadas === 0 ? false : marcadas === ids.length ? true : 'indeterminate';

  const proximo = (op: OportunidadApi) => {
    if (!op.next_contact_at || op.status === 'won' || op.status === 'lost') return { texto: '—', vencido: false };
    if (yaPaso(op.next_contact_at, ahora)) return { texto: t('vencido', { dias: Math.max(diasDesde(op.next_contact_at, ahora, timezone) ?? 0, 0) }), vencido: true };
    const r = diaRelativo(op.next_contact_at, ahora, timezone);
    if (r?.tipo === 'hoy') return { texto: t('hoy', { hora: r.hora }), vencido: false };
    if (r?.tipo === 'manana') return { texto: t('manana', { hora: r.hora }), vencido: false };
    return { texto: `${fechaCortaInstante(op.next_contact_at, timezone, idioma)} ${horaEnZona(op.next_contact_at, timezone)}`, vencido: false };
  };

  const cabecera = (col: OrdenOportunidades | null, etiqueta: string, alinear: 'left' | 'right' = 'left') => {
    const activo = col !== null && p.orden === col;
    const Icono = !activo ? ArrowUpDown : p.ascendente ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={activo ? (p.ascendente ? 'ascending' : 'descending') : undefined} className={cn('h-10 px-3 text-xs font-medium text-fg-secondary', alinear === 'right' ? 'text-right' : 'text-left')}>
        {col ? (
          <button type="button" onClick={() => p.onOrden(col)} className={cn('inline-flex items-center gap-1 hover:text-fg', alinear === 'right' && 'flex-row-reverse')}>
            {etiqueta}
            <Icono aria-hidden="true" className="size-3.5" />
          </button>
        ) : (
          etiqueta
        )}
      </th>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse" aria-busy={p.cargando || undefined}>
          <thead className="bg-subtle">
            <tr>
              <th scope="col" className="h-10 w-10 px-3">
                <Checkbox checked={casilla} onCheckedChange={p.onSeleccionPagina} aria-label={t('seleccionarPagina')} className="size-[18px] rounded" />
              </th>
              {cabecera('nombre', t('oportunidad'))}
              {cabecera(null, t('etapa'))}
              {cabecera('monto', t('monto'), 'right')}
              {cabecera(null, t('prob'), 'right')}
              {p.conCierre && cabecera('cierre', t('cierre'))}
              {cabecera(null, t('responsable'))}
              {cabecera('proximo', t('proximo'))}
              <th scope="col" className="w-12"><span className="sr-only">{t('acciones')}</span></th>
            </tr>
          </thead>
          <tbody>
            {p.cargando && p.filas.length === 0
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-t border-line" aria-hidden="true">
                    <td colSpan={p.conCierre ? 9 : 8} className="px-3 py-3"><div className="h-8 animate-pulse rounded bg-subtle" /></td>
                  </tr>
                ))
              : p.filas.map((op) => {
                  const prox = proximo(op);
                  const sel = p.seleccion.has(op.id);
                  return (
                    <tr key={op.id} className={cn('border-t border-line', sel && 'bg-brand-tint')}>
                      <td className="px-3"><Checkbox checked={sel} onCheckedChange={() => p.onSeleccion(op.id)} aria-label={t('seleccionar', { nombre: op.name })} className="size-[18px] rounded" /></td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => p.onAbrir(op.id)} className="flex flex-col text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                          <span className="flex items-center gap-2 text-sm font-medium text-fg">
                            {op.name}
                            {op.es_lead && <Badge tono="neutro" apariencia="contorno" tamano="sm">{t('lead')}</Badge>}
                          </span>
                          <span className="text-xs text-fg-secondary">{op.cliente_nombre ?? t('sinCliente')}</span>
                        </button>
                      </td>
                      <td className="px-3">{op.etapa?.name && <Badge tono={op.etapa.is_won ? 'exito' : op.etapa.is_lost ? 'peligro' : 'marca'} apariencia="contorno" tamano="sm">{op.etapa.name}</Badge>}</td>
                      <td className="px-3 text-right text-sm font-medium tabular-nums text-fg">{formatMoneda(op.amount, moneda.paraDocumento(op.currency))}</td>
                      <td className="px-3 text-right text-sm tabular-nums text-fg">{typeof op.etapa?.probability === 'number' ? `${op.etapa.probability} %` : '—'}</td>
                      {p.conCierre && <td className="px-3 text-sm text-fg">{op.expected_close_date ? fechaCortaPlana(op.expected_close_date, idioma) : '—'}</td>}
                      <td className="px-3 text-sm text-fg">{nombreUsuario(p.usuarios, op.salesperson_id) ?? t('sinResponsable')}</td>
                      <td className={cn('px-3 text-sm', prox.vencido ? 'font-medium text-danger-text' : 'text-fg')}>{prox.texto}</td>
                      <td className="px-2 text-right">
                        <OpportunityRowMenu titulo={op.name} status={op.status} permisos={permisosFila(p.permisos, p.usuarioId, op)} onAccion={(a) => p.acciones.alMenu(op, a)} />
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      <Pagination
        pagina={p.pagina}
        tamano={p.tamano}
        total={p.total}
        onPaginaChange={p.onPagina}
        onTamanoChange={p.onTamano}
        opcionesTamano={[25, 50, 100]}
        sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
        cargando={p.cargando}
        className="border-t border-line px-4 py-2"
      />
    </div>
  );
}
