'use client';

import { useEffect, useState } from 'react';
import { CampoFecha, FormField, FormSection, clasesBoton } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import type { AnotacionAsientoInforme } from '@/lib/finanzas/informes/configuracion';
import { CONTROL_INFORME } from './catalogo';

interface AsientoSeleccionable { id: number; fecha: string; comprobante?: string; memo?: string }

export function AnotacionesAsientosForm({ valor, onChange }: { valor: Record<string, AnotacionAsientoInforme>; onChange: (valor: Record<string, AnotacionAsientoInforme>) => void }) {
  const { getToday, formatPlain } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [asientos, setAsientos] = useState<AsientoSeleccionable[]>([]);
  const [seleccion, setSeleccion] = useState('');
  const [edicion, setEdicion] = useState<AnotacionAsientoInforme>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (tzLoading) return;
    const hoy = getToday();
    setDesde((previo) => previo || `${hoy.slice(0, 4)}-01-01`);
    setHasta((previo) => previo || hoy);
  }, [tzLoading, getToday]);

  const cargar = async () => {
    if (!desde || !hasta || desde > hasta) { setError('Revisa el rango de los asientos.'); return; }
    setCargando(true);
    setError('');
    try {
      const respuesta = await fetch(`/api/finanzas/informes/asientos?${new URLSearchParams({ desde, hasta })}`, { cache: 'no-store' });
      const body = await respuesta.json();
      if (!respuesta.ok || !Array.isArray(body.asientos)) throw new Error(body.error || 'No se pudo cargar la lista de asientos.');
      setAsientos(body.asientos as AsientoSeleccionable[]);
    } catch (fallo) { setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la lista de asientos.'); }
    finally { setCargando(false); }
  };

  const elegir = (id: string) => { setSeleccion(id); setEdicion(valor[id] ?? {}); };
  const ids = [...new Set([...asientos.map((asiento) => String(asiento.id)), ...Object.keys(valor)])];

  return <FormSection titulo="Clasificación de asientos para los estados" descripcion="Estas marcas solo afectan la presentación de los informes. Los asientos y sus valores se conservan.">
    <FormField etiqueta="Asientos desde"><CampoFecha valor={desde} onValorChange={setDesde} limpiable={false} /></FormField>
    <FormField etiqueta="Asientos hasta"><CampoFecha valor={hasta} onValorChange={setHasta} limpiable={false} /></FormField>
    <div className="sm:col-span-2"><button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={cargando || tzLoading} onClick={() => void cargar()}>{cargando ? 'Cargando asientos…' : 'Cargar asientos contabilizados'}</button></div>
    {error && <AvisoTonal className="sm:col-span-2" tono="peligro" titulo={error} rol="alert" />}
    <FormField etiqueta="Asiento contabilizado" className="sm:col-span-2"><select className={CONTROL_INFORME} value={seleccion} onChange={(evento) => elegir(evento.target.value)}><option value="">Selecciona un asiento</option>{ids.map((id) => { const asiento = asientos.find((item) => String(item.id) === id); return <option value={id} key={id}>{asiento ? `${asiento.comprobante || `Asiento ${id}`} · ${formatPlain(asiento.fecha)} · ${asiento.memo || ''}` : `Asiento ${id} · clasificación guardada`}</option>; })}</select></FormField>
    {seleccion && <>
      <FormField etiqueta="Movimiento del patrimonio"><select className={CONTROL_INFORME} value={edicion.concepto_patrimonio ?? ''} onChange={(evento) => setEdicion({ ...edicion, concepto_patrimonio: (evento.target.value || null) as AnotacionAsientoInforme['concepto_patrimonio'] })}>
        <option value="">Determinar por las cuentas del asiento</option><option value="aportes">Aportes</option><option value="dividendos_efectivo">Dividendos decretados en efectivo</option><option value="dividendos_acciones">Dividendos en acciones</option><option value="reservas">Constitución de reservas</option><option value="traslado_resultados">Traslado de resultados de 36 a 37</option><option value="correccion_errores">Corrección de errores de periodos anteriores</option><option value="ori">Otro resultado integral (ORI)</option>
      </select></FormField>
      <FormField etiqueta="Provisión sin salida de efectivo" ayuda="Para provisiones distintas de depreciación, amortización y deterioro, que ya se calculan desde las cuentas acumuladas."><select className={CONTROL_INFORME} value={edicion.provision_sin_caja ? 'si' : 'no'} onChange={(evento) => setEdicion({ ...edicion, provision_sin_caja: evento.target.value === 'si' })}><option value="no">No marcar</option><option value="si">Sí, provisión sin salida de efectivo</option></select></FormField>
      <FormField etiqueta="Actividad del flujo de efectivo" ayuda="Úsala para identificar, por ejemplo, un cobro posterior de cartera originada por venta de activos."><select className={CONTROL_INFORME} value={edicion.cash_flow_activity ?? ''} onChange={(evento) => setEdicion({ ...edicion, cash_flow_activity: (evento.target.value || null) as AnotacionAsientoInforme['cash_flow_activity'] })}><option value="">Determinar por las cuentas del asiento</option><option value="operacion">Operación</option><option value="inversion">Inversión</option><option value="financiacion">Financiación</option></select></FormField>
      <div className="flex flex-wrap items-end gap-2"><button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onChange({ ...valor, [seleccion]: edicion })}>Aplicar clasificación del asiento</button><button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => { const restantes = { ...valor }; delete restantes[seleccion]; onChange(restantes); setEdicion({}); }}>Quitar clasificación</button></div>
    </>}
  </FormSection>;
}
