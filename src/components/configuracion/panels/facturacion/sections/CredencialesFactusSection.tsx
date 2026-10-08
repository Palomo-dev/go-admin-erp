'use client';

/**
 * Servicio de facturación electrónica en la configuración de la organización.
 *
 * Antes era un formulario de credenciales de Factus que las guardaba en texto
 * plano desde el navegador. GO Admin presta el servicio: las credenciales las
 * carga el equipo de la plataforma y el cliente solo ve el estado. El detalle
 * (resolución, rangos, cola, documentos retenidos) está en
 * Configuración › Facturación electrónica › Servicio (antes
 * /app/finanzas/facturacion-electronica/configuracion, que redirige allí).
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { EstadoFacturacionElectronica } from '@/lib/services/electronicInvoicingConfigService';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';

interface CredencialesFactusSectionProps {
  servicio: EstadoFacturacionElectronica | null;
  cargando: boolean;
  eInvoiceAlwaysEnabled: boolean;
  savingEInvoiceToggle: boolean;
  loadingEInvoicePref: boolean;
  onEInvoiceToggle: (checked: boolean) => void;
}

export function CredencialesFactusSection({
  servicio,
  cargando,
  eInvoiceAlwaysEnabled,
  savingEInvoiceToggle,
  loadingEInvoicePref,
  onEInvoiceToggle,
}: CredencialesFactusSectionProps) {
  const t = useTranslations('facturacionElectronica.configuracion');
  const estado = servicio?.status ?? 'pending_activation';
  const tono = estado === 'active' ? 'exito' : estado === 'suspended' ? 'peligro' : 'advertencia';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand" aria-hidden />
          {t('servicio.titulo')}
        </CardTitle>
        <CardDescription>{t('servicio.descripcion')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cargando ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tono={tono} apariencia="suave" punto>
              {t(`servicio.estados.${estado}` as never)}
            </Badge>
            {servicio?.environment && (
              <span className="text-sm text-fg-secondary">{t(`servicio.ambientes.${servicio.environment}` as never)}</span>
            )}
          </div>
        )}
        {!cargando && estado !== 'active' && (
          <p className="text-sm text-fg-secondary">
            {estado === 'suspended' ? t('servicio.ayudaSuspendido') : t('servicio.ayudaPendiente')}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-brand-tint p-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 flex-shrink-0 text-brand" aria-hidden />
            <div>
              <Label htmlFor="fe-siempre" className="text-sm font-medium">{t('panel.siempreElectronica')}</Label>
              <p className="mt-0.5 text-xs text-fg-secondary">{t('panel.siempreElectronicaAyuda')}</p>
            </div>
          </div>
          <Switch
            id="fe-siempre"
            checked={eInvoiceAlwaysEnabled}
            disabled={savingEInvoiceToggle || loadingEInvoicePref}
            onCheckedChange={onEInvoiceToggle}
          />
        </div>

        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href={rutaSeccion('facturacion.servicio')}>
            {t('panel.verDetalle')}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
