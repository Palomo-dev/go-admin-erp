'use client';

/**
 * Hoja «Menú del encabezado · Principal» / «Menús del pie» del editor en V2 (Figma D/05-20): el
 * MISMO constructor de menús de Páginas › Menú y navegación (`ConstructorMenus`), con la columna
 * de categorías del Inventario, sobre `documento.menus` del borrador. Cada cambio entra al
 * borrador con el autoguardado del editor y el lienzo lo pinta: ya no hay que «Actualizar menú en
 * el borrador». En legacy se sigue usando la hoja de la biblioteca de menús (`HojaMenu`).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import type { DocumentoSitio, ItemMenu } from '@/lib/website/contrato/documentoSitio';
import { ConstructorMenus } from '@/components/sitio-web/paginas/ConstructorMenus';
import { ColumnaCategoriasInventario, useCategoriasMenu } from '@/components/sitio-web/paginas/ColumnaCategoriasInventario';
import { categoriasComoSubmenu, categoriasDeItem, buscarItem } from '@/components/sitio-web/paginas/operacionesMenu';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import { nuevoIdSeccion } from '@/lib/website/v2/vistaEditor';
import { useTextosEditor } from './textos';

export interface HojaMenuV2Props {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  zona: 'header' | 'footer';
  documento: DocumentoSitio;
  branchId: number | null;
  onCambiarItems: (menuId: string, items: ItemMenu[]) => void;
}

export function HojaMenuV2(p: HojaMenuV2Props) {
  const t = useTextosEditor();
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const categorias = useCategoriasMenu(p.branchId, !p.abierto);
  const porId = useMemo(() => new Map(categorias.categorias.map((c) => [String(c.id), c])), [categorias.categorias]);
  const menus = useMemo(() => {
    const ids = p.zona === 'header' ? [p.documento.shell.header.menuPrincipalId] : p.documento.shell.footer.menuIds;
    return ids.map((id) => p.documento.menus.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  }, [p.zona, p.documento]);
  const principal = menus[0] ?? null;
  const nodoSel = principal && seleccionado ? buscarItem(principal.items, seleccionado) : null;

  const titulo =
    p.zona === 'header'
      ? t('menu.tituloEncabezado', { menu: principal?.nombre ?? t('menu.sinMenu') })
      : t('menu.tituloPie');

  return (
    <HojaDetalle
      abierto={p.abierto}
      onAbiertoChange={p.onAbiertoChange}
      titulo={titulo}
      subtitulo={t('menu.subtitulo')}
      ancho={640}
      pie={
        <div className="flex w-full items-center justify-between gap-2">
          <Link href={`${RAIZ_SITIO_WEB}/paginas/menu`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-link hover:underline">
            {t('menu.abrirPaginas')}
          </Link>
          <Button type="button" onClick={() => p.onAbiertoChange(false)}>
            {t('menu.listo')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {menus.length === 0 ? (
          <p className="text-[13px] leading-[18px] text-fg-secondary">{p.zona === 'header' ? t('menu.vacioEncabezado') : t('menu.vacioPie')}</p>
        ) : (
          menus.map((m) => (
            <section key={m.id} className="flex flex-col gap-2">
              {p.zona === 'footer' && <h3 className="text-sm font-semibold text-fg">{m.nombre}</h3>}
              <ConstructorMenus
                menu={m}
                paginas={p.documento.paginas}
                categorias={porId}
                seleccionado={m === principal ? seleccionado : null}
                onSeleccionar={setSeleccionado}
                onCambiar={(items) => p.onCambiarItems(m.id, items)}
                textoVacio={t('menu.vacioMenu')}
              />
            </section>
          ))
        )}
        {p.zona === 'header' && principal && (
          <ColumnaCategoriasInventario
            datos={categorias}
            branchId={p.branchId}
            enMenu={nodoSel ? categoriasDeItem(nodoSel.item) : new Set()}
            onAnadir={(categoriaId) => {
              if (!nodoSel) return;
              const c = porId.get(String(categoriaId));
              if (!c) return;
              p.onCambiarItems(
                principal.id,
                categoriasComoSubmenu(principal.items, nodoSel.item.id, [{ id: c.id, nombre: c.nombre }], true, nuevoIdSeccion),
              );
            }}
            soloLectura={!nodoSel}
          />
        )}
      </div>
    </HojaDetalle>
  );
}
