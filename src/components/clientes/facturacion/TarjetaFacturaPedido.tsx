'use client';

/**
 * Detalle del pedido online (Figma «06 Clientes» 3193-20582 y 3193-21359): la franja «[Factura
 * electrónica] Revisar…» y la tarjeta «Factura electrónica» con lo que pidió el comprador en el
 * checkout (`web_orders.billing_data`): a nombre de quién, documento, correo y la ficha que factura.
 * Si el documento choca con la ficha, se decide aquí mismo («Usar este documento en la ficha»,
 * «Mantener el de la ficha», «Ligar a esa empresa», «Unificar fichas»).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { etiquetaDocumento, leerRevision, pedidoPorRevisar, perfilFactura, urlUnificarFichas, type DecisionRevision } from '@/lib/clientes/facturacionElectronica';
import { leerFacturaPedidoWeb } from '@/lib/services/einvoicing/payloadsFactus';
import { fichaConDocumento, nombreFicha, revisarFacturaPedido, RevisionFacturaError, type FichaConDocumento } from '@/lib/clientes/facturacionClienteDatos';

/** Ancla de la tarjeta: «Revisar» de la franja lleva ahí. */
export const ID_TARJETA_FACTURA_PEDIDO = 'factura-electronica-pedido';

interface PedidoConFactura {
  id: string;
  organization_id: number;
  branch_id?: number | null;
  customer_id?: string | null;
  billing_data?: unknown;
}

const tipoErp = (tipo: string) => (tipo === 'NIT' ? 'nit' : tipo.toLowerCase());

/** Franja amarilla bajo la cabecera del pedido: solo mientras esté por revisar. */
export function FranjaRevisionFactura({ order }: { order: PedidoConFactura }) {
  const t = useTranslations('clientesFacturacion');
  const factura = leerFacturaPedidoWeb(order.billing_data);
  if (!factura || !pedidoPorRevisar(order.billing_data)) return null;
  const documento = etiquetaDocumento({ identification_type: tipoErp(factura.tipo), identification_number: factura.numero, dv: factura.dv });
  const texto = perfilFactura(order.billing_data) === 'duplicado' ? t('pedido.franjaDuplicado', { documento }) : t('pedido.franjaDistinto', { documento });
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line-warning bg-warning-subtle px-4 py-3 text-[13px] text-warning-text">
      <span className="min-w-0 flex-1">{texto}</span>
      <button
        type="button"
        className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
        onClick={() => document.getElementById(ID_TARJETA_FACTURA_PEDIDO)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        {t('pedido.revisar')}
      </button>
    </div>
  );
}

export function TarjetaFacturaPedido({ order, onCambio }: { order: PedidoConFactura; onCambio: () => void }) {
  const t = useTranslations('clientesFacturacion');
  const { formatDateTime } = useFormatDate(order.branch_id ?? null);
  const factura = leerFacturaPedidoWeb(order.billing_data);
  const revision = leerRevision(order.billing_data);
  const perfil = perfilFactura(order.billing_data);
  const porRevisar = pedidoPorRevisar(order.billing_data);
  const [ficha, setFicha] = useState<Awaited<ReturnType<typeof nombreFicha>>>(null);
  const [fichaCliente, setFichaCliente] = useState<Awaited<ReturnType<typeof nombreFicha>>>(null);
  const [otra, setOtra] = useState<FichaConDocumento | null>(null);
  const [enCurso, setEnCurso] = useState<DecisionRevision | null>(null);

  const facturaCon = factura?.customer_id ?? null;
  useEffect(() => {
    let vivo = true;
    if (!facturaCon) {
      setFicha(null);
      return;
    }
    void nombreFicha(order.organization_id, facturaCon).then((f) => {
      if (vivo) setFicha(f);
    });
    return () => {
      vivo = false;
    };
  }, [facturaCon, order.organization_id]);

  useEffect(() => {
    let vivo = true;
    if (!order.customer_id || !porRevisar) {
      setFichaCliente(null);
      return;
    }
    void nombreFicha(order.organization_id, order.customer_id).then((f) => {
      if (vivo) setFichaCliente(f);
    });
    return () => {
      vivo = false;
    };
  }, [order.customer_id, order.organization_id, porRevisar]);

  const numero = factura?.numero ?? '';
  const tipo = factura?.tipo ?? '';
  useEffect(() => {
    let vivo = true;
    if (perfil !== 'duplicado' || !numero || !order.customer_id) {
      setOtra(null);
      return;
    }
    void fichaConDocumento(order.organization_id, numero, tipoErp(tipo), order.customer_id).then((o) => {
      if (vivo) setOtra(o);
    });
    return () => {
      vivo = false;
    };
  }, [perfil, numero, tipo, order.customer_id, order.organization_id]);

  if (!factura) return null;

  const esEmpresa = factura.tipo === 'NIT';
  const documento = etiquetaDocumento({ identification_type: tipoErp(factura.tipo), identification_number: factura.numero, dv: factura.dv });

  const decidir = async (decision: DecisionRevision) => {
    setEnCurso(decision);
    try {
      const r = await revisarFacturaPedido(order.id, decision);
      if (r.estado === 'duplicado') toast.error(t('revision.documentoEnOtraFicha'));
      else toast.success(t(`revision.hecho.${decision}`));
      onCambio();
    } catch (err) {
      toast.error(err instanceof RevisionFacturaError && err.codigo === 'SIN_PERMISO' ? t('revision.sinPermiso') : t('revision.error'));
    } finally {
      setEnCurso(null);
    }
  };

  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-fg-secondary">{etiqueta}</span>
      <span className="min-w-0 break-words text-right text-fg">{valor}</span>
    </div>
  );
  const boton = (decision: DecisionRevision, etiqueta: string, variante: 'secundario' | 'fantasma') => (
    <button type="button" className={clasesBoton({ variante, tamano: 'sm', anchoCompleto: true })} onClick={() => void decidir(decision)} disabled={enCurso !== null}>
      {enCurso === decision && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {etiqueta}
    </button>
  );

  return (
    <Card id={ID_TARJETA_FACTURA_PEDIDO} className="scroll-mt-20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-fg-secondary" aria-hidden="true" />
          <span className="flex-1">{t('pedido.titulo')}</span>
          {porRevisar && (
            <Badge tono="advertencia" tamano="sm">
              {t('pedido.paraRevisar')}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {fila(t('pedido.pedida'), esEmpresa ? t('pedido.siEmpresa') : t('pedido.siPersona'))}
        {fila(t('pedido.aNombreDe'), <span className="font-semibold">{factura.razon_social}</span>)}
        {fila(t('pedido.documento'), documento)}
        {fila(t('pedido.correo'), <span className="break-all">{factura.correo}</span>)}
        {fila(
          t('pedido.fichaQueFactura'),
          ficha ? (
            <Link href={`/app/clientes/${encodeURIComponent(ficha.id)}`} className="text-link hover:underline">
              {ficha.nombre || t('sinNombre')}
            </Link>
          ) : (
            <span className="text-fg-secondary">{t('pedido.ninguna')}</span>
          ),
        )}

        {porRevisar && perfil === 'distinto' && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-warning-text">
              <p className="text-[13px] font-semibold">
                {fichaCliente && etiquetaDocumento(fichaCliente) ? t('pedido.fichaTiene', { documento: etiquetaDocumento(fichaCliente) }) : t('pedido.fichaOtro')}
              </p>
              <p className="text-xs">{t('pedido.salioConPedido')}</p>
            </div>
            {boton('usar', t('pedido.usarEnFicha'), 'secundario')}
            {boton('mantener', t('pedido.mantenerFicha'), 'fantasma')}
          </div>
        )}

        {porRevisar && perfil === 'duplicado' && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-warning-text">
              <p className="text-[13px] font-semibold">
                {esEmpresa ? t('pedido.nitEnOtraFicha', { nombre: otra?.nombre || t('sinNombre') }) : t('pedido.documentoEnOtraFicha', { nombre: otra?.nombre || t('sinNombre') })}
              </p>
              <p className="text-xs">{t('pedido.noSeLigo')}</p>
            </div>
            {otra?.customer_type === 'company' && boton('ligar', t('pedido.ligarEmpresa'), 'secundario')}
            {otra && order.customer_id && (
              <a href={urlUnificarFichas(order.customer_id, otra.id)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', anchoCompleto: true })}>
                {t('pedido.unificar')}
              </a>
            )}
            {boton('mantener', t('pedido.mantenerSinCambios'), 'fantasma')}
            {otra && (
              <Link href={`/app/clientes/${encodeURIComponent(otra.id)}`} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', anchoCompleto: true })}>
                <ExternalLink className="size-4" aria-hidden="true" />
                {otra.customer_type === 'company' ? t('pedido.verFichaEmpresa') : t('pedido.verOtraFicha')}
              </Link>
            )}
          </div>
        )}

        {revision && (
          <p className="border-t border-line pt-2 text-xs text-fg-secondary">
            {t(`pedido.revisado.${revision.decision}`, {
              quien: revision.porNombre || t('pedido.alguienDelEquipo'),
              fecha: revision.en ? formatDateTime(revision.en) : '',
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
