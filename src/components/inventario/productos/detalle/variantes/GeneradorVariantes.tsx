'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Plus, Sparkles, TriangleAlert } from 'lucide-react';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { productoService } from '@/lib/services/productoService';
import { cn } from '@/utils/Utils';
import { combinacionesNuevas, combinarAtributos, nombreVariante, resumenAtributos, skuVariante, type TipoAtributo } from '../../logica/variantes';
import { useProductoDetalle } from '../ContextoProducto';
import { mismoTexto, unirTipos, valoresDeTipo, type TipoCatalogo } from './catalogoAtributos';
import type { VarianteDetalle } from './modeloVariantes';

/**
 * «Generar combinaciones» desde el detalle: tipos y valores (catálogo de la
 * organización + los que ya usan las variantes + nuevos escritos aquí) →
 * producto cartesiano → se crean, una por una con `guardarVariante`, solo
 * las combinaciones que aún no existen. Muestra el progreso y, al final, el
 * resumen con las que fallaron y por qué.
 */
export interface GeneradorVariantesProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  variantes: readonly VarianteDetalle[];
  catalogo: readonly TipoCatalogo[];
  onTerminado: () => void;
}

type Fase = 'configurar' | 'creando' | 'resumen';

interface Resultado {
  creadas: string[];
  fallidas: { sku: string; mensaje: string }[];
}

export function GeneradorVariantes({ abierto, onAbiertoChange, variantes, catalogo, onTerminado }: GeneradorVariantesProps) {
  const t = useTranslations('productoDetalle.variantes.generador');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, organizacionId, resumen, mensajeError } = useProductoDetalle();
  const formatoEntero = useFormatoEntero();

  const [tiposSel, setTiposSel] = useState<string[]>([]);
  const [valoresSel, setValoresSel] = useState<Record<string, string[]>>({});
  const [locales, setLocales] = useState<TipoCatalogo[]>([]);
  const [nuevoValor, setNuevoValor] = useState<Record<string, string>>({});
  const [fase, setFase] = useState<Fase>('configurar');
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState<Resultado>({ creadas: [], fallidas: [] });

  const existentes = useMemo(
    () => resumenAtributos(variantes.map((v) => ({ attributes: v.attributes }))),
    [variantes],
  );
  const tipos = useMemo(
    () => unirTipos(catalogo, existentes.map((x) => ({ id: null, nombre: x.nombre, valores: x.valores })), locales),
    [catalogo, existentes, locales],
  );

  useEffect(() => {
    if (!abierto) return;
    setTiposSel(existentes.map((x) => x.nombre));
    setValoresSel(Object.fromEntries(existentes.map((x) => [x.nombre, [...x.valores]])));
    setLocales([]);
    setNuevoValor({});
    setFase('configurar');
    setProgreso(0);
    setResultado({ creadas: [], fallidas: [] });
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const matriz: TipoAtributo[] = tiposSel.map((nombre) => ({ nombre, valores: valoresSel[nombre] ?? [] }));
  const total = combinarAtributos(matriz).length;
  const nuevas = combinacionesNuevas(
    matriz,
    variantes.map((v) => v.attributes),
  );

  const alternarValor = (tipo: string, valor: string) =>
    setValoresSel((prev) => {
      const actual = prev[tipo] ?? [];
      const ya = actual.some((v) => mismoTexto(v, valor));
      return { ...prev, [tipo]: ya ? actual.filter((v) => !mismoTexto(v, valor)) : [...actual, valor] };
    });

  const agregarValor = (tipo: string) => {
    const valor = (nuevoValor[tipo] ?? '').trim();
    if (!valor) return;
    setLocales((prev) => [...prev, { id: null, nombre: tipo, valores: [valor] }]);
    setValoresSel((prev) => {
      const actual = prev[tipo] ?? [];
      return actual.some((v) => mismoTexto(v, valor)) ? prev : { ...prev, [tipo]: [...actual, valor] };
    });
    setNuevoValor((prev) => ({ ...prev, [tipo]: '' }));
  };

  const generar = async () => {
    if (nuevas.length === 0) return;
    setFase('creando');
    setProgreso(0);
    const usados = new Set<string>([producto.sku.toUpperCase()]);
    for (const c of producto.children ?? []) usados.add(c.sku.toUpperCase());
    for (const v of variantes) usados.add(v.sku.toUpperCase());
    const res: Resultado = { creadas: [], fallidas: [] };
    for (const combo of nuevas) {
      const sku = skuVariante(producto.sku, combo, usados);
      usados.add(sku.toUpperCase());
      try {
        await productoService.guardarVariante(organizacionId, producto.id, {
          sku,
          name: nombreVariante(producto.name, combo),
          attributes: combo,
          price: resumen?.precio ?? null,
          cost: resumen?.costo ?? null,
          status: 'active',
        });
        res.creadas.push(sku);
      } catch (e) {
        res.fallidas.push({ sku, mensaje: mensajeError(e) });
      }
      setProgreso((p) => p + 1);
    }
    setResultado(res);
    setFase('resumen');
    onTerminado();
  };

  const creando = fase === 'creando';

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Sparkles}
      ancho={672}
      ocupado={creando}
      pie={
        fase === 'resumen' ? (
          <Button type="button" onClick={() => onAbiertoChange(false)}>
            {tc('cerrar')}
          </Button>
        ) : (
          <>
            <span className="mr-auto hidden text-sm text-fg-secondary sm:inline">
              {creando ? t('creandoDe', { hecho: progreso, total: nuevas.length }) : t('seGeneraran', { count: nuevas.length })}
            </span>
            <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)} disabled={creando}>
              {tc('cancelar')}
            </Button>
            <Button type="button" onClick={() => void generar()} disabled={creando || nuevas.length === 0}>
              {creando ? <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" /> : <Sparkles aria-hidden="true" className="mr-2 size-4" />}
              {creando ? t('creando') : t('generar', { count: nuevas.length })}
            </Button>
          </>
        )
      }
    >
      {fase === 'resumen' ? (
        <div className="flex flex-col gap-3" role="status">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-success-text">
            <CheckCircle2 aria-hidden="true" className="size-4" /> {t('resumenCreadas', { count: resultado.creadas.length })}
          </p>
          {resultado.fallidas.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-danger-subtle p-3">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-danger-text">
                <TriangleAlert aria-hidden="true" className="size-4" /> {t('resumenFallidas', { count: resultado.fallidas.length })}
              </p>
              <ul className="flex flex-col gap-1 text-sm text-fg">
                {resultado.fallidas.map((f) => (
                  <li key={f.sku} className="min-w-0">
                    <span className="font-mono">{f.sku}</span> · <span className="text-fg-secondary">{f.mensaje}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span id="gv-tipos" className="text-sm font-medium text-fg">
              {t('tipos')}
            </span>
            <MultiSelect
              aria-labelledby="gv-tipos"
              opciones={tipos.map((tp) => ({ valor: tp.nombre, etiqueta: tp.nombre }))}
              valores={tiposSel}
              onValoresChange={setTiposSel}
              onCrear={(texto) => {
                const limpio = texto.trim();
                if (!limpio) return;
                const ya = tipos.find((tp) => mismoTexto(tp.nombre, limpio))?.nombre;
                if (!ya) setLocales((prev) => [...prev, { id: null, nombre: limpio, valores: [] }]);
                setTiposSel((prev) => (prev.some((x) => mismoTexto(x, ya ?? limpio)) ? prev : [...prev, ya ?? limpio]));
              }}
              textoCrear={(texto) => t('crearTipo', { tipo: texto })}
              placeholder={t('tiposPlaceholder')}
              placeholderBusqueda={tc('buscar')}
              textoVacio={t('sinTipos')}
              etiquetaQuitar={(e) => t('quitarTipo', { tipo: e })}
              deshabilitado={creando}
            />
            <p className="text-xs text-fg-muted">{t('tiposAyuda')}</p>
          </div>

          {tiposSel.map((tipo) => {
            const valores = valoresDeTipo(tipos, tipo);
            const sel = valoresSel[tipo] ?? [];
            return (
              <div key={tipo} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <span className="text-sm font-medium text-fg">
                  {tipo} <span className="font-normal text-fg-muted">{t('seleccionados', { count: sel.length })}</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {valores.length === 0 && <span className="text-xs text-fg-muted">{t('sinValores')}</span>}
                  {valores.map((v) => {
                    const activo = sel.some((x) => mismoTexto(x, v));
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={activo}
                        disabled={creando}
                        onClick={() => alternarValor(tipo, v)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                          activo ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
                        )}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={nuevoValor[tipo] ?? ''}
                    onChange={(e) => setNuevoValor((prev) => ({ ...prev, [tipo]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarValor(tipo);
                      }
                    }}
                    placeholder={t('nuevoValor', { tipo })}
                    aria-label={t('nuevoValor', { tipo })}
                    disabled={creando}
                    className="h-9 min-w-0 flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-9" disabled={creando || !(nuevoValor[tipo] ?? '').trim()} onClick={() => agregarValor(tipo)}>
                    <Plus aria-hidden="true" className="mr-1 size-4" /> {tc('agregar')}
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="rounded-lg border border-line bg-subtle p-3 text-sm text-fg-secondary" aria-live="polite">
            {total === 0
              ? t('elegirValores')
              : t('conteo', { total: formatoEntero(total), nuevas: formatoEntero(nuevas.length), existentes: formatoEntero(total - nuevas.length) })}
            {nuevas.length > 0 && <p className="mt-1 text-xs text-fg-muted">{t('ayudaPrecios')}</p>}
          </div>

          {creando && (
            <div className="flex flex-col gap-1.5" role="status">
              <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${nuevas.length ? (progreso / nuevas.length) * 100 : 0}%` }} />
              </div>
              <span className="text-xs text-fg-secondary">{t('creandoDe', { hecho: progreso, total: nuevas.length })}</span>
            </div>
          )}
        </>
      )}
    </PanelAdaptable>
  );
}
