'use client';

import React from 'react';
import { 
  CreditCard, 
  Clock, 
  MoreVertical, 
  Edit, 
  Copy, 
  ToggleLeft, 
  ToggleRight,
  Building2,
  Shield,
  CalendarClock
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn, formatCurrency } from '@/utils/Utils';
import { MembershipPlan } from '@/lib/services/gymService';
import { AccessRules } from './AccessRulesEditor';

interface PlanCardProps {
  plan: MembershipPlan;
  onEdit: (plan: MembershipPlan) => void;
  onDuplicate: (plan: MembershipPlan) => void;
  onToggleStatus: (plan: MembershipPlan) => void;
}

export function PlanCard({ plan, onEdit, onDuplicate, onToggleStatus }: PlanCardProps) {
  const formatDuration = (days: number): string => {
    if (days === 1) return '1 día';
    if (days === 7) return '1 semana';
    if (days === 14) return '2 semanas';
    if (days === 30 || days === 31) return '1 mes';
    if (days === 60 || days === 62) return '2 meses';
    if (days === 90 || days === 93) return '3 meses';
    if (days === 180 || days === 186) return '6 meses';
    if (days === 365 || days === 366) return '1 año';
    return `${days} días`;
  };

  return (
    <Card className={cn(
      "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 transition-all hover:shadow-md",
      !plan.is_active && "opacity-60"
    )}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              plan.is_active 
                ? "bg-blue-100 dark:bg-blue-900/30" 
                : "bg-gray-100 dark:bg-gray-700"
            )}>
              <CreditCard className={cn(
                "h-5 w-5",
                plan.is_active 
                  ? "text-blue-600 dark:text-blue-400" 
                  : "text-gray-500 dark:text-gray-400"
              )} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {plan.name}
              </h3>
              <Badge className={cn(
                plan.is_active
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              )}>
                {plan.is_active ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(plan)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(plan)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleStatus(plan)}>
                {plan.is_active ? (
                  <>
                    <ToggleLeft className="h-4 w-4 mr-2" />
                    Desactivar
                  </>
                ) : (
                  <>
                    <ToggleRight className="h-4 w-4 mr-2" />
                    Activar
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {plan.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">
            {plan.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Clock className="h-4 w-4" />
            <span className="text-sm">{formatDuration(plan.duration_days)}</span>
          </div>
          
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(plan.price)}
          </p>
        </div>

        {/* Reglas de acceso */}
        {plan.access_rules && Object.keys(plan.access_rules).length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <TooltipProvider>
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const rules = plan.access_rules as AccessRules;
                  const badges = [];
                  
                  if (rules.all_branches === false && rules.allowed_branches?.length > 0) {
                    badges.push(
                      <Tooltip key="branches">
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {rules.allowed_branches.length} sede{rules.allowed_branches.length > 1 ? 's' : ''}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Acceso restringido a sedes específicas</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  
                  if (rules.schedule_enabled) {
                    badges.push(
                      <Tooltip key="schedule">
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            Horarios
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Restricción de horarios activa</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  
                  if (rules.max_daily_checkins) {
                    badges.push(
                      <Tooltip key="checkins">
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            {rules.max_daily_checkins}/día
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Máximo {rules.max_daily_checkins} check-ins por día</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  
                  return badges.length > 0 ? badges : (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Acceso sin restricciones
                    </span>
                  );
                })()}
              </div>
            </TooltipProvider>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PlanCard;
