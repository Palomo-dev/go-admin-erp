'use client';

/**
 * Recibir mercancía en consignación a mano (Figma R4 `2406:147241`, captura
 * `docs/design/figma/89-consignacion-recibida-04-recibir-a-mano.png`). «No es una
 * compra. La mercancía sigue siendo del consignante.»
 *
 * Consignante (proveedor), bodega, productos de consignación (siempre aparte de
 * los propios), cantidad y precio del dueño, condiciones del contrato (modalidad,
 * condición contable y valoración de la custodia OBLIGATORIAS) y vista previa de
 * las cuentas de orden: D la cuenta definida del grupo 94 / C 911520, por el
 * costo acreditado o el valor convenido. UNA ruta y UNA RPC (`fn_consignacion_recibir`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Package, PackageOpen, Trash2 } from 'lucide-react';
import { AvisoTonal, CampoNumero, Dialogo, FormField, SelectorEntidad, type OpcionEntidad } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { ElegirProveedor, type ProveedorDocumento } from '@/components/finanzas/documento/terceros';
import { useBranch } from '@/lib/context/BranchContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { buscarProductosDocumento, type ProductoParaDocumento } from '@/lib/services/documentos/edicionDocumento';
import { nuevaClaveIdempotencia } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorConsignacion } from './textoErrorConsignacion';
import { CONDICIONES_VACIAS, terminosDeCondiciones, validarCondiciones, type CondicionesContrato } from '@/lib/inventario/consignaciones/recibidas';
import { CondicionesContratoCampos } from './CondicionesContratoCampos';
import { consignacionesRecibidasService } from './consignacionesRecibidasService';

const NS = 'consignacionesR4';

interface Linea {
  productoId: number;
  nombre: string;
  cantidad: number | null;
  precio: number | null;
  precioLiquidacion: number | null;
  costoAcreditado: number | null;
}

export interface RecibirMercanciaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onRecibida: (r: { nota_id: string; numero: string }) => void;
}

export function RecibirMercanciaDialog({ abierto, onAbiertoChange, onRecibida }: RecibirMercanciaDialogProps) {
  const t = useTranslations(NS);
  const tR5 = useTranslations('consignacionesR5');
  const moneda = useMonedaOrganizacion();
  const { branches, selectedBranchId, branchFilter } = useBranch();
  const [sucursal, setSucursal] = useState<number | null>(null);
  const [proveedor, setProveedor] = useState<ProveedorDocumento | null>(null);
  const [condiciones, setCondiciones] = useState<CondicionesContrato>(CONDICIONES_VACIAS);
  const [comision, setComision] = useState<number | null>(null);
  const [cuentaRecaudo, setCuentaRecaudo] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef('');

  useEffect(() => {
    if (!abierto) return;
    setSucursal(branchFilter ?? selectedBranchId ?? branches[0]?.id ?? null);
    setProveedor(null);
    setCondiciones(CONDICIONES_VACIAS);
    setComision(null);
    setCuentaRecaudo('');
    setLineas([]);
    setTocado(false);
    setError(null);
    clave.current = nuevaClaveIdempotencia('consignacion-recibida');
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const buscarProductos = useCallback(
    async (texto: string, senal: AbortSignal) =>
      buscarProductosDocumento(getOrganizationId(), { texto, variante: 'venta', sucursal, conStock: false, sinServicios: true, limite: 20 }, senal),
    [sucursal],
  );
  const aOpcion = useCallback(
    (p: ProductoParaDocumento): OpcionEntidad => {
      const motivo = p.serial ? t('recibir.motivoSerial') : !p.controlaStock ? t('recibir.motivoSinStock') : undefined;
      return { id: String(p.id), titulo: p.nombre, subtitulo: p.sku, deshabilitada: !!motivo, motivo };
    },
    [t],
  );
  const agregar = (p: ProductoParaDocumento) =>
    setLineas((ls) => (ls.some((l) => l.productoId === p.id) ? ls : [...ls, { productoId: p.id, nombre: p.nombre, cantidad: 1, precio: null, precioLiquidacion: null, costoAcreditado: null }]));
  const cambiar = (id: number, p: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.productoId === id ? { ...l, ...p } : l)));

  const porLiquidacion = condiciones.remuneracionModo === 'precio_liquidacion';
  const porCosto = condiciones.valoracion === 'costo_acreditado';
  const total = lineas.reduce((s, l) => s + (l.cantidad ?? 0) * (l.precio ?? 0), 0);
  // Valor de custodia en cuentas de orden, según la política del contrato.
  const custodia = lineas.reduce((s, l) => s + (l.cantidad ?? 0) * ((porCosto ? l.costoAcreditado : l.precio) ?? 0), 0);
  const columnas = 5 + (porLiquidacion ? 1 : 0) + (porCosto ? 1 : 0);
  const unidades = lineas.reduce((s, l) => s + (l.cantidad ?? 0), 0);
  const erroresCondiciones = validarCondiciones(condiciones, 'recibida');
  const errores = {
    proveedor: !proveedor ? t('validacion.consignante') : null,
    sucursal: sucursal === null ? t('validacion.bodega') : null,
    lineas: lineas.length === 0 ? t('validacion.lineas') : null,
    valores: lineas.some((l) => !(l.cantidad && l.cantidad > 0) || !(l.precio && l.precio > 0)) ? t('validacion.cantidadPrecio') : null,
    liquidacion: porLiquidacion && lineas.some((l) => !(l.precioLiquidacion && l.precioLiquidacion > 0) || (l.precioLiquidacion ?? 0) > (l.precio ?? 0)) ? t('validacion.precioLiquidacion') : null,
    costo: porCosto && lineas.some((l) => !(l.costoAcreditado && l.costoAcreditado > 0)) ? t('validacion.costoAcreditado') : null,
    recaudo: cuentaRecaudo.trim() !== '' && !/^281510\d{2}$/.test(cuentaRecaudo.trim()) ? t('validacion.cuentaRecaudo') : null,
    condiciones: erroresCondiciones.length > 0 ? t('validacion.condiciones') : null,
  };
  const hayErrores = Object.values(errores).some(Boolean);

  const confirmar = async () => {
    setTocado(true);
    if (hayErrores || !proveedor || sucursal === null) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await consignacionesRecibidasService.recibir({
        proveedor_id: Number(proveedor.id),
        sucursal_id: sucursal,
        comision: porLiquidacion ? 0 : (comision ?? 0),
        terminos: terminosDeCondiciones(condiciones, { cuentaRecaudo: cuentaRecaudo || null, direccion: 'recibida' }),
        lineas: lineas.map((l) => ({
          product_id: l.productoId,
          qty: l.cantidad ?? 0,
          precio: l.precio ?? 0,
          precio_liquidacion: porLiquidacion ? l.precioLiquidacion : null,
          costo_acreditado: porCosto ? l.costoAcreditado : null,
        })),
        clave_idempotencia: clave.current,
      });
      toastSuccess(t('recibir.exito', { numero: r.numero, consignante: proveedor.nombre }));
      onAbiertoChange(false);
      onRecibida(r);
    } catch (e) {
      setError(textoErrorConsignacion(t, tR5, e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('recibir.titulo')}
      descripcion={t('recibir.descripcion')}
      icono={PackageOpen}
      ancho={880}
      primario={{
        etiqueta: t('recibir.confirmar'),
        onClick: () => void confirmar(),
        cargando: enviando,
        deshabilitada: condiciones.contrato !== 'intermediacion',
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('recibir.consignante')} obligatorio error={tocado ? errores.proveedor : null}>
          {(c) => <ElegirProveedor layout="campo" id={c.id} proveedor={proveedor} onCambiar={setProveedor} onQuitar={() => setProveedor(null)} />}
        </FormField>
        <FormField etiqueta={t('recibir.bodega')} obligatorio error={tocado ? errores.sucursal : null}>
          {(c) => (
            <Select value={sucursal !== null ? String(sucursal) : ''} onValueChange={(v) => setSucursal(Number(v))}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('recibir.bodegaPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <CondicionesContratoCampos
          valor={condiciones}
          onCambio={setCondiciones}
          tocado={tocado}
          direccion="recibida"
          rutaCompraReal="/app/finanzas/facturas-compra/nuevo"
        />

        {condiciones.contrato === 'intermediacion' && (
          <>
            <SelectorEntidad<ProductoParaDocumento>
              layout="campo"
              valor={null}
              aOpcion={aOpcion}
              icono={Package}
              etiqueta={t('recibir.agregarProducto')}
              buscar={buscarProductos}
              onCambiar={agregar}
              textos={{ placeholder: t('recibir.buscarProducto'), buscar: t('recibir.buscarProducto'), vacio: t('recibir.sinProductos') }}
            />
            <p className="text-xs text-fg-muted">{t('recibir.productosAparte')}</p>

            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
                  <tr>
                    <th className="px-3 py-2">{t('columnas.producto')}</th>
                    <th className="w-28 px-3 py-2 text-right">{t('columnas.cantidad')}</th>
                    <th className="w-36 px-3 py-2 text-right">{t('columnas.precioPactado')}</th>
                    {porLiquidacion && <th className="w-36 px-3 py-2 text-right">{t('columnas.precioLiquidacion')}</th>}
                    {porCosto && <th className="w-36 px-3 py-2 text-right">{t('columnas.costoAcreditado')}</th>}
                    <th className="w-32 px-3 py-2 text-right">{t('columnas.valor')}</th>
                    <th className="w-10 px-2 py-2">
                      <span className="sr-only">{t('recibir.quitar')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.length === 0 && (
                    <tr>
                      <td colSpan={columnas} className="px-3 py-4 text-center text-fg-muted">
                        {t('recibir.sinLineas')}
                      </td>
                    </tr>
                  )}
                  {lineas.map((l) => (
                    <tr key={l.productoId} className="border-t border-line">
                      <td className="px-3 py-2 text-fg">{l.nombre}</td>
                      <td className="px-3 py-2">
                        <CampoNumero aria-label={t('recibir.cantidadDe', { producto: l.nombre })} valor={l.cantidad} onValorChange={(v) => cambiar(l.productoId, { cantidad: v })} minimo={0} decimales={3} alinear="derecha" tamano="sm" />
                      </td>
                      <td className="px-3 py-2">
                        <CampoNumero aria-label={t('recibir.precioDe', { producto: l.nombre })} valor={l.precio} onValorChange={(v) => cambiar(l.productoId, { precio: v })} minimo={0} decimales={2} alinear="derecha" tamano="sm" />
                      </td>
                      {porLiquidacion && (
                        <td className="px-3 py-2">
                          <CampoNumero aria-label={t('recibir.precioLiquidacionDe', { producto: l.nombre })} valor={l.precioLiquidacion} onValorChange={(v) => cambiar(l.productoId, { precioLiquidacion: v })} minimo={0} decimales={2} alinear="derecha" tamano="sm" />
                        </td>
                      )}
                      {porCosto && (
                        <td className="px-3 py-2">
                          <CampoNumero aria-label={t('recibir.costoAcreditadoDe', { producto: l.nombre })} valor={l.costoAcreditado} onValorChange={(v) => cambiar(l.productoId, { costoAcreditado: v })} minimo={0} decimales={2} alinear="derecha" tamano="sm" />
                        </td>
                      )}
                      <td className="px-3 py-2 text-right tabular-nums">{moneda.formatear((l.cantidad ?? 0) * (l.precio ?? 0))}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => setLineas((ls) => ls.filter((x) => x.productoId !== l.productoId))}
                          aria-label={t('recibir.quitarDe', { producto: l.nombre })}
                          className="flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {lineas.length > 0 && (
                  <tfoot className="border-t border-line bg-subtle font-medium tabular-nums">
                    <tr>
                      <td className="px-3 py-2">{t('columnas.total')}</td>
                      <td className="px-3 py-2 text-right">{unidades}</td>
                      <td colSpan={columnas - 4} />
                      <td className="px-3 py-2 text-right">{moneda.formatear(total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {tocado && (errores.lineas || errores.valores || errores.liquidacion || errores.costo) && (
              <p role="alert" className="text-xs text-danger-text">
                {errores.lineas ?? errores.valores ?? errores.liquidacion ?? errores.costo}
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {!porLiquidacion && (
                <FormField etiqueta={t('recibir.comision')} ayuda={t('recibir.comisionAyuda')}>
                  {(c) => <CampoNumero id={c.id} valor={comision} onValorChange={setComision} minimo={0} maximo={100} decimales={2} sufijo="%" />}
                </FormField>
              )}
              <FormField etiqueta={t('recibir.cuentaRecaudo')} ayuda={t('recibir.cuentaRecaudoAyuda')} error={tocado ? errores.recaudo : null}>
                <Input value={cuentaRecaudo} inputMode="numeric" maxLength={8} placeholder="281510__" onChange={(e) => setCuentaRecaudo(e.target.value)} />
              </FormField>
            </div>

            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
                  <tr>
                    <th className="px-3 py-2">{t('recibir.vistaPrevia')}</th>
                    <th className="w-36 px-3 py-2 text-right">{t('asiento.debito')}</th>
                    <th className="w-36 px-3 py-2 text-right">{t('asiento.credito')}</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  <tr className="border-t border-line">
                    <td className="px-3 py-2 text-fg">{t('asiento.contraOrden')}</td>
                    <td className="px-3 py-2 text-right">{moneda.formatear(custodia)}</td>
                    <td />
                  </tr>
                  <tr className="border-t border-line">
                    <td className="px-3 py-2 text-fg">{t('asiento.ordenConsignacion')}</td>
                    <td />
                    <td className="px-3 py-2 text-right">{moneda.formatear(custodia)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <AvisoTonal tono="informacion" titulo={t('recibir.avisoTitulo')} descripcion={t('recibir.aviso.intermediacion')} />
          </>
        )}
        {tocado && errores.condiciones && (
          <p role="alert" className="text-xs text-danger-text">
            {errores.condiciones}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
