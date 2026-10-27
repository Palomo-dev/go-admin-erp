'use client';

/**
 * Un campo de una sección en el inspector, con los controles del kit (Figma A/05b-05d): texto,
 * área de texto, enlace, número, interruptor, lista, color y categorías del Inventario como
 * chips. Los tipos compuestos que aún no tienen versión del kit (imagen, texto enriquecido,
 * repetidor, icono, espaciado, alineación, valores por dispositivo y entidades distintas de
 * categorías) se delegan a `FieldRenderer`, el renderizador único de campos del editor, para no
 * tener una segunda implementación.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { AvisoTonal, CampoNumero, ChipsOpcion, FormField, SettingRow, Skeleton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import FieldRenderer from '@/components/organization/branding/editor/fields/FieldRenderer';
import type { ThemePalette } from '@/components/organization/branding/editor/fields/types';
import { ColorField } from '@/components/sitio-web/ui/ColorField';
import type { CategoriaInventarioMenu } from '@/components/sitio-web/paginas/tiposPaginas';
import { useTextosEditor } from '../textos';
import { CampoChecklist, CampoChips } from './CamposListas';
import { EditorPestanas } from './EditorCascaron';
import { EditorBoletin } from './EditorBoletin';
import { AparienciaCategoriasEditor } from './AparienciaCategoriasEditor';

export const RUTA_PRODUCTOS_INVENTARIO = '/app/inventario/productos';

/** Miniatura del estilo de categorías. No es la tienda: solo para elegir. */
function MiniaturaEstilo({ id }: { id: string }) {
  if (id === 'circle') {
    return (
      <span className="flex h-10 items-end gap-1">
        <span className="h-6 w-6 rounded-full bg-brand/30" />
        <span className="h-6 w-6 rounded-full bg-brand/20" />
      </span>
    );
  }
  if (id === 'card_bottom') {
    return (
      <span className="flex h-10 w-full flex-col overflow-hidden rounded bg-white shadow-sm">
        <span className="h-6 bg-brand/20" />
        <span className="m-1 h-1 w-6 rounded bg-gray-300" />
      </span>
    );
  }
  if (id === 'pill') {
    return (
      <span className="flex h-10 items-center">
        <span className="flex items-center gap-1 rounded-full border px-1 py-0.5">
          <span className="h-4 w-4 rounded-full bg-brand/30" />
          <span className="h-1 w-6 rounded bg-gray-300" />
        </span>
      </span>
    );
  }
  if (id === 'bento') {
    return (
      <span className="grid h-10 w-full grid-cols-4 gap-0.5">
        <span className="col-span-2 row-span-2 rounded-sm bg-brand/40" />
        <span className="rounded-sm bg-brand/20" />
        <span className="rounded-sm bg-brand/20" />
        <span className="rounded-sm bg-brand/15" />
        <span className="rounded-sm bg-brand/15" />
      </span>
    );
  }
  if (id === 'minimal_icon') {
    return (
      <span className="flex h-10 w-full flex-col items-center justify-center rounded bg-brand/10">
        <span className="h-4 w-4 rounded-sm bg-brand/40" />
        <span className="mt-1 h-1 w-6 rounded bg-gray-400" />
      </span>
    );
  }
  return (
    <span className="relative h-10 w-full overflow-hidden rounded bg-gray-800">
      <span className="absolute inset-x-1 bottom-1 h-1 rounded bg-white/80" />
    </span>
  );
}

export interface CampoSeccionProps {
  campo: ContentFieldDef;
  valor: unknown;
  /** El contenido completo (los campos `spacing` escriben varias claves). */
  contenido: Record<string, unknown>;
  onCambiar: (valor: unknown) => void;
  onCambiarContenido: (contenido: Record<string, unknown>) => void;
  organizationId?: number;
  paleta?: ThemePalette;
  /** Fondo contra el que se mide el contraste de los colores. */
  fondo?: string | null;
  categorias: { lista: readonly CategoriaInventarioMenu[]; cargando: boolean; recargar?: () => void | Promise<void> };
  deshabilitado?: boolean;
}

export function CampoSeccion({
  campo,
  valor,
  contenido,
  onCambiar,
  onCambiarContenido,
  organizationId,
  paleta,
  fondo,
  categorias,
  deshabilitado,
}: CampoSeccionProps) {
  const t = useTextosEditor();
  const ayuda = campo.helpText;
  const opcionesCategorias = useMemo(
    () =>
      categorias.lista
        .filter((c) => c.activa)
        .sort((a, b) => Number(a.padreId !== null) - Number(b.padreId !== null) || a.nombre.localeCompare(b.nombre, 'es'))
        .map((c) => ({ valor: String(c.id), etiqueta: c.nombre })),
    [categorias.lista],
  );

  if (campo.type === 'newsletter') {
    return <EditorBoletin contenido={contenido} onCambiar={onCambiarContenido} deshabilitado={deshabilitado} />;
  }

  switch (campo.type) {
    case 'text':
    case 'url':
      return (
        <FormField etiqueta={campo.label} ayuda={ayuda}>
          <Input
              type={campo.type === 'url' ? 'url' : 'text'}
              value={typeof valor === 'string' ? valor : ''}
              placeholder={campo.placeholder}
              disabled={deshabilitado}
              onChange={(e) => onCambiar(e.target.value)}
              className="h-10 rounded-lg"
            />
        </FormField>
      );
    case 'textarea':
      return (
        <FormField etiqueta={campo.label} ayuda={ayuda}>
          <Textarea
              rows={3}
              value={typeof valor === 'string' ? valor : ''}
              placeholder={campo.placeholder}
              disabled={deshabilitado}
              onChange={(e) => onCambiar(e.target.value)}
              className="rounded-lg"
            />
        </FormField>
      );
    case 'number':
    case 'range':
      return (
        <FormField etiqueta={campo.label} ayuda={ayuda}>
          <CampoNumero
              valor={typeof valor === 'number' ? valor : typeof campo.defaultValue === 'number' ? campo.defaultValue : null}
              onValorChange={(v) => onCambiar(v)}
              minimo={campo.min}
              maximo={campo.max}
              sufijo={campo.suffix}
              decimales={campo.step && campo.step < 1 ? 2 : 0}
              disabled={deshabilitado}
            />
        </FormField>
      );
    case 'boolean': {
      const activo = typeof valor === 'boolean' ? valor : campo.defaultValue === true;
      const id = `campo-${campo.key}`;
      return (
        <SettingRow titulo={campo.label} descripcion={ayuda} htmlFor={id}>
          <Switch id={id} checked={activo} disabled={deshabilitado} onCheckedChange={(v) => onCambiar(v)} />
        </SettingRow>
      );
    }
    case 'visual': {
      const actual = typeof valor === 'string' && valor ? valor : 'overlay';
      return (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium leading-[18px] text-fg">{campo.label}</p>
          {ayuda ? <p className="text-xs leading-4 text-fg-secondary">{ayuda}</p> : null}
          <div role="radiogroup" aria-label={campo.label} className="grid grid-cols-3 gap-2">
            {(campo.options ?? []).map((o) => {
              const activo = actual === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  disabled={deshabilitado}
                  onClick={() => onCambiar(o.value === 'overlay' ? null : o.value)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] ${activo ? 'border-brand bg-brand/5' : 'border-border bg-surface'}`}
                >
                  <MiniaturaEstilo id={o.value} />
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case 'select': {
      const actual = typeof valor === 'string' ? valor : typeof campo.defaultValue === 'string' ? campo.defaultValue : '';
      return (
        <FormField etiqueta={campo.label} ayuda={ayuda}>
          {(c) => (
            <Select value={actual || undefined} onValueChange={(v) => onCambiar(v)} disabled={deshabilitado}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 rounded-lg">
                <SelectValue placeholder={t('campo.elegir')} />
              </SelectTrigger>
              <SelectContent>
                {(campo.options ?? []).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      );
    }
    case 'color':
      return (
        <ColorField
          etiqueta={campo.label}
          valor={typeof valor === 'string' && valor ? valor : '#FFFFFF'}
          fondo={fondo ?? undefined}
          onCambiar={(v) => onCambiar(v)}
          deshabilitado={deshabilitado}
        />
      );
    case 'entity':
      if (campo.entity === 'category' && campo.multiple) {
        const elegidas = (Array.isArray(valor) ? valor : []).map(String);
        return (
          <div className="flex flex-col gap-2">
            <p id={`etq-${campo.key}`} className="text-[13px] font-medium leading-[18px] text-fg">
              {campo.label}
            </p>
            {categorias.cargando ? (
              <Skeleton className="h-8 w-full rounded-full" />
            ) : opcionesCategorias.length === 0 ? (
              <p className="text-[13px] leading-[18px] text-fg-secondary">{t('contenido.sinCategorias')}</p>
            ) : (
              <ChipsOpcion
                multiple
                aria-labelledby={`etq-${campo.key}`}
                opciones={opcionesCategorias.map((o) => ({ ...o, deshabilitada: deshabilitado }))}
                valor={elegidas}
                onValorChange={(v) => onCambiar(v.map((x) => Number(x)).filter((n) => Number.isFinite(n)))}
              />
            )}
            {ayuda && <p className="text-xs leading-4 text-fg-secondary">{ayuda}</p>}
            {!categorias.cargando && opcionesCategorias.length > 0 && (
              <AparienciaCategoriasEditor lista={categorias.lista} elegidas={elegidas} onGuardado={categorias.recargar} deshabilitado={deshabilitado} />
            )}
            <Link
              href={RUTA_PRODUCTOS_INVENTARIO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 self-start rounded-md text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('contenido.editarInventario')}
            </Link>
          </div>
        );
      }
      break;
    case 'checklist':
      return <CampoChecklist campo={campo} valor={valor} onCambiar={onCambiar} deshabilitado={deshabilitado} />;
    case 'chips':
      return <CampoChips campo={campo} valor={valor} onCambiar={onCambiar} deshabilitado={deshabilitado} />;
    case 'section_header':
      return <EditorPestanas contenido={contenido} onCambiar={onCambiarContenido} />;
    case 'section_background':
      return null;
    case 'notice':
      // Aviso del catálogo (no guarda nada): «Pagar en línea necesita una pasarela activa».
      return (
        <AvisoTonal
          tono="neutro"
          titulo={campo.label}
          descripcion={campo.helpText}
          accion={campo.link ? { etiqueta: campo.link.label, href: campo.link.href, externo: true } : undefined}
        />
      );
    default:
      break;
  }

  const muestraEtiqueta = campo.type === 'image' || campo.type === 'icon';
  return (
    <div className="flex flex-col gap-1.5">
      {muestraEtiqueta && (
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-medium leading-[18px] text-fg">{campo.label}</p>
          {ayuda ? <p className="text-xs leading-4 text-fg-secondary">{ayuda}</p> : null}
        </div>
      )}
      <FieldRenderer
        field={campo}
        value={campo.type === 'spacing' ? contenido : valor}
        onChange={(v) => (campo.type === 'spacing' ? onCambiarContenido(v as Record<string, unknown>) : onCambiar(v))}
        themePalette={paleta}
        organizationId={organizationId}
        activeViewport="desktop"
      />
    </div>
  );
}

/** ¿Se muestra el campo? (`showIf` del catálogo). */
export function campoVisible(campo: ContentFieldDef, contenido: Record<string, unknown>, variante: string): boolean {
  const c = campo.showIf;
  if (!c) return true;
  if (c.variantIn && !c.variantIn.includes(variante)) return false;
  if (c.field) {
    const v = contenido?.[c.field];
    if (c.equals !== undefined && v !== c.equals) return false;
    if (c.in && !c.in.includes(v)) return false;
  }
  return true;
}
