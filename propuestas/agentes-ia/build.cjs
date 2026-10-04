/** Renderizador aislado. Usa el kit del repositorio; bloquea cualquier backend. */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const raiz = path.resolve(__dirname, '../..');
const dist = path.join(__dirname, 'dist');
const fixtures = {
  link: `import React from 'react';export default function Link({href,children,onClick,...p}){return <a href="#" {...p} onClick={e=>{e.preventDefault();onClick?.(e);window.dispatchEvent(new CustomEvent('propuesta-relacion',{detail:{ruta:typeof href==='string'?href:'#'}}));}}>{children}</a>;}`,
  navigation: `const relacion=ruta=>window.dispatchEvent(new CustomEvent('propuesta-relacion',{detail:{ruta}}));export const useRouter=()=>({push:relacion,replace:relacion,refresh:()=>{},back:()=>relacion('/app/crm')});export const usePathname=()=>'/app/crm/agentes-ia';export const useSearchParams=()=>new URLSearchParams(location.search);export const useParams=()=>({});`,
  image: `import React from 'react';export default function Image({src,fill,priority,unoptimized,...p}){const segura=typeof src==='string'&&/^(data:|blob:)/.test(src)?src:undefined;return <img src={segura} {...p}/>;}`,
  imageUrls: `export const getAvatarUrl=()=>null;export const getOrganizationLogoUrl=()=>null;`,
  organization: `export const ORGANIZATION_CHANGED_EVENT='propuesta:organization';export const BRANCH_CHANGED_EVENT='propuesta:branch';export const getOrganizationId=()=>120;export const getCurrentBranchId=()=>1;export const invalidateBranchIdCache=()=>{};export const cambiarOrganizacionActiva=async()=>{};export const useOrganization=()=>({organization:{id:120,name:'Empresa de ejemplo'},organizationId:120,isLoading:false});`,
  branch: `export const ALL_BRANCHES='all';const branches=[{id:1,name:'Sucursal principal'}];export const useBranch=()=>({branches,selectedBranchId:1,isAllSelected:false,isLoading:false,branchFilter:1,canSelectAll:true,setSelectedBranch:()=>{}});export const useBranchOpcional=useBranch;`,
  plan: `const datos={plan:{nombre:'Ultimate',codigo:'ultimate',estado:'activo',diasPruebaRestantes:null,diasPruebaTotales:null,precio:null,moneda:'COP',periodo:'mensual',proximoCobro:null,cancelaAlFinal:false},uso:{usuarios:{actual:4,maximo:null},sucursales:{actual:1,maximo:null},creditosIa:{restantesPlan:7600,comprados:0,cupoMensual:10000,seRenuevan:null}}};export const usePlanSesion=()=>({datos,cargando:false,error:false,recargar:async()=>{}});`,
  orgs: `const organizaciones=[{id:120,nombre:'Empresa de ejemplo',rol:'Administración',plan:'Ultimate',estado:'activa',logoUrl:null}];export const useOrganizacionesUsuario=()=>({organizaciones,error:null,recargar:async()=>{}});`,
  capabilities: `export const useCapacidades=()=>({datos:{organization:{can_manage:true},branches:{can_manage:true}},cargando:false,navegacion:{}});`,
  notifications: `export const esAvisoDeMiembro=()=>false;export const useNotificacionesHeader=()=>({mias:[],todas:[],noLeidasMias:0,noLeidasTodas:0,cargando:false,pmActivo:false,recordatorios:[],cargandoTareas:false,pendientes:0,marcarLeida:async()=>{},marcarTodas:async()=>{},descartar:async()=>{},marcarNoLeida:async()=>{},refrescarTareas:()=>{}});`,
  timezone: `import{formatDateInTz,formatDateTimeInTz,formatTimeInTz,formatPlainDate}from'@/lib/utils/dateDisplay';export const useOrgTimezone=()=>({timezone:'America/Bogota',isLoading:false});export const useOrganizationTimezone=useOrgTimezone;export const useFormatDate=()=>({timezone:'America/Bogota',getToday:()=> '2026-10-04',formatDate:(v,o)=>formatDateInTz(v,'America/Bogota',o),formatDateTime:(v,o)=>formatDateTimeInTz(v,'America/Bogota',o),formatTime:(v,o)=>formatTimeInTz(v,'America/Bogota',o),formatPlain:(v)=>formatPlainDate(v)});`,
  empty: `export default function Component(){return null;}export const TrialBanner=()=>null;export const EmailVerificationBanner=()=>null;export const VistaRapidaTarea=()=>null;export const PhoneHeaderAction=()=>null;`,
  notificationDetail: `import{Info}from'lucide-react';export const NotificationDetailSheet=()=>null;export const getTypeIcon=()=>Info;`,
  feedback: `export const FeedbackButton=()=>null;export const ReportarProblemaDialog=()=>null;export const abrirReportarProblema=()=>{};`,
  sessionPanel: `import React from'react';export function PanelSesion({usuario,organizacion,onAlternarTema,onCerrar}){return <div className="space-y-3 p-4"><p className="text-sm font-semibold text-fg">{usuario?.name}</p><p className="text-[13px] text-fg-secondary">{organizacion}</p><button className="h-10 rounded-lg border border-line px-3 text-sm text-fg" onClick={onAlternarTema}>Cambiar tema</button></div>;}`,
  search: `import React,{useEffect,useState}from'react';import{Dialog,DialogContent,DialogTitle,DialogDescription}from'@/components/ui/dialog';export const ABRIR_BUSCADOR_EVENT='propuesta:search';export default function GlobalSearch(){const[open,setOpen]=useState(false);useEffect(()=>{const abrir=()=>setOpen(true);window.addEventListener(ABRIR_BUSCADOR_EVENT,abrir);return()=>window.removeEventListener(ABRIR_BUSCADOR_EVENT,abrir)},[]);return <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Buscar en el CRM</DialogTitle><DialogDescription>Explora las relaciones de esta propuesta.</DialogDescription><div className="grid gap-2">{[['Contactos','/app/clientes'],['Oportunidades','/app/crm/oportunidades'],['Llamadas','/app/crm/llamadas']].map(([label,ruta])=><button key={ruta} className="rounded-lg border border-line p-3 text-left text-sm" onClick={()=>{setOpen(false);window.dispatchEvent(new CustomEvent('propuesta-relacion',{detail:{ruta}}))}}>{label}</button>)}</div></DialogContent></Dialog>}`,
};
const porImport = {
  'next/link': 'link', 'next/navigation': 'navigation', 'next/image': 'image',
  '@/lib/hooks/useOrganization': 'organization', '@/lib/context/BranchContext': 'branch',
  '@/lib/supabase/imageUtils': 'imageUrls',
  '@/lib/navigation/useCapacidades': 'capabilities', '@/lib/context/OrganizationTimezoneContext': 'timezone',
  '@/components/organization/CreateOrganizationDialog': 'empty',
  '@/components/app-layout/Header/GlobalSearch': 'search',
  '@/components/app-layout/Header/TrialBanner': 'empty', '@/components/app-layout/Header/EmailVerificationBanner': 'empty',
  '@/components/voice/PhoneHeaderAction': 'empty', '@/components/notificaciones/NotificationDetailSheet': 'notificationDetail',
};
const porNombre = {
  usePlanSesion:'plan', useOrganizacionesUsuario:'orgs', useNotificacionesHeader:'notifications',
  VistaRapidaTarea:'empty', ReportarProblema:'feedback', PanelSesion:'sessionPanel',
};
const plugin = { name: 'propuesta-sin-backend', setup(build) {
  build.onResolve({filter: /.*/}, args => {
    const nombre = path.basename(args.path).replace(/\.(tsx?|jsx?)$/, '');
    const fixture = porImport[args.path] || porNombre[nombre];
    if (fixture) return {path: fixture, namespace: 'fixture'};
    const completo = args.path.startsWith('@/') ? path.join(raiz, 'src', args.path.slice(2)) : path.resolve(args.resolveDir, args.path);
    if (/supabase|\/(services|api)\/|fetchJson|pedirCrm|SoftphoneProvider|server-service|^https?:|^node:|^@sentry\//i.test(args.path+' '+completo)) {
      return {errors:[{text:`Importación de backend bloqueada en la propuesta: ${args.path}`} ]};
    }
    if (args.path.startsWith('@/')) {
      for (const candidato of [completo, completo+'.tsx', completo+'.ts', completo+'.jsx', completo+'.js', path.join(completo,'index.tsx'),path.join(completo,'index.ts')]) {
        if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) return {path:candidato};
      }
      return {errors:[{text:`No se encontró ${args.path}`} ]};
    }
  });
  build.onLoad({filter:/.*/,namespace:'fixture'}, args => ({contents:fixtures[args.path],loader:'tsx',resolveDir:raiz}));
}};

function fuenteInter() {
  const fuenteLocal = path.join(__dirname, 'assets', 'inter-latin.woff2');
  if (!fs.existsSync(fuenteLocal)) throw new Error('Falta la fuente local assets/inter-latin.woff2.');
  return `@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(fuenteLocal).toString('base64')}) format('woff2');}`;
}

(async () => {
  fs.mkdirSync(dist,{recursive:true});
  const resultado = await esbuild.build({entryPoints:[path.join(__dirname,'entry.tsx')],bundle:true,write:false,
    platform:'browser',format:'iife',jsx:'automatic',target:['es2020'],minify:true,
    tsconfig:path.join(raiz,'tsconfig.json'),plugins:[plugin],metafile:true,
    define:{'process.env.NODE_ENV':'"production"'},logLevel:'warning'});
  const config = require(path.join(raiz,'tailwind.config.js'));
  config.content = [path.join(raiz,'src/**/*.{js,ts,jsx,tsx}'),path.join(__dirname,'*.{tsx,ts}')];
  const estilos = await postcss([tailwind(config),autoprefixer]).process(fs.readFileSync(path.join(__dirname,'preview.css'),'utf8'),{from:path.join(__dirname,'preview.css')});
  const css = fuenteInter()+'\n'+fs.readFileSync(path.join(raiz,'src/styles/tokens.css'),'utf8')+'\n'+estilos.css;
  const js = resultado.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
  const licencia = fs.readFileSync(path.join(__dirname,'assets/OFL.txt'),'utf8');
  const html = `<!doctype html><!-- ${licencia.replace(/--/g,'—')} --><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="color-scheme" content="light dark"><title>GO Admin · Agentes IA · Propuesta v1</title><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
  fs.writeFileSync(path.join(dist,'index.html'),html);
  fs.writeFileSync(path.join(__dirname,'propuesta.html'),html);
  fs.writeFileSync(path.join(dist,'bundle.js'),resultado.outputFiles[0].text);
  fs.writeFileSync(path.join(dist,'preview.css'),css);
  fs.writeFileSync(path.join(dist,'build-manifest.json'),JSON.stringify({backend:false,red:false,fuente:'Inter WOFF2 embebida',entrada:'entry.tsx',componentes:Object.keys(resultado.metafile.inputs).filter(p=>/(?:^|\/)src\/components\//.test(p))},null,2));
  console.log(`Propuesta lista: ${path.join(__dirname,'propuesta.html')} (${Math.round(Buffer.byteLength(html)/1024)} KB)`);
})().catch(error=>{console.error(error.message);process.exitCode=1});
