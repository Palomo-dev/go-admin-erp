'use client';

import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormField, SegmentedControl } from '@/components/kit';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import type { Category } from '@/lib/services/categoryService';
import { AltaRapidaCategoria } from '../../nuevo/AltaRapidaCategoria';
import type { EstadoFormularioProducto } from '../../logica/formularioProducto';
import { generarSkuSugerido } from '../cargarCatalogos';
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Información del producto: nombre, SKU, tipo, estado, categoría principal y
 * adicionales, descripción con «Mejorar con IA».
 *
 * `partes` reparte los campos en el stepper móvil: «esencial» (paso 1) y
 * «extra» (paso 3); en escritorio y en editar va «todo».
 */
export interface SeccionInformacionProps extends PropsSeccionFormulario {
  partes?: 'todo' | 'esencial' | 'extra';
}

const ESTADOS: readonly EstadoFormularioProducto['status'][] = ['active', 'inactive', 'discontinued'];

export function SeccionInformacion({
  estado,
  cambiar,
  actualizar,
  errores,
  catalogos,
  agregarACatalogo,
  organizacionId,
  partes = 'todo',
}: SeccionInformacionProps) {
  const t = useTranslations('productoForm.informacion');
  const tErr = useTranslations('productoForm.errores');
  const [nuevaCategoria, setNuevaCategoria] = useState<string | null>(null);
  const [generandoSku, setGenerandoSku] = useState(false);
  const [mejorando, setMejorando] = useState(false);
  const [errorIa, setErrorIa] = useState(false);

  const verEsencial = partes !== 'extra';
  const verExtra = partes !== 'esencial';

  const nombrePorId = useMemo(() => new Map(catalogos.categorias.map((c) => [c.id, c.name])), [catalogos.categorias]);

  const opcionesCategoria = useMemo(
    () =>
      catalogos.categorias.map((c) => ({
        value: String(c.id),
        label: c.name,
        sublabel: c.parent_id ? nombrePorId.get(c.parent_id) : undefined,
      })),
    [catalogos.categorias, nombrePorId],
  );

  const opcionesAdicionales = useMemo(
    () =>
      catalogos.categorias
        .filter((c) => c.id !== estado.category_id)
        .map((c) => ({
          valor: String(c.id),
          etiqueta: c.name,
          descripcion: c.parent_id ? nombrePorId.get(c.parent_id) : undefined,
        })),
    [catalogos.categorias, estado.category_id, nombrePorId],
  );

  // La estación de cocina/bar NO se copia de la categoría: `station` vacío
  // significa «hereda» y se resuelve al usarla (fn_estacion_efectiva), así un
  // cambio de estación en la categoría llega a sus productos.
  const elegirCategoria = (id: number | null) => {
    actualizar({
      category_id: id,
      // La principal no se repite entre las adicionales.
      categorias_adicionales: estado.categorias_adicionales.filter((c) => c !== id),
    });
  };

  const categoriaCreada = (c: Category) => {
    agregarACatalogo('categorias', { id: c.id, name: c.name, parent_id: c.parent_id, station: c.station ?? null });
    actualizar({
      category_id: c.id,
      categorias_adicionales: estado.categorias_adicionales.filter((x) => x !== c.id),
    });
  };

  const regenerarSku = async () => {
    setGenerandoSku(true);
    try {
      cambiar('sku', await generarSkuSugerido(organizacionId));
    } catch {
      cambiar('sku', `PROD-${Date.now().toString(36).toUpperCase()}`);
    } finally {
      setGenerandoSku(false);
    }
  };

  const mejorarDescripcion = async () => {
    if (!estado.name.trim()) return;
    setMejorando(true);
    setErrorIa(false);
    try {
      const r = await fetch('/api/ai-assistant/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: estado.name,
          currentDescription: estado.description || '',
          type: 'product_description',
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as { improvedText?: string };
      if (data.improvedText) cambiar('description', data.improvedText);
    } catch {
      setErrorIa(true);
    } finally {
      setMejorando(false);
    }
  };

  const error = (codigo: string | undefined) => (codigo ? tErr(codigo) : null);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {verEsencial && (
        <>
          <FormField etiqueta={t('nombre')} obligatorio error={error(errores.name)}>
            <Input
              id="producto-nombre"
              value={estado.name}
              onChange={(e) => cambiar('name', e.target.value)}
              placeholder={t('nombrePlaceholder')}
              autoComplete="off"
              maxLength={255}
            />
          </FormField>

          <FormField etiqueta={t('sku')} obligatorio error={error(errores.sku)} ayuda={t('skuAyuda')}>
            {(campo) => (
              <div className="flex gap-2">
                <Input
                  id={campo.id}
                  aria-describedby={campo['aria-describedby']}
                  aria-invalid={campo['aria-invalid']}
                  aria-required
                  value={estado.sku}
                  onChange={(e) => cambiar('sku', e.target.value.toUpperCase())}
                  placeholder={t('skuPlaceholder')}
                  autoComplete="off"
                  className={errores.sku ? 'min-w-0 flex-1 font-mono border-danger' : 'min-w-0 flex-1 font-mono'}
                />
                <button
                  type="button"
                  onClick={() => void regenerarSku()}
                  disabled={generandoSku}
                  aria-label={t('regenerarSku')}
                  title={t('regenerarSku')}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                >
                  {generandoSku ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw aria-hidden className="size-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            )}
          </FormField>

          <FormField etiqueta={t('tipo')} ayuda={t('tipoAyuda')}>
            {(campo) => (
              <SegmentedControl
                aria-labelledby={campo.idEtiqueta}
                aria-describedby={campo['aria-describedby']}
                anchoCompleto
                opciones={[
                  { valor: 'product', etiqueta: t('tipoProducto') },
                  { valor: 'service', etiqueta: t('tipoServicio') },
                ]}
                valor={estado.product_type}
                onValorChange={(v) =>
                  // Servicio ⇒ sin inventario; volver a producto vuelve a rastrearlo (como antes).
                  actualizar({ product_type: v, track_stock: v !== 'service' })
                }
              />
            )}
          </FormField>

          {partes === 'todo' && <CampoEstado valor={estado.status} onCambio={(v) => cambiar('status', v)} />}

          <FormField etiqueta={t('categoria')} error={error(errores.category_id)} ayuda={t('categoriaAyuda')}>
            {(campo) => (
              <div id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']}>
                <SearchSelect
                  options={opcionesCategoria}
                  value={estado.category_id ? String(estado.category_id) : 'none'}
                  onValueChange={(v) => elegirCategoria(v === 'none' ? null : Number(v))}
                  placeholder={t('categoriaPlaceholder')}
                  searchPlaceholder={t('categoriaBuscar')}
                  emptyText={t('categoriaVacia')}
                  noneLabel={t('sinCategoria')}
                  onCreate={(texto) => setNuevaCategoria(texto)}
                  createLabel={(texto) => t('crearCategoriaCon', { nombre: texto })}
                  createEmptyLabel={t('crearCategoria')}
                  className="border-line-strong bg-surface text-fg hover:bg-hover"
                />
              </div>
            )}
          </FormField>
        </>
      )}

      {verExtra && (
        <>
          {partes === 'extra' && <CampoEstado valor={estado.status} onCambio={(v) => cambiar('status', v)} />}

          <FormField etiqueta={t('adicionales')} ayuda={t('adicionalesAyuda')} className={partes === 'extra' ? 'md:col-span-2' : undefined}>
            {(campo) => (
              <MultiSelect
                id={campo.id}
                aria-describedby={campo['aria-describedby']}
                opciones={opcionesAdicionales}
                valores={estado.categorias_adicionales.map(String)}
                onValoresChange={(v) => cambiar('categorias_adicionales', v.map(Number))}
                placeholder={t('adicionalesPlaceholder')}
                placeholderBusqueda={t('categoriaBuscar')}
                textoVacio={t('categoriaVacia')}
                etiquetaQuitar={(nombre) => t('quitar', { nombre })}
              />
            )}
          </FormField>

          <div className="flex min-w-0 flex-col gap-1.5 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <span id="producto-descripcion-etiqueta" className="text-sm font-medium text-fg">
                {t('descripcion')}
              </span>
              <button
                type="button"
                onClick={() => void mejorarDescripcion()}
                disabled={mejorando || !estado.name.trim()}
                title={estado.name.trim() ? undefined : t('mejorarSinNombre')}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-link hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mejorando ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  <Sparkles aria-hidden className="size-4" strokeWidth={1.5} />
                )}
                {mejorando ? t('mejorando') : t('mejorarIA')}
              </button>
            </div>
            <div role="group" aria-labelledby="producto-descripcion-etiqueta">
              <RichTextEditor
                value={estado.description}
                onChange={(html) => cambiar('description', html)}
                placeholder={t('descripcionPlaceholder')}
                minHeight={120}
              />
            </div>
            {errorIa && (
              <p role="alert" className="text-xs text-danger-text">
                {t('errorIA')}
              </p>
            )}
          </div>
        </>
      )}

      <AltaRapidaCategoria
        abierto={nuevaCategoria !== null}
        onAbiertoChange={(v) => !v && setNuevaCategoria(null)}
        nombreInicial={nuevaCategoria ?? undefined}
        onCreada={categoriaCreada}
      />
    </div>
  );
}

function CampoEstado({
  valor,
  onCambio,
}: {
  valor: EstadoFormularioProducto['status'];
  onCambio: (v: EstadoFormularioProducto['status']) => void;
}) {
  const t = useTranslations('productoForm.informacion');
  return (
    <FormField etiqueta={t('estado')} ayuda={t('estadoAyuda')}>
      {(campo) => (
        <Select value={valor} onValueChange={(v) => onCambio(v as EstadoFormularioProducto['status'])}>
          <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS.map((e) => (
              <SelectItem key={e} value={e}>
                {t(`estados.${e}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
