"use client";

import { Customer } from "../types";
import { formatCurrency } from "@/utils/Utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Users, Briefcase } from "lucide-react";

interface CustomerStatsProps {
  customers: Customer[];
}

export default function CustomerStats({ customers }: CustomerStatsProps) {
  // Cálculo de estadísticas resumidas
  const totalCustomers = customers.length;
  const activeOpportunities = customers.reduce((sum, c) => sum + c.active_opportunities, 0);
  const wonOpportunities = customers.reduce((sum, c) => sum + c.won_opportunities, 0);
  const totalValue = customers.reduce((sum, c) => sum + c.total_value, 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <CardDescription className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">Total de clientes</CardDescription>
          <CardTitle className="text-gray-900 dark:text-gray-100 text-xl sm:text-2xl">{totalCustomers}</CardTitle>
        </CardHeader>
        <CardContent>
          <Users className="h-5 w-5 text-blue-500 dark:text-blue-400" />
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <CardDescription className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">Oportunidades activas</CardDescription>
          <CardTitle className="text-gray-900 dark:text-gray-100 text-xl sm:text-2xl">
            {activeOpportunities}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Briefcase className="h-5 w-5 text-amber-500 dark:text-amber-400" />
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <CardDescription className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">Oportunidades ganadas</CardDescription>
          <CardTitle className="text-gray-900 dark:text-gray-100 text-xl sm:text-2xl">
            {wonOpportunities}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Briefcase className="h-5 w-5 text-green-500 dark:text-green-400" />
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <CardDescription className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm">Valor total</CardDescription>
          <CardTitle className="text-gray-900 dark:text-gray-100 text-xl sm:text-2xl">
            {formatCurrency(totalValue)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Briefcase className="h-5 w-5 text-blue-500 dark:text-blue-400" />
        </CardContent>
      </Card>
    </div>
  );
}
