'use client';

/**
 * Aviso de la ficha del cliente (Figma «06 Clientes» 3192-19702; celular 3194-21369): un pedido de la
 * tienda pidió factura con otro documento (`billing_data.perfil = 'distinto'`) o con uno que está en
 * otra ficha ('duplicado') y nadie lo ha revisado.
 *
 * - «Usar este»: el documento del pedido pasa a la ficha; el correo de factura solo si la ficha no
 *   tiene uno; el nombre no se toca (decisión 1).
 * - «Ligar a esa empresa» (NIT de otra ficha de empresa): la persona queda como su contacto y la
 *   factura sale a nombre de la empresa.
 * - «Mantener el actual»: la ficha no cambia.
 * La base registra la decisión en el pedido y en la Actividad del cliente (decisión 2).
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { clasesBoton } from '@/components/kit/botonClases';
import { etiquetaDocumento, perfilFactura, urlUnificarFichas, type DecisionRevision } from '@/lib/clientes/facturacionElectronica';
import { leerFacturaPedidoWeb } from '@/lib/services/einvoicing/payloadsFactus';
import { fichaConDocumento, pedidosParaRevisar, revisarFacturaPedido, RevisionFacturaError, type FichaConDocumento, type PedidoParaRevisar } from '@/lib/clientes/facturacionClienteDatos';

export interface AvisoRevisionFacturaProps {
  clienteId: string;
  organizationId: number;
  /** Documento que tiene hoy la ficha, ya formateado («CC 1.020.456.789»). */
  documentoFicha: string;
  /** La ficha es una persona (solo una persona se liga como contacto de una empresa). */
  esPersona: boolean;
  version?: number;
  onRevisado: () => void;
}

export function AvisoRevisionFactura({ clienteId, organizationId, documentoFicha, esPersona, version = 0, onRevisado }: AvisoRevisionFacturaProps) {
  const t = useTranslations('clientesFacturacion');
  const [pedidos, setPedidos] = useState<PedidoParaRevisar[]>([]);
  const [otra, setOtra] = useState<FichaConDocumento | null>(null);
  const [enCurso, setEnCurso] = useState<DecisionRevision | null>(null);

  const cargar = useCallback(async () => {
    const lista = await pedidosParaRevisar(organizationId, clienteId);
    setPedidos(lista);
    const primero = lista[0];
    const factura = primero ? leerFacturaPedidoWeb(primero.billing_data) : null;
    if (primero && factura && perfilFactura(primero.billing_data) === 'duplicado') {
      setOtra(await fichaConDocumento(organizationId, factura.numero, factura.tipo === 'NIT' ? 'nit' : factura.tipo.toLowerCase(), clienteId));
    } else {
      setOtra(null);
    }
  }, [organizationId, clienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar, version]);

  const pedido = pedidos[0];
  const factura = pedido ? leerFacturaPedidoWeb(pedido.billing_data) : null;
  if (!pedido || !factura) return null;

  const duplicado = perfilFactura(pedido.billing_data) === 'duplicado';
  const documentoPedido = etiquetaDocumento({ identification_type: factura.tipo === 'NIT' ? 'nit' : factura.tipo.toLowerCase(), identification_number: factura.numero, dv: factura.dv });
  const puedeLigar = duplicado && esPersona && otra?.customer_type === 'company';

  const decidir = async (decision: DecisionRevision) => {
    setEnCurso(decision);
    try {
      const r = await revisarFacturaPedido(pedido.id, decision);
      if (r.estado === 'duplicado') {
        toast.error(t('revision.documentoEnOtraFicha'));
      } else {
        toast.success(t(`revision.hecho.${decision}`));
      }
      await cargar();
      onRevisado();
    } catch (err) {
      toast.error(err instanceof RevisionFacturaError && err.codigo === 'SIN_PERMISO' ? t('revision.sinPermiso') : t('revision.error'));
    } finally {
      setEnCurso(null);
    }
  };

  const boton = (decision: DecisionRevision, etiqueta: string, variante: 'primario' | 'secundario') => (
    <button type="button" className={clasesBoton({ variante, tamano: 'sm', className: 'max-sm:flex-1' })} onClick={() => void decidir(decision)} disabled={enCurso !== null}>
      {enCurso === decision && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {etiqueta}
    </button>
  );

  return (
    <section role="alert" className="flex gap-3 rounded-xl border border-line-warning bg-warning-subtle px-4 py-3 text-warning-text">
      <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-sm font-semibold">
            {duplicado
              ? t('revision.tituloDuplicado', { pedido: pedido.order_number, documento: documentoPedido })
              : t('revision.tituloDistinto', { pedido: pedido.order_number, documento: documentoPedido })}
          </p>
          <p className="text-[13px] leading-[18px]">
            {duplicado
              ? t('revision.textoDuplicado', { nombre: otra?.nombre || t('sinNombre') })
              : documentoFicha
                ? t('revision.textoDistinto', { documento: documentoFicha })
                : t('revision.textoDistintoSinDocumento')}
          </p>
          {pedidos.length > 1 && <p className="text-xs">{t('revision.masPedidos', { n: pedidos.length - 1 })}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!duplicado && boton('usar', t('revision.usarEste'), 'primario')}
          {puedeLigar && boton('ligar', t('revision.ligar'), 'primario')}
          {boton('mantener', t('revision.mantener'), 'secundario')}
          {duplicado && otra && (
            <a href={urlUnificarFichas(clienteId, otra.id)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              {t('revision.unificar')}
            </a>
          )}
          <Link href={`/app/pos/pedidos-online/${encodeURIComponent(pedido.id)}`} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <ExternalLink className="size-4" aria-hidden="true" />
            {t('revision.verPedido')}
          </Link>
        </div>
      </div>
    </section>
  );
}
