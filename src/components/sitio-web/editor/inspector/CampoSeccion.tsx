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

export const RUTA_PRODUCTOS_INVENTARIO = '/app/inventario/productos';

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
  categorias: { lista: readonly CategoriaInventarioMenu[]; cargando: boolean };
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

  return (
    <div className="flex flex-col gap-1.5">
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
