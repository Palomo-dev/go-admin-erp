# Investigación normativa: Recursos humanos y nómina en Colombia (para el diseño del módulo de Go Admin ERP)

**Fecha de corte:** 14 de noviembre de 2026.
**Alcance:** pymes del sector privado (restaurantes, hoteles, tiendas, gimnasios, parqueaderos). No cubre empleados públicos: la Ley 2466 no les aplica, salvo en teletrabajo (Concepto de Función Pública citado en §1).

## Cómo leer las marcas de verificación

| Marca | Significado |
|---|---|
| **[V]** | Verificado en esta investigación sobre el texto oficial o compilado (Secretaría del Senado, normograma DIAN, compilaciones Avance Jurídico de Colpensiones/Keralty, UGPP, MinSalud, Corte Constitucional). |
| **[S]** | Solo fuentes secundarias (gremios, medios, firmas, software). Coinciden entre sí, pero no se leyó la norma. |
| **[NC]** | No confirmado o con fuentes en conflicto. **No lo cablees: déjalo configurable y revísalo antes de salir a producción.** |

> Nota técnica: `secretariasenado.gov.co` rechaza HTTPS pero responde por HTTP. Las URL de Función Pública (`funcionpublica.gov.co/eva/...`) fallaron por certificado durante la consulta. Se usaron como respaldo las compilaciones de Avance Jurídico publicadas por Colpensiones, Keralty y Cancillería.

---

## 1. Reforma laboral — Ley 2466 de 2025

- **Ley 2466 del 25 de junio de 2025**, publicada en el Diario Oficial 53.160 de esa fecha. Rige desde su promulgación (art. 70), salvo las vigencias diferidas que se indican abajo. [V]
  Texto: https://incp.org.co/wp-content/uploads/2025/09/Ley-2466-de-2025.pdf · CST actualizado: http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html
- **Control constitucional a la fecha:** la C-081 de 2026 (15-abr-2026) declaró inexequible una expresión del numeral 10 del art. 17 (no discriminación). La C-030 de 2026 declaró exequible el art. 19. No se encontró ninguna sentencia que tumbe los artículos de nómina (jornada, recargos, aprendizaje). [S/V]
  https://www.corteconstitucional.gov.co/relatoria/2026/C-081-26.htm · https://www.corteconstitucional.gov.co/relatoria/2026/C-030-26.htm
- **Empleados públicos:** la reforma no les aplica, salvo en teletrabajo. Concepto de Función Pública del 5 de febrero de 2026. [S] https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=274156

### 1.1 Jornada máxima semanal (Ley 2101 de 2021, art. 3; CST art. 161 modificado por el art. 11 de la Ley 2466)

El art. 3 de la Ley 2101 dice textualmente: «transcurridos dos años… 47 horas; pasados tres años… 46; a partir del cuarto año se reducirán dos horas cada año hasta llegar a 42». [V]
http://www.secretariasenado.gov.co/senado/basedoc/ley_2101_2021.html

| Desde | Horas/semana | Divisor de hora usado en la práctica (horas/semana ÷ 6 × 30) |
|---|---|---|
| 15-jul-2023 | 47 | 235 |
| 15-jul-2024 | 46 | 230 |
| 15-jul-2025 | 44 | 220 |
| **15-jul-2026 (vigente hoy)** | **42** | **210** |

- La fecha del 15 de julio sale de la entrada en vigencia de la Ley 2101 (15-jul-2021). Un medio dice 16 de julio. [S] https://www.vanguardia.com/colombia/2026/07/02/desde-el-16-de-julio-la-jornada-laboral-en-colombia-sera-de-42-horas-asi-queda-la-reduccion/
- **El divisor (210, 220…) no está en la ley:** es la práctica de contadores y software. [S] https://actualicese.com/liquidacion-de-nomina-con-la-jornada-laboral-de-42-horas/
  - Valor hora del SMMLV 2026: $7.959 con divisor 220 (hasta el 14-jul-2026) y $8.338 con divisor 210 (desde el 15-jul-2026).
- **Reglas del art. 161 actual:** [V]
  - 8 h diarias y 42 semanales, distribuibles de 5 a 6 días, con un día de descanso.
  - Jornada flexible de 4 a 9 h diarias, sin recargo mientras el promedio no pase de 42 h.
  - Turnos sucesivos de máximo 6 h/día y 36 h/semana, sin recargo nocturno ni dominical.
  - Menores de 15 a 17 años: 6 h/día y 30 h/semana, solo diurno. Mayores de 17: 8 h/día y 40 h/semana.
  - Se prohíben dos turnos en el mismo día, salvo en cargos de dirección, confianza o manejo.
- **Horas extra:** máximo 2 h/día y 12 h/semana (art. 13 de la Ley 2466, que modifica el art. 22 de la Ley 50 de 1990). [V]
  - Ya no se necesita permiso del MinTrabajo.
  - El empleador **debe llevar un registro** con nombre, actividad, horas y si son diurnas o nocturnas, y entregarlo con el soporte de pago (art. 12, CST 162 num. 2). [V]

### 1.2 Recargo nocturno

- Diurno de 6:00 a. m. a 7:00 p. m.; nocturno de 7:00 p. m. a 6:00 a. m. (CST 160, modificado por el art. 10 de la Ley 2466). [V]
- Rige **6 meses después de la sanción**, es decir, **desde el 25-dic-2025**. Algunas fuentes dicen 26-dic-2025 o 1-ene-2026 [NC sobre el día exacto]. Antes el nocturno empezaba a las 9:00 p. m.
- **Porcentajes (CST 168, sin cambios):** [V] http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html
  - Nocturno: 35 %.
  - Extra diurna: 25 %.
  - Extra nocturna: 75 %.
  - Los recargos no se acumulan entre sí.

### 1.3 Recargo dominical y festivo (CST 179, modificado por el art. 14 de la Ley 2466)

| Desde | Recargo sobre el salario ordinario |
|---|---|
| Antes del 1-jul-2025 | 75 % (régimen anterior) |
| 1-jul-2025 | 80 % |
| **1-jul-2026 (vigente hoy)** | **90 %** |
| **1-jul-2027 (programado)** | **100 %** |

[V]
- El empleador puede aplicar el 100 % desde ya.
- **Ocasional:** hasta 2 días de descanso obligatorio trabajados en el mes calendario. **Habitual:** 3 o más.
- «Dominical» se lee como «día de descanso obligatorio». Las partes pueden pactar por escrito otro día de descanso; si no lo pactan, se presume el domingo.

### 1.4 Contratos y terminación

- **Término fijo (CST 46, art. 6 de la Ley 2466):** [V]
  - Siempre por escrito y por **máximo 4 años**. Si falta el escrito o se supera el plazo, se entiende indefinido desde el inicio.
  - **Prórroga pactada:** en contratos de menos de un año, por escrito. Después de la 4.ª prórroga, no puede ser inferior a 1 año.
  - **Prórroga automática:** se renueva por un término igual si nadie avisa con 30 días de antelación, sin superar 4 años.
  - Para los contratos vigentes, los 4 años se cuentan desde que entró a regir la ley.
- **Obra o labor:** por escrito y con la obra precisa. Si el trabajador sigue después de terminarla, pasa a indefinido. [V]
- **Indefinido como regla general (CST 47):** el trabajador puede renunciar con un preaviso de 30 días, y no se le puede pactar sanción si lo omite. [V]
- **Indemnización por despido sin justa causa (CST 64):** la Ley 2466 **no la modificó**. El texto vigente es el de la Ley 789 de 2002. [V] http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr001.html — el detalle está en §3.4.
- **Nueva indemnización (CST 59A, art. 48):** si el empleador usa fraudulentamente regímenes diferenciados de micro o pequeña empresa, debe 1 día de salario por cada día de la conducta, con tope de 24 meses. [V]
- **Debido proceso disciplinario (CST 115, art. 7):** [V]
  - Comunicación formal de apertura, cargos por escrito y traslado de pruebas.
  - Al menos 5 días para descargos, decisión motivada, sanción proporcional y posibilidad de impugnar.
  - **Microempresas de menos de 10 trabajadores:** solo deben escuchar previamente al trabajador.
- **Prescripción:** 3 años desde que la obligación es exigible (CST 488, art. 62). [V]

### 1.5 Contrato de aprendizaje (CST 81, art. 21 de la Ley 2466)

- Ahora es un **contrato laboral especial a término fijo**, de máximo 3 años. [V]
- **Apoyo de sostenimiento mínimo:**

  | Modalidad | Monto |
  |---|---|
  | Formación dual | 75 % del SMMLV el 1.er año y 100 % el 2.º |
  | Formación tradicional | 75 % en etapa lectiva y 100 % en etapa práctica |
  | Estudiante universitario | Nunca menos de 1 SMMLV |

  2026: 75 % = **$1.313.179**; 100 % = $1.750.905. No se puede regular por convención colectiva.
- **Seguridad social:**
  - Etapa lectiva: salud y ARL a cargo total de la empresa, como dependiente.
  - Etapa práctica o formación dual: salud, pensión y ARL como dependiente, con **todas las prestaciones**.
- **Monetización de la cuota (art. 23):** 1,5 SMMLV mensuales por cada aprendiz no contratado (2026: $2.626.358). [V]
- **Nómina electrónica:** desde la reforma, los pagos a aprendices deben ir en el documento soporte de nómina electrónica para ser deducibles. Es la interpretación de Actualícese y cambia el criterio del Concepto DIAN 0106 de 2022. [S] https://actualicese.com/nomina-electronica-en-2026-cambios-normativos-y-puntos-clave-que-debes-revisar/
- **Orientación:** Circular Externa 0083 de MinTrabajo del 18-jul-2025. [S]

### 1.6 Plataformas digitales de reparto (arts. 24 a 30 y 67)

- Rigen **12 meses después de que el Gobierno reglamente** (art. 67). [V]
  - **[NC]** No se encontró confirmación de que la reglamentación ya esté completa.
- **Dos modalidades:** [V]
  - **Dependiente:** se aplica el régimen general y se permite cotizar a tiempo parcial.
  - **Independiente:** la plataforma paga el **60 % de salud y pensión** y el trabajador el 40 %. La ARL corre por cuenta exclusiva de la plataforma. El IBC es el **40 % de los ingresos** por la plataforma (art. 27).
- **Relevancia para Go Admin:** baja. Solo importa si un cliente opera su propia plataforma de domicilios.

### 1.7 Otros cambios con impacto en el software

- **Nuevas licencias remuneradas (CST 57 num. 6):** [V]
  - Citas médicas de urgencia o con especialista (incluida endometriosis).
  - Obligaciones escolares como acudiente.
  - Citaciones judiciales y administrativas.
  - 1 día por cada 6 meses a quien certifique que llega en bicicleta.
  - **[NC]** No existe una «licencia menstrual» en el texto.
- **Cuota de trabajadores con discapacidad (CST 57 num. 17):** 2 por cada 100 trabajadores en empresas de hasta 500. [V]
  - Opcional el primer año y obligatoria desde el segundo.
  - Cada contrato se reporta a MinTrabajo dentro de los 15 días siguientes.
- **Cesantías pagadas directamente al trabajador:** liberan la obligación si se acredita el pago, aunque la afiliación al fondo sigue siendo obligatoria (CST 57, parágrafo 4). [V]
- **Opciones mensuales (art. 64, parágrafos al art. 99 de la Ley 50 de 1990):** [V]
  - Consignar cada mes el 8,33 % al fondo como **anticipo de cesantías**.
  - Pagar cada mes el 1 % de **intereses sobre cesantías**, por acuerdo escrito.
  - En ambos casos la base es salario + auxilio de transporte.
- **Auxilio de conectividad (art. 53, art. 6A de la Ley 1221):** para teletrabajadores que ganen menos de 2 SMMLV, reemplaza al auxilio de transporte por el mismo valor. [V]
  - No es salario, pero sí entra en la base de prestaciones de quien gana hasta 2 SMMLV.
- **PILA:** el art. 61 ordena ajustarla para cotización a tiempo parcial y concurrente. Ver §6.

---

## 2. Valores 2026

| Parámetro | Valor 2026 | Norma | Vigencia | Estado |
|---|---|---|---|---|
| SMMLV | **$1.750.905** | Decreto 1469 del 29-dic-2025, **suspendido** por el Consejo de Estado (auto del 12-feb-2026). Reemplazado por el **Decreto transitorio 0159 del 19-feb-2026**, con el mismo valor | 1-ene-2026 | [S] Vigente pero con **litigio abierto** (nulidad en la Sección Segunda; hay solicitud de suspender también el 0159) |
| Auxilio de transporte | **$249.095** (hasta 2 SMMLV = $3.501.810) | Decreto 1470 de 2025 y decreto transitorio | 1-ene-2026 | [S] |
| UVT | **$52.374** | Resolución DIAN 000238 del 15-dic-2025 | Año gravable 2026 | [S] (resolución vista en compilación) |
| Salario integral mínimo | **$22.761.765** (13 SMMLV); IBC = 70 % | CST 132; UGPP | 2026 | [V] |
| Tope del IBC | 25 SMMLV = **$43.772.625** | Decreto 1072, art. 2.2.4.3.3; UGPP | 2026 | [V] |

Fuentes:
- Salario mínimo: https://www.larepublica.co/economia/mintrabajo-publico-decreto-transitorio-que-mantiene-minimo-de-1-75-millones-en-2026-4331878 · https://www.eltiempo.com/economia/sectores/gobierno-expide-el-nuevo-decreto-del-salario-minimo-2026-tras-la-suspension-del-consejo-de-estado-3534019 · https://ayuda.miplanilla.com/hc/es-419/articles/46278928365204-Suspensi%C3%B3n-provisional-del-decreto-de-salario-m%C3%ADnimo-2026
- UVT: https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0238_2025.htm · https://incp.org.co/publicaciones/infoincp-publicaciones/impuestos/2025/12/dian-fijo-en-52-374-en-valor-de-la-uvt-para-el-ano-gravable-2026/
- Integral: https://www.ugpp.gov.co/wp-content/uploads/2026/02/ABC-Trabajadores-dependientes-que-devengan-salario-integral.pdf

> **Riesgo de diseño:** si el Consejo de Estado anula el decreto del salario mínimo, podría cambiar el valor 2026 con efectos retroactivos o prospectivos. Por eso el SMMLV debe ser un parámetro **versionado por fecha** con recálculo controlado, nunca una constante.

### 2.1 Aportes sobre el IBC (sector privado)

| Concepto | Empleador | Trabajador | Norma / fuente | Estado |
|---|---|---|---|---|
| Salud | 8,5 % | 4 % | Ley 100 art. 204; UGPP | [V] |
| Pensión | 12 % | 4 % | Ley 100 art. 20; UGPP | [V] |
| Fondo de Solidaridad Pensional (FSP) | — | 1 % a 2 %, según tabla abajo | Ley 100 art. 27 (Ley 797 de 2003); UGPP | [V] |
| ARL | 100 %, según la clase de riesgo | — | Decreto 1072 art. 2.2.4.3.5 | [V] |
| Caja de compensación | 4 % | — | Ley 21 de 1982; UGPP | [V] |
| ICBF | 3 % | — | UGPP | [V] |
| SENA | 2 % | — | UGPP | [V] |

**Exoneración del art. 114-1 del Estatuto Tributario** [V vía UGPP]
- Exonera de **salud del empleador (8,5 %), SENA e ICBF** por los trabajadores que devenguen **menos de 10 SMMLV** (menos de $17.509.050 en 2026).
- **Requisitos:** que el empleador sea persona jurídica contribuyente de renta, o persona natural con 2 o más trabajadores.
- **No aplica** a la caja de compensación ni al salario integral, porque este siempre es de 10 SMMLV o más.
- Fuente: el ABC de salario integral de la UGPP citado en §2.

**Tabla de cotización ARL** (Decreto 1072 de 2015, art. 2.2.4.3.5, compilado del Decreto 1772 de 1994, art. 13) [V]

| Clase | Mínimo | **Inicial** | Máximo | Ejemplos típicos |
|---|---|---|---|---|
| I | 0,348 % | **0,522 %** | 0,696 % | Oficina, caja, venta en tienda |
| II | 0,435 % | **1,044 %** | 1,653 % | Algunos oficios de cocina o mantenimiento (según la actividad económica) |
| III | 0,783 % | **2,436 %** | 4,089 % | — |
| IV | 1,740 % | **4,350 %** | 6,060 % | Conductores (guía UGPP) |
| V | 3,219 % | **6,960 %** | 8,700 % | Alturas, vigilancia armada |

- Fuente: https://normativa.colpensiones.gov.co/colpens/docs/decreto_1072_2015.htm
- La clase la asigna la ARL según la actividad económica (Decreto 768 de 2022, tabla de actividades) [S]. En el software debe ser un **parámetro por centro de trabajo o cargo**, no un valor por empresa.

**Fondo de Solidaridad Pensional vigente hoy** (Ley 100 art. 27; UGPP 2026) [V]

| IBC en SMMLV | 4 a <16 | 16 a 17 | 17 a 18 | 18 a 19 | 19 a 20 | >20 |
|---|---|---|---|---|---|---|
| Aporte del trabajador | 1 % | 1,2 % | 1,4 % | 1,6 % | 1,8 % | 2 % |

**Lo programado para 2027 — Reforma pensional (Ley 2381 de 2024)**
- La Corte Constitucional, en la **Sentencia C-264 de 2026** (25-ago-2026), la declaró exequible en su mayoría y fijó su vigencia en el **1-abr-2027**. [V]
  - Devolvió 9 artículos a la Cámara para subsanar vicios de trámite.
  - Colpensiones pidió aplazarla a 2028 y la Corte no ha decidido. [S]
  - https://incp.org.co/wp-content/uploads/2026/09/Sentencia-C-264-de-2026-a-Corte-Constitucional-a-INCP.pdf
- **Nueva tabla del FSP** según fuentes secundarias [NC sobre el número de artículo y la versión final]:

  | IBC en SMMLV | 4 a <7 | 7 a <11 | 11 a <19 | 19 a 20 | >20 |
  |---|---|---|---|---|---|
  | Aporte | 1,5 % | 1,8 % | 2,5 % | 2,8 % | 3 % |

  https://siemprealdia.co/colombia/derecho-laboral/aportes-al-fondo-de-solidaridad-pensional/
- **PILA:** MinSalud ya ajustó la planilla para la reforma (Resolución 467 de 2025). [S]

### 2.2 Valores programados para 2027

| Parámetro | 2027 | Estado |
|---|---|---|
| Recargo dominical y festivo | 100 % desde el 1-jul-2027 | [V] Fijado por ley |
| Jornada | 42 h (ya alcanzada) | [V] |
| Reforma pensional (FSP, pilares, PILA) | Desde el 1-abr-2027 | [V] Fecha de la Corte, con riesgo de aplazamiento [NC] |
| SMMLV y auxilio de transporte 2027 | Se decretan en diciembre de 2026 | [NC] |
| UVT 2027 | DIAN aún no ha publicado la resolución; un medio estima $55.684 | [NC] https://diariodelsur.com.co/noticias/esta-seria-la-nueva-uvt-para-2027-segun-calculo-de-dian |
| Cotizante 75 en PILA (permanencia en el régimen subsidiado) | Aplazado al 1-mar-2027 (Resolución 2492 de 2026) | [S] |

---

## 3. Prestaciones sociales

Todas las fórmulas toman la base, en días, sobre un año de 360 días. CST: http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr008.html (pr006 y pr010 para los demás artículos).

| Prestación | Regla | Fórmula | Fecha de pago | Norma | Estado |
|---|---|---|---|---|---|
| **Prima de servicios** | 30 días de salario por año, en dos pagos | (salario base × días del semestre) / 360 | Mitad a más tardar el 30-jun; la otra en los primeros 20 días de diciembre | CST 306 (Ley 1788 de 2016) | [V] |
| **Cesantías** | 1 mes de salario por año y proporcional por fracción | (salario base × días) / 360 | Consignar al fondo antes del 14-feb del año siguiente; pagar directo al terminar el contrato | CST 249; Ley 50 de 1990 art. 99 | [V] CST 249 · [S] fecha del 14-feb (la página del Senado de la Ley 50 respondió 404) |
| **Intereses sobre cesantías** | 12 % anual sobre el saldo, proporcional | (cesantías × días × 12 %) / 360 | 31-ene, o al terminar el contrato. Desde 2025 se pueden pagar mensualmente al 1 % por acuerdo | Ley 52 de 1975; art. 64 de la Ley 2466 | [S] Ley 52 · [V] Ley 2466 |
| **Vacaciones** | 15 días hábiles consecutivos por año | (salario × días hábiles) / 30 | Se disfrutan; se puede pagar en dinero hasta la mitad por acuerdo escrito | CST 186, 189 | [V] |

**Base de liquidación**
- **Prima y cesantías:** salario + **auxilio de transporte** para quien tenga derecho a él (Ley 1 de 1963). [S]
- **Vacaciones:** salario ordinario, **sin** auxilio de transporte, sin horas extra y sin el trabajo en días de descanso (CST 192 num. 1). [V]
- **Cesantías con salario variable o que cambió en los últimos 3 meses:** promedio del último año, o de todo el tiempo si es menor (CST 253). [V]
- **Vacaciones con salario variable:** promedio del año anterior a la fecha en que se conceden (CST 192 num. 2). [V]
- **Prima con salario variable:** promedio del semestre. Es práctica y doctrina, no texto del CST 306. [S]
- **Salario integral:** no genera prima ni cesantías. Sí genera vacaciones. [V vía UGPP]

### 3.4 Indemnización por despido sin justa causa (CST 64, texto de la Ley 789 de 2002) [V]

| Tipo de contrato | Indemnización |
|---|---|
| Término fijo | Salarios del tiempo que falta para terminar el plazo pactado |
| Obra o labor | Lo que falte de la obra; nunca menos de 15 días |
| Indefinido, salario < 10 SMMLV | 30 días por el 1.er año + 20 días por cada año siguiente, proporcional por fracción |
| Indefinido, salario ≥ 10 SMMLV | 20 días por el 1.er año + 15 días por cada año siguiente, proporcional |

- **Régimen de transición:** los trabajadores que el 27-dic-2002 tenían 10 o más años de servicio conservan la tabla anterior (45 días + 30 o 40 por año) (parágrafo transitorio del CST 64). [V]
- **Sanción moratoria (CST 65), sin cambios por la Ley 2466:** [S]
  - 1 día de salario por cada día de retraso en el pago de la liquidación, hasta 24 meses.
  - Después, intereses moratorios.
  - Aplica a quienes ganan más de 1 SMMLV.

---

## 4. Retención en la fuente por salarios

Estatuto Tributario actualizado: http://www.secretariasenado.gov.co/senado/basedoc/estatuto_tributario_pr015.html (arts. 383–388) y pr008 (art. 206), pr014 (art. 336).

### 4.1 Tabla del art. 383 ET (Ley 2010 de 2019; vigente en 2026) [V texto · tabla S]

La tabla es una imagen en el texto oficial. Los valores se tomaron de Siempre al Día (actualizado el 19-ene-2026) y coinciden con la versión publicada desde 2019.
https://siemprealdia.co/colombia/impuestos/retencion-en-la-fuente-por-salarios/

| Base mensual en UVT | Tarifa marginal | Impuesto | Base en pesos 2026 (UVT $52.374) |
|---|---|---|---|
| >0 a 95 | 0 % | 0 | hasta $4.975.530 |
| >95 a 150 | 19 % | (base − 95 UVT) × 19 % | hasta $7.856.100 |
| >150 a 360 | 28 % | (base − 150) × 28 % + 10 UVT | hasta $18.854.640 |
| >360 a 640 | 33 % | (base − 360) × 33 % + 69 UVT | hasta $33.519.360 |
| >640 a 945 | 35 % | (base − 640) × 35 % + 162 UVT | hasta $49.493.430 |
| >945 a 2.300 | 37 % | (base − 945) × 37 % + 268 UVT | hasta $120.460.200 |
| >2.300 | 39 % | (base − 2.300) × 39 % + 770 UVT | más de $120.460.200 |

### 4.2 Procedimientos

- **Procedimiento 1 (art. 385):** cada mes se depura el pago del mes y se aplica la tabla. [S]
- **Procedimiento 2 (art. 386):** [S]
  - En **diciembre** y en **junio** se calcula un porcentaje fijo con el promedio de los 12 meses anteriores, o de lo laborado si son menos. Se aplica de enero a junio y de julio a diciembre.
  - Cálculo: base depurada ÷ 13 → tabla → impuesto en UVT ÷ ingreso gravado en UVT = % fijo (art. 383, parágrafo 1). [V]
- **Retención por contratos de prestación de servicios personales** (no laborales): misma tabla sobre «pagos mensualizados» (art. 383, parágrafo 2, Ley 2277). [V]

### 4.3 Depuración de la base (orden y topes, valores 2026)

1. **Ingresos no constitutivos de renta:** aportes obligatorios del trabajador a salud y pensión, y el FSP. [S]
2. **Deducciones (art. 387):** [V]
   - **Dependientes:** 10 % del ingreso bruto laboral del mes, con tope de **32 UVT/mes** ($1.675.968).
   - **Medicina prepagada o seguros de salud:** tope de **16 UVT/mes** ($837.984).
   - **Intereses de vivienda:** tope de 100 UVT/mes ($5.237.400) según el art. 119 ET [S para el tope]. Se calculan con los intereses del año anterior.
3. **Rentas exentas por aportes voluntarios:** AFC, FVP y pensión voluntaria (arts. 126-1 y 126-4). Juntas no pueden superar el **30 % del ingreso laboral** ni **3.800 UVT/año** ($199.021.200). [S]
4. **Renta exenta del 25 % (art. 206 num. 10, Ley 2277 de 2022):** 25 % de lo que queda después de los pasos anteriores, con tope de **790 UVT/año** ($41.375.460; unas 65,83 UVT/mes). [V]
5. **Límite global (art. 336 num. 3):** deducciones + rentas exentas ≤ **40 %** del ingreso neto y ≤ **1.340 UVT/año** ($70.181.160; unas 111,67 UVT/mes). [V]
   - **72 UVT adicionales por dependiente, hasta 4:** están fuera del límite del 40 %. Aplican en la **declaración anual** y, según varias fuentes, **no** en la retención mensual; tampoco se suman con la deducción del art. 387. [V texto del art. 336 · NC en la retención]
   - Decreto 2231 de 2023: https://normograma.dian.gov.co/dian/compilacion/docs/decreto_2231_2023.htm
- **Salario integral:** el 30 % prestacional no entra a la base, porque queda cubierto por el 25 % exento (UGPP; ET 206 num. 10). [V vía UGPP]

---

## 5. Nómina electrónica (DIAN)

- **Norma base:** Resolución 000013 del 11-feb-2021. [V]
  - Modificada por las Resoluciones 037 y 063 de 2021, 151 de 2021 y 028 de 2022 (plazos).
  - **Compilada desde el 23-sep-2025 en la Resolución Única 000227 de 2025** (Título 5; nómina en el capítulo III; anexo T.5.4). [V/S]
  - https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0013_2021.htm · https://www.cancilleria.gov.co/normograma/compilacion/docs/resolucion_dian_0227_2025.htm · https://www.dian.gov.co/impuestos/Paginas/Sistema-de-Factura-Electronica/Documento-Soporte-de-Pago-de-Nomina-Electronica.aspx
- **Qué es (art. 1 num. 10):** un XML por cada beneficiario con devengados, deducciones y total. Soporta costos y deducciones en renta e impuestos descontables. [V]
- **Obligados (art. 4):** contribuyentes de renta que hagan pagos por relación laboral, legal y reglamentaria o pensiones y quieran deducirlos. [V]
  - El escalonamiento 2021–2022 por número de empleados ya se cumplió.
  - Quien empieza a tener empleados tiene **2 meses** desde el primer pago para habilitarse y transmitir (art. 6 num. 2, calendario permanente).
- **Periodicidad y plazo (arts. 3 y 8):** [V]
  - Un documento **mensual** que acumula los pagos del mes, aunque se pague quincenal o semanalmente.
  - Se transmite **dentro de los 10 primeros días del mes siguiente** al pago.
  - Ante inconvenientes tecnológicos hay 48 horas adicionales (arts. 13 y 14).
- **Validación previa (arts. 9, 15 y 16):** [V]
  - La DIAN responde «Documento validado» o «Documento rechazado».
  - Sin validación, no hay soporte de la deducción.
- **Nota de ajuste (arts. 1 num. 12 y 17):** dos tipos. [V]
  - **Reemplazar:** para corregir; el número del documento reemplazado no se puede reutilizar.
  - **Eliminar:** para un documento transmitido por error.
- **CUNE:** código único que identifica el documento, calculado según el anexo técnico (hash SHA-384 de campos definidos). [V definición · S algoritmo]
- **Contenido obligatorio (art. 5):** [V]
  - Identificación del empleador y del trabajador, CUNE, consecutivo, devengados, deducciones y medio de pago.
  - Fecha y hora, **firma digital del emisor**, identificación del software y **NIT del proveedor tecnológico**.
- **Anexo técnico:** la DIAN adoptó la versión 1.0 y su «caja de herramientas». [V v1.0 · NC versiones posteriores]
  - Un tercero menciona una versión 3.0 (Resolución 000040 de 2024) y una 4.0 «en evaluación».
  - La DIAN da **3 meses** para adoptar cada actualización del anexo (art. 20).
- **Cambios 2025–2026:** [V/S]
  - La compilación en la Resolución 227 de 2025, sin cambio de fondo.
  - La Resolución 000012 de 2026, que ajustó formatos y anexos de la 227.
  - La inclusión de aprendices tras la Ley 2466 (§1.5).
- **Solución gratuita DIAN:** existe, pero es manual. Sirve de respaldo, no de integración. [V]

## 6. PILA (aportes a seguridad social)

- **Norma:** Resolución 2388 de 2016 de MinSalud y sus anexos técnicos (1 glosario, 2 archivo de aportes, 3 pensionados, etc.). [V]
  - Modificaciones relevantes: 5858 de 2016, 980 y 1608 de 2017, 454 y 2421 de 2020, 638 de 2021, 261 de 2022 y 467 de 2025 (reforma pensional).
  - **Resolución 1529 del 24-jul-2026:** cotizantes 74 (reciclador), 75 (dependiente que permanece en el régimen subsidiado, por el art. 65 de la Ley 2466) y 76 (independiente a tiempo parcial), y aportante 17. Aplica desde agosto, septiembre y noviembre de 2026.
  - **Resolución 2492 del 29-oct-2026:** aplaza el cotizante 75 al 1-mar-2027. [S]
  - https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-2388-2016.pdf · https://www.minsalud.gov.co/Normatividad_Nuevo/Resoluci%C3%B3n%20No%201529%20de%202026.pdf · https://incp.org.co/publicaciones/infoincp-publicaciones/informacion-para-empresas/2026/08/minsalud-incorporo-nuevos-tipos-de-cotizante-y-modifico-las-reglas-de-reporte-de-la-pila/
- **Plazos de pago (Decreto 780 de 2016, art. 3.2.2.1, Decreto 923 de 2017):** del **2.º al 16.º día hábil del mes**, según los dos últimos dígitos del NIT. [V]
  - Ejemplos: 00–07 el 2.º día hábil; 94–99 el 16.º.
  - https://normativa.colpensiones.gov.co/colpens/docs/decreto_0780_2016.htm
- **Operadores de información autorizados:** [V lista de la UGPP]
  - Asopagos, Enlace Operativo, SOI (ACH), Mi Planilla, Aportes en Línea y Pago Simple. MinSalud añade Fedecajas (Pila Fácil).
  - Los vigila la Superintendencia Financiera (Decreto Ley 019 de 2012, art. 74).
  - https://www.ugpp.gov.co/pague-sus-aportes/ · https://www2.minsalud.gov.co/proteccionsocial/Paginas/contacto-operadores-pila.aspx
- **Tipos de planilla confirmados:** [S]

  | Planilla | Uso |
  |---|---|
  | **E** | Empleados |
  | **Y** | Independientes empresas |
  | **A** | Cotizantes con novedad de ingreso |
  | **I** | Independientes |
  | **K** | Estudiantes |
  | **N** | Correcciones |
  | **J** | Pago por sentencia judicial |
  | **X** | Empresa en liquidación o en proceso concursal |
  | **U** | Uso exclusivo de la UGPP |
  | **O** | Obligaciones determinadas por la UGPP |

  - Hay otras letras (S servicio doméstico, M mora, H madres sustitutas, T, F) que se mencionan pero no se verificaron. **[NC] Tómalas del Anexo Técnico 2 vigente.**
  - El salario integral va en la planilla E, con tipo de salario «X» (UGPP). [V]
- **¿API o archivo?** El **estándar es generar el archivo plano** con la estructura del Anexo 2 (registro de encabezado del aportante y un registro por cotizante con sus novedades: ING, RET, VSP, IGE, LMA, VAC, etc.) y que el cliente lo cargue y pague por PSE en el portal del operador. [S]
  - No se encontró **ninguna API pública documentada** de SOI, Aportes en Línea ni Mi Planilla.
  - Algunos operadores (Enlace Operativo) tienen **integraciones por convenio comercial** con casas de software, que permiten transmitir y pagar sin salir del software.
  - https://bitakora.co/integraciones/ · https://www.buk.co/blog/automatizacion-pila-colombia-aportes-seguridad-social
- **Conservación:** el aportante debe conservar copia del archivo magnético de las planillas según las reglas del Código de Comercio (Decreto 780, art. 3.2.1.9). [V]
- **Cruce:** la DIAN y la UGPP cruzan la nómina electrónica con la PILA del mismo período. Las diferencias generan fiscalización. [S]

---

## 7. Proveedores de nómina electrónica con API

| Proveedor | ¿Nómina electrónica por API? | Documentación pública | Precio público | Observaciones |
|---|---|---|---|---|
| **Factus** (FACTUS SAS; la documentación también está en `factusapi-v2.halltec.co`) | **Sí, documentada.** `POST /v2/payrolls` (crear y validar), DELETE, GET, PDF, XML, *application response* y **nota de ajuste** (`/nota-ajuste-nomina/...`). Mismo OAuth2 que facturación; devuelve `cune` y `qr` | https://developers.factus.com.co/coleccion · https://developers.factus.com.co/nomina/crear-y-validar/ | No publicado («Consultar planes» por WhatsApp). El sandbox compartido no tiene costo | **[NC] Contradicción:** el glosario aún dice «Actualmente en desarrollo (próximamente)» para nómina y CUNE, aunque el endpoint tiene un ejemplo de mayo de 2026 y el sitio la anuncia como producto nuevo. **Confirmar con Factus que está en producción** y el precio por documento. La web no dice explícitamente «proveedor tecnológico» |
| **MATIAS API** | Sí: `POST /ep/payroll`, `/ep/payroll/replace`, `/ep/payroll/delete`; devuelve CUNE y XML firmado | https://docs.matias-api.com/docs/endpoints | Planes anuales: Mini $196.000 (500 documentos), Básico $265.000 (1.200), Emprendedor $365.000 (3.000), PYME Pro $560.000 (8.000); casas de software desde $220.000 (5.000) (página del 29-ago-2026) | Opera como «software propio» del cliente, no necesariamente como proveedor tecnológico. https://matias-api.com/nomina-electronica/ |
| **Alegra** | Parcial: solo `GET /v1/e-payrolls` (listar) documentado en `payroll-calculator-api.alegra.com` | https://developer.alegra.com/reference/getelectronicpayrolls | Cotización por PDF | La API pública no permite emitir nómina desde un tercero |
| **Siigo** | No se encontró API pública de nómina | — | — | Un competidor afirma que su API no cubre nómina [S] |
| **The Factory HKA** | La wiki pública documenta servicios **SOAP** de facturación; no se encontró manual público de nómina | https://felcowiki.thefactoryhka.com.co/ | No publicado | Requiere contacto comercial |
| **Carvajal, Nominapp** | No se encontró API pública de nómina electrónica | — | — | Productos de nómina completos, no API para terceros [S] |
| **Soenac** | Paquete open source `soenac/api-dian` (Laravel; facturación UBL 2.1); su soporte de nómina no se confirmó | https://packagist.org/packages/soenac/api-dian | Gratuito (LGPL) | Última actualización en 2023 |

**Recomendación técnica:** usar **Factus**, porque ya está integrado para facturación (mismo token, mismo modelo y numeración por rango), siempre que confirmen por escrito la disponibilidad en producción y la tarifa. MATIAS API queda como alternativa con precios públicos.
- El motor de cálculo (devengados y deducciones) debe ser **propio** de Go Admin; el proveedor solo construye el XML, firma y transmite.
- La PILA va por **archivo plano** (§6).

---

## 8. Firma electrónica de contratos laborales

- **Marco general:** [V]
  - Ley 527 de 1999, art. 7 (equivalencia funcional de la firma) y art. 28 (firma digital).
  - Decreto 2364 de 2012, compilado en el **Decreto 1074 de 2015, arts. 2.2.2.47.1 y siguientes**.
- **Norma laboral específica — Decreto 526 del 19-may-2021:** adiciona los **arts. 2.2.1.1.8 a 2.2.1.1.15 del Decreto 1072 de 2015**. [V]
  https://normograma.com/keralty/compilacion/docs/decreto_0526_2021.htm
  - El contrato de trabajo **puede firmarse electrónicamente por una o ambas partes** (2.2.1.1.8) y debe tener el contenido mínimo del CST 39 (2.2.1.1.9).
  - Se admiten dos tipos (2.2.1.1.10):
    - **Firma electrónica:** códigos, contraseñas, OTP, biometría o claves. Debe ser confiable y apropiada según el art. 2.2.2.47.3 del Decreto 1074.
    - **Firma digital:** certificado de una entidad acreditada.
  - Ambas producen **los mismos efectos que la firma manuscrita**.
  - El empleador **escoge el mecanismo y debe proveer los medios** (2.2.1.1.11). No poder firmar electrónicamente no puede ser una barrera para el empleo.
  - **Conservación** con autenticidad, integridad y disponibilidad, en el formato original (2.2.1.1.12).
  - **Entregar copia** del contrato, sus anexos y modificaciones por un medio que el trabajador autorice.
  - Ponerlo a disposición de inspectores y jueces.
  - **Sin costo para el trabajador** (2.2.1.1.13).
  - Respeto de la Ley 1581 (2.2.1.1.14).
- **¿Sirve la firma simple por OTP o enlace en el correo?** Sí, si cumple dos condiciones del art. 2.2.2.47.3 del Decreto 1074 y del art. 7 de la Ley 527. [V/S]
  - **Identifica al firmante:** OTP a un celular o correo verificado, ligado al documento.
  - **Es confiable y apropiada para el propósito:** hash del PDF, evidencias de IP, fecha y hora, y aceptación expresa.
  - Conviene **pactarla por escrito** (acuerdo de uso de firma electrónica), como prevé el Decreto 1074 (art. 2.2.2.47.7, firma pactada).
- **¿Cuándo hace falta firma digital certificada?** La norma laboral no la exige para el contrato. Es recomendable en estos casos: [S]
  - Salario integral u otros pactos de alto valor.
  - Cláusulas de exclusividad o confidencialidad que se quieran hacer valer sin discusión probatoria.
  - Cuando la contraparte o una autoridad la pida.
  - Es **obligatoria** para firmar el XML de la nómina electrónica (art. 5 de la Resolución 13 de 2021), pero esa la pone el proveedor tecnológico.
- **Entidades de certificación digital (ECD):** deben estar acreditadas por **ONAC** (Decreto 333 de 2014). [V/S]
  - Certicámara (plataforma Certifirma, con OTP, biometría y firma digital), Gestión de Seguridad Electrónica (GSE), Andes SCD, Camerfirma Colombia y Viafirma Colombia (acreditación 24-ECD-001).
  - **[NC]** La existencia y condiciones de sus API se deben confirmar con cada una; ninguna publica precios. Lista oficial: https://onac.org.co/en/services/digital-certification-entities

---

## 9. Protección de datos personales (Ley 1581 de 2012; Decreto 1377 de 2013, compilado en el Decreto 1074 de 2015)

Ley: http://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html · Decreto 1377: https://normativa.colpensiones.gov.co/colpens/docs/decreto_1377_2013.htm

- **Autorización previa e informada,** obtenida por un medio que se pueda consultar después (art. 9). [V]
- **Datos sensibles (art. 5):** incluyen expresamente **salud y biometría**, además de afiliación sindical, origen étnico, etc. [V]
- **Tratamiento de datos sensibles (art. 6 de la Ley; art. 6 del Decreto 1377, hoy 2.2.2.25.2.3 del Decreto 1074):** [V]
  1. Autorización **explícita**.
  2. Informar que el titular **no está obligado** a autorizarlo.
  3. Informar cuáles datos son sensibles y para qué se usan.
  4. **Ninguna actividad puede condicionarse** a que se entreguen datos sensibles.
- **Temporalidad (art. 11 del Decreto 1377, hoy 2.2.2.25.2.8 del Decreto 1074):** [V]
  - Los datos se conservan solo el tiempo razonable y necesario para la finalidad y luego se **suprimen**.
  - Excepción: que una obligación legal o contractual exija conservarlos.
  - Los plazos deben estar **documentados**.

### 9.1 Hojas de vida de candidatos

- Se necesita autorización con una **finalidad específica**, por ejemplo «proceso de selección para el cargo X», antes de recibir la hoja de vida. [V principio · S aplicación]
- **Al cerrar el proceso,** los datos de los no seleccionados deben **suprimirse**, salvo autorización separada para conservarlos en un banco de candidatos. En ese caso, con un plazo definido. [S] https://www.buk.co/blog/proteccion-datos-personales-reclutamiento-seleecion
  - **[NC]** No se encontró un concepto de la SIC que fije un número de meses; el plazo lo define cada empresa en su política, por ejemplo 6 a 12 meses.
- No pedir datos sensibles (salud, embarazo, religión) en la etapa de selección.
- La Resolución 1843 de 2025 prohíbe exigir prueba de embarazo o de VIH (§9.3).

### 9.2 Datos sensibles de empleados

- **Salud:** las incapacidades y licencias son datos sensibles; se usan solo para nómina y SG-SST, con acceso restringido por rol. [V principio]
  - El diagnóstico **no** debe guardarse en el ERP; basta el código de origen (común o laboral) y los días.
- **Biometría para marcación:** es dato sensible. [V/S]
  - La SIC (Resolución 52185 de 2025, en un caso de propiedad horizontal) ordenó **ofrecer un mecanismo alternativo** (tarjeta, PIN, código) a quien no autorice y **suprimir** los datos de quien lo pida.
  - El criterio se extiende al control de asistencia laboral: la marcación biométrica no puede ser la única opción.
  - https://sedeelectronica.sic.gov.co/comunicado/la-superintendencia-de-industria-y-comercio-ordena-un-conjunto-residencial-habilitar-mecanismos-de-ingreso-que-no-impliquen-el-tratamiento
  - **Recomendación de arquitectura:** guardar plantillas o hashes y no imágenes del rostro o la huella.
- **Geolocalización:** no está catalogada expresamente como sensible, pero es dato personal. [S/NC]
  - Debe tener finalidad informada (marcación o rutas) y limitarse a la jornada, en coherencia con la Ley 2191 de 2022 sobre desconexión laboral.
  - Tomar la ubicación **en el momento de marcar**, no rastreo continuo.
  - **[NC]** No se encontró una guía específica de la SIC.
- **Registro Nacional de Bases de Datos (RNBD):** obligatorio para sociedades con activos de más de 100.000 UVT (Decreto 090 de 2018). [S/NC] Útil como recordatorio en el módulo.

### 9.3 Historia clínica ocupacional — Resolución 1843 del 29-abr-2025 (MinTrabajo)

Publicada en el Diario Oficial 53.109 del 6-may-2025; transición de 6 meses (art. 35). [V]
https://normograma.com/keralty/compilacion/docs/resolucion_mtra_1843_2025.htm

- **Deroga** las Resoluciones 2346 de 2007, 1918 de 2009, 1075 de 1992 y 4050 de 1994 (art. 36).
- **Evaluaciones:** preingreso, periódica, egreso (dentro de los 5 días hábiles después del retiro), retorno laboral (tras 90 días o más de ausencia), posincapacidad (30 días o más) y seguimiento (arts. 8 a 14).
  - La periodicidad la fija el SG-SST y nunca supera 3 años (art. 15).
- **Custodia:** la tiene el prestador de medicina SST y la conserva **mínimo 20 años** (art. 30).
  - El **empleador solo recibe el concepto médico ocupacional** (restricciones y recomendaciones, sin diagnóstico; no se usa la expresión «no apto») (art. 19).
  - El empleador **no puede guardar copia de la historia** salvo autorización expresa del trabajador **y** que tenga médico SST.
- **Prohibido exigir** prueba de embarazo, VIH o VDRL para ingresar o permanecer (arts. 21 a 23).
- **Consecuencia para el diseño:** el ERP guarda la fecha, el tipo de evaluación, el concepto y las restricciones con su vigencia, **nunca** la historia clínica.

### 9.4 Tiempos de conservación de documentos laborales y de nómina

| Documento | Plazo mínimo | Norma | Estado |
|---|---|---|---|
| Documentos del SG-SST: perfiles epidemiológicos, conceptos de exámenes, mediciones, **registros de capacitación**, **entrega de EPP** | **20 años desde el retiro del trabajador** | Decreto 1072 art. 2.2.4.6.13 | [V] |
| Historia clínica ocupacional (en el prestador) | 20 años | Resolución 1843 de 2025 art. 30 | [V] |
| Nómina, soportes contables y archivo de la PILA | **10 años** (libros y papeles del comerciante) | Código de Comercio art. 60 / Ley 962 de 2005 art. 28; Decreto 780 art. 3.2.1.9 | [V] remisión · [S] el plazo |
| Soportes tributarios, incluida la nómina electrónica | Mientras la declaración no esté en firme (en la práctica, 5 años o más); los 10 años del Código de Comercio lo cubren | ET art. 632 / Ley 962 art. 46 | [S] |
| Historia laboral, contratos y datos para el cálculo de pensión | **Indefinido.** Las tablas de retención del sector público usan 80 años; el plazo de 3 años de prescripción no aplica a derechos pensionales | CST 264; Concepto MinProtección 186917 de 2010 | [S/NC] |
| Contratos firmados electrónicamente | Durante la relación laboral y después de terminada, en el formato original | Decreto 1072 art. 2.2.1.1.12–13 | [V] |
| Datos de candidatos no seleccionados | Hasta cumplir la finalidad; luego se suprimen | Decreto 1074 art. 2.2.2.25.2.8 | [V] |

---

## 10. SG-SST mínimo para una pyme (Decreto 1072 de 2015, Libro 2, Parte 2, Título 4, Capítulo 6; Resolución 0312 de 2019)

Resolución 0312: https://colmenaseguros.com/documents/d/guest/abece-resolucion-0312-de-2019-290921 (ABC de ARL) · Decreto 1072: https://normativa.colpensiones.gov.co/colpens/docs/decreto_1072_2015.htm

### 10.1 Estándares mínimos por tamaño [V vía ABC de la ARL]

- **Hasta 10 trabajadores, riesgo I a III — 7 estándares:**
  1. Responsable del SG-SST.
  2. Afiliación a seguridad social.
  3. Capacitación en SST.
  4. Plan anual de trabajo.
  5. Evaluaciones médicas ocupacionales.
  6. Identificación de peligros y valoración de riesgos.
  7. Medidas de prevención y control.
- **11 a 50 trabajadores, riesgo I a III — 21 estándares.** Además de los anteriores:
  - Asignación de recursos, **COPASST**, **comité de convivencia**, política SST.
  - **Archivo y retención documental**, perfil sociodemográfico y diagnóstico de salud.
  - Restricciones médicas, **reporte e investigación de accidentes y enfermedades laborales**.
  - Mantenimiento, **entrega de EPP**, plan de emergencias, brigada y revisión por la dirección.
- **Más de 50 trabajadores, o cualquier tamaño con riesgo IV o V — 60 estándares.** Incluyen indicadores de frecuencia, severidad y ausentismo, matriz legal, auditoría anual y curso de 50 horas.
- **Quién lo diseña:**
  - Hasta 10 trabajadores: un técnico en SST con licencia, 1 año de experiencia y el curso de 50 h.
  - 11 a 50 trabajadores: un tecnólogo con 2 años de experiencia.
  - Más de 50 o riesgo IV/V: un profesional en SST.
  - Para administrar el sistema, basta el curso virtual de 50 h (Decreto 1072, art. 2.2.4.6.35). [V]
- **Autoevaluación anual y plan de mejoramiento:** < 60 % es crítico, 60 a 85 % moderado, > 85 % aceptable. Se reporta en la plataforma de MinTrabajo o de la ARL. [S/NC sobre la fecha exacta del reporte]

### 10.2 Matriz de peligros

- **Obligación (Decreto 1072, art. 2.2.4.6.15):** el empleador aplica una metodología sistemática que cubra todos los procesos, rutinarios y no rutinarios, todos los centros de trabajo y todos los trabajadores sin importar su forma de vinculación. [V]
- La **GTC 45** es la guía técnica usual, pero **no es obligatoria**. [S]
- **Para el diseño:** matriz por centro de trabajo o sede con proceso, actividad, peligro (clasificación GTC 45), controles, nivel de riesgo y responsable.

### 10.3 Accidentes de trabajo (FURAT)

- **Reporte a la ARL y a la EPS:** en el formato FURAT, **dentro de los 2 días hábiles** siguientes al accidente o al diagnóstico de la enfermedad laboral (Resolución 156 de 2005). [S/V]
  https://www.fasecolda.com/wp-content/uploads/res-0156-2005.pdf
- **Accidentes graves y mortales:** se reportan además a la Dirección Territorial de MinTrabajo dentro de los **2 días hábiles** (Decreto 1072, art. 2.2.4.1.7). [V]
- **Muerte del trabajador:** investigación con el COPASST o vigía dentro de los **15 días calendario**, remitida a la ARL (art. 2.2.4.1.6). [V]
- **Investigación de todo incidente o accidente:** Resolución 1401 de 2007, con un plazo de 15 días. [S/NC]
- **Ingreso de un trabajador a la ARL:** a más tardar el **día hábil siguiente** al ingreso, porque la cobertura empieza al día siguiente de la afiliación (art. 2.2.4.3.6). [V] Es crítico para el *onboarding* en el software.

### 10.4 COPASST o vigía

- **Menos de 10 trabajadores:** un **vigía** de SST. **10 o más:** **COPASST** paritario, elegido para **2 años** (Resolución 2013 de 1986; Decreto 1295 de 1994, art. 63). [S]
- **Tamaño del COPASST** [S]:

  | Trabajadores | Representantes por cada parte |
  |---|---|
  | 10 a 49 | 1 |
  | 50 a 499 | 2 |
  | 500 a 999 | 3 |
  | 1.000 o más | 4 |

- **Comité de convivencia laboral:** lo regula ahora la **Resolución 3461 del 1-sep-2025** (Diario Oficial del 11-sep-2025), que **deroga las Resoluciones 652 y 1356 de 2012**. [S/V]
  - Reuniones mensuales.
  - Procedimiento de máximo 65 días calendario.
  - Incluye contratistas.
  - https://normativa.colpensiones.gov.co/compilacion/docs/resolucion_mtra_3461_2025.htm

### 10.5 Capacitación

- **Programa de capacitación (art. 2.2.4.6.11):** documentado, impartido por personal idóneo y extendido a contratistas y trabajadores en misión. [V]
  - Incluye inducción y reinducción.
  - Los registros se conservan **20 años** (art. 2.2.4.6.13).

---

## 11. Otros

### 11.1 Incapacidades

| Origen | Días | Quién paga | Valor | Norma | Estado |
|---|---|---|---|---|---|
| Común | 1–2 | **Empleador** | 2/3 del salario, sin bajar del SMMLV diario ($58.364 en 2026) | Decreto 780 art. 3.2.1.10 par. 1; CST 227; Corte C-543/2007 | [V] / [S] el piso |
| Común | 3–90 | **EPS** (el empleador paga y recobra) | 2/3 del IBC, mínimo el SMMLV diario | CST 227; Decreto 780 (Decreto 1427 de 2022) | [V] / [S] |
| Común | 91–180 | EPS | 50 % del IBC, mínimo el SMMLV diario | CST 227 | [V] |
| Común | 181–540 | **Fondo de pensiones**, con concepto favorable de rehabilitación | 50 % | Decreto Ley 019 de 2012 art. 142 (modifica el art. 41 de la Ley 100) | [S] |
| Común | 541 en adelante | **EPS** | 50 % | Ley 1753 de 2015 art. 67; Decreto 780 art. 2.2.3.6.1 | [V] el art. 2.2.3.6.1 |
| Laboral (accidente de trabajo o enfermedad laboral) | Día del evento: el empleador. Desde el día siguiente: **ARL** | — | **100 % del IBC** | Ley 776 de 2002 art. 3; Decreto 780 art. 3.2.1.10 | [V] |

- **Requisito para que la EPS pague:** 4 semanas cotizadas inmediatamente antes de la incapacidad (art. 2.2.3.3.1). [V]
- **Plazos de la EPS:** revisa en 15 días hábiles y paga 5 días hábiles después (art. 2.2.3.4.3). [V]
- Durante la incapacidad se sigue cotizando sobre el valor de la incapacidad (art. 3.2.1.10). [V]
- https://normativa.colpensiones.gov.co/colpens/compilacion/docs/decreto_1427_2022.htm

### 11.2 Licencias de maternidad y paternidad

- **Maternidad:** **18 semanas**, pagadas con el salario que se devengue al iniciar la licencia (CST 236, Ley 2114 de 2021). [V]
  - Empieza al menos 2 semanas antes del parto.
  - Las **últimas 6 semanas se pueden compartir** con el padre (licencia parental compartida).
  - Existe además la licencia parental flexible de tiempo parcial.
- **Paternidad:** **2 semanas**, pagadas por la EPS en proporción a lo cotizado durante la gestación (Ley 2114, parágrafo 2 del art. 236). [V]
  - Aumenta 1 semana por cada punto que baje la tasa de desempleo estructural, hasta 5 semanas. Esa tasa se publica cada diciembre.
  - **[NC]** No se encontró ningún acto que haya activado el aumento: la regla vigente sigue siendo de 2 semanas.
  - Requisitos: registro civil ante la EPS dentro de los 30 días, y disfrute dentro de los 30 días siguientes al nacimiento (Decreto 780 art. 2.2.3.2.7). [V]
- **«Licencia de paternidad ampliada»:** hay un **proyecto de ley** (PL 014 de 2026 Cámara) para llevarla gradualmente a 12 semanas. Fue aprobado en primer debate el 9-sep-2026 y le faltan 3 debates. **No es ley.** [S]
  https://www.larepublica.co/alta-gerencia/licencia-de-paternidad-busca-llegar-a-12-semanas-con-aumento-gradual-en-el-congreso-4486968
- **Ley 2466:** no cambió la paternidad.
- **Recobro:** la EPS paga al aportante y luego recobra ante la ADRES (art. 2.2.3.4.4). [V]

### 11.3 Embargos y descuentos de salario

- **Salario mínimo inembargable** (CST 154). [V]
- **Excedente sobre el mínimo:** embargable solo en **1/5** (CST 155). [V]
- **Alimentos y cooperativas:** hasta el **50 %** de *todo* el salario (CST 156). [V]
- **Prelación de créditos:** los créditos laborales son de primera clase y excluyen a los demás (CST 157). [V]
- **Orden práctico de prelación entre embargos** [S/NC]:
  1. Alimentos.
  2. Cooperativas.
  3. Embargos ordinarios, por orden de llegada.

  Cuando confluyen varios, aplica el Código General del Proceso: el juez de alimentos tiene preferencia. Validar con un abogado laboral las reglas de concurrencia.
- **Libranzas (Ley 1527 de 2012, art. 3 num. 5):** el trabajador no puede recibir menos del **50 % de su salario neto** después de los descuentos de ley. [V]
  - Exige autorización expresa e irrevocable.
  - Las libranzas quedan fuera de la restricción del CST 149.
- **Cesantías:** inembargables salvo por alimentos o cooperativas (CST 344). [S]
- Textos: http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html · http://www.secretariasenado.gov.co/senado/basedoc/ley_1527_2012.html

---

## 12. Qué tiene que ser configurable por vigencia en el software

**Modelo recomendado:** tabla `payroll_parameters` (o equivalente) con `code`, `value`, `effective_from`, `effective_to`, `legal_source` (URL y norma) y `status` (vigente, transitorio, litigio). La consulta siempre se hace **por la fecha del hecho** (la hora trabajada, el día de pago o la fecha de corte), nunca «el valor actual». Varias normas cambian **a mitad de año** (1-jul, 15-jul, 25-dic, 1-abr), así que un período de nómina puede necesitar **dos valores** del mismo parámetro.

### A. Cambian cada año por decreto o resolución

1. SMMLV (con su estado jurídico: hoy Decreto 0159 de 2026, transitorio).
2. Auxilio de transporte y su tope (2 SMMLV).
3. Auxilio de conectividad (igual al de transporte).
4. UVT del año gravable.
5. Valores en pesos derivados del SMMLV: mínimo integral (13 SMMLV), tope IBC (25 SMMLV), umbral del 114-1 (10 SMMLV), rangos del FSP (4 a 20+ SMMLV), apoyo de sostenimiento del aprendiz (75 % y 100 %), monetización de la cuota SENA (1,5 SMMLV), SMMLV diario mínimo de las incapacidades.
6. Valores derivados de la UVT: rangos de la tabla del art. 383, topes de deducciones y rentas exentas.
7. Calendario de festivos (Ley 51 de 1983, festivos que se trasladan; cambian cada año).
8. Plazos de PILA por dígito del NIT, que dependen de los días hábiles del mes.

### B. Cambian por ley con calendario conocido (fecha de vigencia como dato)

9. Jornada máxima semanal (47, 46, 44, 42) y **divisor de hora** (235, 230, 220, 210), con la fecha de corte del 15-jul. Debe permitir que una empresa haya adoptado antes la jornada menor.
10. Hora de inicio del recargo nocturno: 21:00 → **19:00 desde el 25-dic-2025**.
11. Porcentaje del recargo dominical y festivo: 75 % → 80 % (1-jul-2025) → **90 % (1-jul-2026)** → 100 % (1-jul-2027). Con opción por empresa de adoptar el 100 % por anticipado.
12. Porcentajes de horas extra y recargos (25 %, 75 %, 35 %): fijos hoy, pero deben ser parámetros.
13. Umbral de trabajo dominical ocasional o habitual (2 o 3 o más por mes) y el día de descanso pactado por trabajador.
14. Topes de horas extra (2 por día y 12 por semana) para alertas.
15. Tabla del FSP: régimen de la Ley 100 → **régimen de la Ley 2381 desde el 1-abr-2027** (fecha en riesgo de cambio).
16. Reglas del aprendiz: modalidad (dual, tradicional o universitario) × etapa (lectiva o práctica) → % del SMMLV y aportes que aplican.
17. Fecha de vigencia del régimen de plataformas digitales (pendiente de reglamentación).

### C. Tarifas y tablas que pueden cambiar por ley

18. Tarifas de aportes: salud (8,5 % y 4 %), pensión (12 % y 4 %), caja (4 %), ICBF (3 %), SENA (2 %).
19. Bandera de exoneración del 114-1 **por empleador** (tipo de persona y número de empleados) y umbral en SMMLV.
20. Tabla ARL por clase (mínimo, inicial y máximo) y **clase asignada por centro de trabajo o cargo**.
21. Tabla de retención del art. 383 (rangos en UVT, tarifas y sumas fijas).
22. Topes de depuración: dependientes (10 % y 32 UVT), medicina prepagada (16 UVT), intereses de vivienda (100 UVT), AFC y FVP (30 % y 3.800 UVT), 25 % exento (790 UVT/año), límite global (40 % y 1.340 UVT/año), 72 UVT por dependiente (solo para el certificado anual).
23. Procedimiento de retención por trabajador (1 o 2) y fecha del recálculo semestral (junio y diciembre).
24. Reglas de incapacidad por tramo de días: quién paga, % y piso, más la regla de las 4 semanas cotizadas.
25. Duración de licencias: maternidad (18 semanas), paternidad (2 semanas, ampliable hasta 5), licencias del CST 57 nuevas o futuras (catálogo editable).
26. Tabla de indemnización del CST 64 (días por tramo y umbral de 10 SMMLV), incluido el régimen de transición de quienes tenían 10 años al 27-dic-2002.
27. Tasa de intereses sobre cesantías (12 %) y opción de pago mensual (1 %) o de anticipo de cesantías (8,33 %) **por acuerdo con cada trabajador**.
28. Límites de embargo (1/5 del excedente, 50 % por alimentos o cooperativas) y de libranza (50 % del neto).

### D. Cambian por resolución técnica (versionar el formato, no solo el valor)

29. **Anexo técnico de la nómina electrónica** (versión y reglas de validación) y su fecha de adopción obligatoria (3 meses).
30. **Estructura del archivo PILA** (Anexo 2 de la Resolución 2388): tipos de planilla, **tipos y subtipos de cotizante** (nuevos 74, 75 y 76 en 2026; el 75 desde el 1-mar-2027), códigos de novedad y longitudes de campo.
31. Catálogo de operadores PILA.

### E. Configurables por empresa (no por ley, pero necesarios)

32. Periodicidad de pago (semanal, quincenal o mensual), con el documento DIAN siempre **mensual**.
33. Tamaño de la empresa y clase de riesgo → estándares SG-SST que aplican (7, 21 o 60) y vigía o COPASST.
34. Políticas de retención documental por tipo (§9.4) y plazo del banco de hojas de vida.
35. Mecanismo de marcación por trabajador (biometría opcional con alternativa obligatoria; geolocalización solo al marcar).

> **Regla de oro para el código:** ninguno de los valores de este informe debe ir como constante en TypeScript ni en SQL. Siempre se leen de la tabla de parámetros por fecha y, si la organización tiene un valor propio, del suyo primero, igual que ya hace el proyecto con los modelos de IA.
