# Arquitectura de Integración: Pagos y Suscripciones B2B (EEUU) usando Stripe

Este documento detalla la estrategia de implementación comercial para la nueva plataforma SaaS **GetBackplate**, enfocándose en una integración limpia, segura y escalable de pagos recurrentes usando **Stripe**. 

Se ha diseñado considerando **específicamente el mercado de Estados Unidos**, donde se deben contemplar impuestos (Sales Tax) y métodos de pago corporativos.

## User Review Required
> [!IMPORTANT]
> - **Impuestos (EEUU):** Stripe Tax se recomienda ampliamente para recolectar el código postal (ZIP Code) correcto y calcular el Sales Tax automáticamente según cada estado. Si tu modelo de precios indica "taxes not included", necesitas esta automatización.
> - **Catálogo en Stripe:** Los precios (ej $99/mo, $299/mo) que mostramos actualmente en la Landing Page deberán crearse manualmente dentro de tu panel de **Stripe Products**.

## Cambios Propuestos

### 1. Modelado de Datos (Supabase)

Para sincronizar la organización de tu SaaS con el cliente en Stripe de manera limpia, necesitamos un par de tablas nuevas.

#### [NEW] `supabase/migrations/[TIMESTAMP]_stripe_billing.sql`
- **`stripe_customers`**: Para enlazar de manera inequívoca tu empresa (`organization_id`) con el `cus_xxxxxxxx` de Stripe.
- **`subscriptions`**: Para mantener una réplica de alta velocidad del estado del plan en nuestra base de datos, evitando hacer llamadas lentas a Stripe en cada página.
  - Campos clave: `status` (activa, cancelada, impaga), `price_id`, `current_period_end`.
- **Modificación a `teams / organizations`**: Almacenar o enlazar qué `plan_id` tiene activo.

### 2. Flujo de Precios y Checkout (Frontend & Backend)

#### [MODIFY] `src/shared/ui/landing-components.tsx`
- En la sección `LandingPricing`, actualizaremos el botón principal (`Call to Action`) de los planes.
- Al hacer click, el botón disparará una petición POST a nuestra API interna (`/api/stripe/checkout`).

#### [NEW] `src/app/api/stripe/checkout/route.ts`
- Se creará una sesión segura de Checkout (`stripe.checkout.sessions.create`).
- Se configuran los line items: `price_id` correspondiente al plan clickeado.
- Se configurará `automatic_tax: { enabled: true }` y validación robusta de Billing Address obligatoria para EEUU (recogiendo ZIP codes).
- Si el usuario *no* está autenticado, Stripe pedirá su email para registrar su organización de forma automática durante el Checkout.

### 3. Portal de Clientes (Autoservicio B2B)

El cliente que compró un plan debe tener un lugar en su perfil (Panel de Empresa) para gestionar sus métodos de pago sin depender de nuestro soporte.

#### [NEW] `src/app/api/stripe/billing-portal/route.ts`
- Creará una sesión autenticada usando `stripe.billingPortal.sessions.create`.
- Redirigirá al gerente del restaurante (el `company_admin`) al entorno seguro de Stripe para descargar facturas pasadas ("invoices" muy importantes en EEUU para la deducción de impuestos) o cancelar el plan.

### 4. Automatización con Webhooks

Los webhooks son los mensajeros que mandan la información de Stripe a nuestra base de datos en segundo plano.

#### [NEW] `src/app/api/stripe/webhook/route.ts`
- Endpoing protegido vía `STRIPE_WEBHOOK_SECRET` con verificación estricta de firmas usando el SDK oficial de Stripe.
- **Eventos a escuchar:**
  - `checkout.session.completed`: La venta inicial fue un éxito. Se marca la suscripción como **activa**. Otorga inmediatamente acceso al Dashboard del restaurante.
  - `customer.subscription.updated`: Renovacones, cambios a planes más caros/baratos o cuando la tarjeta falla.
  - `customer.subscription.deleted`: El administrador canceló el plan, la aplicación del restaurante se "congela" o se revoca acceso hasta que pague.

## Plan de Verificación

### Verificación Automatizada (Opcional pero Recomendada)
- Configurar el CLI de test de Stripe: `stripe listen --forward-to localhost:3000/api/stripe/webhook` para verificar localmente los eventos sin tarjeta de crédito.

### Verificación Manual
1. Generaremos las Secret Keys temporales ("Test Mode") en tu panel de Stripe.
2. Visitaremos la Landing Page simulando ser un nuevo cliente y elegiremos un plan Premium.
3. Completaremos el flujo del Checkout ingresando la clásica tarjeta de prueba americana (`4242...`) y un ZIP Code de Texas.
4. Verificaremos que al finalizar, se nos redirigió al dashboard correctamente.
5. Verificaremos que la tabla `subscriptions` diga `status: active`.
