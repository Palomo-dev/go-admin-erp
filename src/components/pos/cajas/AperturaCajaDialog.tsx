'use client';

/**
 * «Abrir caja» (Figma `I-Apertura` · `I-AperturaUser`; paso 11 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md) sobre el `Dialogo` del kit (antes
 * era un portal de React hecho a mano).
 *
 * - Alcance según el modo de la organización (`alcancesDisponibles`): en modo
 *   sucursal, «Esta sucursal» o «Todas las sucursales» (caja global); en modo
 *   cajero, siempre «Mi caja en {sucursal}».
 * - Monto inicial con el símbolo de la moneda de la organización y SIN un
 *   valor cableado (antes proponía 100.000 pesos a todas las organizaciones).
 * - Abre con `CajasService.openSession` (con red inserta la apertura propia;
 *   sin red va al outbox). La base impide dos cajas abiertas en el mismo
 *   alcance y el error se traduce (`cajas.errores.*`).
 *
 * API conservada para la pantalla del POS: `onSessionOpened` y, opcionales,
 * `open`/`onOpenChange` (sin ellos dibuja su botón «Abrir caja»).
 */
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Globe, Lock, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialogo, FilaDato, FormField, ListaDatos, SegmentedControl } from '@/components/kit';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useBranch } from '@/lib/context/BranchContext';
import { getCurrentUserId } from '@/lib/hooks/useOrganization';
import { getUserName } from '@/lib/services/userService';
import { alcancesDisponibles, type AlcanceApertura, type ModoCaja } from '@/lib/pos/cajas/alcance';
import { CajasService } from './CajasService';
import { useFechaHoraCaja, useMensajeErrorCaja, useMonedaCaja } from './comunesCaja';
import type { CashSession } from './types';

interface AperturaCajaDialogProps {
  onSessionOpened: (session: CashSession) => void;
  disabled?: boolean;
  /** Modo controlado: la pantalla pone su propio botón (PageHeader, EmptyState) y no se dibuja el disparador. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AperturaCajaDialog({ onSessionOpened, disabled, open: controlledOpen, onOpenChange }: AperturaCajaDialogProps) {
  const t = useTranslations('cajas.abrir');
  const { formatear, simbolo } = useMonedaCaja();
  const fechaHora = useFechaHoraCaja();
  const mensajeError = useMensajeErrorCaja();
  const { branches, selectedBranchId } = useBranch();
  const idMonto = useId();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const [modo, setModo] = useState<ModoCaja>('branch');
  const [alcance, setAlcance] = useState<AlcanceApertura>('branch');
  const [monto, setMonto] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [nombre, setNombre] = useState<string>('');
  const [intento, setIntento] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  const sucursal = branches.find((b) => b.id === selectedBranchId)?.name ?? t('sinSucursal');

  useEffect(() => {
    if (!open) return;
    let vigente = true;
    CajasService.getCashSessionMode()
      .then((m) => vigente && setModo(m))
      .catch(() => vigente && setModo('branch'));
    if (!nombre) {
      getCurrentUserId()
        .then((id) => (id ? getUserName(id) : null))
        .then((n) => vigente && n && setNombre(n))
        .catch(() => undefined);
    }
    return () => {
      vigente = false;
    };
  }, [open, nombre]);

  const cerrar = (v: boolean) => {
    if (abriendo) return;
    setOpen(v);
    if (!v) {
      setMonto(null);
      setNotas('');
      setAlcance('branch');
      setIntento(false);
    }
  };

  const errorMonto = intento && (monto === null || monto < 0) ? t('montoObligatorio') : null;

  const abrir = async () => {
    setIntento(true);
    if (monto === null || monto < 0) return;
    setAbriendo(true);
    try {
      const sesion = await CajasService.openSession({ initial_amount: monto, notes: notas.trim() || undefined, scope: alcance });
      toast.success(sesion.pending_sync ? t('abiertaSinRed') : t('abierta'), {
        description: t(sesion.pending_sync ? 'montoPendiente' : 'montoInicialToast', { monto: formatear(Number(sesion.initial_amount)) }),
      });
      setAbriendo(false);
      onSessionOpened(sesion);
      setOpen(false);
      setMonto(null);
      setNotas('');
      setAlcance('branch');
      setIntento(false);
    } catch (e) {
      const codigo = (e as { codigo?: string })?.codigo;
      toast.error(t('errorAbrir'), { description: mensajeError(codigo, (e as Error)?.message) });
      setAbriendo(false);
    }
  };

  const alcances = alcancesDisponibles(modo);

  return (
    <>
      {!controlled && (
        <Button className="h-10 gap-2" disabled={disabled} onClick={() => setOpen(true)}>
          <Lock aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('abrirCaja')}
        </Button>
      )}
      <Dialogo
        abierto={open}
        onAbiertoChange={cerrar}
        titulo={t('titulo')}
        descripcion={t('descripcion')}
        icono={Lock}
        ancho={520}
        primario={{ etiqueta: abriendo ? t('abriendo') : t('abrirCaja'), onClick: () => void abrir(), cargando: abriendo }}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void abrir();
          }}
        >
          <ListaDatos etiqueta={t('datos')} className="rounded-lg border border-line bg-subtle px-3 py-2">
            <FilaDato etiqueta={t('sucursal')} valor={sucursal} />
            <FilaDato etiqueta={t('cajero')} valor={nombre || '…'} />
            <FilaDato etiqueta={t('fechaHora')} valor={fechaHora(new Date())} />
          </ListaDatos>

          {alcances.length > 1 ? (
            <FormField etiqueta={t('alcance')} ayuda={alcance === 'global' ? t('avisoGlobal') : t('ayudaSucursal')}>
              {(campo) => (
                <SegmentedControl<AlcanceApertura>
                  aria-labelledby={campo.idEtiqueta}
                  anchoCompleto
                  valor={alcance}
                  onValorChange={setAlcance}
                  opciones={[
                    { valor: 'branch', etiqueta: t('estaSucursal'), icono: Building2 },
                    { valor: 'global', etiqueta: t('todasSucursales'), icono: Globe },
                  ]}
                />
              )}
            </FormField>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-line-success bg-success-subtle px-3 py-2 text-sm text-success-text">
              <UserCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>
                <strong className="font-semibold">{t('miCajaEn', { sucursal })}</strong> · {t('avisoModoCajero')}
              </span>
            </div>
          )}

          <FormField etiqueta={t('montoInicial')} obligatorio error={errorMonto} id={idMonto} ayuda={t('montoAyuda')}>
            <CampoNumero valor={monto} onValorChange={setMonto} prefijo={simbolo} minimo={0} alinear="derecha" autoFocus disabled={abriendo} />
          </FormField>

          <FormField etiqueta={t('notas')}>
            <Textarea value={notas} maxLength={500} rows={2} onChange={(e) => setNotas(e.target.value)} placeholder={t('notasPlaceholder')} disabled={abriendo} />
          </FormField>
        </form>
      </Dialogo>
    </>
  );
}
