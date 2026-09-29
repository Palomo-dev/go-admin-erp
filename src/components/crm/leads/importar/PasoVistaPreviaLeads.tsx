'use client';

import { useMemo, useState } from 'react';
import { Ban, RotateCcw, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable, ListCard, Pagination, SearchInput, SegmentedControl, calcularRango, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { normalizarNombre } from '@/lib/inventario/importacion/texto';
import type { ResultadoFilaLead } from '@/lib/crm/importacionLeads/tipos';
import type { ImportarLeads } from './useImportarLeads';
import { useTextosLeads } from './useTextosLeads';

type Filtro = 'todas' | 'importar' | 'omitir' | 'error';

const TONO = { crear: 'exito', ligar: 'informacion', omitir: 'neutro', error: 'peligro' } as const;

export function PasoVistaPreviaLeads({ a }: { a: ImportarLeads }) {
  const { t, accion, detalle } = useTextosLeads();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const resultados = useMemo(() => a.validacion?.resultados ?? [], [a.validacion]);
  const ciudades = useMemo(() => new Map(a.filas.map((f) => [f.fila, f.campos.ciudad ?? ''])), [a.filas]);

  const importable = (r: ResultadoFilaLead) => r.accion === 'crear' || r.accion === 'ligar';
  const filtradas = useMemo(() => {
    const q = normalizarNombre(busqueda);
    return resultados.filter((r) => {
      if (filtro === 'importar' && (!importable(r) || a.excluidas.has(r.fila))) return false;
      if (filtro === 'omitir' && r.accion !== 'omitir' && !a.excluidas.has(r.fila)) return false;
      if (filtro === 'error' && r.accion !== 'error') return false;
      return !q || normalizarNombre(`${r.nombre} ${r.telefono ?? ''} ${ciudades.get(r.fila) ?? ''}`).includes(q);
    });
  }, [resultados, filtro, busqueda, a.excluidas, ciudades]);

  const cuenta = useMemo(
    () => ({
      importar: resultados.filter((r) => importable(r) && !a.excluidas.has(r.fila)).length,
      omitir: resultados.filter((r) => r.accion === 'omitir' || (importable(r) && a.excluidas.has(r.fila))).length,
      error: resultados.filter((r) => r.accion === 'error').length,
    }),
    [resultados, a.excluidas],
  );

  const rango = calcularRango(pagina, tamano, filtradas.length);
  const visibles = filtradas.slice(rango.desde ? rango.desde - 1 : 0, rango.hasta);

  const excluida = (r: ResultadoFilaLead) => importable(r) && a.excluidas.has(r.fila);
  const badge = (r: ResultadoFilaLead) => (
    <Badge tono={excluida(r) ? 'neutro' : TONO[r.accion]} tamano="sm" punto>
      {accion(r, excluida(r))}
    </Badge>
  );
  const accionesDe = (r: ResultadoFilaLead): AccionFila[] =>
    importable(r)
      ? [
          a.excluidas.has(r.fila)
            ? { id: 'incluir', etiqueta: t('vista.incluir'), icono: RotateCcw, onSelect: () => a.alternarExclusion(r.fila) }
            : { id: 'excluir', etiqueta: t('vista.excluir'), icono: Ban, onSelect: () => a.alternarExclusion(r.fila) },
        ]
      : [];

  const columnas: ColumnaTabla<ResultadoFilaLead>[] = [
    { id: 'accion', encabezado: t('vista.columnas.accion'), ancho: 150, celda: badge },
    { id: 'fila', encabezado: t('vista.columnas.fila'), ancho: 64, variante: 'mono', ocultarDebajo: 'xl', celda: (r) => r.fila },
    {
      id: 'nombre',
      encabezado: t('vista.columnas.nombre'),
      celda: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg" title={r.nombre}>
            {r.nombre || '—'}
          </p>
          {detalle(r) && (
            <p className={r.accion === 'error' ? 'truncate text-xs text-danger-text' : 'truncate text-xs text-fg-secondary'} title={detalle(r)}>
              {detalle(r)}
            </p>
          )}
        </div>
      ),
    },
    { id: 'telefono', encabezado: t('vista.columnas.telefono'), variante: 'mono', ocultarDebajo: 'md', celda: (r) => r.telefono ?? '—' },
    { id: 'ciudad', encabezado: t('vista.columnas.ciudad'), ocultarDebajo: 'lg', celda: (r) => ciudades.get(r.fila) || '—' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput value={busqueda} onChange={(q) => { setBusqueda(q); setPagina(1); }} placeholder={t('vista.buscar')} className="lg:flex-1" />
        <SegmentedControl
          etiqueta={t('vista.filtrar')}
          valor={filtro}
          onValorChange={(f) => { setFiltro(f); setPagina(1); }}
          opciones={[
            { valor: 'todas', etiqueta: t('vista.filtros.todas') },
            { valor: 'importar', etiqueta: t('vista.filtros.importar'), contador: cuenta.importar },
            { valor: 'omitir', etiqueta: t('vista.filtros.omitir'), contador: cuenta.omitir },
            { valor: 'error', etiqueta: t('vista.filtros.error'), contador: cuenta.error },
          ]}
        />
      </div>

      <DataTable
        etiqueta={t('vista.titulo', { n: resultados.length })}
        columnas={columnas}
        filas={visibles}
        obtenerId={(r) => String(r.fila)}
        densidad="compacta"
        estado={visibles.length === 0 ? (busqueda || filtro !== 'todas' ? 'sinResultados' : 'vacio') : 'listo'}
        tonoFila={(r) => (r.accion === 'error' ? 'peligro' : undefined)}
        etiquetaFila={(r) => r.nombre || String(r.fila)}
        acciones={accionesDe}
        vacio={{ titulo: t('vista.vacio') }}
        sinResultados={{ titulo: t('vista.sinResultados') }}
        onLimpiarFiltros={() => { setBusqueda(''); setFiltro('todas'); }}
        termino={busqueda || undefined}
        tarjetaMovil={(r) => (
          <ListCard
            icono={UserPlus}
            titulo={r.nombre || '—'}
            subtitulo={`${r.telefono ?? '—'} · ${ciudades.get(r.fila) || '—'}`}
            meta={detalle(r) || undefined}
            estado={badge(r)}
            acciones={accionesDe(r)}
          />
        )}
        pie={
          <Pagination
            pagina={rango.pagina}
            tamano={tamano}
            total={filtradas.length}
            onPaginaChange={setPagina}
            onTamanoChange={(n) => { setTamano(n); setPagina(1); }}
            opcionesTamano={[25, 50, 100]}
            sustantivo={{ singular: t('vista.sustantivo.singular'), plural: t('vista.sustantivo.plural') }}
          />
        }
      />
    </div>
  );
}
