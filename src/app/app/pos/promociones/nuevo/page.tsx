'use client';

import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PageHeaderSkeleton, DetailSkeleton } from '@/components/common/PageSkeletons';
import { PageHeader } from '@/components/kit/PageHeader';
import { PromotionWizard } from '@/components/pos/promociones/nuevo';

export default function NuevaPromocionPage() {
  const t = useTranslations('posPromociones');
  const { isLoading: orgLoading } = useOrganization();

  if (orgLoading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
        <PageHeaderSkeleton />
        <DetailSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <PageHeader
          variante="form"
          titulo={t('pantalla.nueva')}
          volverA="/app/pos/promociones"
          migas={[
            { etiqueta: t('pantalla.migasPos'), href: '/app/pos' },
            { etiqueta: t('pantalla.titulo'), href: '/app/pos/promociones' },
            { etiqueta: t('pantalla.nueva') },
          ]}
        />
        <PromotionWizard />
      </div>
    </div>
  );
}
