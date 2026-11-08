'use client';

/**
 * Documento que llegó de otra organización vinculada:
 * - Nota por aceptar (Figma R2 `2405:146580`): condiciones del contrato (con su
 *   clasificación), productos del consignante y, para cada uno, el producto TUYO
 *   de consignación con el que se enlaza; bodega donde la recibes. «Aceptar y
 *   recibir» crea tu nota recibida con tus funciones.
 * - Liquidación o devolución del consignatario (Figma R8 `2407:148109`): la
 *   comparación con tu nota y «Aceptar y facturar», que es el MISMO «Facturar y
 *   cerrar» de la entregada.
 * «Rechazar con motivo» solo cambia el estado del documento compartido.
 * Lo que se ve es la COPIA que armó el emisor: nunca datos de la otra organización.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, FileInput, Package, X } from 'lucide-react';
import { AvisoTonal, CampoNumero, DialogoMotivo, FilaDato, FormField, ListaDatos, PageHeader, SelectorEntidad, StatusBadge, Tarjeta, clasesBoton, type OpcionEntidad } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { buscarProductosDocumento, type ProductoParaDocumento } from '@/lib/services/documentos/edicionDocumento';
import { ErrorPeticionSaldoFavor, nuevaClaveIdempotencia } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { RUTA_CONSIGNACIONES } from '@/lib/finanzas/consignaciones/consignaciones';
import { RUTA_CONSIGNACIONES_INVENTARIO, rutaRecibida, type DocumentoPorAceptar } from '@/lib/inventario/consignaciones/recibidas';
import { consignacionesRecibidasService, type ComparacionDocumento } from './consignacionesRecibidasService';

const NS = 'consignacionesR4';

interface LineaCopia {
  ref: string;
  producto_ref: string;
  nombre: string;
  referencia: string | null;
  cantidad: number;
  precio: number | null;
}

interface Enlace {
  producto: { id: number; nombre: string } | null;
  precio: number | null;
}

export function DocumentoPorAceptarPagina({ documentoId }: { documentoId: string }) {
  const t = useTranslations(NS);
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const fmt = useMonedaOrganizacion().formatear;
  const { formatDate } = useFormatDate();
  const { branches, selectedBranchId } = useBranch();
  const [doc, setDoc] = useState<(DocumentoPorAceptar & { estado: string }) | null>(null);
  const [comparacion, setComparacion] = useState<ComparacionDocumento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sucursal, setSucursal] = useState<number | null>(selectedBranchId ?? null);
  const [enlaces, setEnlaces] = useState<Record<string, Enlace>>({});
  const [cuentaRecaudo, setCuentaRecaudo] = useState('');
  const [rechazar, setRechazar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const clave = useRef(nuevaClaveIdempotencia('consignacion-aceptar'));

  useEffect(() => {
    let vigente = true;
    consignacionesRecibidasService
      .documento(documentoId)
      .then((r) => {
        if (!vigente) return;
        setDoc(r.documento);
        setComparacion(r.comparacion);
      })
      .catch((e) => vigente && setError(e instanceof ErrorPeticionSaldoFavor ? textoErrorSaldo(t, e) : t('errores.error_desconocido')))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [documentoId, t]);

  const esNota = doc?.tipo === 'consignacion_nota';
  const terminos = (doc?.payload?.terminos ?? {}) as Record<string, unknown>;
  const lineas = ((doc?.payload?.lineas ?? []) as LineaCopia[]).filter((l) => l && typeof l === 'object');
  const contrato = (terminos.contrato as string | undefined) ?? null;

  const buscar = useCallback(
    async (texto: string, senal: AbortSignal) =>
      buscarProductosDocumento(getOrganizationId(), { texto, variante: 'venta', sucursal, conStock: false, sinServicios: true, limite: 20 }, senal),
    [sucursal],
  );
  const aOpcion = (p: ProductoParaDocumento): OpcionEntidad => ({ id: String(p.id), titulo: p.nombre, subtitulo: p.sku });

  const faltanEnlaces = esNota && lineas.some((l) => !enlaces[l.producto_ref]?.producto || (l.precio == null && !(enlaces[l.producto_ref]?.precio && (enlaces[l.producto_ref]?.precio ?? 0) > 0)));
  const necesitaRecaudo = contrato === 'intermediacion';
  const recaudoValido = !necesitaRecaudo || cuentaRecaudo.trim() === '' || /^281510\d{2}$/.test(cuentaRecaudo.trim());
  const bloqueantes = (comparacion?.diferencias ?? []).filter((d) => d.tipo !== 'comision_distinta');
  const abierto = doc?.estado === 'enviado';

  const aceptar = async () => {
    if (!doc || !abierto) return;
    setEnviando(true);
    setError(null);
    try {
      if (esNota) {
        if (faltanEnlaces || sucursal === null || !recaudoValido) return;
        const r = await consignacionesRecibidasService.aceptarNota(documentoId, {
          sucursal_id: sucursal,
          mapeo: lineas.map((l) => ({ producto_ref: l.producto_ref, product_id: enlaces[l.producto_ref]?.producto?.id ?? 0, precio: l.precio == null ? enlaces[l.producto_ref]?.precio ?? null : null })),
          cuenta_recaudo: necesitaRecaudo && cuentaRecaudo.trim() ? cuentaRecaudo.trim() : null,
          clave_idempotencia: clave.current,
        });
        toastSuccess(t('porAceptar.aceptada', { numero: r.numero }));
        router.push(rutaRecibida(r.nota_id));
      } else {
        await consignacionesRecibidasService.aceptarLiquidacion(documentoId, clave.current);
        toastSuccess(t('porAceptar.liquidacionAceptada'));
        router.push(comparacion ? `${RUTA_CONSIGNACIONES}/${comparacion.nota_id}` : RUTA_CONSIGNACIONES_INVENTARIO);
      }
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  const titulo = !doc ? '…' : esNota ? t('porAceptar.tituloNota') : t('porAceptar.tituloLiquidacion', { numero: String(doc.payload?.nota_externa ?? doc.numero ?? '') });
  const de = doc?.de.nombre ?? '—';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={titulo}
        variante="detail"
        icono={FileInput}
        cargando={cargando}
        volverA={`${RUTA_CONSIGNACIONES_INVENTARIO}?pestana=por-aceptar`}
        subtitulo={doc ? t('porAceptar.subtitulo', { de, fecha: formatDate(doc.fecha), numero: doc.numero ?? '—' }) : undefined}
        badge={doc && !abierto ? <StatusBadge estado={doc.estado === 'aceptado' ? 'completado' : 'anulado'} etiqueta={t(`porAceptar.estados.${doc.estado}`)} tamano="md" /> : undefined}
        migas={[
          { etiqueta: t('migas.inventario'), href: '/app/inventario' },
          { etiqueta: t('migas.consignaciones'), href: `${RUTA_CONSIGNACIONES_INVENTARIO}?pestana=por-aceptar` },
          { etiqueta: t('pestanas.porAceptar') },
        ]}
        acciones={
          permisos.crear && abierto ? (
            <>
              <button type="button" onClick={() => setRechazar(true)} className={clasesBoton({ variante: 'secundario' })}>
                <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('porAceptar.rechazar')}
              </button>
              <button type="button" onClick={() => void aceptar()} disabled={enviando || (esNota ? faltanEnlaces || sucursal === null || !recaudoValido : bloqueantes.length > 0)} className={clasesBoton({ variante: 'primario' })}>
                <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {esNota ? t('porAceptar.aceptarRecibir') : t('porAceptar.aceptarFacturar')}
              </button>
            </>
          ) : undefined
        }
        movil={{
          subtitulo: de,
          menu: [
            {
              id: 'aceptar',
              etiqueta: esNota ? t('porAceptar.aceptarRecibir') : t('porAceptar.aceptarFacturar'),
              icono: Check,
              onSelect: () => void aceptar(),
              oculta: !(permisos.crear && abierto),
              deshabilitada: enviando || (esNota ? faltanEnlaces || sucursal === null || !recaudoValido : bloqueantes.length > 0),
            },
            { id: 'rechazar', etiqueta: t('porAceptar.rechazar'), icono: X, onSelect: () => setRechazar(true), oculta: !(permisos.crear && abierto) },
          ],
        }}
      />

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {doc && (
        <AvisoTonal
          tono="informacion"
          titulo={esNota ? t('porAceptar.avisoNotaTitulo') : t('porAceptar.avisoLiquidacionTitulo')}
          descripcion={esNota ? t('porAceptar.avisoNota') : t('porAceptar.avisoLiquidacion')}
        />
      )}

      {doc && esNota && (
        <>
          <Tarjeta titulo={t('detalle.condiciones')}>
            <ListaDatos>
              <FilaDato etiqueta={t('columnas.consignante')} valor={`${de}${doc.de.nit ? ` · ${doc.de.nit}` : ''}`} />
              <FilaDato etiqueta={t('condiciones.contrato')} valor={contrato ? t(`condiciones.contratos.${contrato}`) : '—'} />
              <FilaDato etiqueta={t('condiciones.precio')} valor={terminos.precio_modo ? t(`condiciones.precios.${terminos.precio_modo as string}`) : '—'} />
              <FilaDato
                etiqueta={t('condiciones.remuneracion')}
                valor={
                  terminos.remuneracion_modo === 'precio_liquidacion'
                    ? t('condiciones.remuneraciones.precio_liquidacion')
                    : t('detalle.porcentajeSobre', { pct: Number(terminos.comision ?? 0), base: t(`condiciones.bases.${(terminos.base_comision as string) ?? 'precio_pactado'}`) })
                }
              />
              {terminos.periodicidad ? <FilaDato etiqueta={t('porAceptar.periodicidad')} valor={t(`porAceptar.periodicidades.${terminos.periodicidad as string}`)} /> : null}
            </ListaDatos>
          </Tarjeta>

          <div className="flex flex-col gap-3">
            {lineas.map((l) => (
              <div key={l.ref} className="grid grid-cols-1 gap-3 rounded-lg border border-line p-3 lg:grid-cols-[1fr_auto_minmax(16rem,22rem)]">
                <div className="min-w-0">
                  <p className="font-medium text-fg">{l.nombre}</p>
                  <p className="text-xs text-fg-muted">
                    {[l.referencia, t('porAceptar.cantidad', { n: l.cantidad }), l.precio != null ? fmt(l.precio) : t('porAceptar.sinPrecio')].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {l.precio == null && (
                  <CampoNumero
                    aria-label={t('recibir.precioDe', { producto: l.nombre })}
                    valor={enlaces[l.producto_ref]?.precio ?? null}
                    onValorChange={(v) => setEnlaces((e) => ({ ...e, [l.producto_ref]: { producto: e[l.producto_ref]?.producto ?? null, precio: v } }))}
                    minimo={0}
                    decimales={2}
                    tamano="sm"
                  />
                )}
                <div className="flex flex-col gap-1">
                <SelectorEntidad<ProductoParaDocumento>
                  layout="campo"
                  valor={null}
                  aOpcion={aOpcion}
                  icono={Package}
                  etiqueta={t('porAceptar.tuProducto')}
                  buscar={buscar}
                  onCambiar={(p) => setEnlaces((e) => ({ ...e, [l.producto_ref]: { producto: { id: p.id, nombre: p.nombre }, precio: e[l.producto_ref]?.precio ?? null } }))}
                  textos={{ placeholder: t('porAceptar.eligeProducto'), buscar: t('recibir.buscarProducto'), vacio: t('recibir.sinProductos') }}
                />
                {enlaces[l.producto_ref]?.producto ? (
                  <StatusBadge estado="completado" etiqueta={t('porAceptar.vinculado', { producto: enlaces[l.producto_ref]!.producto!.nombre })} />
                ) : (
                  <StatusBadge estado="pendiente" etiqueta={t('porAceptar.sinVincular')} />
                )}
                </div>
              </div>
            ))}
            <p className="text-xs text-fg-muted">{t('porAceptar.productosAparte')}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('recibir.bodega')} obligatorio>
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
            {necesitaRecaudo && (
              <FormField etiqueta={t('recibir.cuentaRecaudo')} ayuda={t('recibir.cuentaRecaudoAyuda')} error={recaudoValido ? null : t('validacion.cuentaRecaudo')}>
                <Input value={cuentaRecaudo} inputMode="numeric" maxLength={8} placeholder="281510__" onChange={(e) => setCuentaRecaudo(e.target.value)} />
              </FormField>
            )}
          </div>
        </>
      )}

      {doc && !esNota && (
        <>
          <Tarjeta titulo={t('porAceptar.liquidacion')}>
            <ListaDatos divisores>
              <FilaDato etiqueta={t('liquidar.venta')} valor={fmt(Number(doc.payload?.venta ?? 0))} />
              <FilaDato etiqueta={t('liquidar.remuneracionPct', { pct: Number(doc.payload?.comision_pct ?? 0), base: '' })} valor={`(${fmt(Number(doc.payload?.remuneracion ?? 0))})`} />
              <FilaDato etiqueta={t('porAceptar.netoPorCobrar')} valor={fmt(Number(doc.payload?.dueno ?? 0))} tamano="lg" separadorAntes />
            </ListaDatos>
          </Tarjeta>
          <Tarjeta titulo={t('porAceptar.diferencias', { numero: comparacion?.numero_nota ?? '—' })}>
            {(comparacion?.diferencias ?? []).length === 0 ? (
              <FilaDato etiqueta={t('porAceptar.sinDiferenciasDetalle')} accesorio={<StatusBadge estado="completado" etiqueta={t('porAceptar.sinDiferencias')} />} />
            ) : (
              <ListaDatos>
                {comparacion!.diferencias.map((d, i) => (
                  <FilaDato key={`${d.tipo}-${i}`} etiqueta={t(`porAceptar.tiposDiferencia.${d.tipo}`)} tono={d.tipo === 'comision_distinta' ? 'advertencia' : 'peligro'} />
                ))}
              </ListaDatos>
            )}
          </Tarjeta>
        </>
      )}

      <DialogoMotivo
        abierto={rechazar}
        onAbiertoChange={setRechazar}
        titulo={t('porAceptar.rechazarTitulo')}
        descripcion={t('porAceptar.rechazarDescripcion', { de })}
        textoConfirmar={t('porAceptar.rechazar')}
        destructiva
        onConfirmar={async (motivo) => {
          try {
            await consignacionesRecibidasService.responder(documentoId, 'rechazar', motivo);
            toastSuccess(t('porAceptar.rechazada'));
            router.push(`${RUTA_CONSIGNACIONES_INVENTARIO}?pestana=por-aceptar`);
          } catch (e) {
            setError(textoErrorSaldo(t, e));
            setRechazar(false);
          }
        }}
      />
    </div>
  );
}
