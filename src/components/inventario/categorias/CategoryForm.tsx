'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChefHat, Globe, Info, Layers, Loader2, Lock, Save, Sparkles, Tags, TriangleAlert, Wand2 } from 'lucide-react';
import { FormField, FormSection, PageHeader } from '@/components/kit';
import { TreeCell } from '@/components/kit/TreeCell';
import { TreeSelect, type OpcionArbol } from '@/components/kit/TreePicker';
import { ancestrosDe, descendientesDe } from '@/components/kit/arbol';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import ImageUploader from '@/components/common/ImageUploader';
import IconSelector from '@/components/common/IconSelector';
import ColorPicker from '@/components/common/ColorPicker';
import { useOrganization } from '@/lib/hooks/useOrganization';
import categoryService, {
  ErrorCategoria,
  emptyFormData,
  generateSlug,
  type Category,
  type CategoryFormData,
} from '@/lib/services/categoryService';
import type { PrinterStation } from '@/components/pos/configuracion/printersService';
import { cn } from '@/utils/Utils';
import { iconoCategoria, OPCIONES_ESTACION, RUTAS_CATEGORIAS } from './iconoCategoria';

/**
 * Formulario completo de categoría, uno solo para crear y editar (Figma
 * «Escritorio / Categoría — editar (formulario completo)», `586:313786`):
 * General · Cocina y POS · Apariencia · Tienda web y SEO, con «Estado» y
 * «Vista previa en el árbol» al lado.
 *
 * - El padre se elige sobre el árbol real; la propia categoría y sus
 *   subcategorías salen deshabilitadas con el motivo (crearían un ciclo). El
 *   servidor lo comprueba igual (`trg_categories_sin_ciclos`).
 * - El slug es la dirección pública en la tienda web: al crear se deriva del
 *   nombre; al editar queda **bloqueado** y hay que desbloquearlo a propósito.
 *   Antes de guardar se comprueba que no esté repetido y, si lo está, se
 *   propone el primero libre.
 * - Título y descripción SEO se autocompletan solo al crear y solo mientras la
 *   persona no los haya tocado (antes la descripción SEO se pisaba con cada
 *   tecla y guardaba el HTML del editor).
 */
interface CategoryFormProps {
  categoryUuid?: string;
  defaultParentId?: number | null;
}

type Errores = Partial<Record<'name' | 'slug' | 'parent_id' | 'general', string>>;

/** Texto plano de la descripción (el editor guarda HTML). */
function textoPlano(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function CategoryForm({ categoryUuid, defaultParentId }: CategoryFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const esEdicion = !!categoryUuid;

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [generandoDesc, setGenerandoDesc] = useState(false);
  const [generandoImg, setGenerandoImg] = useState(false);
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [original, setOriginal] = useState<Category | null>(null);
  const [datos, setDatos] = useState<CategoryFormData>({ ...emptyFormData, parent_id: defaultParentId ?? null });
  const [errores, setErrores] = useState<Errores>({});
  const [sugerenciaSlug, setSugerenciaSlug] = useState<string | null>(null);
  const [slugDesbloqueado, setSlugDesbloqueado] = useState(!esEdicion);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const tocados = useRef<Set<keyof CategoryFormData>>(new Set());

  useEffect(() => {
    if (!organizationId) return;
    let vivo = true;
    (async () => {
      try {
        const [todas, cat] = await Promise.all([
          categoryService.getAll(organizationId),
          esEdicion && categoryUuid ? categoryService.getByUuid(categoryUuid).catch(() => null) : Promise.resolve(null),
        ]);
        if (!vivo) return;
        setCategorias(todas);
        if (esEdicion) {
          if (!cat || cat.organization_id !== organizationId) {
            setNoEncontrada(true);
            return;
          }
          setOriginal(cat);
          setDatos({
            name: cat.name,
            slug: cat.slug,
            parent_id: cat.parent_id,
            rank: cat.rank,
            icon: cat.icon || 'Package',
            color: cat.color || emptyFormData.color,
            image_url: cat.image_url || '',
            description: cat.description || '',
            is_active: cat.is_active,
            display_order: cat.display_order,
            meta_title: cat.meta_title || '',
            meta_description: cat.meta_description || '',
            metadata: cat.metadata || {},
            station: cat.station || null,
            requires_preparation: cat.requires_preparation ?? false,
          });
        }
      } catch {
        if (vivo) toast({ title: 'No se pudieron cargar las categorías', variant: 'destructive' });
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [organizationId, esEdicion, categoryUuid, toast]);

  const cambiar = useCallback(<K extends keyof CategoryFormData>(clave: K, valor: CategoryFormData[K], aMano = true) => {
    if (aMano) tocados.current.add(clave);
    setDatos((d) => ({ ...d, [clave]: valor }));
    setErrores((e) => (e[clave as keyof Errores] ? { ...e, [clave]: undefined } : e));
  }, []);

  const cambiarNombre = (name: string) => {
    tocados.current.add('name');
    setDatos((d) => ({
      ...d,
      name,
      // Al crear, el slug y el SEO siguen al nombre mientras no se toquen. Al
      // editar no: el slug es la URL publicada y el SEO ya lo escribió alguien.
      ...(!esEdicion && !tocados.current.has('slug') ? { slug: generateSlug(name) } : {}),
      ...(!esEdicion && !tocados.current.has('meta_title') ? { meta_title: name } : {}),
      ...(!esEdicion && !tocados.current.has('meta_description') && !textoPlano(d.description)
        ? { meta_description: name ? `Categoría: ${name}` : '' }
        : {}),
    }));
    setErrores((e) => ({ ...e, name: undefined }));
    setSugerenciaSlug(null);
  };

  const cambiarDescripcion = (html: string) => {
    setDatos((d) => ({
      ...d,
      description: html,
      ...(!esEdicion && !tocados.current.has('meta_description')
        ? { meta_description: (textoPlano(html) || (d.name ? `Categoría: ${d.name}` : '')).slice(0, 160) }
        : {}),
    }));
  };

  // ── Árbol para el padre y la vista previa ────────────────────────────────
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

  const deshabilitadas = useMemo(() => {
    const mapa = new Map<number, string>();
    if (!original) return mapa;
    mapa.set(original.id, 'Es esta misma categoría');
    for (const d of descendientesDe(opciones, [original.id])) mapa.set(d, 'Es una de sus subcategorías: crearía un ciclo');
    return mapa;
  }, [original, opciones]);

  const rutaPadre = useMemo(
    () =>
      datos.parent_id !== null
        ? [...ancestrosDe(opciones, datos.parent_id), ...opciones.filter((o) => o.id === datos.parent_id)]
        : [],
    [opciones, datos.parent_id],
  );

  // ── Generación con IA (mismos endpoints de antes) ────────────────────────
  const generarDescripcion = async () => {
    if (!datos.name.trim()) {
      setErrores((e) => ({ ...e, name: 'Escribe un nombre primero' }));
      return;
    }
    setGenerandoDesc(true);
    try {
      const res = await fetch('/api/ai-assistant/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: datos.name, currentDescription: datos.description || '', type: 'category_description' }),
      });
      if (!res.ok) throw new Error();
      const r = await res.json();
      if (r.improvedText) cambiarDescripcion(r.improvedText);
      toast({ title: 'Descripción generada' });
    } catch {
      toast({ title: 'No se pudo generar la descripción', variant: 'destructive' });
    } finally {
      setGenerandoDesc(false);
    }
  };

  const generarImagen = async () => {
    if (!datos.name.trim()) {
      setErrores((e) => ({ ...e, name: 'Escribe un nombre primero' }));
      return;
    }
    setGenerandoImg(true);
    try {
      const res = await fetch('/api/ai-assistant/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: datos.name,
          description: textoPlano(datos.description) || `Categoría: ${datos.name}`,
          organizationId: organizationId ?? 0,
        }),
      });
      if (!res.ok) throw new Error();
      const r = await res.json();
      if (r.imageUrl) {
        cambiar('image_url', r.imageUrl);
        toast({ title: 'Imagen generada con IA' });
      }
    } catch {
      toast({ title: 'No se pudo generar la imagen', variant: 'destructive' });
    } finally {
      setGenerandoImg(false);
    }
  };

  // ── Guardar ──────────────────────────────────────────────────────────────
  const guardar = async () => {
    if (!organizationId) return;
    const nuevos: Errores = {};
    if (!datos.name.trim()) nuevos.name = 'El nombre es obligatorio';
    // Un slug bloqueado se guarda tal cual: normalizarlo cambiaría una URL ya publicada.
    const slug = esEdicion && !slugDesbloqueado ? datos.slug : generateSlug(datos.slug) || generateSlug(datos.name);
    if (!slug) nuevos.slug = 'Escribe una dirección con letras o números';
    if (original && datos.parent_id !== null && deshabilitadas.has(datos.parent_id)) {
      nuevos.parent_id = 'No puedes elegir una de sus subcategorías: crearía un ciclo.';
    }
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }

    setGuardando(true);
    setErrores({});
    try {
      if (!(await categoryService.slugDisponible(organizationId, slug, original?.id))) {
        const libre = await categoryService.sugerirSlug(organizationId, slug, original?.id);
        setSugerenciaSlug(libre);
        setSlugDesbloqueado(true);
        setErrores({ slug: `Ya hay una categoría con /${slug}.` });
        return;
      }

      const aGuardar: CategoryFormData = { ...datos, name: datos.name.trim(), slug };
      let resultado: Category;
      if (esEdicion && categoryUuid) {
        resultado = await categoryService.updateByUuid(categoryUuid, aGuardar);
        toast({ title: 'Categoría actualizada', description: `«${aGuardar.name}» guardada.` });
      } else {
        // Al final de sus hermanas, como antes.
        const hermanas = categorias.filter((c) => c.parent_id === datos.parent_id);
        const maximo = hermanas.length ? Math.max(...hermanas.map((c) => c.display_order || 0)) : 0;
        resultado = await categoryService.create(organizationId, { ...aGuardar, rank: maximo + 1, display_order: maximo + 1 });
        toast({ title: 'Categoría creada', description: `«${aGuardar.name}» ya está disponible.` });
      }
      router.push(RUTAS_CATEGORIAS.detalle(resultado.uuid));
    } catch (e) {
      if (e instanceof ErrorCategoria && e.slugDuplicado) {
        setErrores({ slug: e.message });
      } else if (e instanceof ErrorCategoria && e.codigo === 'CATEGORIA_CICLO') {
        setErrores({ parent_id: e.message });
      } else {
        setErrores({ general: e instanceof Error ? e.message : 'No se pudo guardar' });
      }
    } finally {
      setGuardando(false);
    }
  };

  const volverA = original ? RUTAS_CATEGORIAS.detalle(original.uuid) : RUTAS_CATEGORIAS.listado;
  const titulo = esEdicion ? 'Editar categoría' : 'Nueva categoría';
  const subtitulo = `${datos.name || (esEdicion ? 'Categoría' : 'Sin nombre')} · los cambios se ven en el POS y en la tienda web al guardar`;

  const botonGuardar = (compacto?: boolean) => (
    <button
      type="button"
      onClick={() => void guardar()}
      disabled={guardando || cargando}
      aria-busy={guardando || undefined}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60',
        compacto ? 'px-3' : 'px-4',
      )}
    >
      {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />}
      {guardando ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear categoría'}
    </button>
  );

  const cabecera = (
    <PageHeader
      titulo={titulo}
      subtitulo={subtitulo}
      variante="form"
      volverA={volverA}
      cargando={cargando}
      migas={[
        { etiqueta: 'Inventario', href: '/app/inventario' },
        { etiqueta: 'Categorías', href: RUTAS_CATEGORIAS.listado },
        ...(original ? [{ etiqueta: original.name, href: RUTAS_CATEGORIAS.detalle(original.uuid) }] : [{ etiqueta: 'Nueva' }]),
      ]}
      acciones={
        <>
          <button
            type="button"
            onClick={() => router.push(volverA)}
            disabled={guardando}
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Descartar
          </button>
          {botonGuardar()}
        </>
      }
      movil={{ subtitulo: datos.name || undefined, accion: botonGuardar(true), ocultarBarra: true }}
    />
  );

  if (noEncontrada) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        <p role="alert" className="rounded-xl border border-line bg-surface p-6 text-sm text-fg-secondary">
          No encontramos esta categoría en tu organización.
        </p>
      </div>
    );
  }

  if (cargando) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    );
  }

  const IconoVista = iconoCategoria(datos.icon);

  return (
    <form
      className="flex flex-col gap-4 lg:gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      {cabecera}

      {errores.general && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {errores.general}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <FormSection titulo="General" descripcion="Nombre, ubicación en el árbol y descripción." icono={Tags} colapsable>
            <FormField etiqueta="Nombre" obligatorio error={errores.name}>
              <Input
                value={datos.name}
                onChange={(e) => cambiarNombre(e.target.value)}
                placeholder="Ej.: Bebidas calientes"
                autoFocus={!esEdicion}
                maxLength={120}
                className="h-10"
              />
            </FormField>

            <FormField
              etiqueta="Categoría padre"
              error={errores.parent_id}
              ayuda={esEdicion ? 'No puedes elegir una de sus subcategorías: crearía un ciclo.' : 'Déjala sin padre para que sea una categoría principal.'}
            >
              {(c) => (
                <TreeSelect
                  id={c.id}
                  aria-labelledby={c.idEtiqueta}
                  aria-describedby={c['aria-describedby']}
                  aria-invalid={c['aria-invalid']}
                  opciones={opciones}
                  valor={datos.parent_id}
                  onValorChange={(v) => cambiar('parent_id', v)}
                  opcionRaiz={{ etiqueta: 'Sin categoría padre (principal)' }}
                  deshabilitadas={deshabilitadas}
                  actual={original ? original.parent_id : undefined}
                  etiquetaLista="Categoría padre"
                  placeholderBusqueda="Buscar categoría"
                />
              )}
            </FormField>

            <FormField
              etiqueta="Descripción"
              ayuda="Se usa en la tienda web. «Generar con IA» consume créditos."
              extra={
                <button
                  type="button"
                  onClick={() => void generarDescripcion()}
                  disabled={generandoDesc || !datos.name.trim()}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-link hover:bg-hover disabled:opacity-50"
                >
                  {generandoDesc ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Sparkles aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
                  {generandoDesc ? 'Generando…' : 'Generar con IA'}
                </button>
              }
            >
              {() => (
                <RichTextEditor
                  value={datos.description}
                  onChange={cambiarDescripcion}
                  placeholder="Qué agrupa esta categoría (opcional)"
                />
              )}
            </FormField>
          </FormSection>

          <FormSection titulo="Cocina y POS" descripcion="Dónde se prepara y si genera comanda." columnas={2} icono={ChefHat} colapsable>
            <FormField
              etiqueta="Estación de cocina"
              ayuda="Los productos de esta categoría se envían a esta estación. Un producto puede cambiarla."
            >
              {(c) => (
                <Select
                  value={datos.station || 'ninguna'}
                  onValueChange={(v) => cambiar('station', v === 'ninguna' ? null : (v as PrinterStation))}
                >
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10">
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
            <FormField etiqueta="Requiere preparación" ayuda="Genera una comanda de cocina al vender desde el POS.">
              {(c) => (
                <span className="flex h-10 items-center gap-3">
                  <Switch
                    id={c.id}
                    aria-labelledby={c.idEtiqueta}
                    checked={datos.requires_preparation}
                    onCheckedChange={(v) => cambiar('requires_preparation', v)}
                  />
                  <span className="text-sm text-fg-secondary">
                    {datos.requires_preparation ? 'Sí · genera comanda al vender' : 'No'}
                  </span>
                </span>
              )}
            </FormField>
          </FormSection>

          <FormSection titulo="Apariencia" descripcion="Color, icono e imagen en el POS y la tienda." columnas={2} icono={Layers} colapsable>
            <ColorPicker value={datos.color} onChange={(v) => cambiar('color', v)} label="Color" />
            <IconSelector value={datos.icon} onChange={(v) => cambiar('icon', v)} label="Icono" color={datos.color} />
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-fg">Imagen</span>
                <button
                  type="button"
                  onClick={() => void generarImagen()}
                  disabled={generandoImg || !datos.name.trim()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-fg hover:bg-hover disabled:opacity-50"
                >
                  {generandoImg ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <Wand2 aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
                  {generandoImg ? 'Generando…' : 'Generar con IA'}
                </button>
              </div>
              <ImageUploader
                currentImageUrl={datos.image_url}
                onImageUploaded={(url) => cambiar('image_url', url)}
                onImageRemoved={() => cambiar('image_url', '')}
                bucket="categories"
                folder="images"
                label=""
              />
              <p className="text-xs text-fg-muted">Se usa en el POS (vista de imágenes), la tienda web y el catálogo.</p>
            </div>
          </FormSection>

          <FormSection titulo="Tienda web y SEO" descripcion="Dirección pública de la categoría." icono={Globe} colapsable>
            <FormField
              etiqueta="Slug (dirección pública)"
              obligatorio
              error={errores.slug}
              ayuda={
                esEdicion && !slugDesbloqueado
                  ? 'Bloqueado: al renombrar ya no se regenera. Editarlo rompe las páginas y los enlaces de menú que lo usan.'
                  : 'Se forma con el nombre; solo letras minúsculas, números y guiones.'
              }
              extra={
                esEdicion && !slugDesbloqueado ? (
                  <button
                    type="button"
                    onClick={() => setSlugDesbloqueado(true)}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-link hover:bg-hover"
                  >
                    <Lock aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                    Desbloquear
                  </button>
                ) : undefined
              }
            >
              <Input
                value={datos.slug}
                readOnly={esEdicion && !slugDesbloqueado}
                onChange={(e) => {
                  cambiar('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  setSugerenciaSlug(null);
                }}
                onBlur={() => datos.slug && cambiar('slug', generateSlug(datos.slug), false)}
                placeholder="bebidas-calientes"
                className={cn('h-10 font-mono text-sm', esEdicion && !slugDesbloqueado && 'bg-subtle text-fg-secondary')}
              />
            </FormField>
            {sugerenciaSlug && (
              <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
                Libre:
                <button
                  type="button"
                  onClick={() => {
                    cambiar('slug', sugerenciaSlug);
                    setSugerenciaSlug(null);
                  }}
                  className="rounded-md bg-brand-tint px-2 py-0.5 font-mono text-link hover:underline"
                >
                  {sugerenciaSlug}
                </button>
              </p>
            )}
            <FormField etiqueta="Título SEO" ayuda={!esEdicion ? 'Se completa con el nombre mientras no lo cambies.' : undefined}>
              <Input
                value={datos.meta_title}
                onChange={(e) => cambiar('meta_title', e.target.value)}
                placeholder="Título para buscadores"
                maxLength={70}
                className="h-10"
              />
            </FormField>
            <FormField
              etiqueta="Descripción SEO"
              ayuda={`${datos.meta_description.length}/160 · ${!esEdicion ? 'se completa con la descripción mientras no la cambies' : 'texto para buscadores'}`}
            >
              <Textarea
                value={datos.meta_description}
                onChange={(e) => cambiar('meta_description', e.target.value)}
                placeholder="Descripción para buscadores"
                rows={3}
                maxLength={320}
                className="resize-none"
              />
            </FormField>
          </FormSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <FormSection titulo="Estado">
            <label className="flex items-center gap-3">
              <Switch checked={datos.is_active} onCheckedChange={(v) => cambiar('is_active', v)} aria-label="Categoría activa" />
              <span className="text-sm text-fg-secondary">
                {datos.is_active ? 'Activa · visible en el POS y la tienda' : 'Inactiva · oculta en el POS y la tienda'}
              </span>
            </label>
          </FormSection>

          <FormSection titulo="Vista previa en el árbol">
            <div className="flex flex-col gap-1">
              {rutaPadre.map((o, i) => (
                <TreeCell
                  key={o.id}
                  titulo={o.etiqueta}
                  subtitulo={o.detalle}
                  nivel={i}
                  tieneHijos
                  abierto
                  icono={o.icono}
                  color={o.color}
                  contexto
                  sangria={16}
                />
              ))}
              <TreeCell
                className="bg-brand-tint p-1"
                titulo={datos.name || 'Sin nombre'}
                subtitulo={`/${datos.slug || generateSlug(datos.name) || '…'}`}
                nivel={rutaPadre.length}
                tieneHijos={false}
                icono={IconoVista ?? Tags}
                color={datos.color}
                miniatura={datos.image_url || null}
                sangria={16}
              />
            </div>
          </FormSection>

          <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-[13px] leading-[18px] text-warning-text">
            <Info aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.5} />
            Al guardar, el POS y la tienda web muestran los cambios. Las reglas de asignación no se recalculan solas: aplícalas desde el detalle.
          </p>
        </aside>
      </div>
    </form>
  );
}
