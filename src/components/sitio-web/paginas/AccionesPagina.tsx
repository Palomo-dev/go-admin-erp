'use client';

/**
 * Acciones de una fila de Páginas (Figma A/04a «⋯» y A/04h ActionSheet en móvil): Editar SEO,
 * Duplicar, Cambiar dirección, Ocultar del sitio / Volver a publicar, Mostrar u ocultar en el
 * menú y Eliminar (con ConfirmDialog; Inicio no se elimina). Un solo lugar arma las acciones
 * para la tabla y para el móvil, con sus diálogos.
 */
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, EyeOff, Link2, ListMinus, ListPlus, Pencil, Search, Trash2 } from 'lucide-react';
import { ConfirmDialog, Dialogo, FormField, type AccionFila } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { rutaEditorSitio, RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import { ICONO_TAREA_SITIO } from '@/components/sitio-web/ui/iconosSitio';
import { apiPaginas, ErrorApiPaginas } from './apiPaginas';
import { slugDesdeTexto } from './plantillasPagina';
import { useTextosPaginas } from './textos';
import type { PaginasSitio } from './usePaginasSitio';
import type { FilaPagina } from './vistaPaginas';

export const RUTA_MENU_NAVEGACION = `${RAIZ_SITIO_WEB}/paginas/menu`;

/** Editor con el panel de SEO abierto (B/08 «Corregir» usa la misma ruta). */
export function rutaEditorSeo(paginaId: string): string {
  return `${rutaEditorSitio(paginaId)}?panel=seo`;
}

export interface AccionesPagina {
  /** Menú «⋯» de la fila en escritorio. */
  accionesFila: (fila: FilaPagina) => AccionFila[];
  /** ActionSheet de la tarjeta en móvil (A/04h). */
  accionesMovil: (fila: FilaPagina) => AccionFila[];
  dialogos: ReactNode;
}

export function useAccionesPagina(paginas: PaginasSitio, host: string | null): AccionesPagina {
  const t = useTextosPaginas();
  const router = useRouter();
  const [eliminar, setEliminar] = useState<FilaPagina | null>(null);
  const [direccion, setDireccion] = useState<{ fila: FilaPagina; valor: string; error: string | null } | null>(null);
  const ocupado = paginas.ocupado;

  const fallo = (error: unknown) => {
    toast({
      title: t('lista.noSePudo'),
      description: error instanceof ErrorApiPaginas && error.message ? error.message : t('lista.revertido'),
      variant: 'destructive',
    });
  };

  const ejecutar = async (fila: FilaPagina, accion: Record<string, unknown>, exito: string) => {
    try {
      const r = await paginas.escribir(fila.id, (c) => apiPaginas.modificar(c, fila.id, accion));
      if (r) toast({ title: exito, description: t('lista.guardadoBorrador') });
      return r;
    } catch (error) {
      fallo(error);
      return null;
    }
  };

  const editar = (fila: FilaPagina) => router.push(rutaEditorSitio(fila.id));

  const alternarPublicada = (fila: FilaPagina) =>
    void ejecutar(
      fila,
      { accion: 'publicada', publicada: !fila.publicada },
      fila.publicada ? t('acciones.ocultada', { nombre: fila.titulo }) : t('acciones.publicada', { nombre: fila.titulo }),
    );

  const accionPublicada = (fila: FilaPagina): AccionFila => ({
    id: 'publicada',
    etiqueta: fila.publicada ? t('acciones.ocultar') : t('acciones.publicar'),
    icono: fila.publicada ? EyeOff : Eye,
    onSelect: () => alternarPublicada(fila),
    deshabilitada: ocupado !== null,
  });

  const accionEliminar = (fila: FilaPagina): AccionFila => ({
    id: 'eliminar',
    etiqueta: t('acciones.eliminar'),
    icono: Trash2,
    destructiva: true,
    separadorAntes: true,
    onSelect: () => setEliminar(fila),
    oculta: fila.inicio,
    deshabilitada: ocupado !== null,
  });

  const accionesFila = (fila: FilaPagina): AccionFila[] => [
    { id: 'seo', etiqueta: t('acciones.editarSeo'), icono: Search, onSelect: () => router.push(rutaEditorSeo(fila.id)) },
    {
      id: 'duplicar',
      etiqueta: t('acciones.duplicar'),
      icono: Copy,
      deshabilitada: ocupado !== null,
      onSelect: () => void ejecutar(fila, { accion: 'duplicar', sufijo: t('acciones.sufijoCopia') }, t('acciones.duplicada')),
    },
    {
      id: 'direccion',
      etiqueta: t('acciones.cambiarDireccion'),
      icono: Link2,
      oculta: fila.inicio,
      onSelect: () => setDireccion({ fila, valor: fila.slug, error: null }),
    },
    accionPublicada(fila),
    accionEliminar(fila),
  ];

  const accionesMovil = (fila: FilaPagina): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editarTextos'), icono: Pencil, onSelect: () => editar(fila) },
    {
      id: 'menu',
      etiqueta: fila.enMenu ? t('acciones.quitarDelMenu') : t('acciones.mostrarEnMenu'),
      icono: fila.enMenu ? ListMinus : ListPlus,
      oculta: fila.legal,
      deshabilitada: ocupado !== null,
      onSelect: () => void paginas.alternarEnMenu(fila.id, !fila.enMenu),
    },
    accionPublicada(fila),
    { id: 'navegacion', etiqueta: t('acciones.menuYNavegacion'), icono: ICONO_TAREA_SITIO.menu, onSelect: () => router.push(RUTA_MENU_NAVEGACION) },
  ];

  const guardarDireccion = async () => {
    if (!direccion) return;
    const slug = slugDesdeTexto(direccion.valor.replace(/^\/+/, ''));
    if (!slug) {
      setDireccion({ ...direccion, error: t('nueva.direccionObligatoria') });
      return;
    }
    try {
      const r = await paginas.escribir(direccion.fila.id, (c) => apiPaginas.modificar(c, direccion.fila.id, { accion: 'direccion', slug }));
      if (r) toast({ title: t('acciones.direccionCambiada') });
      setDireccion(null);
    } catch (error) {
      if (
        error instanceof ErrorApiPaginas &&
        (error.codigoPagina === 'slug_repetido' || error.codigoPagina === 'slug_invalido' || error.codigoPagina === 'slug_de_sede')
      ) {
        setDireccion({
          ...direccion,
          error:
            error.codigoPagina === 'slug_repetido'
              ? t('nueva.direccionRepetida')
              : error.codigoPagina === 'slug_de_sede'
                ? t('nueva.direccionDeSede')
                : t('nueva.direccionInvalida'),
        });
        return;
      }
      fallo(error);
    }
  };

  const confirmarEliminar = async () => {
    if (!eliminar) return;
    try {
      const r = await paginas.escribir(eliminar.id, (c) => apiPaginas.eliminar(c, eliminar.id));
      if (r) toast({ title: t('acciones.eliminada', { nombre: eliminar.titulo }), description: t('lista.guardadoBorrador') });
    } catch (error) {
      fallo(error);
    } finally {
      setEliminar(null);
    }
  };

  const slugVista = direccion ? slugDesdeTexto(direccion.valor.replace(/^\/+/, '')) : '';

  const dialogos = (
    <>
      <ConfirmDialog
        abierto={eliminar !== null}
        onAbiertoChange={(v) => !v && setEliminar(null)}
        titulo={t('acciones.eliminarTitulo', { nombre: eliminar?.titulo ?? '' })}
        descripcion={t('acciones.eliminarDescripcion')}
        textoConfirmar={t('acciones.eliminarConfirmar')}
        tono="peligro"
        icono={Trash2}
        cargando={ocupado !== null}
        onConfirmar={confirmarEliminar}
      />
      <Dialogo
        abierto={direccion !== null}
        onAbiertoChange={(v) => !v && setDireccion(null)}
        titulo={t('acciones.direccionTitulo')}
        descripcion={t('acciones.direccionDescripcion')}
        icono={Link2}
        ancho={520}
        primario={{ etiqueta: t('acciones.direccionGuardar'), onClick: () => void guardarDireccion(), cargando: ocupado !== null }}
      >
        <FormField etiqueta={t('nueva.direccion')} obligatorio error={direccion?.error} ayuda={host ? `${host}/${slugVista}` : undefined}>
          <Input
            value={`/${direccion?.valor.replace(/^\/+/, '') ?? ''}`}
            maxLength={121}
            onChange={(e) => direccion && setDireccion({ ...direccion, valor: e.target.value.replace(/^\/+/, ''), error: null })}
          />
        </FormField>
      </Dialogo>
    </>
  );

  return { accionesFila, accionesMovil, dialogos };
}
