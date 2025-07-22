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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total de clientes</CardDescription>
          <CardTitle>{totalCustomers}</CardTitle>
        </CardHeader>
        <CardContent>
          <Users className="h-5 w-5 text-blue-500" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Oportunidades activas</CardDescription>
          <CardTitle>
            {activeOpportunities}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Briefcase className="h-5 w-5 text-amber-500" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Oportunidades ganadas</CardDescription>
          <CardTitle>
            {wonOpportunities}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Briefcase className="h-5 w-5 text-green-500" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Valor total</CardDescription>
          <CardTitle>
            {formatCurrency(totalValue)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Briefcase className="h-5 w-5 text-blue-500" />
        </CardContent>
      </Card>
    </div>
  );
}
