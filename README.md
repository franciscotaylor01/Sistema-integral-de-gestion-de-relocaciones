# SIGR — Sistema Integral de Gestión de Relocaciones

Plataforma de gestión de relocaciones internacionales para **Relocare**, desarrollada por **Argen Labs**.

> **Fase 3 — gestión comercial.** Demo funcional con persistencia local en el navegador: proyectos y servicios (Fase 2) más clientes, tarifarios, cotizaciones, órdenes de compra y trazabilidad comercial. Todos los datos son ficticios. No hay backend, autenticación, integraciones (ARCA) ni facturación real, impuestos o conversión de monedas.

## Diseño

SIGR adopta el sistema de diseño de **Vertix** sin cambios de lenguaje visual: tokens (`src/theme/tokens.css`), CSS global, tipografía Inter Variable, superficies, sombras, radios, header en píldoras, rail lateral, KPI tiles, tabla, gráfico de barras con trama, animaciones (`src/lib/motion.ts`) y modo claro/oscuro. Las variables se renombraron `--vx-*` → `--sg-*`; se agregaron solo `warning` e `info-soft` para estados.

## Stack

React 19 · TypeScript 6 (strict) · Vite 8 · Tailwind CSS 4 · React Router 8 · Motion · Recharts · Lucide · ESLint 10

## Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script              | Descripción                                    |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo                         |
| `npm test`          | Tests de dominio y persistencia (Vitest)       |
| `npm run build`     | Chequeo de tipos + build de producción         |
| `npm run preview`   | Sirve el build                                 |
| `npm run typecheck` | TypeScript                                     |
| `npm run lint`      | ESLint (`lint:fix` para corregir)              |

## Secciones

| Ruta                     | Contenido                                                                 |
| ------------------------ | ------------------------------------------------------------------------- |
| `/`                      | Dashboard: rentabilidad, KPIs, facturación vs. cobranzas, vencimientos, proyectos recientes, alertas, pagos a proveedores |
| `/proyectos`             | Listado con búsqueda y filtros (en la URL)                                |
| `/proyectos/nuevo`       | Alta de proyecto en 4 pasos (cliente y beneficiario, traslado, servicios, revisión) |
| `/proyectos/:id`         | Detalle: Resumen, Servicios, Operaciones, Finanzas (comercial, resultado, facturas, cobros, costos, obligaciones, pagos) y Actividad; Documentos como vista previa |
| `/tareas`                | Mis tareas: próximas, vencidas, esperando a terceros y completadas |
| `/clientes`, `/clientes/:id` | Clientes corporativos: empresa, contactos, proyectos, tarifario, facturas, saldos |
| `/operaciones`           | Tablero/lista de servicios, trámites migratorios, vencimientos de documentos |
| `/finanzas`              | Resumen, Facturas, Cuentas por cobrar, Proveedores, Cobros y pagos, Costos y gastos, Resultados por proyecto, y las vistas comerciales de Fase 3 |
| `/facturas/:id`          | Factura: edición del borrador, emisión (registro interno), anulación, cobros y gestiones de cobranza |
| `/proveedores`, `/proveedores/:id` | Proveedores: datos, acuerdos por servicio, obligaciones, pagos y saldos por moneda |
| `/calendario`, `/documentos`, `/reportes`, `/configuracion` | Módulos anticipados ("Próximamente") |

Búsqueda global con <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd>. "Mis tareas" y "Restablecer datos de demo" están en el menú de usuario.

## Fase 4 — gestión financiera

- **Facturas:** ID estable, número interno (`FC-AAAA-NNNN`), entidad emisora, cliente, proyecto, fechas, moneda, tipo, líneas vinculadas a servicio/cotización/OC, impuestos cargados por el usuario (SIGR no los determina), notas y referencia externa. Ciclo de vida borrador → emitida → anulada; *cobro parcial*, *cobrada* y *vencida* se derivan de los cobros. Se impide facturar por encima de lo facturable por servicio (política del cliente, aprobación, OC, hito) y facturar dos veces lo mismo. **Emitir es solo un registro interno de demo:** no es un comprobante fiscal, no hay CAE ni integración con ARCA.
- **Cuentas por cobrar:** cobros aplicables a varias facturas del mismo cliente y moneda, parciales o múltiples. No se puede aplicar más que el saldo; el excedente queda como saldo a favor explícito, aplicable después. Antigüedad de saldos, días de atraso y gestiones de cobranza. Las reversiones conservan el historial.
- **Proveedores y costos:** proveedores (empresa o profesional) con país, contacto, moneda preferida, categorías, datos de pago (placeholder), estado y notas. Costos reales imputables a proyecto, servicio, proveedor y categoría; los gastos generales de la empresa van aparte. El costo estimado (planificación) se distingue del costo real.
- **Obligaciones y pagos a proveedores:** cada obligación tiene ID, comprobante, fechas, condición de pago y estado; registrarla genera su costo. Pagos totales o parciales, sin sobrepago (el excedente es un anticipo explícito), con reversión que conserva el historial.
- **Florencia:** modelada como profesional independiente que factura a la empresa, con acuerdos por servicio, sus comprobantes, pagado acumulado y pendiente, vinculados a proyectos. "Pagar después del cobro al cliente" es configurable por acuerdo/obligación; pagar antes exige un motivo explícito. No hay motor de reparto de ganancias y sus pagos no son distribuciones societarias.
- **Multimoneda:** nunca se suman monedas distintas. Los tipos de cambio se registran con fuente y fecha; los ajustes crean un registro nuevo que reemplaza al anterior (historial completo) y no se aplican conversiones. Aritmética en centavos enteros (`src/domain/finance/money.ts`).
- **Resultados por proyecto:** por moneda: acordado, facturado (neto y total), cobrado, por cobrar, costo estimado, costo real, obligaciones, pagado e impago. El margen operativo (facturado neto − costo real directo, antes de impuestos y gastos generales) se separa de la caja; si faltan bases se muestra "Sin datos suficientes".
- **Migración:** `schemaVersion 4`. Las facturas, cuentas a pagar y pagos de fases anteriores se convierten preservando exactamente los importes cobrados y pagados (`src/data/legacyFinance.ts`).

## Fase 3 — gestión comercial

- **Clientes:** alta y edición con identificación fiscal (única), dirección de facturación, contactos (uno principal), plazo de pago, moneda, estado, notas y **política comercial configurable**: exige OC o no, exige cotización aprobada o no, hito de facturación (al aprobar, al iniciar o al completar el servicio) y validez de cotizaciones.
- **Tarifarios:** reglas por cliente, servicio, mercado (país de destino o todos), moneda, unidad, tramo por cantidad, vigencia y estado, con búsqueda, filtros y un simulador "Probar tarifa". Precedencia explícita: mercado específico > general; mayor tramo aplicable. Las reglas que empatan se marcan como **superpuestas**: guardarlas requiere confirmación y las cotizaciones piden elegir el precio a mano.
- **Cotizaciones** (`/cotizaciones/:id`): se generan desde el proyecto con una línea por servicio contratado y el precio sugerido por el tarifario. Los ajustes sobre la tarifa requieren motivo y un usuario autorizado (`COMMERCIAL_AUTHORIZERS`). Estados: borrador, enviada, aprobada, rechazada y vencida (derivado de la validez). Tienen versiones: las aprobadas son un snapshot inmutable que los cambios de tarifario no alteran, y una nueva versión aprobada reemplaza a la anterior sin borrarla. Los totales van por moneda, nunca sumados entre monedas.
- **Órdenes de compra** (`/ordenes-compra/:id`): varias por proyecto, cada una con asignaciones por servicio. Se impide superar el monto de la OC y lo aprobado por servicio (sumando otras OC), y repetir el número de OC de un mismo cliente. Un doble envío no crea duplicados. Cada OC tiene una referencia documental estable (`DOCREF-…`) para adjuntar el archivo más adelante. Anular una OC libera sus autorizaciones.
- **Trazabilidad:** en Proyecto → Finanzas se ven, por servicio, lo cotizado, lo aprobado, lo autorizado por OC y lo pendiente de OC, más un indicador de facturación que evalúa por separado la aprobación, la OC (según la política) y el hito. Recibir una OC no habilita la facturación por sí sola.
- **Finanzas:** vistas Comercial, Cotizaciones, Órdenes de compra y Pendiente de OC. **Dashboard:** alertas comerciales accionables (cotizaciones vencidas o por vencer, trabajo aprobado sin OC, tarifas superpuestas).
- **Migración de datos:** el almacenamiento pasa a `schemaVersion 3`. Los datos guardados en Fase 2 se migran automáticamente, conservando proyectos, servicios, tareas y notas (`src/services/local/migrations.ts`).

## Fase 2 — operación diaria

- **Proyectos:** alta guiada con validación (fechas, origen ≠ destino, campos requeridos) e idempotencia (un doble envío no duplica el proyecto); edición en un modal dentro del proyecto, incluida la familia.
- **Servicios:** varios por proyecto, cada uno con su workflow, responsable, proveedor, fechas, estado, notas y tareas. Se pueden completar (con confirmación) y reabrir (con motivo).
- **Workflows:** plantillas configurables por tipo de servicio y de trámite. Las etapas se completan, se activan, se editan o se agregan; al activarse una etapa se crean sus tareas.
- **Trámites:** dentro de servicios migratorios (residencia, DNI, TIE, visa…), uno por persona, cada uno con su workflow. Una persona puede tener varios a lo largo del tiempo.
- **Avance:** calculado sobre las etapas completadas (servicios y trámites), nunca fijo.
- **Tareas:** siempre vinculadas a proyecto y servicio (y opcionalmente a trámite y etapa).
- **Actividad:** cada cambio queda registrado; se pueden agregar notas.

### Persistencia de la demo

`src/services/local/` guarda el dataset ficticio en `localStorage` (clave `sigr.demo.dataset`), versionado (`SCHEMA_VERSION`) y validado. Si lo guardado está dañado, es de otra versión o es inconsistente, se descarta y se recargan los datos iniciales, con un aviso. Si el navegador no permite guardar, la app sigue funcionando en memoria. Nunca cargar datos reales en esta demo.

## Arquitectura

```
src/
  app/                 App raíz (providers) y router (code-splitting por ruta)
  theme/               Tokens de diseño (claro/oscuro) y ThemeProvider — de Vertix
  styles/              CSS global — de Vertix
  config/              Marca, navegación, catálogos, catálogo de servicios, trámites y plantillas de workflow
  components/ui/       Primitivas reutilizables (Card, Button, StatTile, DataTable, Tabs, …)
  components/layout/   AppShell, Header, TopNav, Sidebar, MobileNav, búsqueda, menús
  components/feedback/ Toasts
  features/<módulo>/   Páginas, componentes y selectores por módulo
  data/mock/, seed.ts  Datos ficticios y armado del dataset inicial
  domain/              Lógica de negocio pura (proyectos, servicios, trámites, workflows, tareas, actividad) + tests
  domain/commercial/   Clientes, tarifas, cotizaciones, OC, trazabilidad y elegibilidad de facturación
  services/            `SigrDataSource` (única frontera UI ↔ datos), adaptador local y store reactivo
  hooks/               useQuery, useWorkspace, useDismiss
  lib/                 Formato (es-AR), fechas, montos por moneda, búsqueda, motion
  types/               Modelo de dominio
```

**Modelo de dominio** (`src/types/domain.ts`). Cliente 1─* Proyecto 1─* Servicio 1─* Trámite; Proyecto *─* Persona vía Participante (beneficiario, cónyuge, hijo/a…); Tarea → Proyecto + Servicio (+ Trámite/Etapa); Evento de actividad → Proyecto (+ Servicio/Trámite/Tarea). Colecciones normalizadas con IDs estables; el cliente nunca se copia dentro del proyecto. Hay referencias financieras preparadas (tarifario, cotización, OC, facturas) sin lógica todavía.

**Configuración.** Catálogo de servicios: `src/config/serviceCatalog.ts`. Trámites: `src/config/procedureCatalog.ts`. Workflows (etapas y tareas por defecto): `src/config/workflowTemplates.ts`.

**Datos.** Los indicadores se derivan de los mismos registros (facturas, pagos, cuentas a pagar), así que todas las pantallas son coherentes. Los montos se agrupan por moneda y nunca se convierten. La fecha "hoy" de la demo está fijada en `DEMO_TODAY` (`src/config/brand.ts`).

**Supabase (próximo paso).** Implementar `SigrDataSource` (`src/services/dataSource.ts`) contra Supabase: cada colección del `Dataset` (`src/domain/dataset.ts`) es una tabla, y las reglas de `src/domain/` pueden reutilizarse o portarse a funciones del backend.

## Notas

- TypeScript está fijado en 6.0 porque `typescript-eslint` aún no soporta TypeScript 7.
- Se respeta `prefers-reduced-motion` (MotionConfig + CSS).
