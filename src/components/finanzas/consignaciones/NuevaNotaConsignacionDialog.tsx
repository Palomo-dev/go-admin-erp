'use client';

/**
 * Nueva nota de consignación (Figma `2335:139248`, captura
 * `docs/design/figma/88-terceros-consignaciones-nueva-nota.png`). «No es una
 * factura. La mercancía sigue siendo tuya.»
 *
 * Consignatario (el cliente que vende por ti), ubicación «en poder de», productos
 * y cantidades, comisión pactada y condiciones del contrato. Ronda 2 del Contador:
 * la mercancía sigue en TU inventario, a costo, y NO cambia de cuenta (nada de
 * 1465 ni de ingreso o costo al entregar): se identifica en poder del
 * consignatario con un traslado del kardex. Al «Entregar mercancía», UNA ruta y
 * UNA RPC (`fn_consignacion_entregar`), sin asiento.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Package, PackagePlus, Trash2 } from 'lucide-react';
import { AvisoTonal, CampoNumero, Dialogo, FormField, SelectorEntidad, type OpcionEntidad } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { ElegirCliente, type ClienteDocumento } from '@/components/finanzas/documento/terceros';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { buscarProductosDocumento, type ProductoParaDocumento } from '@/lib/services/documentos/edicionDocumento';
import { ErrorPeticionSaldoFavor, nuevaClaveIdempotencia } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { CondicionesContratoCampos } from '@/components/inventario/consignaciones/CondicionesContratoCampos';
import { CONDICIONES_VACIAS, terminosDeCondiciones, validarCondiciones, type CondicionesContrato } from '@/lib/inventario/consignaciones/recibidas';
import { consignacionesService } from './consignacionesService';

const NS = 'finanzasTercerosR4.consignaciones';
const NS_R4 = 'consignacionesR4';

interface LineaNueva {
  productoId: number;
  nombre: string;
  stock: number | null;
  cantidad: number | null;
  /** Precio del dueño (sin IVA), opcional: lo ve el consignatario vinculado. */
  precio: number | null;
}

export interface NuevaNotaConsignacionDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onEntregada: (r: { nota_id: string; numero: string }) => void;
}

export function NuevaNotaConsignacionDialog({ abierto, onAbiertoChange, onEntregada }: NuevaNotaConsignacionDialogProps) {
  const t = useTranslations(NS);
  const tr = useTranslations(NS_R4);
  const moneda = useMonedaOrganizacion();
  const [condiciones, setCondiciones] = useState<CondicionesContrato>(CONDICIONES_VACIAS);
  const { branches, selectedBranchId, branchFilter } = useBranch();
  const [sucursal, setSucursal] = useState<number | null>(null);
  const [cliente, setCliente] = useState<ClienteDocumento | null>(null);
  const [ubicacion, setUbicacion] = useState('');
  const [ubicacionTocada, setUbicacionTocada] = useState(false);
  const [comision, setComision] = useState<number | null>(null);
  const [lineas, setLineas] = useState<LineaNueva[]>([]);
  const [costos, setCostos] = useState<Map<number, number>>(new Map());
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef('');

  useEffect(() => {
    if (!abierto) return;
    setSucursal(branchFilter ?? selectedBranchId ?? branches[0]?.id ?? null);
    setCliente(null);
    setUbicacion('');
    setUbicacionTocada(false);
    setComision(null);
    setLineas([]);
    setCondiciones(CONDICIONES_VACIAS);
    setTocado(false);
    setError(null);
    clave.current = nuevaClaveIdempotencia('consignacion');
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Bodega por defecto: «Consignación · <consignatario>», hasta que la persona la escriba.
  useEffect(() => {
    if (!ubicacionTocada) setUbicacion(cliente ? t('nueva.ubicacionPorDefecto', { consignatario: cliente.nombre }) : '');
  }, [cliente, ubicacionTocada, t]);

  // Costo promedio de la sucursal para la vista previa (lectura con RLS; la base pone el definitivo).
  const ids = useMemo(() => lineas.map((l) => l.productoId).join(','), [lineas]);
  useEffect(() => {
    if (!abierto || sucursal === null || !ids) {
      setCostos(new Map());
      return;
    }
    let vigente = true;
    void Promise.resolve(
      supabase
        .from('stock_levels')
        .select('product_id, avg_cost, qty_on_hand')
        .eq('branch_id', sucursal)
        .in('product_id', ids.split(',').map(Number)),
    ).then(({ data }) => {
      if (!vigente) return;
      const m = new Map<number, number>();
      for (const f of (data ?? []) as { product_id: number; avg_cost: number | string | null }[]) {
        if (!m.has(f.product_id)) m.set(f.product_id, Number(f.avg_cost ?? 0) || 0);
      }
      setCostos(m);
    });
    return () => {
      vigente = false;
    };
  }, [abierto, sucursal, ids]);

  const buscarProductos = useCallback(
    async (texto: string, senal: AbortSignal) =>
      buscarProductosDocumento(getOrganizationId(), { texto, variante: 'venta', sucursal, conStock: true, sinServicios: true, limite: 20 }, senal),
    [sucursal],
  );

  const aOpcion = useCallback(
    (p: ProductoParaDocumento): OpcionEntidad => {
      const motivo = p.serial ? t('nueva.motivoSerial') : !p.controlaStock ? t('nueva.motivoSinStock') : undefined;
      return {
        id: String(p.id),
        titulo: p.nombre,
        subtitulo: p.sku,
        meta: p.stock != null ? t('nueva.stock', { n: p.stock }) : null,
        deshabilitada: !!motivo,
        motivo,
      };
    },
    [t],
  );

  const agregar = (p: ProductoParaDocumento) => {
    setLineas((ls) => (ls.some((l) => l.productoId === p.id) ? ls : [...ls, { productoId: p.id, nombre: p.nombre, stock: p.stock, cantidad: 1, precio: null }]));
  };

  const costoEstimado = lineas.reduce((s, l) => s + (l.cantidad ?? 0) * (costos.get(l.productoId) ?? 0), 0);
  const errores = {
    sucursal: sucursal === null ? t('validacion.sucursal') : null,
    cliente: !cliente ? t('validacion.consignatario') : null,
    lineas: lineas.length === 0 ? t('validacion.lineas') : null,
    cantidades: lineas.some((l) => !(l.cantidad && l.cantidad > 0)) ? t('validacion.cantidad') : null,
    excede: lineas.some((l) => l.stock != null && (l.cantidad ?? 0) > l.stock) ? t('validacion.excedeStock') : null,
    comision: comision !== null && (comision < 0 || comision > 100) ? t('validacion.comision') : null,
    condiciones: validarCondiciones(condiciones, 'entregada').length > 0 ? tr('validacion.condiciones') : null,
  };
  const hayErrores = Object.values(errores).some(Boolean);

  const entregar = async () => {
    setTocado(true);
    if (hayErrores || !cliente || sucursal === null) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await consignacionesService.entregar({
        clienteId: cliente.id,
        sucursalId: sucursal,
        comision: condiciones.remuneracionModo === 'precio_liquidacion' ? 0 : (comision ?? 0),
        terminos: terminosDeCondiciones(condiciones, { direccion: 'entregada' }),
        ubicacion,
        notas: '',
        lineas: lineas.map((l) => ({ product_id: l.productoId, qty: l.cantidad ?? 0, precio: l.precio })),
        claveIdempotencia: clave.current,
      });
      toastSuccess(t('nueva.exito', { numero: r.numero, consignatario: cliente.nombre }));
      onAbiertoChange(false);
      onEntregada(r);
    } catch (e) {
      // Los códigos de la consignación (Ronda 2) se leen en consignacionesR4; el resto, en su namespace de siempre.
      const codigo = e instanceof ErrorPeticionSaldoFavor ? String(e.codigo) : '';
      setError(textoErrorSaldo(tr.has(`errores.${codigo}`) ? tr : t, e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('nueva.titulo')}
      descripcion={t('nueva.descripcion')}
      icono={PackagePlus}
      ancho={672}
      primario={{ etiqueta: t('nueva.confirmar'), onClick: () => void entregar(), cargando: enviando, deshabilitada: condiciones.contrato !== 'intermediacion' }}
    >
      <div className="flex flex-col gap-4">
        <CondicionesContratoCampos
          valor={condiciones}
          onCambio={setCondiciones}
          tocado={tocado}
          direccion="entregada"
          rutaCompraReal="/app/finanzas/facturas-venta/nuevo"
        />
        {condiciones.contrato === 'intermediacion' && (
          <p role="note" className="text-xs text-warning-text">
            {tr('condiciones.mandanteEntregadaPendiente')}
          </p>
        )}
        {tocado && errores.condiciones && (
          <p role="alert" className="text-xs text-danger-text">
            {errores.condiciones}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <ElegirCliente layout="campo" cliente={cliente} sucursal={sucursal} onCambiar={setCliente} onQuitar={() => setCliente(null)} />
          {tocado && errores.cliente && (
            <p role="alert" className="text-xs text-danger-text">
              {errores.cliente}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('nueva.ubicacion')} obligatorio ayuda={t('nueva.ubicacionAyuda')}>
            <Input
              value={ubicacion}
              maxLength={120}
              onChange={(e) => {
                setUbicacionTocada(true);
                setUbicacion(e.target.value);
              }}
            />
          </FormField>
          <FormField etiqueta={t('nueva.origen')} obligatorio error={tocado ? errores.sucursal : null}>
            {(c) => (
              <Select value={sucursal !== null ? String(sucursal) : ''} onValueChange={(v) => setSucursal(Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('nueva.origenPlaceholder')} />
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
        </div>

        <SelectorEntidad<ProductoParaDocumento>
          layout="campo"
          valor={null}
          aOpcion={aOpcion}
          icono={Package}
          etiqueta={t('nueva.agregarProducto')}
          buscar={buscarProductos}
          onCambiar={agregar}
          textos={{ placeholder: t('nueva.buscarProducto'), buscar: t('nueva.buscarProducto'), vacio: t('nueva.sinProductos') }}
        />

        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
              <tr>
                <th className="px-3 py-2">{t('columnas.producto')}</th>
                <th className="w-32 px-3 py-2 text-right">{t('columnas.cantidad')}</th>
                <th className="w-36 px-3 py-2 text-right">{tr('columnas.precioDueno')}</th>
                <th className="w-36 px-3 py-2 text-right">{t('columnas.costo')}</th>
                <th className="w-10 px-2 py-2">
                  <span className="sr-only">{t('nueva.quitar')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-fg-muted">
                    {t('nueva.sinLineas')}
                  </td>
                </tr>
              )}
              {lineas.map((l) => (
                <tr key={l.productoId} className="border-t border-line">
                  <td className="px-3 py-2">
                    <span className="block truncate text-fg">{l.nombre}</span>
                    {l.stock != null && <span className="text-xs text-fg-muted">{t('nueva.stock', { n: l.stock })}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <CampoNumero
                      aria-label={t('nueva.cantidadDe', { producto: l.nombre })}
                      valor={l.cantidad}
                      onValorChange={(v) => setLineas((ls) => ls.map((x) => (x.productoId === l.productoId ? { ...x, cantidad: v } : x)))}
                      minimo={0}
                      decimales={3}
                      alinear="derecha"
                      tamano="sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <CampoNumero
                      aria-label={tr('recibir.precioDe', { producto: l.nombre })}
                      valor={l.precio}
                      onValorChange={(v) => setLineas((ls) => ls.map((x) => (x.productoId === l.productoId ? { ...x, precio: v } : x)))}
                      minimo={0}
                      decimales={2}
                      alinear="derecha"
                      tamano="sm"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg-secondary">{moneda.formatear((l.cantidad ?? 0) * (costos.get(l.productoId) ?? 0))}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => ls.filter((x) => x.productoId !== l.productoId))}
                      aria-label={t('nueva.quitarDe', { producto: l.nombre })}
                      className="flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tocado && (errores.lineas || errores.cantidades || errores.excede) && (
          <p role="alert" className="text-xs text-danger-text">
            {errores.lineas ?? errores.cantidades ?? errores.excede}
          </p>
        )}

        <FormField etiqueta={t('nueva.comision')} ayuda={t('nueva.comisionAyuda')} error={tocado ? errores.comision : null}>
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              valor={comision}
              onValorChange={setComision}
              minimo={0}
              maximo={100}
              decimales={2}
              sufijo="%"
            />
          )}
        </FormField>

        <AvisoTonal
          tono="informacion"
          titulo={tr('entregada.sinAsientoTitulo')}
          descripcion={tr('entregada.sinAsientoDescripcion', { costo: moneda.formatear(costoEstimado) })}
        />

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
