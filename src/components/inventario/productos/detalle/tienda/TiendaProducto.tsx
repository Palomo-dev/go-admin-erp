'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Info, Link2, ListChecks, Package, Plus, Trash2, X } from 'lucide-react';
import { AvisoTonal, EmptyState, SegmentedControl, SelectorEntidad, Tarjeta, clasesBoton, type OpcionEntidad } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { avisarCambioCatalogo } from '@/lib/services/website/avisarCambioCatalogo';
import { MAX_FILAS_PROPIAS, MAX_NOMBRE_FILA, MAX_VALOR_FILA } from '@/lib/website/v2/seccionesFicha';
import { cn } from '@/utils/Utils';
import { useProductoDetalle } from '../ContextoProducto';
import {
  MAX_RELACIONADOS_A_MANO,
  buscarProductosTienda,
  cargarFichaTecnica,
  cargarRelaciones,
  guardarFichaTecnica,
  guardarRelaciones,
  type ProductoRelacionado,
  type TipoRelacion,
} from './datosTienda';

/**
 * Pestaña «Tienda» del producto: lo que la ficha de la tienda web muestra de este producto y no
 * sale de otras pestañas (Figma «16 Sitio web» 2983:72501, aprobado el 2026-11-24).
 * - Productos relacionados elegidos a mano: «Relacionados» (fuente «Elegidos a mano» de la
 *   sección) y «Comprados juntos» (van primero; la tienda completa con los calculados con las
 *   ventas de los últimos 90 días). Cada cambio se guarda al momento.
 * - Ficha técnica: filas propias (Capacidad, Voltaje…) además de marca, referencia, medidas,
 *   peso, garantía y categoría, que salen de las columnas del producto.
 *
 * No hay diseño de Figma para esta pestaña: UI mínima con el kit (Tarjeta, SegmentedControl,
 * SelectorEntidad, AvisoTonal), pendiente de revisión del dueño.
 */
export function TiendaProducto() {
  const t = useTranslations('productoDetalle.tienda');
  const ta = useTranslations('productoDetalle.acciones');
  const { producto, organizacionId, permisos, resumen } = useProductoDetalle();
  const puedeEditar = !!resumen && permisos.editar && producto.status !== 'deleted';
  const motivo = puedeEditar ? undefined : ta('motivoSinPermiso');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <RelacionadosAMano organizacionId={organizacionId} productoId={producto.id} puedeEditar={puedeEditar} motivo={motivo} />
      <FichaTecnicaPropia organizacionId={organizacionId} productoId={producto.id} puedeEditar={puedeEditar} motivo={motivo} />
      <p className="text-xs text-fg-muted lg:col-span-2">{t('ayudaEditor')}</p>
    </div>
  );
}

interface PropsBloque {
  organizacionId: number;
  productoId: number;
  puedeEditar: boolean;
  motivo?: string;
}

function RelacionadosAMano({ organizacionId, productoId, puedeEditar, motivo }: PropsBloque) {
  const t = useTranslations('productoDetalle.tienda');
  const { toast } = useToast();
  const [tipo, setTipo] = useState<TipoRelacion>('related');
  const [listas, setListas] = useState<Record<TipoRelacion, ProductoRelacionado[]> | null>(null);
  const [error, setError] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setListas(await cargarRelaciones(organizacionId, productoId));
    } catch {
      setError(true);
    }
  }, [organizacionId, productoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const lista = listas?.[tipo] ?? [];

  const guardar = async (siguiente: ProductoRelacionado[]) => {
    if (!listas) return;
    const anterior = listas;
    setListas({ ...listas, [tipo]: siguiente });
    setGuardando(true);
    try {
      await guardarRelaciones(organizacionId, productoId, tipo, siguiente.map((p) => p.id));
      avisarCambioCatalogo();
    } catch {
      setListas(anterior);
      toast({ variant: 'destructive', title: t('relacionados.errorGuardar') });
    } finally {
      setGuardando(false);
    }
  };

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    const n = [...lista];
    [n[i], n[j]] = [n[j], n[i]];
    void guardar(n);
  };

  const aOpcion = (p: ProductoRelacionado): OpcionEntidad => ({ id: String(p.id), titulo: p.nombre, subtitulo: p.sku });

  return (
    <Tarjeta titulo={t('relacionados.titulo')} icono={Link2} descripcion={t('relacionados.descripcion')}>
      <div className="flex flex-col gap-3">
        <SegmentedControl<TipoRelacion>
          etiqueta={t('relacionados.titulo')}
          tamano="sm"
          anchoCompleto
          valor={tipo}
          onValorChange={setTipo}
          opciones={[
            { valor: 'related', etiqueta: t('relacionados.related', { n: listas?.related.length ?? 0 }) },
            { valor: 'bought_together', etiqueta: t('relacionados.bought_together', { n: listas?.bought_together.length ?? 0 }) },
          ]}
        />
        <p className="text-xs text-fg-secondary">{t(`relacionados.ayuda_${tipo}`)}</p>

        {error ? (
          <EmptyState variante="error" titulo={t('errorCargar')} onReintentar={() => void cargar()} />
        ) : !listas ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : lista.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-fg-muted">{t('relacionados.vacio')}</p>
        ) : (
          <ol className="flex flex-col gap-1.5" aria-label={t(`relacionados.${tipo}`, { n: lista.length })}>
            {lista.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5">
                <Package aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{p.nombre}</span>
                  {p.sku && <span className="block truncate text-xs text-fg-muted">{p.sku}</span>}
                </span>
                <button type="button" onClick={() => mover(i, -1)} disabled={!puedeEditar || guardando || i === 0} aria-label={t('relacionados.subir', { nombre: p.nombre })} title={motivo} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0 disabled:opacity-40')}>
                  <ArrowUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => mover(i, 1)} disabled={!puedeEditar || guardando || i === lista.length - 1} aria-label={t('relacionados.bajar', { nombre: p.nombre })} title={motivo} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0 disabled:opacity-40')}>
                  <ArrowDown aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => void guardar(lista.filter((x) => x.id !== p.id))} disabled={!puedeEditar || guardando} aria-label={t('relacionados.quitar', { nombre: p.nombre })} title={motivo} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0 disabled:opacity-40')}>
                  <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              </li>
            ))}
          </ol>
        )}

        {listas && !error && (
          lista.length >= MAX_RELACIONADOS_A_MANO ? (
            <p className="text-xs text-fg-muted">{t('relacionados.maximo', { max: MAX_RELACIONADOS_A_MANO })}</p>
          ) : (
            <SelectorEntidad<ProductoRelacionado>
              layout="campo"
              valor={null}
              aOpcion={aOpcion}
              icono={Plus}
              etiqueta={t('relacionados.agregar')}
              deshabilitado={!puedeEditar || guardando}
              buscar={(texto, senal) => buscarProductosTienda(organizacionId, texto, [productoId, ...lista.map((p) => p.id)], senal)}
              onCambiar={(p) => void guardar([...lista, p])}
              textos={{ placeholder: t('relacionados.agregar'), buscar: t('relacionados.buscar'), vacio: t('relacionados.sinProductos'), sinResultados: t('relacionados.sinProductos') }}
            />
          )
        )}
      </div>
    </Tarjeta>
  );
}

interface FilaEditable {
  clave: number;
  nombre: string;
  valor: string;
}

let siguienteClave = 1;
const conClave = (f: { nombre: string; valor: string }): FilaEditable => ({ clave: siguienteClave++, nombre: f.nombre, valor: f.valor });

function FichaTecnicaPropia({ organizacionId, productoId, puedeEditar, motivo }: PropsBloque) {
  const t = useTranslations('productoDetalle.tienda');
  const { toast } = useToast();
  const [filas, setFilas] = useState<FilaEditable[] | null>(null);
  const [guardadas, setGuardadas] = useState<string>('[]');
  const [error, setError] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      const actuales = await cargarFichaTecnica(organizacionId, productoId);
      setFilas(actuales.map(conClave));
      setGuardadas(JSON.stringify(actuales));
    } catch {
      setError(true);
    }
  }, [organizacionId, productoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const limpias = (filas ?? []).map((f) => ({ nombre: f.nombre.trim(), valor: f.valor.trim() })).filter((f) => f.nombre && f.valor);
  const cambiado = filas !== null && JSON.stringify(limpias) !== guardadas;
  const incompletas = (filas ?? []).some((f) => (f.nombre.trim() === '') !== (f.valor.trim() === ''));

  const guardar = async () => {
    setGuardando(true);
    try {
      const resultado = await guardarFichaTecnica(organizacionId, productoId, limpias);
      setFilas(resultado.map(conClave));
      setGuardadas(JSON.stringify(resultado));
      avisarCambioCatalogo();
      toast({ title: t('ficha.guardada') });
    } catch {
      toast({ variant: 'destructive', title: t('ficha.errorGuardar') });
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (clave: number, cambio: Partial<FilaEditable>) => setFilas((fs) => (fs ?? []).map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));

  return (
    <Tarjeta
      titulo={t('ficha.titulo')}
      icono={ListChecks}
      descripcion={t('ficha.descripcion')}
      pie={
        filas && !error ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!puedeEditar || (filas?.length ?? 0) >= MAX_FILAS_PROPIAS}
              title={motivo}
              onClick={() => setFilas((fs) => [...(fs ?? []), conClave({ nombre: '', valor: '' })])}
            >
              <Plus className="h-4 w-4" aria-hidden /> {t('ficha.agregar')}
            </Button>
            <Button type="button" size="sm" disabled={!puedeEditar || !cambiado || guardando} title={motivo} onClick={() => void guardar()}>
              {guardando ? t('ficha.guardando') : t('ficha.guardar')}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <AvisoTonal tono="informacion" compacto icono={Info} titulo={t('ficha.columnas')} />
        {error ? (
          <EmptyState variante="error" titulo={t('errorCargar')} onReintentar={() => void cargar()} />
        ) : !filas ? (
          <Skeleton className="h-20 w-full" />
        ) : filas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-fg-muted">{t('ficha.vacia')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2rem] gap-2 text-xs font-semibold text-fg-secondary">
              <span>{t('ficha.nombre')}</span>
              <span>{t('ficha.valor')}</span>
              <span className="sr-only">{t('ficha.quitar', { nombre: '' })}</span>
            </div>
            {filas.map((f) => (
              <div key={f.clave} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2rem] items-center gap-2">
                <Input value={f.nombre} maxLength={MAX_NOMBRE_FILA} placeholder={t('ficha.ejemploNombre')} aria-label={t('ficha.nombre')} disabled={!puedeEditar} onChange={(e) => cambiar(f.clave, { nombre: e.target.value })} />
                <Input value={f.valor} maxLength={MAX_VALOR_FILA} placeholder={t('ficha.ejemploValor')} aria-label={t('ficha.valor')} disabled={!puedeEditar} onChange={(e) => cambiar(f.clave, { valor: e.target.value })} />
                <button type="button" onClick={() => setFilas((fs) => (fs ?? []).filter((x) => x.clave !== f.clave))} disabled={!puedeEditar} aria-label={t('ficha.quitar', { nombre: f.nombre || t('ficha.nombre') })} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0 disabled:opacity-40')}>
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            ))}
            {incompletas && <p className="text-xs text-warning-text">{t('ficha.incompletas')}</p>}
          </div>
        )}
      </div>
    </Tarjeta>
  );
}
