'use client';

import { useTranslations } from 'next-intl';
import { Info, PackageCheck, SlidersHorizontal, Warehouse } from 'lucide-react';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { FilaStockForm } from '../../logica/formularioProducto';
import { totalesStockInicial } from '../../logica/stock';
import { BotonInventario } from '../../detalle/inventario/stock/BotonInventario';
import { rutaAjuste } from '../../detalle/inventario/stock/logicaInventario';
import { useCantidad } from '../../detalle/inventario/stock/useFormatoInventario';
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Tabla de stock por sucursal del formulario de producto (Figma 09 · Nuevo
 * producto › «Inventario por sucursal»; móvil, paso 2: una tarjeta por
 * sucursal). Solo el contenido: el marco lo pone `ProductoForm`.
 *
 * - Crear / duplicar: cantidad inicial, mínimo y costo unitario (vacío = costo
 *   del producto) por sucursal activa, con total por fila y al pie. La
 *   entrada inicial queda en el kardex al guardar (`fn_producto_guardar`).
 * - Editar: la existencia es de solo lectura (se cambia con un ajuste, que se
 *   abre en otra pestaña para no perder lo que no se ha guardado); el mínimo
 *   sí se edita.
 * - Con lotes (`track_lots`, crear/duplicar): cada cantidad entra a un lote con
 *   su código y vencimiento opcional; sin código el servidor propone
 *   L-AAAAMMDD (fn_producto_int_stock_inicial, inv_b7_3).
 * - Con variantes el stock se captura por variante, no aquí.
 */
export function SeccionStockInicial({ estado, cambiar, errores, modo, moneda, productId, hoy }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.stock');
  const te = useTranslations('productoForm.errores');
  const cantidad = useCantidad();

  const rastrea = estado.track_stock && estado.product_type !== 'service';
  const editar = modo === 'editar';
  const conLotes = !editar && estado.track_lots;
  const filas = estado.stock;
  const costoProducto = estado.cost;

  if (!rastrea) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-fg-secondary">
        <PackageCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {estado.product_type === 'service' ? t('servicio') : t('sinSeguimiento')}
      </p>
    );
  }

  if (estado.tiene_variantes) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-sm text-info-text">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        {t('porVariante')}
      </p>
    );
  }

  if (filas.length === 0) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-fg-secondary">
        <Warehouse aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {t('sinSucursales')}
      </p>
    );
  }

  const actualizarFila = (branchId: number, parcial: Partial<FilaStockForm>) =>
    cambiar(
      'stock',
      filas.map((f) => (f.branch_id === branchId ? { ...f, ...parcial } : f)),
    );

  const totales = totalesStockInicial(filas, costoProducto);
  const sucursalesConStock = filas.filter((f) => (f.qty ?? 0) > 0).length;
  const existenciaActual = filas.reduce((n, f) => n + f.qty_actual, 0);
  const totalFila = (f: FilaStockForm) => (f.qty ?? 0) * (f.unit_cost ?? costoProducto ?? 0);
  const placeholderCosto = costoProducto !== null ? String(costoProducto) : undefined;
  const mensajeError = errores.stock ? te(errores.stock, { detalle: '' }) : null;
  const idError = 'stock-inicial-error';
  const hayError = !!mensajeError;

  const campoCantidad = (f: FilaStockForm) => (
    <CampoNumero
      tamano="sm"
      valor={f.qty}
      onValorChange={(v) => actualizarFila(f.branch_id, { qty: v })}
      decimales={2}
      minimo={0}
      placeholder="0"
      aria-label={t('cantidadEn', { sucursal: f.nombre })}
      aria-invalid={hayError && (f.qty ?? 0) < 0 ? true : undefined}
      aria-describedby={hayError ? idError : undefined}
    />
  );
  const campoMinimo = (f: FilaStockForm) => (
    <CampoNumero
      tamano="sm"
      valor={f.min_level}
      onValorChange={(v) => actualizarFila(f.branch_id, { min_level: v })}
      decimales={2}
      minimo={0}
      placeholder="0"
      aria-label={t('minimoEn', { sucursal: f.nombre })}
    />
  );
  const campoCosto = (f: FilaStockForm) => (
    <CampoNumero
      tamano="sm"
      valor={f.unit_cost}
      onValorChange={(v) => actualizarFila(f.branch_id, { unit_cost: v })}
      decimales={moneda.decimales}
      minimo={0}
      prefijo={moneda.simbolo}
      placeholder={placeholderCosto}
      aria-label={t('costoEn', { sucursal: f.nombre })}
      aria-invalid={hayError && (f.qty ?? 0) > 0 && !((f.unit_cost ?? costoProducto ?? 0) > 0) ? true : undefined}
      aria-describedby={hayError ? idError : undefined}
    />
  );
  const campoLote = (f: FilaStockForm) => (
    <Input
      className="h-8"
      value={f.lot_code}
      maxLength={60}
      onChange={(ev) => actualizarFila(f.branch_id, { lot_code: ev.target.value })}
      placeholder={t('lotePlaceholder')}
      aria-label={t('loteEn', { sucursal: f.nombre })}
      disabled={!((f.qty ?? 0) > 0)}
    />
  );
  const campoVence = (f: FilaStockForm) => (
    <CampoFecha
      tamano="sm"
      valor={f.expiry_date}
      onValorChange={(dia) => actualizarFila(f.branch_id, { expiry_date: dia || null })}
      hoy={hoy}
      limpiable
      placeholder={t('vencePlaceholder')}
      aria-label={t('venceEn', { sucursal: f.nombre })}
      disabled={!((f.qty ?? 0) > 0)}
    />
  );
  const botonAjustar = (f: FilaStockForm) => (
    <BotonInventario
      tamano="sm"
      etiqueta={t('ajustar')}
      icono={SlidersHorizontal}
      href={rutaAjuste(productId ?? null, null, f.branch_id)}
      nuevaPestana
      deshabilitado={!productId}
      motivo={!productId ? t('ajustarSinProducto') : undefined}
    />
  );
  const nombreSucursal = (f: FilaStockForm) => (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <Warehouse aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
      <span className="font-medium text-fg">{f.nombre}</span>
      {f.principal && (
        <Badge tono="marca" tamano="sm">
          {t('principal')}
        </Badge>
      )}
    </span>
  );

  const th = 'h-10 whitespace-nowrap px-3 text-xs font-medium text-fg-secondary';

  return (
    <div className="flex flex-col gap-3">
      {/* Escritorio: tabla */}
      <div className="hidden overflow-hidden rounded-xl border border-line lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t('tablaEtiqueta')}</caption>
          <thead className="bg-subtle">
            <tr className="border-b border-line">
              <th scope="col" className={cn(th, 'pl-4 text-left')}>
                {t('columnas.sucursal')}
              </th>
              {editar ? (
                <th scope="col" className={cn(th, 'text-right')}>
                  {t('columnas.existencia')}
                </th>
              ) : (
                <th scope="col" className={cn(th, 'w-32 text-right')}>
                  {t('columnas.cantidad')}
                </th>
              )}
              {conLotes && (
                <>
                  <th scope="col" className={cn(th, 'w-36 text-left')}>
                    {t('columnas.lote')}
                  </th>
                  <th scope="col" className={cn(th, 'w-40 text-left')}>
                    {t('columnas.vence')}
                  </th>
                </>
              )}
              <th scope="col" className={cn(th, 'w-32 text-right')}>
                {t('columnas.minimo')}
              </th>
              {editar ? (
                <th scope="col" className={cn(th, 'w-36 pr-4 text-right')}>
                  <span className="sr-only">{t('columnas.acciones')}</span>
                </th>
              ) : (
                <>
                  <th scope="col" className={cn(th, 'w-44 text-right')}>
                    {t('columnas.costoUnitario')}
                  </th>
                  <th scope="col" className={cn(th, 'w-36 pr-4 text-right')}>
                    {t('columnas.total')}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.branch_id} className="border-b border-line last:border-b-0">
                <td className="py-2 pl-4 pr-3">{nombreSucursal(f)}</td>
                {editar ? (
                  <td className="px-3 py-2 text-right tabular-nums text-fg">{cantidad(f.qty_actual)}</td>
                ) : (
                  <td className="px-3 py-2">{campoCantidad(f)}</td>
                )}
                {conLotes && (
                  <>
                    <td className="px-3 py-2">{campoLote(f)}</td>
                    <td className="px-3 py-2">{campoVence(f)}</td>
                  </>
                )}
                <td className="px-3 py-2">{campoMinimo(f)}</td>
                {editar ? (
                  <td className="py-2 pl-3 pr-4 text-right">{botonAjustar(f)}</td>
                ) : (
                  <>
                    <td className="px-3 py-2">{campoCosto(f)}</td>
                    <td className="whitespace-nowrap py-2 pl-3 pr-4 text-right font-medium tabular-nums text-fg">
                      {(f.qty ?? 0) > 0 ? moneda.formatear(totalFila(f)) : <span className="text-fg-muted">{moneda.formatear(0)}</span>}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-subtle">
            <tr>
              <td colSpan={editar ? 4 : conLotes ? 7 : 5} className="px-4 py-2.5 text-xs text-fg-secondary">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {editar ? t('notaEditar') : t('notaKardex', { count: filas.length })}
                    {conLotes && ` ${t('notaLotes')}`}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-fg">
                    {editar
                      ? t('totalExistencia', { unidades: cantidad(existenciaActual) })
                      : t('totales', { unidades: cantidad(totales.unidades), valor: moneda.formatear(totales.valor) })}
                  </span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Móvil: una tarjeta por sucursal (Figma 09 móvil, paso 2) */}
      <ul aria-label={t('tablaEtiqueta')} className="flex flex-col gap-3 lg:hidden">
        {filas.map((f) => (
          <li key={f.branch_id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              {nombreSucursal(f)}
              {!editar && (f.qty ?? 0) > 0 && (
                <span className="shrink-0 text-sm font-medium tabular-nums text-fg">{moneda.formatear(totalFila(f))}</span>
              )}
            </div>
            <div className={cn('grid gap-2', editar ? 'grid-cols-2' : 'grid-cols-3')}>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium text-fg-secondary">{editar ? t('columnas.existencia') : t('columnas.cantidad')}</span>
                {editar ? (
                  <span className="flex h-8 items-center justify-end rounded-md bg-subtle px-3 tabular-nums text-fg">{cantidad(f.qty_actual)}</span>
                ) : (
                  campoCantidad(f)
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-medium text-fg-secondary">{t('columnas.minimo')}</span>
                {campoMinimo(f)}
              </div>
              {!editar && (
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-medium text-fg-secondary">{t('columnas.costo')}</span>
                  {campoCosto(f)}
                </div>
              )}
            </div>
            {conLotes && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-medium text-fg-secondary">{t('columnas.lote')}</span>
                  {campoLote(f)}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-medium text-fg-secondary">{t('columnas.vence')}</span>
                  {campoVence(f)}
                </div>
              </div>
            )}
            {editar && <div className="flex justify-end">{botonAjustar(f)}</div>}
          </li>
        ))}
        <li className="px-1 text-xs text-fg-secondary">
          <span className="block text-sm font-semibold tabular-nums text-fg">
            {editar
              ? t('totalExistencia', { unidades: cantidad(existenciaActual) })
              : t('totales', { unidades: cantidad(totales.unidades), valor: moneda.formatear(totales.valor) })}
          </span>
          {editar ? t('notaEditar') : t('notaKardex', { count: filas.length })}
          {conLotes && ` ${t('notaLotes')}`}
        </li>
      </ul>

      {!editar && sucursalesConStock > 0 && costoProducto === null && filas.some((f) => (f.qty ?? 0) > 0 && f.unit_cost === null) && (
        <p className="text-xs text-warning-text">{t('avisoSinCosto')}</p>
      )}

      {mensajeError && (
        <p id={idError} role="alert" className="text-sm font-medium text-danger-text">
          {mensajeError}
        </p>
      )}
    </div>
  );
}
