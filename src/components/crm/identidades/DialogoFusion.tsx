'use client';

/**
 * Diálogo «Fusionar clientes» (Figma CRM 1436:19, comparación lado a lado, y
 * 1438:1553 «error, nada cambió»). Se elige el principal, el secundario (si el
 * grupo tiene más de dos) y, campo por campo, con qué valor se queda el
 * principal. La fusión es UNA transacción en el servidor: si falla, nada
 * cambió y se dice por qué.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Merge } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import type { CampoFusion, ClienteDuplicado, GrupoDuplicados } from '@/lib/services/crm/customerMergeLogica';
import { camposDistintos, eleccionesIniciales, nombreCliente, principalSugerido } from './fusionLogica';

interface Props {
  grupo: GrupoDuplicados | null;
  fusionando: boolean;
  error: string | null;
  onCerrar: () => void;
  onFusionar: (principal: ClienteDuplicado, secundario: ClienteDuplicado, elecciones: Partial<Record<CampoFusion, string>>) => void;
}

export function DialogoFusion({ grupo, fusionando, error, onCerrar, onFusionar }: Props) {
  const t = useTranslations('crm.duplicados.fusion');
  const entero = useFormatoEntero();
  const [principalId, setPrincipalId] = useState('');
  const [secundarioId, setSecundarioId] = useState('');
  const [elecciones, setElecciones] = useState<Partial<Record<CampoFusion, string>>>({});

  useEffect(() => {
    if (!grupo) return;
    const p = principalSugerido(grupo.customers);
    const s = grupo.customers.find((c) => c.id !== p?.id);
    setPrincipalId(p?.id ?? '');
    setSecundarioId(s?.id ?? '');
  }, [grupo]);

  const principal = grupo?.customers.find((c) => c.id === principalId) ?? null;
  const secundario = grupo?.customers.find((c) => c.id === secundarioId && c.id !== principalId) ?? null;
  const campos = useMemo(() => (principal && secundario ? camposDistintos(principal, secundario) : []), [principal, secundario]);
  useEffect(() => {
    setElecciones(principal && secundario ? eleccionesIniciales(principal, secundario) : {});
  }, [principal, secundario]);

  const opciones = (grupo?.customers ?? []).map((c) => ({ valor: c.id, etiqueta: nombreCliente(c) ?? t('sinNombre') }));
  const nombre = (c: ClienteDuplicado | null) => (c ? nombreCliente(c) ?? t('sinNombre') : '');

  return (
    <Dialogo
      abierto={grupo !== null}
      onAbiertoChange={(a) => !a && !fusionando && onCerrar()}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Merge}
      ancho={672}
      primario={{
        etiqueta: t('fusionar'),
        onClick: () => principal && secundario && onFusionar(principal, secundario, elecciones),
        cargando: fusionando,
        deshabilitada: !principal || !secundario,
        motivo: !principal || !secundario ? t('eligeDos') : undefined,
      }}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-[13px] font-medium text-fg">
            <span>{t('principal')}</span>
            <SelectCrm valor={principalId} onValorChange={(v) => { setPrincipalId(v); if (v === secundarioId) setSecundarioId(grupo?.customers.find((c) => c.id !== v)?.id ?? ''); }} opciones={opciones} aria-label={t('principal')} />
          </label>
          <label className="space-y-1 text-[13px] font-medium text-fg">
            <span>{t('secundario')}</span>
            <SelectCrm valor={secundarioId} onValorChange={setSecundarioId} opciones={opciones.filter((o) => o.valor !== principalId)} aria-label={t('secundario')} />
          </label>
        </div>

        {principal && secundario && (
          campos.length === 0 ? (
            <p className="text-[13px] text-fg-secondary">{t('mismosDatos')}</p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-fg">{t('queConservar')}</legend>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[480px] text-[13px]">
                  <thead className="bg-subtle text-left text-xs text-fg-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">{t('campo')}</th>
                      <th scope="col" className="px-3 py-2 font-medium">{nombre(principal)}</th>
                      <th scope="col" className="px-3 py-2 font-medium">{nombre(secundario)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {campos.map((c) => (
                      <tr key={c}>
                        <th scope="row" className="px-3 py-2 text-left font-medium text-fg">{t(`campos.${c}`)}</th>
                        {[principal, secundario].map((cli) => (
                          <td key={cli.id} className="px-3 py-2">
                            <label className="flex items-start gap-2">
                              <input
                                type="radio"
                                name={`campo-${c}`}
                                className="mt-0.5 accent-brand-action"
                                checked={elecciones[c] === cli.id}
                                onChange={() => setElecciones((e) => ({ ...e, [c]: cli.id }))}
                                disabled={!String(cli[c] ?? '').trim()}
                              />
                              <span className="break-words text-fg">{String(cli[c] ?? '').trim() || '—'}</span>
                            </label>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
          )
        )}

        {secundario && (
          <AvisoTonal
            tono="informacion"
            compacto
            titulo={t('seMueve.titulo')}
            descripcion={t('seMueve.descripcion', { conversaciones: entero(secundario.conversations_count), oportunidades: entero(secundario.opportunities_count) })}
          />
        )}
        {error && <AvisoTonal tono="peligro" compacto titulo={t('error.titulo')} descripcion={error} />}
      </div>
    </Dialogo>
  );
}
