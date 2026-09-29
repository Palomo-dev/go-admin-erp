'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Package, Pencil, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, Dialogo, FormField, ListCard, Pagination, SearchInput, SegmentedControl, calcularRango, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { normalizarNombre, parseNumero } from '@/lib/inventario/importacion/texto';
import type { FilaImport, FilaValidada } from '@/lib/inventario/importacion/tipos';
import type { AsistenteImportacion } from './useAsistenteImportacion';
import { useFormatoMoneda, useTextoMensaje } from './useTextos';

type Filtro = 'todas' | 'errores' | 'avisos';

interface Props {
  a: AsistenteImportacion;
  moneda: string;
}

const TONO = { listo: 'exito', aviso: 'advertencia', error: 'peligro' } as const;

export function PasoVistaPrevia({ a, moneda }: Props) {
  const t = useTranslations('productosImportar.vista');
  const texto = useTextoMensaje();
  const dinero = useFormatoMoneda(moneda);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [editando, setEditando] = useState<FilaValidada | null>(null);

  const filtradas = useMemo(() => {
    const q = normalizarNombre(busqueda);
    return a.validadas.filter((f) => {
      if (filtro === 'errores' && f.estado !== 'error') return false;
      if (filtro === 'avisos' && f.estado !== 'aviso') return false;
      if (!q) return true;
      return normalizarNombre(`${f.datos.sku ?? ''} ${f.datos.name ?? ''} ${f.datos.category ?? ''}`).includes(q);
    });
  }, [a.validadas, filtro, busqueda]);

  const rango = calcularRango(pagina, tamano, filtradas.length);
  const visibles = filtradas.slice(rango.desde ? rango.desde - 1 : 0, rango.hasta);
  const cuenta = useMemo(() => ({ errores: a.validadas.filter((f) => f.estado === 'error').length, avisos: a.validadas.filter((f) => f.estado === 'aviso').length }), [a.validadas]);

  const estadoDe = (f: FilaValidada) => (a.excluidas.has(f.id) && f.estado !== 'error' ? 'excluida' : f.estado);
  const mensajes = (f: FilaValidada) => [...f.errores, ...f.avisos].map(texto).join(' · ');
  const badgeEstado = (f: FilaValidada) => {
    const e = estadoDe(f);
    return (
      <Badge tono={e === 'excluida' ? 'neutro' : TONO[f.estado]} tamano="sm" punto>
        {t(`estados.${e}`)}
      </Badge>
    );
  };
  const accionesDe = (f: FilaValidada): AccionFila[] => [
    { id: 'editar', etiqueta: t('editar'), icono: Pencil, onSelect: () => setEditando(f) },
    f.estado !== 'error'
      ? a.excluidas.has(f.id)
        ? { id: 'incluir', etiqueta: t('incluir'), icono: RotateCcw, onSelect: () => a.alternarExclusion(f.id) }
        : { id: 'excluir', etiqueta: t('excluir'), icono: Ban, onSelect: () => a.alternarExclusion(f.id) }
      : { id: 'excluir', etiqueta: t('excluir'), icono: Ban, onSelect: () => undefined, deshabilitada: true, motivo: t('excluidaPorError') },
  ];

  const columnas: ColumnaTabla<FilaValidada>[] = [
    { id: 'estado', encabezado: t('columnas.estado'), ancho: 110, celda: badgeEstado },
    { id: 'fila', encabezado: t('columnas.fila'), ancho: 64, variante: 'mono', ocultarDebajo: 'xl', celda: (f) => f.datos.fila },
    { id: 'sku', encabezado: t('columnas.sku'), variante: 'mono', celda: (f) => f.datos.sku ?? '—' },
    {
      id: 'nombre',
      encabezado: t('columnas.nombre'),
      celda: (f) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg" title={f.datos.name}>
            {f.datos.name || '—'}
          </p>
          {(f.errores.length > 0 || f.avisos.length > 0) && (
            <p className={f.estado === 'error' ? 'truncate text-xs text-danger-text' : 'truncate text-xs text-fg-secondary'} title={mensajes(f)}>
              {mensajes(f)}
            </p>
          )}
        </div>
      ),
    },
    { id: 'precio', encabezado: t('columnas.precio'), variante: 'importe', celda: (f) => dinero(f.datos.price) },
    { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => dinero(f.datos.cost) },
    { id: 'stock', encabezado: t('columnas.stock'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => f.datos.stock ?? 0 },
    { id: 'categoria', encabezado: t('columnas.categoria'), ocultarDebajo: 'lg', celda: (f) => f.datos.category ?? '—' },
    { id: 'impuesto', encabezado: t('columnas.impuesto'), ocultarDebajo: 'xl', celda: (f) => f.datos.tax ?? '—' },
    { id: 'accion', encabezado: t('columnas.accion'), ancho: 110, celda: (f) => (f.estado === 'error' ? <span className="text-danger-text">{t('acciones.ninguna')}</span> : t(`acciones.${f.accion}`)) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput value={busqueda} onChange={(v) => { setBusqueda(v); setPagina(1); }} placeholder={t('buscar')} className="lg:flex-1" />
        <SegmentedControl
          etiqueta={t('filtrar')}
          valor={filtro}
          onValorChange={(v) => { setFiltro(v); setPagina(1); }}
          opciones={[
            { valor: 'todas', etiqueta: t('filtros.todas') },
            { valor: 'errores', etiqueta: t('filtros.errores'), contador: cuenta.errores },
            { valor: 'avisos', etiqueta: t('filtros.avisos'), contador: cuenta.avisos },
          ]}
        />
      </div>

      <DataTable
        etiqueta={t('titulo', { n: a.validadas.length })}
        columnas={columnas}
        filas={visibles}
        obtenerId={(f) => f.id}
        densidad="compacta"
        estado={visibles.length === 0 ? (busqueda || filtro !== 'todas' ? 'sinResultados' : 'vacio') : 'listo'}
        tonoFila={(f) => (f.estado === 'error' ? 'peligro' : f.estado === 'aviso' ? 'advertencia' : undefined)}
        onFilaClick={(f) => setEditando(f)}
        etiquetaFila={(f) => f.datos.name ?? f.datos.sku ?? String(f.datos.fila)}
        acciones={accionesDe}
        vacio={{ titulo: t('vacio') }}
        sinResultados={{ titulo: t('sinResultados') }}
        onLimpiarFiltros={() => { setBusqueda(''); setFiltro('todas'); }}
        termino={busqueda || undefined}
        tarjetaMovil={(f) => (
          <ListCard
            icono={Package}
            titulo={f.datos.name || '—'}
            subtitulo={`${f.datos.sku ?? '—'} · ${t(`acciones.${f.estado === 'error' ? 'ninguna' : f.accion}`)}`}
            meta={mensajes(f) || undefined}
            valor={dinero(f.datos.price)}
            estado={badgeEstado(f)}
            acciones={accionesDe(f)}
            onClick={() => setEditando(f)}
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
            sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
          />
        }
      />

      {editando && <EditarFila fila={editando} onCerrar={() => setEditando(null)} onGuardar={(cambios) => { a.editarFila(editando.datos.fila, cambios); if (cambios.sku !== undefined || cambios.parentSku !== undefined) void a.validarContraCatalogo(); setEditando(null); }} />}
    </div>
  );
}

function EditarFila({ fila, onCerrar, onGuardar }: { fila: FilaValidada; onCerrar: () => void; onGuardar: (c: Partial<FilaImport>) => void }) {
  const t = useTranslations('productosImportar.vista');
  const tc = useTranslations('productosImportar.campos');
  const texto = useTextoMensaje();
  const d = fila.datos;
  const [v, setV] = useState({
    sku: d.sku ?? '',
    name: d.name ?? '',
    price: d.price?.toString() ?? '',
    cost: d.cost?.toString() ?? '',
    stock: d.stock?.toString() ?? '',
    category: d.category ?? '',
    tax: d.tax ?? '',
    parentSku: d.parentSku ?? '',
  });
  const num = (s: string) => (s.trim() === '' ? undefined : parseNumero(s) ?? undefined);
  const guardar = () => {
    const cambios: Partial<FilaImport> = {
      name: v.name.trim(),
      price: num(v.price),
      cost: num(v.cost),
      stock: num(v.stock),
      category: v.category.trim() || undefined,
      tax: v.tax.trim() || undefined,
    };
    if (v.sku.trim() !== (d.sku ?? '')) cambios.sku = v.sku.trim() || undefined;
    if (v.parentSku.trim() !== (d.parentSku ?? '')) cambios.parentSku = v.parentSku.trim() || undefined;
    onGuardar(cambios);
  };
  const campo = (clave: keyof typeof v, etiqueta: string, tipo: 'text' | 'number' = 'text') => (
    <FormField etiqueta={etiqueta}>
      <Input value={v[clave]} inputMode={tipo === 'number' ? 'decimal' : undefined} onChange={(e) => setV((p) => ({ ...p, [clave]: e.target.value }))} />
    </FormField>
  );
  const mensajes = [...fila.errores, ...fila.avisos];
  return (
    <Dialogo abierto onAbiertoChange={(o) => !o && onCerrar()} titulo={t('editarTitulo', { n: d.fila })} ancho={560} primario={{ etiqueta: t('guardar'), onClick: guardar, deshabilitada: !v.name.trim(), motivo: t('faltaNombre') }}>
      {mensajes.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg bg-subtle p-3 text-xs">
          {fila.errores.map((m, i) => (
            <li key={`e${i}`} className="text-danger-text">
              {texto(m)}
            </li>
          ))}
          {fila.avisos.map((m, i) => (
            <li key={`a${i}`} className="text-fg-secondary">
              {texto(m)}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {campo('name', tc('name.nombre'))}
        {campo('sku', tc('sku.nombre'))}
        {campo('price', tc('price.nombre'), 'number')}
        {campo('cost', tc('cost.nombre'), 'number')}
        {campo('stock', tc('stock.nombre'), 'number')}
        {campo('category', tc('category.nombre'))}
        {campo('tax', tc('tax.nombre'))}
        {campo('parentSku', tc('parentSku.nombre'))}
      </div>
    </Dialogo>
  );
}
