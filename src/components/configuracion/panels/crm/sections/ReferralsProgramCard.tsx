'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Save, RefreshCw, Users, Gift, Award } from 'lucide-react';
import {
  referralsService,
  type ReferralProgramConfig,
  type Referral,
} from '@/lib/services/crm/referralsService';

const DEFAULT_CONFIG: ReferralProgramConfig = {
  enabled: false,
  incentive_type: 'discount',
  incentive_value: 10,
  incentive_description: '10% de descuento en la próxima compra',
  eligibility: {
    min_purchase: 0,
    valid_for_days: 90,
    new_customers_only: true,
  },
  reward_to: 'both',
  reward_description: 'Beneficio para referente y referido',
};

const STATUS_LABELS: Record<Referral['estado'], string> = {
  pending: 'Pendiente',
  completed: 'Completado',
  rewarded: 'Recompensado',
  cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<Referral['estado'], string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  rewarded: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export function ReferralsProgramCard() {
  const { toast } = useToast();

  const [config, setConfig] = useState<ReferralProgramConfig>(DEFAULT_CONFIG);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [programConfig, referralsList] = await Promise.all([
        referralsService.getReferralProgram(),
        referralsService.listReferrals(),
      ]);
      if (programConfig) setConfig(programConfig);
      setReferrals(referralsList);
    } catch (error) {
      console.error('Error cargando programa de referidos:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el programa de referidos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await referralsService.saveReferralProgram(config);
      if (ok) {
        toast({
          title: 'Programa guardado',
          description: 'La configuración del programa de referidos se guardó correctamente',
        });
      } else {
        throw new Error('No se pudo guardar');
      }
    } catch (error) {
      console.error('Error guardando programa:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el programa de referidos',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: Referral['estado']) => {
    try {
      const ok = await referralsService.updateReferralStatus(id, status);
      if (ok) {
        toast({ title: 'Estado actualizado', description: `Referido marcado como: ${STATUS_LABELS[status]}` });
        loadData();
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo actualizar el estado', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Programa de Referidos
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Configura incentivos, elegibilidad y recompensas
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Configuración general */}
      <Card className="border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gift className="h-4 w-4 text-indigo-500" />
            Configuración General
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enabled */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ref-enabled">Programa activo</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Habilita o deshabilita el programa de referidos
              </p>
            </div>
            <Switch
              id="ref-enabled"
              checked={config.enabled}
              onCheckedChange={(checked) =>
                setConfig((prev) => ({ ...prev, enabled: checked }))
              }
            />
          </div>

          <Separator />

          {/* Incentivo */}
          <div className="space-y-3">
            <Label>Tipo de incentivo</Label>
            <Select
              value={config.incentive_type}
              onValueChange={(value) =>
                setConfig((prev) => ({
                  ...prev,
                  incentive_type: value as ReferralProgramConfig['incentive_type'],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discount">Descuento</SelectItem>
                <SelectItem value="cashback">Cashback</SelectItem>
                <SelectItem value="credit">Crédito</SelectItem>
                <SelectItem value="gift">Regalo</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label htmlFor="ref-value">Valor del incentivo</Label>
                <Input
                  id="ref-value"
                  type="number"
                  value={config.incentive_value}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      incentive_value: Number(e.target.value),
                    }))
                  }
                  min={0}
                  step={1}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="ref-desc">Descripción</Label>
                <Input
                  id="ref-desc"
                  value={config.incentive_description}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      incentive_description: e.target.value,
                    }))
                  }
                  placeholder="Ej: 10% de descuento"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Elegibilidad */}
          <div className="space-y-3">
            <Label>Elegibilidad</Label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label htmlFor="ref-min" className="text-xs">Compra mínima</Label>
                <Input
                  id="ref-min"
                  type="number"
                  value={config.eligibility.min_purchase || 0}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      eligibility: {
                        ...prev.eligibility,
                        min_purchase: Number(e.target.value),
                      },
                    }))
                  }
                  min={0}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="ref-days" className="text-xs">Válido por (días)</Label>
                <Input
                  id="ref-days"
                  type="number"
                  value={config.eligibility.valid_for_days || 90}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      eligibility: {
                        ...prev.eligibility,
                        valid_for_days: Number(e.target.value),
                      },
                    }))
                  }
                  min={1}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="ref-new" className="text-xs">Solo clientes nuevos</Label>
              <Switch
                id="ref-new"
                checked={config.eligibility.new_customers_only}
                onCheckedChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    eligibility: { ...prev.eligibility, new_customers_only: checked },
                  }))
                }
              />
            </div>
          </div>

          <Separator />

          {/* Recompensa */}
          <div className="space-y-3">
            <Label>Recompensa para</Label>
            <Select
              value={config.reward_to}
              onValueChange={(value) =>
                setConfig((prev) => ({
                  ...prev,
                  reward_to: value as ReferralProgramConfig['reward_to'],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="referrer">Solo referente</SelectItem>
                <SelectItem value="referred">Solo referido</SelectItem>
                <SelectItem value="both">Ambos</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Label htmlFor="ref-reward-desc" className="text-xs">Descripción de recompensa</Label>
              <Input
                id="ref-reward-desc"
                value={config.reward_description}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    reward_description: e.target.value,
                  }))
                }
                placeholder="Ej: Beneficio para referente y referido"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </Button>
        </CardContent>
      </Card>

      {/* Lista de referidos */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
            Referidos registrados ({referrals.length})
          </h4>
        </div>

        {referrals.length === 0 ? (
          <div className="text-center py-8 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
            <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay referidos registrados todavía.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {referrals.map((ref) => (
              <Card key={ref.id} className="border-gray-200 dark:border-gray-700">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {ref.referred_customer_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Referido por: {ref.origin_customer_name}
                      </p>
                      {ref.recompensa && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Recompensa: {ref.recompensa}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={STATUS_COLORS[ref.estado]}>
                        {STATUS_LABELS[ref.estado]}
                      </Badge>
                      <Select
                        value={ref.estado}
                        onValueChange={(value) =>
                          handleStatusChange(ref.id, value as Referral['estado'])
                        }
                      >
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="completed">Completado</SelectItem>
                          <SelectItem value="rewarded">Recompensado</SelectItem>
                          <SelectItem value="cancelled">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
