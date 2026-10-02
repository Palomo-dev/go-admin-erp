'use client';
import {useTranslations,useFormatter} from 'next-intl';
import {StatCard} from '@/components/kit';
import {StaggerItem} from '@/components/shared/motion';
import {TriangleAlert,ArrowUp} from 'lucide-react';
import type {ObjectionInsights} from '@/lib/services/crm/objectionInsightsService';
import {librarySummary,type LibraryRow} from './objectionLibraryModel';
export function ObjectionStats({rows,insights,loading}:{rows:LibraryRow[];insights:ObjectionInsights|null;loading:boolean}){
 const t=useTranslations('crm.objecionesNuevo'),format=useFormatter(),summary=librarySummary(rows,insights);
 const category=summary.frequent?.category;
 const name=summary.frequent?(category?(t.has(`categories.${category}`)?t(`categories.${category}`):category):t('noCategory')):t('visual.noneFrequent');
 return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
  <StaggerItem><StatCard etiqueta={t('visual.libraryCount')} valor={format.number(summary.count)} detalle={t('visual.categoriesCount',{count:summary.categories})} cargando={loading} varianteCarga="compacta"/></StaggerItem>
  <StaggerItem><StatCard etiqueta={t('visual.detectedCount')} valor={summary.callCount===null?'—':format.number(summary.callCount)} detalle={t('visual.detectionHint')} cargando={loading} varianteCarga="compacta"/></StaggerItem>
  <StaggerItem><StatCard etiqueta={t('visual.mostFrequent')} valor={insights?name:'—'} cargando={loading} varianteCarga="compacta" tono="advertencia" iconoDetalle={TriangleAlert}
   detalle={summary.frequent?t('visual.frequencyDetail',{count:summary.frequent.calls!,share:summary.frequent.share===null?'—':format.number(summary.frequent.share,{style:'percent',maximumFractionDigits:0})}):undefined}/></StaggerItem>
  <StaggerItem><StatCard etiqueta={t('visual.advancedPercent')} valor={summary.advancedRate===null?'—':format.number(summary.advancedRate,{style:'percent',maximumFractionDigits:0})}
   detalle={t('visual.advancedHint')} cargando={loading} varianteCarga="compacta" tono="exito" iconoDetalle={ArrowUp}/></StaggerItem>
 </div>;
}
