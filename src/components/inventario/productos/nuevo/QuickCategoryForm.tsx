'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Info, Loader2, TriangleAlert } from 'lucide-react';
import { FormField } from '@/components/kit';
import { TreeSelect, type OpcionArbol } from '@/components/kit/TreePicker';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import ColorPicker from '@/components/common/ColorPicker';
import IconSelector from '@/components/common/IconSelector';
import { useOrganization } from '@/lib/hooks/useOrganization';
import categoryService, {
  ErrorCategoria,
  emptyFormData,
  generateSlug,
  type Category,
  type CategoryFormData,
} from '@/lib/services/categoryService';
import type { PrinterStation } from '@/components/pos/configuracion/printersService';
import { iconoCategoria, OPCIONES_ESTACION } from '@/components/inventario/categorias/iconoCategoria';
import { cn } from '@/utils/Utils';

interface QuickCategoryFormProps {
  /** Se llama al crear la categoría, con la categoría creada (el llamador la selecciona). */
  onSuccess: (category: Category) => void;
  onCancel: () => void;
  /** Nombre ya escrito en el buscador de categorías («Crear “…”»); forma también el slug. */
  nombreInicial?: string;
}

type EstadoSlug = 'vacio' | 'validando' | 'libre' | 'duplicado' | 'error';

/**
 * Alta rápida de categoría (Figma `QuickCategoryForm` 513:259550, estados
 * listo · validando · duplicado · guardando · error; instanciado en
 * `586:312019`). Nombre, padre sobre el árbol real, slug visible y validado
 * contra la organización (con una alternativa libre si está repetido), color e
 * icono. Descripción, estación, preparación y estado siguen disponibles en
 * «Más opciones», así no se pierde nada de lo que tenía el formulario anterior.
 *
 * Contrato sin cambios: `onSuccess(categoria)` / `onCancel()`.
 */
export function QuickCategoryForm({ onSuccess, onCancel, nombreInicial }: QuickCategoryFormProps) {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;

  const [categorias, setCategorias] = useState<Category[]>([]);
  const [errorCategorias, setErrorCategorias] = useState(false);
  const [datos, setDatos] = useState<CategoryFormData>(() => {
    const name = (nombreInicial ?? '').trim();
    return name
      ? { ...emptyFormData, name, slug: generateSlug(name), meta_title: name, meta_description: `Categoría: ${name}` }
      : { ...emptyFormData };
  });
  const [slugTocado, setSlugTocado] = useState(false);
  const [estadoSlug, setEstadoSlug] = useState<EstadoSlug>('vacio');
  const [sugerencia, setSugerencia] = useState<string | null>(null);
  const [masOpciones, setMasOpciones] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const consulta = useRef(0);

  useEffect(() => {
    if (!organizationId) return;
    categoryService
      .getAll(organizationId)
      .then(setCategorias)
      .catch(() => setErrorCategorias(true));
  }, [organizationId]);

  const opciones: OpcionArbol[] = useMemo(
    () =>
      categorias.map((c) => ({
        id: c.id,
        parentId: c.parent_id,
        etiqueta: c.name,
        detalle: `/${c.slug}`,
        icono: iconoCategoria(c.icon),
        color: c.color,
      })),
    [categorias],
  );

  // Validación del slug contra la organización, con 400 ms de espera.
  const slug = generateSlug(datos.slug);
  useEffect(() => {
    if (!organizationId || !slug) {
      setEstadoSlug('vacio');
      setSugerencia(null);
      return;
    }
    const turno = ++consulta.current;
    setEstadoSlug('validando');
    const t = setTimeout(async () => {
      try {
        const libre = await categoryService.slugDisponible(organizationId, slug);
        if (turno !== consulta.current) return;
        if (libre) {
          setEstadoSlug('libre');
          setSugerencia(null);
        } else {
          const alternativa = await categoryService.sugerirSlug(organizationId, slug);
          if (turno !== consulta.current) return;
          setEstadoSlug('duplicado');
          setSugerencia(alternativa);
        }
      } catch {
        if (turno === consulta.current) setEstadoSlug('error');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [organizationId, slug]);

  const cambiar = <K extends keyof CategoryFormData>(clave: K, valor: CategoryFormData[K]) =>
    setDatos((d) => ({ ...d, [clave]: valor }));

  const cambiarNombre = (name: string) => {
    setErrorNombre(null);
    setDatos((d) => ({
      ...d,
      name,
      slug: slugTocado ? d.slug : generateSlug(name),
      meta_title: name,
      meta_description: d.description || (name ? `Categoría: ${name}` : ''),
    }));
  };

  const crear = async () => {
    if (!datos.name.trim()) {
      setErrorNombre('El nombre es obligatorio');
      return;
    }
    if (!organizationId) {
      setErrorGuardar('No se encontró la organización activa.');
      return;
    }
    if (estadoSlug === 'duplicado') return;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const hermanas = categorias.filter((c) => c.parent_id === datos.parent_id);
      const maximo = hermanas.length ? Math.max(...hermanas.map((c) => c.display_order || 0)) : 0;
      const creada = await categoryService.create(organizationId, {
        ...datos,
        name: datos.name.trim(),
        slug: slug || generateSlug(datos.name),
        rank: maximo + 1,
        display_order: maximo + 1,
      });
      toast({ title: 'Categoría creada', description: `«${creada.name}» quedó seleccionada.` });
      onSuccess(creada);
    } catch (e) {
      if (e instanceof ErrorCategoria && e.slugDuplicado && organizationId) {
        setEstadoSlug('duplicado');
        setSugerencia(await categoryService.sugerirSlug(organizationId, slug).catch(() => null));
      } else {
        setErrorGuardar(e instanceof Error ? e.message : 'No se pudo crear la categoría.');
      }
    } finally {
      setGuardando(false);
    }
  };

  const ayudaSlug =
    estadoSlug === 'validando' ? (
      <span className="inline-flex items-center gap-1">
        <Loader2 aria-hidden="true" className="size-3 animate-spin" /> Comprobando que esté libre…
      </span>
    ) : estadoSlug === 'libre' ? (
      <span className="inline-flex items-center gap-1 text-success-text">
        <Check aria-hidden="true" className="size-3" strokeWidth={2} /> Libre · será la dirección en la tienda web
      </span>
    ) : estadoSlug === 'error' ? (
      'No pudimos comprobarla ahora; se validará al crear.'
    ) : (
      'Se forma con el nombre. Es la dirección pública en la tienda web.'
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void crear();
      }}
    >
      {errorGuardar && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-subtle px-3 py-2.5 text-sm text-danger-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {errorGuardar}
        </p>
      )}

      <FormField etiqueta="Nombre" obligatorio error={errorNombre}>
        <Input
          value={datos.name}
          onChange={(e) => cambiarNombre(e.target.value)}
          placeholder="Ej.: Bebidas calientes"
          autoFocus
          maxLength={120}
          className="h-10"
        />
      </FormField>

      <FormField
        etiqueta="Categoría padre"
        ayuda={errorCategorias ? 'No pudimos cargar las categorías: se creará como principal.' : undefined}
      >
        {(c) => (
          <TreeSelect
            id={c.id}
            aria-labelledby={c.idEtiqueta}
            opciones={opciones}
            valor={datos.parent_id}
            onValorChange={(v) => cambiar('parent_id', v)}
            opcionRaiz={{ etiqueta: 'Sin categoría padre (principal)' }}
            etiquetaLista="Categoría padre"
            placeholderBusqueda="Buscar categoría"
          />
        )}
      </FormField>

      <FormField
        etiqueta="Slug"
        obligatorio
        error={estadoSlug === 'duplicado' ? `Ya hay una categoría con /${slug}.` : null}
        ayuda={estadoSlug === 'duplicado' ? undefined : ayudaSlug}
      >
        <Input
          value={datos.slug}
          onChange={(e) => {
            setSlugTocado(true);
            cambiar('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'));
          }}
          onBlur={() => cambiar('slug', generateSlug(datos.slug))}
          placeholder="bebidas-calientes"
          className="h-10 font-mono text-sm"
        />
      </FormField>
      {estadoSlug === 'duplicado' && sugerencia && (
        <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
          Usa esta, que está libre:
          <button
            type="button"
            onClick={() => {
              setSlugTocado(true);
              cambiar('slug', sugerencia);
            }}
            className="rounded-md bg-brand-tint px-2 py-0.5 font-mono text-link hover:underline"
          >
            {sugerencia}
          </button>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ColorPicker value={datos.color} onChange={(v) => cambiar('color', v)} label="Color" />
        <IconSelector value={datos.icon} onChange={(v) => cambiar('icon', v)} label="Icono" color={datos.color} />
      </div>

      <div className="rounded-lg border border-line">
        <button
          type="button"
          aria-expanded={masOpciones}
          onClick={() => setMasOpciones((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Más opciones
          <span className="flex items-center gap-2 text-xs font-normal text-fg-secondary">
            Descripción, cocina y estado
            <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', masOpciones && 'rotate-180')} strokeWidth={1.5} />
          </span>
        </button>
        {masOpciones && (
          <div className="flex flex-col gap-4 border-t border-line p-3">
            <FormField etiqueta="Descripción">
              <Input
                value={datos.description}
                onChange={(e) => {
                  const description = e.target.value;
                  setDatos((d) => ({ ...d, description, meta_description: description || (d.name ? `Categoría: ${d.name}` : '') }));
                }}
                placeholder="Qué agrupa esta categoría (opcional)"
                className="h-10"
              />
            </FormField>
            <FormField etiqueta="Estación de cocina">
              {(c) => (
                <Select
                  value={datos.station || 'ninguna'}
                  onValueChange={(v) => cambiar('station', v === 'ninguna' ? null : (v as PrinterStation))}
                >
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguna">Sin estación</SelectItem>
                    {OPCIONES_ESTACION.map((o) => (
                      <SelectItem key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <label className="flex items-center justify-between gap-3 text-sm text-fg">
              <span className="flex flex-col">
                Requiere preparación
                <span className="text-xs text-fg-muted">Genera comanda de cocina al vender</span>
              </span>
              <Switch checked={datos.requires_preparation} onCheckedChange={(v) => cambiar('requires_preparation', v)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-fg">
              <span className="flex flex-col">
                Activa
                <span className="text-xs text-fg-muted">Visible en el POS y la tienda web</span>
              </span>
              <Switch checked={datos.is_active} onCheckedChange={(v) => cambiar('is_active', v)} />
            </label>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-[13px] leading-[18px] text-info-text">
        <Info aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
        <span>
          La imagen, el SEO y el orden se completan después en{' '}
          <Link href="/app/inventario/categorias" target="_blank" className="font-medium underline">
            Categorías
          </Link>
          .
        </span>
      </p>

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={guardando}
          className="flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={guardando || estadoSlug === 'duplicado'}
          title={estadoSlug === 'duplicado' ? 'Cambia el slug: ya existe' : undefined}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {guardando ? 'Guardando…' : 'Crear y seleccionar'}
        </button>
      </div>
    </form>
  );
}
