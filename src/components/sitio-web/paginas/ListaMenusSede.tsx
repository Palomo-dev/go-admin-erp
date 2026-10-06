'use client';

/**
 * «Menús de <sitio>» (Figma D/04-10): menús con nombre del sitio principal o de una sede, con su
 * ubicación (Encabezado, Megamenú, Pie · columna n, Sin ubicación), número de enlaces y
 * procedencia («copiado del principal», «editado en Sede Norte», «Solo existe en …»).
 *
 * - Sede con sitio propio: OutletSwitcher ámbar, banda «Sitio propio…» y «Restablecer desde el
 *   principal».
 * - Sede que hereda: InheritanceTag «Heredado de la principal», filas bloqueadas y «Personalizar
 *   en esta sede».
 * - Una sola sede (o ninguna): «Menús del sitio», sin selector.
 */
import { useState } from 'react';
import { Copy, Lock, MapPin, Pencil, Trash2, Type } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal, ChipsOpcion, ConfirmDialog, Dialogo, FormField, RowActionsMenu, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DocumentoSitio, MenuSitio } from '@/lib/website/contrato/documentoSitio';
import { InheritanceTag } from '@/components/sitio-web/ui/InheritanceTag';
import { OutletSwitcher, type SedeEditable } from '@/components/sitio-web/ui/OutletSwitcher';
import { contarItems, menuIgualABase, ubicacionDeMenu, type UbicacionMenu } from './operacionesMenu';
import { useTextosPaginas, type TraductorPaginas } from './textos';
import { ICONO_ZONA_MENU } from './iconosPagina';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';

export interface ListaMenusSedeProps {
  documento: DocumentoSitio;
  /** Documento del principal (sedes): procedencia de cada menú. */
  base: DocumentoSitio | null;
  modo: 'principal' | 'propio' | 'heredado';
  sitioNombre: string;
  /** Selector de sitio (solo con sedes en la web). */
  sedes: readonly SedeEditable[];
  sedeActual: string | null;
  onCambiarSede: (id: string | null) => void;
  soloLectura: boolean;
  menuActivo: string | null;
  onEditar: (menuId: string) => void;
  onNuevo: () => void;
  onRenombrar: (menuId: string, nombre: string) => void;
  onUbicacion: (menuId: string, ubicacion: UbicacionMenu) => void;
  onDuplicar: (menuId: string) => void;
  onEliminar: (menuId: string) => void;
  onPersonalizar: () => void;
  onRestablecer: () => void;
  personalizando?: boolean;
}

function textoUbicacion(u: UbicacionMenu, t: TraductorPaginas): string {
  return u.tipo === 'pie' ? t('sedes.ubicacion.pie', { n: u.columna }) : t(`sedes.ubicacion.${u.tipo}`);
}

const TONO_UBICACION = { encabezado: 'marca', megamenu: 'informacion', pie: 'neutro', sin: 'neutro' } as const;

export function ListaMenusSede(props: ListaMenusSedeProps) {
  const { documento, base, modo, sitioNombre, sedes, sedeActual, onCambiarSede, soloLectura, menuActivo } = props;
  const t = useTextosPaginas();
  const [eliminar, setEliminar] = useState<MenuSitio | null>(null);
  const [renombrar, setRenombrar] = useState<{ menu: MenuSitio; nombre: string } | null>(null);
  const [ubicar, setUbicar] = useState<{ menu: MenuSitio; tipo: UbicacionMenu['tipo']; columna: number } | null>(null);
  const heredado = modo === 'heredado';
  const columnasPie = documento.shell.footer.menuIds.length;

  const procedencia = (m: MenuSitio) => {
    if (modo === 'principal') return null;
    if (heredado) return t('sedes.delPrincipal');
    const p = menuIgualABase(m, base);
    return p === 'copiado' ? t('sedes.copiado') : p === 'editado' ? t('sedes.editado', { nombre: sitioNombre }) : t('sedes.soloAqui', { nombre: sitioNombre });
  };

  return (
    <section aria-labelledby="menus-sitio-titulo" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="menus-sitio-titulo" className="mr-auto text-base font-semibold text-fg">
          {sedes.length > 0 || modo !== 'principal' ? t('sedes.menusDe', { nombre: sitioNombre }) : t('sedes.menusSitio')}
        </h2>
        {sedes.length > 0 && <OutletSwitcher valor={sedeActual} onCambiar={onCambiarSede} sedes={sedes} />}
        {heredado && <InheritanceTag origen="heredado" />}
        {!soloLectura && !heredado && (
          <button type="button" onClick={props.onNuevo} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            {t('sedes.nuevoMenu')}
          </button>
        )}
      </div>

      {modo === 'propio' && (
        <AvisoTonal
          tono="advertencia"
          compacto
          titulo={t('sedes.propio')}
          accion={soloLectura ? undefined : { etiqueta: t('menu.restablecer'), onClick: props.onRestablecer }}
        />
      )}
      {heredado && <p className="text-sm text-fg-secondary">{t('sedes.hereda')}</p>}

      <ul className="flex flex-col gap-3">
        {documento.menus.map((m) => {
          const u = ubicacionDeMenu(documento, m.id);
          const n = contarItems(m.items);
          const detalle = [textoUbicacion(u, t), n === 1 ? t('sedes.enlaceUno') : t('sedes.enlaces', { n }), procedencia(m)].filter(Boolean).join(' · ');
          const activo = menuActivo === m.id;
          return (
            <li
              key={m.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-4 py-3',
                heredado ? 'border-transparent bg-subtle' : activo ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface',
              )}
            >
              {heredado && <Lock aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-muted')} strokeWidth={TRAZO_ICONO} />}
              <button
                type="button"
                disabled={heredado}
                onClick={() => props.onEditar(m.id)}
                className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default"
              >
                <span className={cn('truncate text-sm font-medium', heredado ? 'text-fg-secondary' : 'text-fg')}>{m.nombre}</span>
                <span className="truncate text-[13px] text-fg-secondary">{detalle}</span>
              </button>
              {!heredado && (
                <Badge tono={TONO_UBICACION[u.tipo]} apariencia="suave" tamano="sm" icono={ICONO_ZONA_MENU[u.tipo]}>
                  {textoUbicacion(u, t)}
                </Badge>
              )}
              {!heredado && !soloLectura && (
                <RowActionsMenu
                  titulo={m.nombre}
                  orientacion="horizontal"
                  acciones={[
                    { id: 'editar', etiqueta: t('sedes.acciones.editar'), icono: Pencil, onSelect: () => props.onEditar(m.id) },
                    { id: 'renombrar', etiqueta: t('sedes.acciones.renombrar'), icono: Type, onSelect: () => setRenombrar({ menu: m, nombre: m.nombre }) },
                    {
                      id: 'ubicacion',
                      etiqueta: t('sedes.acciones.cambiarUbicacion'),
                      icono: MapPin,
                      onSelect: () => setUbicar({ menu: m, tipo: u.tipo, columna: u.tipo === 'pie' ? u.columna : Math.min(10, columnasPie + 1) }),
                    },
                    { id: 'duplicar', etiqueta: t('sedes.acciones.duplicar'), icono: Copy, onSelect: () => props.onDuplicar(m.id) },
                    {
                      id: 'eliminar',
                      etiqueta: t('sedes.acciones.eliminar'),
                      icono: Trash2,
                      destructiva: true,
                      separadorAntes: true,
                      onSelect: () => setEliminar(m),
                    },
                  ]}
                />
              )}
            </li>
          );
        })}
      </ul>

      {heredado && !soloLectura && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={props.onPersonalizar}
            disabled={props.personalizando}
            className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
          >
            {t('sedes.personalizar')}
          </button>
          <span className="text-[13px] text-fg-secondary">{t('sedes.personalizarAyuda', { nombre: sitioNombre })}</span>
        </div>
      )}

      <ConfirmDialog
        abierto={eliminar !== null}
        onAbiertoChange={(v) => !v && setEliminar(null)}
        titulo={t('sedes.eliminarTitulo', { nombre: eliminar?.nombre ?? '' })}
        descripcion={t('sedes.eliminarDescripcion')}
        textoConfirmar={t('sedes.eliminarConfirmar')}
        tono="peligro"
        icono={Trash2}
        onConfirmar={() => {
          if (eliminar) props.onEliminar(eliminar.id);
          setEliminar(null);
        }}
      />
      <Dialogo
        abierto={renombrar !== null}
        onAbiertoChange={(v) => !v && setRenombrar(null)}
        titulo={t('sedes.renombrarTitulo')}
        icono={Type}
        primario={{
          etiqueta: t('sedes.guardarNombre'),
          deshabilitada: !renombrar?.nombre.trim(),
          onClick: () => {
            if (renombrar) props.onRenombrar(renombrar.menu.id, renombrar.nombre);
            setRenombrar(null);
          },
        }}
      >
        <FormField etiqueta={t('sedes.nombre')} obligatorio>
          <Input value={renombrar?.nombre ?? ''} maxLength={200} onChange={(e) => renombrar && setRenombrar({ ...renombrar, nombre: e.target.value })} />
        </FormField>
      </Dialogo>
      <Dialogo
        abierto={ubicar !== null}
        onAbiertoChange={(v) => !v && setUbicar(null)}
        titulo={t('sedes.ubicacionTitulo', { nombre: ubicar?.menu.nombre ?? '' })}
        icono={MapPin}
        primario={{
          etiqueta: t('sedes.guardarUbicacion'),
          onClick: () => {
            if (ubicar) props.onUbicacion(ubicar.menu.id, ubicar.tipo === 'pie' ? { tipo: 'pie', columna: ubicar.columna } : { tipo: ubicar.tipo });
            setUbicar(null);
          },
        }}
      >
        {ubicar && (
          <div className="flex flex-col gap-3">
            <ChipsOpcion<UbicacionMenu['tipo']>
              etiqueta={t('nuevoMenu.donde')}
              valor={ubicar.tipo}
              onValorChange={(tipo) => setUbicar({ ...ubicar, tipo })}
              opciones={(['encabezado', 'megamenu', 'pie', 'sin'] as const).map((v) => ({ valor: v, etiqueta: t(`nuevoMenu.opciones.${v}`) }))}
            />
            {ubicar.tipo === 'pie' && (
              <Select value={String(ubicar.columna)} onValueChange={(v) => setUbicar({ ...ubicar, columna: Number(v) })}>
                <SelectTrigger aria-label={t('nuevoMenu.columna', { n: ubicar.columna })} className="h-10 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: Math.min(10, columnasPie + 1) }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t('nuevoMenu.columna', { n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </Dialogo>
    </section>
  );
}
