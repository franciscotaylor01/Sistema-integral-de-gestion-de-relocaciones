# SIGR — Sistema Integral de Gestión de Relocaciones

Plataforma de gestión de relocaciones internacionales para **Relocare**, desarrollada por **Argen Labs**.

> **Fase 1 — interfaz.** Todos los datos son ficticios (mocks). No hay backend, autenticación, integraciones (ARCA) ni cálculos impositivos o de tipo de cambio.

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
| `npm run build`     | Chequeo de tipos + build de producción         |
| `npm run preview`   | Sirve el build                                 |
| `npm run typecheck` | TypeScript                                     |
| `npm run lint`      | ESLint (`lint:fix` para corregir)              |

## Secciones

| Ruta                     | Contenido                                                                 |
| ------------------------ | ------------------------------------------------------------------------- |
| `/`                      | Dashboard: rentabilidad, KPIs, facturación vs. cobranzas, vencimientos, proyectos recientes, alertas, pagos a proveedores |
| `/proyectos`             | Listado con búsqueda y filtros (en la URL)                                |
| `/proyectos/:id`         | Detalle con pestañas: Resumen, Servicios, Operaciones, Finanzas, Documentos, Actividad |
| `/clientes`, `/clientes/:id` | Clientes corporativos: empresa, contactos, proyectos, tarifario, facturas, saldos |
| `/operaciones`           | Tablero/lista de servicios, trámites migratorios, vencimientos de documentos |
| `/finanzas`              | Posición por moneda, facturas, cuentas por cobrar, proveedores, pagos, costos por proyecto |
| `/calendario`, `/proveedores`, `/documentos`, `/reportes`, `/configuracion` | Módulos anticipados ("Próximamente") |

Búsqueda global con <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd>.

## Arquitectura

```
src/
  app/                 App raíz (providers) y router (code-splitting por ruta)
  theme/               Tokens de diseño (claro/oscuro) y ThemeProvider — de Vertix
  styles/              CSS global — de Vertix
  config/              Marca, navegación, catálogos (estados, servicios, países)
  components/ui/       Primitivas reutilizables (Card, Button, StatTile, DataTable, Tabs, …)
  components/layout/   AppShell, Header, TopNav, Sidebar, MobileNav, búsqueda, menús
  components/feedback/ Toasts
  features/<módulo>/   Páginas, componentes y selectores por módulo
  data/mock/           Datos ficticios
  services/            `SigrDataSource`: única frontera entre UI y datos
  hooks/               useQuery, useWorkspace, useDismiss
  lib/                 Formato (es-AR), fechas, montos por moneda, búsqueda, motion
  types/               Modelo de dominio
```

**Modelo de dominio.** El **Proyecto** (una relocación) es la entidad central: pertenece a un cliente, traslada a un beneficiario con su familia y agrupa **varios servicios** (migraciones, vivienda, escolaridad, mudanza, …), cada uno con estado, responsable, proveedor, vencimiento y etapas propias. Facturas, cuentas a pagar, documentos y actividad se vinculan al proyecto (y opcionalmente al servicio).

**Datos.** Los indicadores se derivan de los mismos registros (facturas, pagos, cuentas a pagar), así que todas las pantallas son coherentes. Los montos se agrupan por moneda y nunca se convierten. La fecha "hoy" de la demo está fijada en `DEMO_TODAY` (`src/config/brand.ts`).

**Supabase (próximo paso).** Implementar `SigrDataSource` (`src/services/dataSource.ts`) contra Supabase; los tipos de `src/types/domain.ts` ya reflejan las tablas.

## Notas

- TypeScript está fijado en 6.0 porque `typescript-eslint` aún no soporta TypeScript 7.
- Se respeta `prefers-reduced-motion` (MotionConfig + CSS).
