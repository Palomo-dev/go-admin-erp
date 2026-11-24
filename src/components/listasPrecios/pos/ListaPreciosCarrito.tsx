'use client';

/**
 * POS con cliente de lista (Figma «05 POS y ventas» 07, 3022:276328). La insignia de cada línea
 * está en `EtiquetaListaLinea.tsx` (sin dependencias de servicios: la usa la lista de líneas).
 *
 * - `AvisoListaCarrito`: franja bajo el cliente — «Lista «Mayoristas» · ahorra $ 17.600 frente al
 *   precio normal» y «Usar precio normal». Quitar la lista pide el permiso «Cambiar precios en la
 *   venta» (pos.precios.cambiar_en_venta), resuelto en el servidor (`fn_tiene_permiso`) y exigido
 *   otra vez al cobrar (`sale_items.notes.lista_quitada`). Sin el permiso, se pide a un supervisor.
 * - `EtiquetaListaLinea`: insignia de la línea («Lista Mayoristas · 12+», «−10 %», «Bebidas») con
 *   el precio normal tachado.
 *
 * Los precios los pone `POSService` (`aplicarListaDePrecios`); aquí no se calcula nada.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { Dialogo } from '@/components/kit';
import type { Cart } from '@/components/pos/types';
import { POSService } from '@/lib/services/posService';
import { tienePermisoLista } from '@/lib/services/listasPreciosService';
import { ahorroPorLista } from '@/lib/listasPrecios/precioLista';

export function AvisoListaCarrito({
  cart,
  onCartUpdate,
  formatear,
}: {
  cart: Cart;
  onCartUpdate: (cart: Cart) => void;
  formatear: (n: number) => string;
}) {
  const t = useTranslations('listasPrecios.pos');
  const [puede, setPuede] = useState<boolean | null>(null);
  const [pedirSupervisor, setPedirSupervisor] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const nombre =
    cart.items.find((i) => i.price_list_name)?.price_list_name ??
    Object.values(cart.price_list_cache?.filas ?? {}).find((f) => f.price_list_name)?.price_list_name ??
    null;
  const conLista = cart.items.some((i) => !!i.price_list_id);
  const visible = !!cart.customer_id && !!nombre && (conLista || cart.price_list_override === true);

  useEffect(() => {
    if (!visible || puede !== null) return;
    tienePermisoLista('pos.precios.cambiar_en_venta').then(setPuede).catch(() => setPuede(false));
  }, [visible, puede]);

  if (!visible) return null;

  const cambiar = async (usar: boolean) => {
    if (usar && !puede) {
      setPedirSupervisor(true);
      return;
    }
    setOcupado(true);
    try {
      onCartUpdate(await POSService.usarPrecioNormal(cart.id, usar));
    } catch (err) {
      console.error('Error cambiando la lista de precios del carrito:', err);
      toast.error(t('error'));
    } finally {
      setOcupado(false);
    }
  };

  const ahorro = ahorroPorLista(cart.items);
  return (
    <>
      <div className="flex items-center gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-sm text-info-text" role="status">
        <Tags aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate">
          {cart.price_list_override ? t('quitada', { lista: nombre }) : t('aviso', { lista: nombre, ahorro: formatear(ahorro) })}
        </span>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void cambiar(!cart.price_list_override)}
          className="shrink-0 text-xs font-medium text-fg underline-offset-2 hover:underline disabled:opacity-50"
        >
          {cart.price_list_override ? t('volverALista') : t('usarNormal')}
        </button>
      </div>
      <Dialogo
        abierto={pedirSupervisor}
        onAbiertoChange={setPedirSupervisor}
        titulo={t('supervisor.titulo')}
        descripcion={t('supervisor.descripcion')}
        icono={ShieldAlert}
        ancho={440}
        sinCancelar
        primario={{ etiqueta: t('supervisor.entendido'), onClick: () => setPedirSupervisor(false) }}
      />
    </>
  );
}
