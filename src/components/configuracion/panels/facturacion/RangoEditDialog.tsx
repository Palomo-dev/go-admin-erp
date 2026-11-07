'use client';

/**
 * Editar un rango de numeración (antes `RangoEditForm`, en línea dentro de la
 * tarjeta vieja). Mismos campos; guarda por `POST /api/factus/rangos`
 * (administrador o `finance.approve`), que valida la organización y no mueve
 * el rango de sucursal salvo que se elija otra.
 *
 * La clave técnica no viaja al navegador: si ya hay una, el campo queda vacío y
 * solo se cambia si se escribe algo.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil } from 'lucide-react';
import { CampoFecha, CampoNumero, Dialogo, FormField, type PropsCampo } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { validarRango, type DatosRango, type ErrorRango, type RangoNumeracion } from '@/lib/finanzas/facturacionElectronica/resolucionesLogica';

const CLASES_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

/** Solo los atributos de un `<input>` (sin `idEtiqueta`, que es para `aria-labelledby`). */
function campo(c: PropsCampo) {
  return { id: c.id, 'aria-describedby': c['aria-describedby'], 'aria-invalid': c['aria-invalid'], 'aria-required': c['aria-required'] };
}

export type RangoEditable = RangoNumeracion & { test_set_id?: string | null; tieneClaveTecnica?: boolean };

export interface RangoEditDialogProps {
  rango: RangoEditable | null;
  sucursales: ReadonlyArray<{ id: number; name: string }>;
  onCerrar: () => void;
  onGuardar: (cuerpo: Record<string, unknown>) => Promise<string | null>;
}

function aDatos(r: RangoEditable): DatosRango {
  return {
    documentType: r.document_type,
    prefix: r.prefix ?? '',
    rangeStart: Number(r.range_start ?? 0),
    rangeEnd: Number(r.range_end ?? 0),
    currentNumber: Number(r.current_number ?? 0),
    resolutionNumber: r.resolution_number ?? '',
    resolutionDate: r.resolution_date ?? '',
    validFrom: r.valid_from ?? '',
    validUntil: r.valid_until ?? '',
    technicalKey: '',
    testSetId: r.test_set_id ?? '',
    factusNumberingRangeId: r.factus_numbering_range_id ?? null,
    isActive: r.is_active,
    alertThreshold: Number(r.alert_threshold ?? 100),
  };
}

export function RangoEditDialog({ rango, sucursales, onCerrar, onGuardar }: RangoEditDialogProps) {
  const t = useTranslations('finanzasDocumentosR3.resoluciones.editar');
  const tTipos = useTranslations('finanzasDocumentosR3.resoluciones.tipos');
  const [d, setD] = useState<DatosRango | null>(null);
  const [sucursal, setSucursal] = useState<string>('');
  const [errores, setErrores] = useState<ErrorRango[]>([]);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!rango) return;
    setD(aDatos(rango));
    setSucursal(rango.branch_id ? String(rango.branch_id) : '');
    setErrores([]);
    setErrorServidor(null);
  }, [rango]);

  if (!rango || !d) return null;
  const cambiar = (c: Partial<DatosRango>) => setD({ ...d, ...c });
  const err = (k: ErrorRango) => (errores.includes(k) ? t(`errores.${k}`) : null);

  const guardar = async () => {
    const e = validarRango(d);
    setErrores(e);
    if (e.length > 0) return;
    setGuardando(true);
    setErrorServidor(null);
    const cuerpo: Record<string, unknown> = { id: rango.id, ...d };
    if (!d.technicalKey.trim()) delete cuerpo.technicalKey;
    if (sucursal && Number(sucursal) !== rango.branch_id) cuerpo.branchId = Number(sucursal);
    const problema = await onGuardar(cuerpo);
    setGuardando(false);
    if (problema) setErrorServidor(problema);
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => !v && !guardando && onCerrar()}
      titulo={t('titulo', { prefijo: rango.prefix ?? '' })}
      descripcion={t('descripcion')}
      icono={Pencil}
      ancho={672}
      primario={{ etiqueta: guardando ? t('guardando') : t('guardar'), onClick: () => void guardar(), cargando: guardando }}
      textoCancelar={t('cancelar')}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField etiqueta={t('tipo')} error={err('tipo')}>
          {(c) => (
            <Select value={d.documentType} onValueChange={(v) => cambiar({ documentType: v })}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['invoice', 'credit_note', 'debit_note', 'support_document'] as const).map((x) => (
                  <SelectItem key={x} value={x}>
                    {tTipos(x)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('sucursal')}>
          {(c) => (
            <Select value={sucursal} onValueChange={setSucursal}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('sucursal')} />
              </SelectTrigger>
              <SelectContent>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('prefijo')} error={err('prefijo')} obligatorio>
          {(c) => <input {...campo(c)} className={CLASES_CAMPO} value={d.prefix} maxLength={10} onChange={(e) => cambiar({ prefix: e.target.value.toUpperCase() })} />}
        </FormField>
        <FormField etiqueta={t('idProveedor')} ayuda={t('idProveedorAyuda')}>
          {(c) => <CampoNumero {...campo(c)} valor={d.factusNumberingRangeId} minimo={1} decimales={0} onValorChange={(v) => cambiar({ factusNumberingRangeId: v })} />}
        </FormField>
        <FormField etiqueta={t('desde')} error={err('rango')}>
          {(c) => <CampoNumero {...campo(c)} valor={d.rangeStart} minimo={0} decimales={0} onValorChange={(v) => cambiar({ rangeStart: v ?? 0 })} />}
        </FormField>
        <FormField etiqueta={t('hasta')}>
          {(c) => <CampoNumero {...campo(c)} valor={d.rangeEnd} minimo={0} decimales={0} onValorChange={(v) => cambiar({ rangeEnd: v ?? 0 })} />}
        </FormField>
        <FormField etiqueta={t('actual')} ayuda={t('actualAyuda')} error={err('actual')}>
          {(c) => <CampoNumero {...campo(c)} valor={d.currentNumber} minimo={0} decimales={0} onValorChange={(v) => cambiar({ currentNumber: v ?? 0 })} />}
        </FormField>
        <FormField etiqueta={t('alerta')} ayuda={t('alertaAyuda')}>
          {(c) => <CampoNumero {...campo(c)} valor={d.alertThreshold} minimo={0} decimales={0} onValorChange={(v) => cambiar({ alertThreshold: v ?? 0 })} />}
        </FormField>
        <FormField etiqueta={t('resolucion')}>
          {(c) => <input {...campo(c)} className={CLASES_CAMPO} value={d.resolutionNumber} maxLength={40} onChange={(e) => cambiar({ resolutionNumber: e.target.value })} />}
        </FormField>
        <FormField etiqueta={t('fechaResolucion')}>
          {(c) => <CampoFecha id={c.id} aria-describedby={c['aria-describedby']} valor={d.resolutionDate} limpiable onValorChange={(v) => cambiar({ resolutionDate: v })} />}
        </FormField>
        <FormField etiqueta={t('validoDesde')} error={err('vigencia')}>
          {(c) => <CampoFecha id={c.id} aria-describedby={c['aria-describedby']} valor={d.validFrom} limpiable onValorChange={(v) => cambiar({ validFrom: v })} />}
        </FormField>
        <FormField etiqueta={t('validoHasta')}>
          {(c) => <CampoFecha id={c.id} aria-describedby={c['aria-describedby']} valor={d.validUntil} limpiable onValorChange={(v) => cambiar({ validUntil: v })} />}
        </FormField>
        <FormField etiqueta={t('claveTecnica')} ayuda={rango.tieneClaveTecnica ? t('claveTecnicaGuardada') : undefined}>
          {(c) => (
            <input
              {...campo(c)}
              type="password"
              autoComplete="off"
              className={CLASES_CAMPO}
              value={d.technicalKey}
              placeholder={rango.tieneClaveTecnica ? t('claveTecnicaPlaceholder') : ''}
              onChange={(e) => cambiar({ technicalKey: e.target.value })}
            />
          )}
        </FormField>
        <FormField etiqueta={t('setPruebas')}>
          {(c) => <input {...campo(c)} className={CLASES_CAMPO} value={d.testSetId} maxLength={100} onChange={(e) => cambiar({ testSetId: e.target.value })} />}
        </FormField>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 sm:col-span-2">
          <label htmlFor="rango-activo" className="text-sm font-medium text-fg">
            {t('activo')}
          </label>
          <Switch id="rango-activo" checked={d.isActive} onCheckedChange={(v) => cambiar({ isActive: v })} />
        </div>
        {errorServidor && (
          <p role="alert" className="text-sm text-danger-text sm:col-span-2">
            {errorServidor}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
