import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Mail, 
  Eye, 
  MousePointer, 
  TrendingUp,
  Users,
  CheckCircle 
} from 'lucide-react';
import { CampaignKPIData } from './types';

interface CampaignKPIsProps {
  data: CampaignKPIData;
  className?: string;
}

const CampaignKPIs: React.FC<CampaignKPIsProps> = ({ data, className = '' }) => {
  const kpis = [
    {
      title: 'Total Envíos',
      value: data.total_sent.toLocaleString(),
      icon: Mail,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20'
    },
    {
      title: 'Entregados',
      value: data.delivered.toLocaleString(),
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20'
    },
    {
      title: 'Aperturas',
      value: data.opened.toLocaleString(),
      icon: Eye,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20'
    },
    {
      title: 'Clics',
      value: data.clicked.toLocaleString(),
      icon: MousePointer,
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20'
    }
  ];

  const rates = [
    {
      title: 'Open Rate',
      value: `${data.open_rate}%`,
      color: data.open_rate >= 20 ? 'text-green-600' : data.open_rate >= 10 ? 'text-yellow-600' : 'text-red-600'
    },
    {
      title: 'Click Rate',
      value: `${data.click_rate}%`,
      color: data.click_rate >= 3 ? 'text-green-600' : data.click_rate >= 1 ? 'text-yellow-600' : 'text-red-600'
    },
    {
      title: 'Conversión',
      value: `${data.conversion_rate}%`,
      color: data.conversion_rate >= 5 ? 'text-green-600' : data.conversion_rate >= 2 ? 'text-yellow-600' : 'text-red-600'
    }
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => {
          const IconComponent = kpi.icon;
          return (
            <Card key={index} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                    <IconComponent className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {kpi.title}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {kpi.value}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tasas de Rendimiento */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
            Tasas de Rendimiento
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {rates.map((rate, index) => (
              <div key={index} className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {rate.title}
                </p>
                <p className={`text-xl font-bold ${rate.color} dark:${rate.color.replace('text-', 'text-')}`}>
                  {rate.value}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignKPIs;
