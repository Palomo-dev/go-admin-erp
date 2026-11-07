'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BudgetService, ErrorPresupuesto, type Budget } from './BudgetService';

/**
 * «Nuevo presupuesto» (Figma 82-20): nombre, año fiscal y «Empezar desde».
 * Vacío o copia de otro presupuesto de la organización. «Real del año
 * anterior» se ve deshabilitado con su motivo: no hay una fuente aprobada de
 * saldos reales por cuenta y mes.
 */
export interface NuevoPresupuestoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  presupuestos: readonly Budget[];
  /** Año por defecto: el siguiente al último presupuesto o el que pase la pantalla. */
  anioInicial: number;
  /** Abre el diálogo como «Copiar como borrador» de este presupuesto. */
  copiarDe?: Budget | null;
  puedeCrear: boolean;
  onCreado: (presupuesto: Budget) => void;
}

const VACIO = 'vacio';
const REAL = 'real_anterior';

export function NuevoPresupuestoDialog({ abierto, onAbiertoChange, presupuestos, anioInicial, copiarDe, puedeCrear, onCreado }: NuevoPresupuestoDialogProps) {
  const t = useTranslations('finanzasReportesR2.presupuestos');
  const [nombre, setNombre] = useState('');
  const [anio, setAnio] = useState(String(anioInicial));
  const [origen, setOrigen] = useState<string>(VACIO);
  const [errores, setErrores] = useState<{ nombre?: string; anio?: string }>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setNombre(copiarDe ? t('nuevoDialogo.copiaDe', { nombre: copiarDe.name }) : '');
    setAnio(String(copiarDe?.fiscal_year ?? anioInicial));
    setOrigen(copiarDe ? copiarDe.id : VACIO);
    setErrores({});
  }, [abierto, copiarDe, anioInicial, t]);

  const crear = async () => {
    const anioNum = Number(anio);
    const nuevos: typeof errores = {};
    if (!nombre.trim()) nuevos.nombre = t('nuevoDialogo.nombreObligatorio');
    if (!Number.isInteger(anioNum) || anioNum < 2000 || anioNum > 2100) nuevos.anio = t('nuevoDialogo.anioInvalido');
    setErrores(nuevos);
    if (nuevos.nombre || nuevos.anio) return;
    setGuardando(true);
    try {
      const copia = origen !== VACIO && origen !== REAL;
      const creado = await BudgetService.create({
        name: nombre.trim(),
        fiscal_year: anioNum,
        origen: copia ? 'copia' : 'vacio',
        copiar_de: copia ? origen : null,
      });
      toast.success(t('toast.creado'));
      onAbiertoChange(false);
      onCreado(creado);
    } catch (e) {
      const codigo = e instanceof ErrorPresupuesto ? e.codigo : 'error';
      if (codigo === 'nombre_repetido') setErrores({ nombre: t('error.nombre_repetido') });
      else toast.error(t.has(`error.${codigo}`) ? t(`error.${codigo}`) : t('error.error'));
    } finally {
      setGuardando(false);
    }
  };

  const ayuda = origen === VACIO ? t('nuevoDialogo.ayuda.vacio') : t('nuevoDialogo.ayuda.copia');

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={copiarDe ? t('menu.copiar') : t('nuevoDialogo.titulo')}
      descripcion={t('nuevoDialogo.descripcion')}
      ancho={520}
      primario={{
        etiqueta: t('nuevoDialogo.crear'),
        onClick: () => void crear(),
        cargando: guardando,
        deshabilitada: !puedeCrear,
        motivo: puedeCrear ? undefined : t('nuevoDialogo.sinPermiso'),
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('nuevoDialogo.nombre')} obligatorio error={errores.nombre}>
          <Input
            value={nombre}
            maxLength={120}
            placeholder={t('nuevoDialogo.nombrePlaceholder', { anio })}
            onChange={(e) => setNombre(e.target.value)}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('nuevoDialogo.anio')} obligatorio error={errores.anio}>
            <Input type="number" inputMode="numeric" min={2000} max={2100} value={anio} onChange={(e) => setAnio(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('nuevoDialogo.desde')}>
            {(campo) => (
              <Select value={origen} onValueChange={setOrigen}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={VACIO}>{t('nuevoDialogo.origen.vacio')}</SelectItem>
                  {presupuestos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {t('nuevoDialogo.origen.copia', { nombre: p.name, anio: p.fiscal_year })}
                    </SelectItem>
                  ))}
                  <SelectItem value={REAL} disabled>
                    {t('nuevoDialogo.origen.realAnterior')}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
        <p className="text-xs text-fg-muted">{ayuda}</p>
        <p className="text-xs text-fg-muted">
          <span className="font-medium text-fg-secondary">{t('nuevoDialogo.origen.realAnterior')}:</span> {t('nuevoDialogo.realNoDisponible')}
        </p>
      </div>
    </Dialogo>
  );
}
