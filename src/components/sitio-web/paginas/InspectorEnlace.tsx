'use client';

/**
 * Inspector «Enlace · <nombre>» (Figma A/04c y D/04-09): texto del enlace, a dónde lleva
 * (página, categoría del Inventario, enlace externo, WhatsApp o teléfono), «Mostrar categorías
 * … como submenú (de Inventario)» y «Editar categorías en Inventario».
 *
 * Las opciones de presentación del megamenú de D/04-09 (columnas, autollenado en vivo, imagen,
 * destacado, icono e insignia) no tienen campo en el contrato del documento (`ItemMenu` es
 * estricto) ni las pinta todavía el sitio público: se muestran deshabilitadas con «Próximamente»
 * en lugar de guardar algo que nadie verá. Ver el informe del área.
 */
import Link from 'next/link';
import { ListMinus } from 'lucide-react';
import { AvisoTonal, ChipsOpcion, FormField, SettingRow, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ItemMenu, PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { categoriasDeItem, tipoEnlace, urlContacto, type DestinoEnlace } from './operacionesMenu';
import { esInicio } from './tipoPagina';
import { useTextosPaginas } from './textos';
import type { CategoriaInventarioMenu } from './tiposPaginas';
import type { Giro } from './plantillasPagina';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';

export const RUTA_CATEGORIAS_INVENTARIO = '/app/inventario/categorias';

export interface InspectorEnlaceProps {
  item: ItemMenu | null;
  /** Nivel del ítem (0 = primer nivel). */
  nivel: number;
  paginas: readonly PaginaSitio[];
  categorias: readonly CategoriaInventarioMenu[];
  giro: Giro;
  soloLectura?: boolean;
  onRenombrar: (texto: string) => void;
  onDestino: (destino: DestinoEnlace) => void;
  onCategoriasSubmenu: (activar: boolean) => void;
  onQuitar: () => void;
}

function valorDestino(item: ItemMenu): string {
  if (item.tipo === 'page') return `page:${item.paginaId}`;
  if (item.tipo === 'entity') return `cat:${item.entidadId}`;
  if (item.tipo === 'custom') {
    const tipo = tipoEnlace(item);
    return tipo === 'whatsapp' ? 'whatsapp' : tipo === 'telefono' ? 'telefono' : 'externo';
  }
  return 'otro';
}

function numeroDe(item: ItemMenu): string {
  if (item.tipo !== 'custom') return '';
  return item.url.replace(/^tel:/, '').replace(/^https:\/\/wa\.me\//, '+');
}

export function InspectorEnlace({
  item,
  nivel,
  paginas,
  categorias,
  giro,
  soloLectura,
  onRenombrar,
  onDestino,
  onCategoriasSubmenu,
  onQuitar,
}: InspectorEnlaceProps) {
  const t = useTextosPaginas();
  if (!item) return <p className="text-sm text-fg-secondary">{t('inspector.vacio')}</p>;

  const valor = valorDestino(item);
  const elegirDestino = (v: string) => {
    if (v.startsWith('page:')) onDestino({ tipo: 'page', paginaId: v.slice(5) });
    else if (v.startsWith('cat:')) onDestino({ tipo: 'entity', entidad: 'category', entidadId: v.slice(4) });
    else if (v === 'externo') onDestino({ tipo: 'custom', url: 'https://' });
    else if (v === 'whatsapp' || v === 'telefono') onDestino({ tipo: 'custom', url: urlContacto(v, '') });
  };
  const conCategorias = categoriasDeItem(item).size > 0;
  // Presentación derivada de los hijos REALES del ítem (con hijos, el sitio lo pinta como
  // desplegable). El documento aún no guarda «megamenú» ni sus columnas: no se marca ninguna
  // columna en vez de mostrar una cifra que no sale del documento.
  const presentacion: 'enlace' | 'desplegable' = (item.hijos?.length ?? 0) > 0 ? 'desplegable' : 'enlace';
  const raices = categorias.filter((c) => c.padreId === null && c.activa);
  const etiquetaPagina = (p: PaginaSitio) => t('inspector.pagina', { nombre: p.titulo, ruta: esInicio(p) ? '/' : `/${p.slug}` });

  return (
    <div className="flex flex-col gap-4">
      <FormField etiqueta={t('inspector.texto')} obligatorio>
        <Input value={item.etiqueta} maxLength={200} disabled={soloLectura} onChange={(e) => onRenombrar(e.target.value)} />
      </FormField>

      <FormField etiqueta={t('inspector.llevaA')} obligatorio>
        {(campo) => (
          <Select value={valor} onValueChange={elegirDestino} disabled={soloLectura}>
            <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10 rounded-lg">
              <SelectValue placeholder={t('inspector.elegirPagina')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{t('inspector.destino.pagina')}</SelectLabel>
                {paginas.map((p) => (
                  <SelectItem key={p.id} value={`page:${p.id}`}>
                    {etiquetaPagina(p)}
                  </SelectItem>
                ))}
              </SelectGroup>
              {categorias.length > 0 && (
                <SelectGroup>
                  <SelectLabel>{t('inspector.destino.categoria')}</SelectLabel>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={`cat:${c.id}`}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              <SelectGroup>
                <SelectLabel>{t('inspector.tipoDestino')}</SelectLabel>
                <SelectItem value="externo">{t('inspector.destino.externo')}</SelectItem>
                <SelectItem value="whatsapp">{t('inspector.destino.whatsapp')}</SelectItem>
                <SelectItem value="telefono">{t('inspector.destino.telefono')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </FormField>

      {valor === 'externo' && item.tipo === 'custom' && (
        <>
          <FormField etiqueta={t('inspector.url')} obligatorio>
            <Input
              type="url"
              value={item.url}
              maxLength={2048}
              disabled={soloLectura}
              onChange={(e) => onDestino({ tipo: 'custom', url: e.target.value, nuevaPestana: item.nuevaPestana })}
            />
          </FormField>
          <SettingRow titulo={t('inspector.nuevaPestana')} htmlFor={`nueva-pestana-${item.id}`}>
            <Switch
              id={`nueva-pestana-${item.id}`}
              checked={!!item.nuevaPestana}
              disabled={soloLectura}
              onCheckedChange={(v) => onDestino({ tipo: 'custom', url: item.url, nuevaPestana: v })}
            />
          </SettingRow>
        </>
      )}
      {(valor === 'whatsapp' || valor === 'telefono') && (
        <FormField etiqueta={t('inspector.numero')} obligatorio ayuda={t('inspector.numeroAyuda')}>
          <Input
            type="tel"
            value={numeroDe(item)}
            maxLength={20}
            disabled={soloLectura}
            onChange={(e) => onDestino({ tipo: 'custom', url: urlContacto(valor, e.target.value) })}
          />
        </FormField>
      )}

      {item.tipo === 'page' && nivel === 0 && (
        <>
          <SettingRow
            titulo={giro === 'restaurante' ? t('inspector.categoriasSubmenu') : t('inspector.categoriasSubmenuTienda')}
            htmlFor={`categorias-${item.id}`}
          >
            <Switch
              id={`categorias-${item.id}`}
              checked={conCategorias}
              disabled={soloLectura || raices.length === 0}
              onCheckedChange={onCategoriasSubmenu}
            />
          </SettingRow>
          <Link href={RUTA_CATEGORIAS_INVENTARIO} className="text-sm font-medium text-brand-deep hover:underline">
            {t('inspector.editarCategorias')}
          </Link>
        </>
      )}

      {conCategorias && (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <AvisoTonal tono="informacion" compacto titulo={t('inspector.proximamente')} descripcion={t('inspector.proximamenteAyuda')} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">{t('inspector.tipoEnlace')}</span>
            <ChipsOpcion
              etiqueta={t('inspector.tipoEnlace')}
              valor={presentacion}
              onValorChange={() => undefined}
              opciones={[
                { valor: 'enlace', etiqueta: t('inspector.tipos.enlace'), deshabilitada: presentacion !== 'enlace', motivo: t('inspector.proximamente') },
                { valor: 'desplegable', etiqueta: t('inspector.tipos.desplegable'), deshabilitada: presentacion !== 'desplegable', motivo: t('inspector.proximamente') },
                { valor: 'megamenu', etiqueta: t('inspector.tipos.megamenu'), deshabilitada: true, motivo: t('inspector.proximamente') },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg-muted">{t('inspector.columnas')}</span>
            <ChipsOpcion
              etiqueta={t('inspector.columnas')}
              valor=""
              onValorChange={() => undefined}
              opciones={['2', '3', '4', '5', '6'].map((c) => ({ valor: c, etiqueta: c, deshabilitada: true, motivo: t('inspector.proximamente') }))}
            />
          </div>
          <SettingRow titulo={t('inspector.autollenar')} descripcion={t('inspector.autollenarAyuda')}>
            <Switch checked={false} disabled aria-label={t('inspector.autollenar')} />
          </SettingRow>
          <SettingRow titulo={t('inspector.imagenCategoria')}>
            <Switch checked={false} disabled aria-label={t('inspector.imagenCategoria')} />
          </SettingRow>
          <SettingRow titulo={t('inspector.destacado')}>
            <Switch checked={false} disabled aria-label={t('inspector.destacado')} />
          </SettingRow>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg-muted">{t('inspector.icono')}</span>
            <ChipsOpcion
              etiqueta={t('inspector.icono')}
              valor="ninguno"
              onValorChange={() => undefined}
              opciones={(['ninguno', 'cubiertos', 'etiqueta', 'estrella'] as const).map((c) => ({
                valor: c,
                etiqueta: t(`inspector.iconos.${c}`),
                deshabilitada: true,
                motivo: t('inspector.proximamente'),
              }))}
            />
          </div>
          <FormField etiqueta={t('inspector.insignia')} ayuda={t('inspector.insigniaAyuda')}>
            <Input disabled maxLength={12} value="" readOnly />
          </FormField>
        </div>
      )}

      {!soloLectura && (
        <button type="button" onClick={onQuitar} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start' })}>
          <ListMinus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('inspector.quitar')}
        </button>
      )}
    </div>
  );
}
