'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Package, X } from 'lucide-react';
import { Dialogo, SelectorEntidad } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { buscarProductos, type ProductoElegible } from './ImagenesService';

/**
 * «Asignar «x» a productos» (Figma `597:353266`): el buscador de productos
 * del kit (`SelectorEntidad`, búsqueda en el servidor por nombre, SKU o
 * código) va sumando productos a la lista; «Marcarla como principal» la deja
 * de portada en cada uno. El servidor (`fn_imagen_asignar_productos`) no
 * duplica la foto en un producto que ya la tiene.
 */
export interface DialogoAsignarProductosProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  organizacionId: number;
  /** Nombre de la imagen (título) o «3 imágenes». */
  nombre: string;
  onAsignar: (productos: number[], principal: boolean) => Promise<void>;
}

export function DialogoAsignarProductos({ abierto, onAbiertoChange, organizacionId, nombre, onAsignar }: DialogoAsignarProductosProps) {
  const t = useTranslations('inventarioImagenes.asignar');
  const { formatear } = useMonedaOrganizacion();
  const [elegidos, setElegidos] = useState<ProductoElegible[]>([]);
  const [principal, setPrincipal] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setElegidos([]);
      setPrincipal(false);
    }
  }, [abierto]);

  const buscar = useCallback((texto: string, senal: AbortSignal) => buscarProductos(organizacionId, texto, senal), [organizacionId]);

  const confirmar = async () => {
    setGuardando(true);
    try {
      await onAsignar(
        elegidos.map((p) => p.id),
        principal,
      );
      onAbiertoChange(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={t('titulo', { nombre })}
      descripcion={t('descripcion')}
      ancho={672}
      primario={{
        etiqueta: t('confirmar', { n: elegidos.length }),
        onClick: () => void confirmar(),
        cargando: guardando,
        deshabilitada: elegidos.length === 0,
        motivo: t('eligeUno'),
      }}
    >
      <div className="flex flex-col gap-3">
        <SelectorEntidad<ProductoElegible>
          layout="campo"
          valor={null}
          icono={Package}
          etiqueta={t('buscar')}
          buscar={buscar}
          aOpcion={(p) => ({
            id: String(p.id),
            titulo: p.nombre,
            subtitulo: [p.sku, p.esPadre ? t('conVariantes') : null].filter(Boolean).join(' · ') || null,
            insignia: p.precio !== null ? { texto: formatear(p.precio), tono: 'neutro' } : null,
            deshabilitada: elegidos.some((e) => e.id === p.id),
            motivo: t('yaElegido'),
          })}
          onCambiar={(p) => setElegidos((l) => (l.some((e) => e.id === p.id) ? l : [...l, p]))}
          textos={{ placeholder: t('placeholder'), buscar: t('buscar'), vacio: t('vacio'), sinResultados: t('sinResultados'), error: t('errorBuscar') }}
        />

        {elegidos.length > 0 ? (
          <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line" aria-label={t('elegidos')}>
            {elegidos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <Package aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{p.nombre}</span>
                  {p.sku && <span className="block truncate text-xs text-fg-secondary">{p.sku}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setElegidos((l) => l.filter((e) => e.id !== p.id))}
                  aria-label={t('quitar', { nombre: p.nombre })}
                  className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-secondary">{t('ninguno')}</p>
        )}

        <label className="flex cursor-pointer items-start gap-2 text-sm text-fg">
          <Checkbox checked={principal} onCheckedChange={(v) => setPrincipal(v === true)} className="mt-0.5" />
          <span>
            <span className="font-medium">{t('principal')}</span>
            <span className="block text-xs text-fg-secondary">{t('principalAyuda')}</span>
          </span>
        </label>
      </div>
    </Dialogo>
  );
}
