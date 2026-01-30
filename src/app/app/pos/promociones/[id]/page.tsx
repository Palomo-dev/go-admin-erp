'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Edit, 
  Copy, 
  Trash2, 
  Calendar, 
  Tag,
  RefreshCw,
  Percent,
  Gift,
  DollarSign,
  Package,
  CheckCircle,
  XCircle,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PromotionsService } from '@/components/pos/promociones/promotionsService';
import { PromotionWizard } from '@/components/pos/promociones/nuevo';
import { Promotion, PROMOTION_TYPE_LABELS, APPLIES_TO_LABELS } from '@/components/pos/promociones/types';
import { formatCurrency, cn } from '@/utils/Utils';
import { toast } from 'sonner';

export default function PromocionDetallePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: orgLoading } = useOrganization();
  
  const promotionId = params.id as string;
  const isEditMode = searchParams.get('edit') === 'true';
  
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [toggling, setToggling] = useState(false);

  const loadPromotion = useCallback(async () => {
    if (!promotionId) return;
    
    setLoading(true);
    try {
      const data = await PromotionsService.getById(promotionId);
      setPromotion(data);
    } catch (error: any) {
      console.error('Error loading promotion:', error);
      toast.error('Error al cargar la promoción');
    } finally {
      setLoading(false);
    }
  }, [promotionId]);

  useEffect(() => {
    loadPromotion();
  }, [loadPromotion]);

  const handleDelete = async () => {
    try {
      await PromotionsService.delete(promotionId);
      toast.success('Promoción eliminada correctamente');
      router.push('/app/pos/promociones');
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar la promoción');
    }
  };

  const handleDuplicate = async () => {
    try {
      await PromotionsService.duplicate(promotionId);
      toast.success('Promoción duplicada correctamente');
      router.push('/app/pos/promociones');
    } catch (error: any) {
      toast.error(error.message || 'Error al duplicar la promoción');
    }
  };

  const handleToggleActive = async () => {
    if (!promotion) return;
    setToggling(true);
    try {
      await PromotionsService.toggleActive(promotionId);
      toast.success(promotion.is_active ? 'Promoción desactivada' : 'Promoción activada');
      loadPromotion();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
    } finally {
      setToggling(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'percentage': return <Percent className="h-5 w-5" />;
      case 'fixed': return <DollarSign className="h-5 w-5" />;
      case 'buy_x_get_y': return <Gift className="h-5 w-5" />;
      case 'bundle': return <Package className="h-5 w-5" />;
      default: return <Tag className="h-5 w-5" />;
    }
  };

  const getDiscountDisplay = (promo: Promotion) => {
    switch (promo.promotion_type) {
      case 'percentage':
        return `${promo.discount_value}%`;
      case 'fixed':
        return formatCurrency(promo.discount_value || 0);
      case 'buy_x_get_y':
        return `Compra ${promo.buy_quantity}, Lleva ${promo.get_quantity}`;
      case 'bundle':
        return formatCurrency(promo.discount_value || 0);
      default:
        return '-';
    }
  };

  const getStatusBadge = (promo: Promotion) => {
    const now = new Date();
    const startDate = new Date(promo.start_date);
    const endDate = promo.end_date ? new Date(promo.end_date) : null;

    if (!promo.is_active) {
      return <Badge variant="secondary">Inactiva</Badge>;
    }
    if (startDate > now) {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Programada</Badge>;
    }
    if (endDate && endDate < now) {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Expirada</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Activa</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  if (orgLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!promotion) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
        <div className="max-w-4xl mx-auto text-center py-12">
          <Tag className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold dark:text-white mb-2">Promoción no encontrada</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            La promoción que buscas no existe o fue eliminada.
          </p>
          <Link href="/app/pos/promociones">
            <Button>Volver a Promociones</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isEditMode) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <PromotionWizard 
            promotionId={promotionId}
            initialData={{
              name: promotion.name,
              description: promotion.description,
              promotion_type: promotion.promotion_type,
              discount_value: promotion.discount_value,
              buy_quantity: promotion.buy_quantity,
              get_quantity: promotion.get_quantity,
              min_purchase_amount: promotion.min_purchase_amount,
              max_discount_amount: promotion.max_discount_amount,
              applies_to: promotion.applies_to,
              start_date: promotion.start_date,
              end_date: promotion.end_date,
              is_active: promotion.is_active,
              usage_limit: promotion.usage_limit,
              is_combinable: promotion.is_combinable,
              priority: promotion.priority,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <Link href="/app/pos/promociones">
                  <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </Link>
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  {getTypeIcon(promotion.promotion_type)}
                </div>
                <div>
                  <CardTitle className="dark:text-white flex items-center gap-2">
                    {promotion.name}
                    {getStatusBadge(promotion)}
                  </CardTitle>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {PROMOTION_TYPE_LABELS[promotion.promotion_type]}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/app/pos/promociones/${promotionId}?edit=true`}>
                  <Button variant="outline" size="sm" className="dark:bg-gray-700 dark:border-gray-600">
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={handleDuplicate} className="dark:bg-gray-700 dark:border-gray-600">
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicar
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-600 dark:text-red-400 dark:bg-gray-700 dark:border-gray-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Información Principal */}
          <Card className="md:col-span-2 dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Detalles de la Promoción</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {promotion.description && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Descripción</h4>
                  <p className="text-gray-900 dark:text-white">{promotion.description}</p>
                </div>
              )}

              <Separator className="dark:bg-gray-700" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Descuento</h4>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {getDiscountDisplay(promotion)}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Aplica a</h4>
                  <p className="dark:text-white">{APPLIES_TO_LABELS[promotion.applies_to]}</p>
                </div>
              </div>

              <Separator className="dark:bg-gray-700" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha Inicio</h4>
                  <p className="dark:text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatDate(promotion.start_date)}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha Fin</h4>
                  <p className="dark:text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {promotion.end_date ? formatDate(promotion.end_date) : 'Sin fecha fin'}
                  </p>
                </div>
              </div>

              {promotion.min_purchase_amount && (
                <>
                  <Separator className="dark:bg-gray-700" />
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Compra Mínima</h4>
                    <p className="dark:text-white">{formatCurrency(promotion.min_purchase_amount)}</p>
                  </div>
                </>
              )}

              {promotion.max_discount_amount && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Descuento Máximo</h4>
                  <p className="dark:text-white">{formatCurrency(promotion.max_discount_amount)}</p>
                </div>
              )}

              {/* Reglas */}
              {promotion.rules && promotion.rules.length > 0 && (
                <>
                  <Separator className="dark:bg-gray-700" />
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Reglas Aplicadas</h4>
                    <div className="space-y-2">
                      {promotion.rules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-2 p-2 rounded bg-gray-50 dark:bg-gray-700">
                          <Badge variant={rule.rule_type === 'include' ? 'default' : 'destructive'}>
                            {rule.rule_type === 'include' ? 'Incluye' : 'Excluye'}
                          </Badge>
                          {rule.product && <span className="dark:text-white">{rule.product.name}</span>}
                          {rule.category && <span className="dark:text-white">{rule.category.name}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Panel Lateral */}
          <div className="space-y-6">
            {/* Estado */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg dark:text-white">Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {promotion.is_active ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-gray-400" />
                    )}
                    <span className="dark:text-white">
                      {promotion.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  <Switch
                    checked={promotion.is_active}
                    onCheckedChange={handleToggleActive}
                    disabled={toggling}
                    className="data-[state=checked]:bg-green-600"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Estadísticas */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg dark:text-white">Estadísticas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Usos</span>
                  <span className="font-semibold dark:text-white">
                    {promotion.usage_count}
                    {promotion.usage_limit && (
                      <span className="text-gray-400">/{promotion.usage_limit}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Prioridad</span>
                  <Badge variant="outline">{promotion.priority}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Combinable</span>
                  <Badge variant={promotion.is_combinable ? 'default' : 'secondary'}>
                    {promotion.is_combinable ? 'Sí' : 'No'}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Info adicional */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>Creada: {formatDate(promotion.created_at)}</p>
                  <p>Actualizada: {formatDate(promotion.updated_at)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">¿Eliminar promoción?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. La promoción será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
