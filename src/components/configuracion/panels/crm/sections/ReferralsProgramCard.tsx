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
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  getReferralPrograms,
  createReferralProgram,
  updateReferralProgram,
  getReferrals,
  updateReferralStatus,
  type ReferralProgram,
  type Referral,
  type ReferralProgramInput,
} from '@/lib/services/crm/referralsService';

const STATUS_LABELS: Record<Referral['status'], string> = {
  pending: 'Pendiente',
  contacted: 'Contactado',
  qualified: 'Calificado',
  converted: 'Convertido',
  rejected: 'Rechazado',
};

const STATUS_COLORS: Record<Referral['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  contacted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  qualified: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  converted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export function ReferralsProgramCard() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const [program, setProgram] = useState<ReferralProgram | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('Programa de Referidos');
  const [description, setDescription] = useState('');
  const [rewardType, setRewardType] = useState('discount');
  const [rewardAmount, setRewardAmount] = useState(10);
  const [rewardTo, setRewardTo] = useState('both');
  const [isActive, setIsActive] = useState(false);

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [programs, referralsList] = await Promise.all([
        getReferralPrograms(organizationId, supabase),
        getReferrals(organizationId, supabase),
      ]);
      if (programs.length > 0) {
        setProgram(programs[0]);
        setName(programs[0].name);
        setDescription(programs[0].description || '');
        setRewardType(programs[0].reward_type);
        setRewardAmount(programs[0].reward_amount);
        setRewardTo(programs[0].reward_to);
        setIsActive(programs[0].is_active);
      }
      setReferrals(referralsList.data);
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
  }, [toast, organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      const data: ReferralProgramInput = {
        name,
        description: description || null,
        reward_type: rewardType,
        reward_amount: rewardAmount,
        reward_to: rewardTo,
        is_active: isActive,
      };

      if (program) {
        await updateReferralProgram(program.id, organizationId, data, supabase);
      } else {
        await createReferralProgram(organizationId, data, supabase);
      }

      toast({
        title: 'Programa guardado',
        description: 'La configuración del programa de referidos se guardó correctamente',
      });
      loadData();
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

  const handleStatusChange = async (id: string, status: Referral['status']) => {
    if (!organizationId) return;
    try {
      await updateReferralStatus(id, organizationId, status, supabase);
      toast({ title: 'Estado actualizado', description: `Referido marcado como: ${STATUS_LABELS[status]}` });
      loadData();
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
          {/* Activo */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ref-enabled">Programa activo</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Habilita o deshabilita el programa de referidos
              </p>
            </div>
            <Switch
              id="ref-enabled"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          <Separator />

          {/* Nombre y descripción */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="ref-name">Nombre del programa</Label>
              <Input
                id="ref-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Programa de Referidos Premium"
              />
            </div>
            <div>
              <Label htmlFor="ref-desc">Descripción</Label>
              <Input
                id="ref-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: 10% de descuento para referente y referido"
              />
            </div>
          </div>

          <Separator />

          {/* Recompensa */}
          <div className="space-y-3">
            <Label>Tipo de recompensa</Label>
            <Select value={rewardType} onValueChange={setRewardType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Crédito</SelectItem>
                <SelectItem value="discount">Descuento</SelectItem>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="gift">Regalo</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label htmlFor="ref-amount">Valor de la recompensa</Label>
                <Input
                  id="ref-amount"
                  type="number"
                  value={rewardAmount}
                  onChange={(e) => setRewardAmount(Number(e.target.value))}
                  min={0}
                  step={1}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Recompensa para */}
          <div className="space-y-3">
            <Label>Recompensa para</Label>
            <Select value={rewardTo} onValueChange={setRewardTo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="referrer">Solo referente</SelectItem>
                <SelectItem value="referred">Solo referido</SelectItem>
                <SelectItem value="both">Ambos</SelectItem>
              </SelectContent>
            </Select>
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
                        {ref.referred_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Referido por: {ref.referrer_customer_id}
                      </p>
                      {ref.reward_paid && (
                        <p className="text-xs text-green-600 mt-0.5">
                          Recompensa pagada
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={STATUS_COLORS[ref.status]}>
                        {STATUS_LABELS[ref.status]}
                      </Badge>
                      <Select
                        value={ref.status}
                        onValueChange={(value) =>
                          handleStatusChange(ref.id, value as Referral['status'])
                        }
                      >
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendiente</SelectItem>
                          <SelectItem value="contacted">Contactado</SelectItem>
                          <SelectItem value="qualified">Calificado</SelectItem>
                          <SelectItem value="converted">Convertido</SelectItem>
                          <SelectItem value="rejected">Rechazado</SelectItem>
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
