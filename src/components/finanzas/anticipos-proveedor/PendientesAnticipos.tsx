'use client';

/**
 * Pendientes contables de los anticipos (ronda 2 del Contador, ítem 9): retención
 * por evaluar, retención repetida en una factura (con los periodos a revisar),
 * retenciones de una devolución por definir y anulación con la caja cerrada.
 * Visibles y conciliables: un pendiente no se cierra hasta resolverse con la
 * resolución y su soporte (`POST /api/anticipos-proveedor/pendientes/[id]/resolver`,
 * permiso `finance.approve`); no se reabre ni se borra.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ClipboardCheck } from 'lucide-react';
import { Dialogo, FormField, ListCard, SegmentedControl, StatusBadge, Tarjeta } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { PendienteAnticipo } from '@/lib/finanzas/anticiposProveedor/contrato';
import { ErrorPeticionSaldoFavor } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { anticiposProveedorService } from './anticiposProveedorService';

const NS = 'finanzasTercerosR4.anticipos';
/** Ronda 6 del Contador: errores nuevos (p. ej. resolver un anticipo de AIU con el contrato sin validar). */
const NS_R6 = 'finanzasTercerosR6.anticipos';
type Vista = 'abiertos' | 'resueltos';

export interface PendientesAnticiposProps {
  pendientes: readonly PendienteAnticipo[];
  puedeResolver: boolean;
  onResuelto: () => void;
}

export function PendientesAnticipos({ pendientes, puedeResolver, onResuelto }: PendientesAnticiposProps) {
  const t = useTranslations(NS);
  const { formatDate } = useFormatDate();
  const [vista, setVista] = useState<Vista>('abiertos');
  const [resolver, setResolver] = useState<PendienteAnticipo | null>(null);
  const abiertos = pendientes.filter((p) => p.estado === 'abierto');
  const resueltos = pendientes.filter((p) => p.estado === 'resuelto');
  if (pendientes.length === 0) return null;
  const lista = vista === 'abiertos' ? abiertos : resueltos;

  return (
    <Tarjeta
      titulo={t('pendientes.titulo')}
      descripcion={t('pendientes.descripcion')}
      icono={ClipboardCheck}
      tono={abiertos.length > 0 ? 'advertencia' : 'neutro'}
    >
      <div className="flex flex-col gap-3">
        <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <SegmentedControl<Vista>
            etiqueta={t('pendientes.titulo')}
            valor={vista}
            onValorChange={setVista}
            className="w-max"
            tamano="sm"
            opciones={[
              { valor: 'abiertos', etiqueta: t('pendientes.abiertos'), contador: abiertos.length },
              { valor: 'resueltos', etiqueta: t('pendientes.resueltos'), contador: resueltos.length },
            ]}
          />
        </div>
        {lista.length === 0 && <p className="text-sm text-fg-muted">{t(vista === 'abiertos' ? 'pendientes.sinAbiertos' : 'pendientes.sinResueltos')}</p>}
        <ul className="flex flex-col gap-2">
          {lista.map((p) => (
            <li key={p.id}>
              <ListCard
                titulo={t(`pendientes.tipos.${p.tipo}`)}
                subtitulo={[p.proveedor || t('sinProveedor'), p.recibo, formatDate(p.creadoEn)].filter(Boolean).join(' · ')}
                estado={<StatusBadge estado={p.estado === 'abierto' ? 'pendiente' : 'activo'} etiqueta={t(`pendientes.estados.${p.estado}`)} />}
                acciones={
                  p.estado === 'abierto' && puedeResolver
                    ? [{ id: 'resolver', etiqueta: t('pendientes.resolver'), icono: ClipboardCheck, onSelect: () => setResolver(p) }]
                    : undefined
                }
              />
              <p className="mt-1 px-1 text-xs text-fg-muted">
                {t(`pendientes.ayuda.${p.tipo}`)}
                {p.periodos.length > 0 ? ` ${t('pendientes.periodos', { periodos: p.periodos.join(', ') })}` : ''}
                {p.estado === 'resuelto' && p.resolucion ? ` ${t('pendientes.resuelto', { resolucion: p.resolucion, soporte: p.soporte ?? '—' })}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <ResolverPendienteDialog pendiente={resolver} onCerrar={() => setResolver(null)} onResuelto={onResuelto} />
    </Tarjeta>
  );
}

function ResolverPendienteDialog({ pendiente, onCerrar, onResuelto }: { pendiente: PendienteAnticipo | null; onCerrar: () => void; onResuelto: () => void }) {
  const t = useTranslations(NS);
  const tR6 = useTranslations(NS_R6);
  const [resolucion, setResolucion] = useState('');
  const [soporte, setSoporte] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const faltaResolucion = resolucion.trim().length < 10;
  const faltaSoporte = soporte.trim().length < 3;

  const cerrar = () => {
    setResolucion('');
    setSoporte('');
    setTocado(false);
    setError(null);
    onCerrar();
  };

  const confirmar = async () => {
    setTocado(true);
    if (!pendiente || faltaResolucion || faltaSoporte) return;
    setEnviando(true);
    setError(null);
    try {
      await anticiposProveedorService.resolverPendiente(pendiente.id, { resolucion, soporte });
      toastSuccess(t('pendientes.exito'));
      cerrar();
      onResuelto();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionSaldoFavor ? String(e.codigo) : '';
      setError(textoErrorSaldo(codigo && tR6.has(`errores.${codigo}`) ? tR6 : t, e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={!!pendiente}
      onAbiertoChange={(v) => !v && !enviando && cerrar()}
      titulo={t('pendientes.resolverTitulo')}
      descripcion={pendiente ? t(`pendientes.tipos.${pendiente.tipo}`) : undefined}
      icono={ClipboardCheck}
      ancho={520}
      primario={{ etiqueta: t('pendientes.resolverConfirmar'), onClick: () => void confirmar(), cargando: enviando }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('pendientes.resolucion')} obligatorio error={tocado && faltaResolucion ? t('validacion.resolucion') : null}>
          <Textarea value={resolucion} onChange={(e) => setResolucion(e.target.value)} maxLength={2000} rows={4} placeholder={t('pendientes.resolucionPlaceholder')} />
        </FormField>
        <FormField etiqueta={t('pendientes.soporte')} obligatorio error={tocado && faltaSoporte ? t('validacion.soporte') : null}>
          <Input value={soporte} onChange={(e) => setSoporte(e.target.value)} maxLength={500} />
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
