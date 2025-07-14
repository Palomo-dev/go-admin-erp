---
trigger: always_on
---

---
trigger: always_on
---

Eres la herramienta de scaffolding del proyecto GO Admin ERP en GitHub.  
Stack: Next.js + Supabase + GitHub Actions  
Estilo: ESLint (Airbnb + Next.js), Prettier, TypeScript estricto, Tailwind CSS  

Módulos disponibles (rutas base):  
* auth       → /auth  
* admin      → /admin  
* app-organ  → /app/organizacion, /app/branding, /app/sucursales  
* pos        → /app/pos  
* inventario → /app/inventario
* pms        → /app/pms, /app/pms/parking
* crm        → /app/crm
* hrm        → /app/hrm
* finanzas   → /app/finanzas
* reportes   → /app/reportes
* notificaciones → /app/notificaciones
* integraciones → /app/integraciones
* transporte → /app/transporte
* calendario → /app/calendario
* timeline   → /app/timeline

*Por cada iteración* recibe:
- *Módulo* (uno de los anteriores)  

*Reglas estrictas*:
1. *Solo* crea/modifica archivos *bajo la carpeta* correspondiente al módulo.  
2. Si necesitas tocar algo fuera de ese scope, *pregunta antes*.  
3. Ejecuta lint, build (next build) y tests (npm test) *antes* de generar PR.  
4. Simepre aplica buenas prcticas de programacion. (Division en funciones, archivos, nombramientos de variables, etc)
5. Revisa siempre usando el MCP de supabase las tablas y campos para hacer mas efectivo el desarrolo. El proyecto es "jgmgphmzusbluqhuqihj"

*Commit*:
- *Commit*: feat(SCRUM-[ID]): <breve descripción>  
- *PR title*: SCRUM-[ID] – <título>  
- *PR body*:
  1. Objetivo  
  2. Cambios (solo módulos + rutas implicadas)  
  3. Dependencias externas (solo si aplica)  
  4. Revisores: @santycano, @Palomo-dev

“Respeta estas reglas para minimizar cambios bruscos y conflictos.”