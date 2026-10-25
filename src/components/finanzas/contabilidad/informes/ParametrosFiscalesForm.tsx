'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { CampoFecha, FormField, FormSection, clasesBoton } from '@/components/kit';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import type { AccionistaRegistrado, MunicipioIca, ParametrosAnioTributario } from '@/lib/finanzas/informes/tributarios';
import { CONTROL_INFORME } from './catalogo';

const FORMATOS_EXOGENA = ['1001', '1005', '1006', '1007', '1008', '1009'];
const codigos = (texto: string) => texto.split(/[,;\s]+/).map((codigo) => codigo.trim()).filter(Boolean);

function ListaCodigos({ valor, onChange, ...campo }: { valor: string[]; onChange: (codigos: string[]) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const normalizado = valor.join(', ');
  const esperado = useRef(normalizado);
  const [texto, setTexto] = useState(normalizado);
  useEffect(() => { if (normalizado !== esperado.current) { esperado.current = normalizado; setTexto(normalizado); } }, [normalizado]);
  return <input {...campo} className={`${CONTROL_INFORME} ${campo.className ?? ''}`} value={texto} onChange={(evento) => { const nuevoTexto = evento.target.value; const lista = codigos(nuevoTexto); esperado.current = lista.join(', '); setTexto(nuevoTexto); onChange(lista); }} />;
}

export function ParametrosFiscalesForm({ valor, onChange }: { valor: Record<string, unknown>; onChange: (valor: Record<string, unknown>) => void }) {
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const [anio, setAnio] = useState('');
  const [cuentaFiscal, setCuentaFiscal] = useState('');
  const [saldoFiscal, setSaldoFiscal] = useState('');
  useEffect(() => { if (!tzLoading) setAnio((previo) => previo || getToday().slice(0, 4)); }, [getToday, tzLoading]);
  const anios = valor.anios && typeof valor.anios === 'object' && !Array.isArray(valor.anios) ? valor.anios as Record<string, ParametrosAnioTributario> : {};
  const cfg: ParametrosAnioTributario = anios[anio] ?? {};
  const actualizar = (cambio: Partial<ParametrosAnioTributario>) => { if (/^\d{4}$/.test(anio)) onChange({ ...valor, anios: { ...anios, [anio]: { ...cfg, ...cambio } } }); };
  const municipios = cfg.municipios_ica ?? [];
  const cambiarMunicipio = (indice: number, cambio: Partial<MunicipioIca>) => actualizar({ municipios_ica: municipios.map((municipio, i) => i === indice ? { ...municipio, ...cambio } : municipio) });
  const accionistas = cfg.accionistas ?? [];
  const cambiarAccionista = (indice: number, cambio: Partial<AccionistaRegistrado>) => actualizar({ accionistas: accionistas.map((accionista, i) => i === indice ? { ...accionista, ...cambio } : accionista) });

  return <>
    <FormSection titulo="Parámetros tributarios por año" descripcion="Los topes, tarifas y municipios se guardan para el año elegido. Un valor vacío queda pendiente; no se inventa un tope ni una tarifa.">
      <FormField etiqueta="Año de los parámetros" error={anio && !/^\d{4}$/.test(anio) ? 'Escribe un año de cuatro dígitos.' : undefined}><input className={CONTROL_INFORME} value={anio} inputMode="numeric" maxLength={4} onChange={(evento) => setAnio(evento.target.value)} /></FormField>
      <FormField etiqueta="Periodicidad del IVA"><select className={CONTROL_INFORME} value={cfg.periodicidad_iva ?? ''} onChange={(evento) => actualizar({ periodicidad_iva: (evento.target.value || undefined) as ParametrosAnioTributario['periodicidad_iva'] })}><option value="">Sin definir</option><option value="bimestral">Bimestral</option><option value="cuatrimestral">Cuatrimestral</option></select></FormField>
      <FormField etiqueta="Responsable de IVA"><select className={CONTROL_INFORME} value={cfg.responsable_iva === true ? 'si' : cfg.responsable_iva === false ? 'no' : ''} onChange={(evento) => actualizar({ responsable_iva: evento.target.value === '' ? undefined : evento.target.value === 'si' })}><option value="">Sin definir</option><option value="si">Sí</option><option value="no">No</option></select></FormField>
      {FORMATOS_EXOGENA.map((formato) => <FormField etiqueta={`Tope exógena ${formato} · pesos`} key={formato}><input className={CONTROL_INFORME} type="number" min="0" step="1" value={cfg.topes_exogena?.[formato] ?? ''} onChange={(evento) => { const topes = { ...cfg.topes_exogena }; if (evento.target.value === '') delete topes[formato]; else topes[formato] = Number(evento.target.value); actualizar({ topes_exogena: topes }); }} /></FormField>)}
      {([{ clave: 'auxiliares_reteiva_recibida', etiqueta: 'Auxiliares 1355 de reteIVA recibida' }, { clave: 'auxiliares_reteica_recibida', etiqueta: 'Auxiliares 1355 de reteICA recibida' }, { clave: 'auxiliares_autorretencion', etiqueta: 'Auxiliares 2365 de autorretención' }] as const).map(({ clave, etiqueta }) => <FormField key={clave} etiqueta={etiqueta} ayuda="Códigos PUC separados por coma."><ListaCodigos valor={cfg[clave] ?? []} onChange={(lista) => actualizar({ [clave]: lista })} /></FormField>)}
    </FormSection>
    <FormSection titulo="ICA por municipio y actividad" descripcion="Asigna los auxiliares de ingreso, sus exclusiones y los anticipos de cada municipio. Las tarifas se expresan por mil.">
      <div className="flex flex-col gap-4 sm:col-span-2">
        {municipios.map((municipio, indice) => <div className="grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-2" key={indice}>
          <FormField etiqueta="Código del municipio"><input className={CONTROL_INFORME} value={municipio.codigo} onChange={(evento) => cambiarMunicipio(indice, { codigo: evento.target.value })} /></FormField>
          <FormField etiqueta="Municipio y autoridad tributaria"><input className={CONTROL_INFORME} value={municipio.nombre} placeholder="Municipio · Secretaría de Hacienda" onChange={(evento) => cambiarMunicipio(indice, { nombre: evento.target.value })} /></FormField>
          <FormField etiqueta="Auxiliares de anticipos recibidos (1355)" className="sm:col-span-2"><ListaCodigos valor={municipio.cuentas_anticipo ?? []} onChange={(lista) => cambiarMunicipio(indice, { cuentas_anticipo: lista })} /></FormField>
          {municipio.actividades.map((actividad, i) => <div className="grid gap-3 rounded-lg bg-subtle p-3 sm:col-span-2 sm:grid-cols-2" key={i}>
            <FormField etiqueta="Actividad económica"><input className={CONTROL_INFORME} value={actividad.codigo} onChange={(evento) => cambiarMunicipio(indice, { actividades: municipio.actividades.map((item, n) => n === i ? { ...item, codigo: evento.target.value } : item) })} /></FormField>
            <FormField etiqueta="Tarifa ICA por mil"><input className={CONTROL_INFORME} type="number" min="0" step="0.001" value={actividad.tarifa_por_mil ?? ''} onChange={(evento) => cambiarMunicipio(indice, { actividades: municipio.actividades.map((item, n) => n === i ? { ...item, tarifa_por_mil: evento.target.value === '' ? null : Number(evento.target.value) } : item) })} /></FormField>
            <FormField etiqueta="Auxiliares de ingresos (41)"><ListaCodigos valor={actividad.cuentas} onChange={(lista) => cambiarMunicipio(indice, { actividades: municipio.actividades.map((item, n) => n === i ? { ...item, cuentas: lista } : item) })} /></FormField>
            <FormField etiqueta="Auxiliares excluidos"><ListaCodigos valor={actividad.exclusiones ?? []} onChange={(lista) => cambiarMunicipio(indice, { actividades: municipio.actividades.map((item, n) => n === i ? { ...item, exclusiones: lista } : item) })} /></FormField>
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => cambiarMunicipio(indice, { actividades: municipio.actividades.filter((_, n) => n !== i) })}>Quitar actividad</button>
          </div>)}
          <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => cambiarMunicipio(indice, { actividades: [...municipio.actividades, { codigo: '', tarifa_por_mil: null, cuentas: [] }] })}>Agregar actividad</button><button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => actualizar({ municipios_ica: municipios.filter((_, n) => n !== indice) })}>Quitar municipio</button></div>
        </div>)}
        <div><button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => actualizar({ municipios_ica: [...municipios, { codigo: '', nombre: '', actividades: [] }] })}>Agregar municipio</button></div>
      </div>
    </FormSection>
    <FormSection titulo="Conciliación fiscal e informe de gestión" descripcion="El contador registra los saldos fiscales revisados. Un saldo no informado queda pendiente de conciliación.">
      <FormField etiqueta="Formato de conciliación"><select className={CONTROL_INFORME} value={cfg.formato_conciliacion ?? ''} onChange={(evento) => actualizar({ formato_conciliacion: (evento.target.value || undefined) as ParametrosAnioTributario['formato_conciliacion'] })}><option value="">Sin definir</option><option value="2516">2516</option><option value="2517">2517</option></select></FormField>
      <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3"><FormField etiqueta="Cuenta del saldo fiscal"><input className={CONTROL_INFORME} value={cuentaFiscal} inputMode="numeric" onChange={(evento) => setCuentaFiscal(evento.target.value)} /></FormField><FormField etiqueta="Saldo fiscal · pesos"><input className={CONTROL_INFORME} type="number" step="1" value={saldoFiscal} onChange={(evento) => setSaldoFiscal(evento.target.value)} /></FormField><div className="flex items-end"><button type="button" disabled={!/^\d+$/.test(cuentaFiscal) || saldoFiscal === '' || !Number.isFinite(Number(saldoFiscal))} className={clasesBoton({ variante: 'secundario' })} onClick={() => { actualizar({ saldos_fiscales: { ...cfg.saldos_fiscales, [cuentaFiscal]: Number(saldoFiscal) } }); setCuentaFiscal(''); setSaldoFiscal(''); }}>Agregar saldo fiscal</button></div></div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">{Object.entries(cfg.saldos_fiscales ?? {}).map(([codigo, saldo]) => <button type="button" className={clasesBoton({ variante: 'tinte', tamano: 'sm' })} key={codigo} title="Quitar saldo fiscal" onClick={() => { const saldos = { ...cfg.saldos_fiscales }; delete saldos[codigo]; actualizar({ saldos_fiscales: saldos }); }}>{codigo}: {new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(saldo)} · Quitar</button>)}</div>
      <FormField etiqueta="Informe de gestión de la administración" className="sm:col-span-2"><textarea rows={6} className={`${CONTROL_INFORME} h-auto py-3`} value={cfg.informe_gestion ?? ''} onChange={(evento) => actualizar({ informe_gestion: evento.target.value })} /></FormField>
    </FormSection>
    <FormSection titulo="Registro de accionistas" descripcion="Registra los titulares y sus acciones para el año elegido. Revisa los documentos que soportan cada inscripción.">
      {accionistas.map((accionista, indice) => <div className="grid gap-3 rounded-lg border border-line p-4 sm:col-span-2 sm:grid-cols-2" key={indice}>
        <FormField etiqueta="Identificación del accionista"><input className={CONTROL_INFORME} value={accionista.identificacion} onChange={(evento) => cambiarAccionista(indice, { identificacion: evento.target.value })} /></FormField>
        <FormField etiqueta="Nombre del accionista"><input className={CONTROL_INFORME} value={accionista.nombre} onChange={(evento) => cambiarAccionista(indice, { nombre: evento.target.value })} /></FormField>
        <FormField etiqueta="Número de acciones"><input className={CONTROL_INFORME} type="number" min="0" step="1" value={accionista.acciones} onChange={(evento) => cambiarAccionista(indice, { acciones: Number(evento.target.value) })} /></FormField>
        <FormField etiqueta="Valor nominal · pesos"><input className={CONTROL_INFORME} type="number" min="0" step="1" value={accionista.valor_nominal} onChange={(evento) => cambiarAccionista(indice, { valor_nominal: Number(evento.target.value) })} /></FormField>
        <FormField etiqueta="Fecha de inscripción"><CampoFecha valor={accionista.fecha_inscripcion} onValorChange={(fecha) => cambiarAccionista(indice, { fecha_inscripcion: fecha })} /></FormField>
        <div className="flex items-end"><button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => actualizar({ accionistas: accionistas.filter((_, i) => i !== indice) })}>Quitar accionista</button></div>
      </div>)}
      <div className="sm:col-span-2"><button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => actualizar({ accionistas: [...accionistas, { identificacion: '', nombre: '', acciones: 0, valor_nominal: 0, fecha_inscripcion: '' }] })}>Agregar accionista</button></div>
    </FormSection>
  </>;
}
