'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign, Edit2, Save, X } from 'lucide-react';
import { IncidentWithDetails } from '@/lib/services/incidentsService';

interface IncidentCostsProps {
  incident: IncidentWithDetails;
  onUpdateCosts: (costs: { estimated_cost?: number; actual_cost?: number }) => Promise<void>;
}

export function IncidentCosts({ incident, onUpdateCosts }: IncidentCostsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState(incident.estimated_cost || 0);
  const [actualCost, setActualCost] = useState(incident.actual_cost || 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: incident.currency || 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateCosts({
        estimated_cost: estimatedCost,
        actual_cost: actualCost,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEstimatedCost(incident.estimated_cost || 0);
    setActualCost(incident.actual_cost || 0);
    setIsEditing(false);
  };

  const difference = actualCost - estimatedCost;
  const percentDiff = estimatedCost > 0 ? ((difference / estimatedCost) * 100).toFixed(1) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-blue-600" />
          Costos del Incidente
        </CardTitle>
        {!isEditing ? (
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
            <Edit2 className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="estimated_cost">Costo Estimado</Label>
                <Input
                  id="estimated_cost"
                  type="number"
                  value={estimatedCost}
                  onChange={(e) => setEstimatedCost(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="actual_cost">Costo Real</Label>
                <Input
                  id="actual_cost"
                  type="number"
                  value={actualCost}
                  onChange={(e) => setActualCost(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Costo Estimado */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Costo Estimado</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(incident.estimated_cost || 0)}
              </p>
            </div>

            {/* Costo Real */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Costo Real</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(incident.actual_cost || 0)}
              </p>
            </div>

            {/* Diferencia */}
            <div className={`rounded-lg p-4 ${
              difference > 0 
                ? 'bg-red-50 dark:bg-red-900/20' 
                : difference < 0 
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-gray-50 dark:bg-gray-800/50'
            }`}>
              <p className="text-sm text-gray-500 dark:text-gray-400">Diferencia</p>
              <p className={`text-2xl font-bold ${
                difference > 0 
                  ? 'text-red-600 dark:text-red-400' 
                  : difference < 0 
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-600 dark:text-gray-400'
              }`}>
                {difference > 0 ? '+' : ''}{formatCurrency(difference)}
              </p>
              {estimatedCost > 0 && (
                <p className={`text-xs ${
                  difference > 0 ? 'text-red-500' : difference < 0 ? 'text-green-500' : 'text-gray-500'
                }`}>
                  {difference > 0 ? '+' : ''}{percentDiff}% vs estimado
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
