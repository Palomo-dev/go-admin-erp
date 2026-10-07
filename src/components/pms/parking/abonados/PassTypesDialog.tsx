'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Edit, Trash2 } from 'lucide-react';
import ParkingService, { type ParkingPassType } from '@/lib/services/parkingService';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useTranslations } from 'next-intl';

interface PassTypesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passTypes: ParkingPassType[];
  organizationId: number;
  onUpdate: () => void;
}

export function PassTypesDialog({ 
  open, 
  onOpenChange, 
  passTypes, 
  organizationId,
  onUpdate 
}: PassTypesDialogProps) {
  const t = useTranslations('pmsParking');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<ParkingPassType | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [price, setPrice] = useState('');
  const [maxEntriesPerDay, setMaxEntriesPerDay] = useState('');
  const [includesCarWash, setIncludesCarWash] = useState(false);
  const [includesValet, setIncludesValet] = useState(false);

  const resetForm = () => {
    setName('');
    setDescription('');
    setDurationDays('30');
    setPrice('');
    setMaxEntriesPerDay('');
    setIncludesCarWash(false);
    setIncludesValet(false);
    setEditingType(null);
    setShowForm(false);
  };

  const handleEdit = (type: ParkingPassType) => {
    setEditingType(type);
    setName(type.name);
    setDescription(type.description || '');
    setDurationDays(type.duration_days.toString());
    setPrice(type.price.toString());
    setMaxEntriesPerDay(type.max_entries_per_day?.toString() || '');
    setIncludesCarWash(type.includes_car_wash);
    setIncludesValet(type.includes_valet);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !price) return;

    setIsSubmitting(true);
    try {
      const data = {
        organization_id: organizationId,
        name: name.trim(),
        description: description.trim() || undefined,
        duration_days: parseInt(durationDays),
        price: parseFloat(price),
        max_entries_per_day: maxEntriesPerDay ? parseInt(maxEntriesPerDay) : undefined,
        includes_car_wash: includesCarWash,
        includes_valet: includesValet,
        allowed_vehicle_types: ['car', 'motorcycle'],
      };

      if (editingType) {
        await ParkingService.updatePassType(editingType.id, data);
      } else {
        await ParkingService.createPassType(data);
      }

      onUpdate();
      resetForm();
    } catch (error) {
      console.error('Error guardando tipo de pase:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (typeId: string) => {
    if (!confirm(t('passTypesDialog.estaSeguroEliminarEste'))) return;

    try {
      await ParkingService.deletePassType(typeId);
      onUpdate();
    } catch (error) {
      console.error('Error eliminando tipo de pase:', error);
    }
  };

  // Moneda base de la organización (la reserva/abono no tiene moneda propia).
  const { formatear: formatCurrency } = useMonedaOrganizacion();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('passTypesDialog.tiposPlanAbonado')}</DialogTitle>
          <DialogDescription>
            {t('passTypesDialog.gestionaTiposPlanesDisponibles')}
          </DialogDescription>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">
            <Button
              onClick={() => setShowForm(true)}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('passTypesDialog.nuevoTipoPlan')}
            </Button>

            {passTypes.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {t('passTypesDialog.noHayTiposPlan')}
              </div>
            ) : (
              <div className="space-y-2">
                {passTypes.map((type) => (
                  <div
                    key={type.id}
                    className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                          {type.name}
                        </h4>
                        {type.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {type.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="outline">
                            {t('passTypesDialog.dias', { duration_days: type.duration_days })}
                          </Badge>
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            {formatCurrency(type.price)}
                          </Badge>
                          {type.includes_car_wash && (
                            <Badge variant="secondary">{t('passTypesDialog.lavado')}</Badge>
                          )}
                          {type.includes_valet && (
                            <Badge variant="secondary">{t('passTypesDialog.valet')}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(type)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(type.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="type_name">{t('passTypesDialog.nombrePlan')}</Label>
              <Input
                id="type_name"
                placeholder={t('passTypesDialog.ejMensualTrimestralAnual')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type_description">{t('passTypesDialog.descripcion')}</Label>
              <Input
                id="type_description"
                placeholder={t('passTypesDialog.descripcionOpcionalPlan')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration_days">{t('passTypesDialog.duracionDias')}</Label>
                <Input
                  id="duration_days"
                  type="number"
                  min="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type_price">{t('passTypesDialog.precio')}</Label>
                <Input
                  id="type_price"
                  type="number"
                  min="0"
                  step="100"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_entries">{t('passTypesDialog.maxEntradasDiaOpcional')}</Label>
              <Input
                id="max_entries"
                type="number"
                min="1"
                placeholder={t('passTypesDialog.sinLimite')}
                value={maxEntriesPerDay}
                onChange={(e) => setMaxEntriesPerDay(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              <Label>{t('passTypesDialog.beneficiosIncluidos')}</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="car_wash"
                  checked={includesCarWash}
                  onCheckedChange={(checked) => setIncludesCarWash(checked as boolean)}
                />
                <Label htmlFor="car_wash" className="font-normal">
                  {t('passTypesDialog.incluyeLavadoVehiculo')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="valet"
                  checked={includesValet}
                  onCheckedChange={(checked) => setIncludesValet(checked as boolean)}
                />
                <Label htmlFor="valet" className="font-normal">
                  {t('passTypesDialog.incluyeServicioValet')}
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                {t('passVehiclesDialog.cancelar')}
              </Button>
              <Button type="submit" disabled={isSubmitting || !name.trim() || !price}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('passFormDialog.guardando')}
                  </>
                ) : (
                  editingType ? t('passDialog.guardarCambios') : t('passFormDialog.crearPlan')
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
