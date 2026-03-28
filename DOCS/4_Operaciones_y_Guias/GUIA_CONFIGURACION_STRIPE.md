# 🏦 Guía de Configuración de Stripe — GetBackplate SaaS

> **¿Para quién es esta guía?**
> Para el dueño o responsable del negocio que necesita configurar la pasarela de pagos (Stripe) para que los clientes puedan pagar sus planes de suscripción con tarjeta de crédito/débito.
>
> **No se necesitan conocimientos técnicos.** Todo se hace desde el navegador web.

---

## 📋 Índice

1. [Crear la cuenta de Stripe](#1-crear-la-cuenta-de-stripe)
2. [Activar el Modo Test (Pruebas)](#2-activar-el-modo-test-pruebas)
3. [Obtener las API Keys (claves secretas)](#3-obtener-las-api-keys-claves-secretas)
4. [Crear los Productos y Precios (tus Planes)](#4-crear-los-productos-y-precios-tus-planes)
5. [Configurar el Webhook](#5-configurar-el-webhook)
6. [Configurar el Customer Portal (Portal del Cliente)](#6-configurar-el-customer-portal-portal-del-cliente)
7. [Activar Stripe Tax (Impuestos automáticos)](#7-activar-stripe-tax-impuestos-automáticos)
8. [Pasar a Producción (cuando todo esté listo)](#8-pasar-a-producción-cuando-todo-esté-listo)
9. [Resumen de datos que necesito](#9-resumen-de-datos-que-necesito)

---

## 1. Crear la cuenta de Stripe

1. Abrí tu navegador y andá a 👉 **[https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)**
2. Completá los datos:
   - **Email**: el email corporativo de tu empresa (ej: `billing@tuempresa.com`)
   - **Nombre completo**: tu nombre
   - **País**: **United States** (Estados Unidos) — esto es **obligatorio** porque la plataforma opera en EEUU
   - **Contraseña**: una contraseña segura
3. Hacé click en **"Create account"**
4. Revisá tu email y **confirmá tu dirección de correo electrónico** haciendo click en el link que te manda Stripe

> [!IMPORTANT]
> **El país DEBE ser United States.** Si lo ponés en otro país, los impuestos, moneda y regulaciones no van a funcionar correctamente con la plataforma.

---

## 2. Activar el Modo Test (Pruebas)

Antes de cobrar de verdad, vamos a configurar todo en **modo prueba** para verificar que funciona.

1. Entrá al Dashboard de Stripe: **[https://dashboard.stripe.com](https://dashboard.stripe.com)**
2. Arriba a la derecha, mirá que diga **"Test mode"** (Modo de prueba).
   - Si dice "Live mode", hacé click en el switch/interruptor que está al lado y cambialo a **"Test mode"**
3. Vas a ver que el fondo del dashboard se pone con una franja naranja arriba que dice **"TEST DATA"** — eso confirma que estás en modo prueba

> [!TIP]
> En modo test, **no se cobra dinero real**. Se usan tarjetas de prueba ficticias para simular pagos. Es 100% seguro.

---

## 3. Obtener las API Keys (claves secretas)

Estas son las "contraseñas" que le permiten a la plataforma comunicarse con Stripe.

### Paso a paso:

1. Estando en **Test mode**, andá a: **[https://dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)**
   - O navegá manualmente: en el menú de la izquierda → **Developers** → **API keys**
2. Vas a ver dos claves:

| Nombre | Empieza con... | ¿Para qué sirve? |
|--------|----------------|-------------------|
| **Publishable key** | `pk_test_...` | Se usa en el frontend (parte visible). Es pública, no es secreta. |
| **Secret key** | `sk_test_...` | Se usa en el backend (servidor). **NUNCA la compartas públicamente.** |

3. **Copiá ambas claves** y mandámelas de forma segura (por privado, NO por chat abierto ni email sin cifrar).

> [!CAUTION]
> La **Secret key** (`sk_test_...`) es como la contraseña de tu cuenta bancaria. Si alguien la obtiene, puede hacer cargos desde tu cuenta. **Nunca la publiques en redes sociales, emails abiertos o chats grupales.**

### ¿Qué necesito exactamente?

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICA_TEST
STRIPE_SECRET_KEY=TU_CLAVE_SECRETA_TEST
```

---

## 4. Crear los Productos y Precios (tus Planes)

Acá es donde creás los planes de suscripción que van a ver tus clientes. Por ejemplo: Plan Básico, Plan Pro, Plan Enterprise.

### Paso a paso:

1. Andá a: **[https://dashboard.stripe.com/test/products](https://dashboard.stripe.com/test/products)**
   - O menú de la izquierda → **Product catalog** → **Products**
2. Hacé click en el botón **"+ Add product"** (arriba a la derecha)

### Para CADA plan que quieras ofrecer, completá:

| Campo | Qué poner | Ejemplo |
|-------|-----------|---------|
| **Name** (Nombre) | El nombre del plan | `Plan Starter` |
| **Description** (Descripción) | Una descripción corta | `Ideal para restaurantes pequeños. Hasta 1 sucursal.` |
| **Pricing model** | Elegí **"Standard pricing"** | — |
| **Price** (Precio) | El precio mensual en USD | `49.00` |
| **Currency** | **USD** (Dólar estadounidense) | — |
| **Billing period** | **Monthly** (mensual) o **Yearly** (anual) | `Monthly` |
| **Tax behavior** | **Exclusive** (se calcula el impuesto aparte) | — |

3. Hacé click en **"Save product"**
4. Una vez guardado, Stripe te mostrará la página del producto. Buscá la sección **"Pricing"** y ahí vas a ver algo así:

```
Price ID: price_1PxxxxxxxxxxxxxxxxxxxxXXXX
```

5. **Copiá ese Price ID** — lo necesito para conectar el plan en la plataforma
6. **Repetí los pasos 2-5 para cada plan** que quieras ofrecer

### Ejemplo de planes típicos:

| Plan | Precio/mes (USD) | Price ID (lo copiás de Stripe) |
|------|-------------------|-------------------------------|
| Starter | $49 | `price_1P...` (lo que te dé Stripe) |
| Professional | $99 | `price_1P...` |
| Enterprise | $299 | `price_1P...` |

> [!IMPORTANT]
> **Necesito que me mandes una tabla como la de arriba** con el nombre de cada plan y su `Price ID` correspondiente. Esa información es la que conecta Stripe con la base de datos de la plataforma.

---

## 5. Configurar el Webhook

Un "webhook" es como un mensajero automático: cada vez que un cliente paga, Stripe le avisa a la plataforma para activar el plan automáticamente.

### En modo Test (para probar):

1. Andá a: **[https://dashboard.stripe.com/test/webhooks](https://dashboard.stripe.com/test/webhooks)**
   - O menú: **Developers** → **Webhooks**
2. Hacé click en **"+ Add endpoint"**
3. Completá:

| Campo | Qué poner |
|-------|-----------|
| **Endpoint URL** | La URL de tu plataforma + `/api/stripe/webhook`. Ejemplo: `https://tudominio.com/api/stripe/webhook` |
| **Listen to** | Elegí **"Events on your account"** |

4. En **"Select events to listen to"**, buscá y seleccioná estos 3 eventos:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`

5. Hacé click en **"Add endpoint"**
6. Stripe te va a mostrar un **"Signing secret"** que empieza con `whsec_...`
7. **Copiá ese Signing secret** y mandámelo

```
STRIPE_WEBHOOK_SECRET=TU_WEBHOOK_SECRET_AQUI
```

> [!NOTE]
> Si todavía no tenés el dominio final del sitio web, avisame y te doy las instrucciones para testear localmente con la **Stripe CLI** (una herramienta gratuita de Stripe para probar en tu computadora).

---

## 6. Configurar el Customer Portal (Portal del Cliente)

El "Customer Portal" es una página que Stripe te da gratis donde los clientes pueden:
- Ver sus facturas pasadas
- Cambiar su tarjeta de crédito
- Cancelar su suscripción

### Paso a paso:

1. Andá a: **[https://dashboard.stripe.com/test/settings/billing/portal](https://dashboard.stripe.com/test/settings/billing/portal)**
   - O menú: **Settings** (ícono de engranaje) → **Billing** → **Customer portal**
2. Activá estas opciones:

| Opción | Activar |
|--------|---------|
| **Invoice history** (historial de facturas) | ✅ Sí |
| **Customer update** → **Payment methods** | ✅ Sí (para que cambien su tarjeta) |
| **Customer update** → **Email address** | ✅ Sí |
| **Subscriptions** → **Cancel subscriptions** | ✅ Sí |
| **Subscriptions** → **Switch plans** | ✅ Sí (si querés que puedan subir/bajar de plan solos) |

3. En **"Business information"**:
   - **Business name**: poné el nombre de tu empresa
   - **Terms of service URL**: si tenés una, ponela. Si no, la podemos crear después
   - **Privacy policy URL**: si tenés una, ponela. Si no, la podemos crear después

4. Hacé click en **"Save changes"**

> [!TIP]
> No necesitás mandarme nada de esta sección. Solo asegurate de que esté configurado y guardado, porque la plataforma ya está preparada para abrir este portal automáticamente.

---

## 7. Activar Stripe Tax (Impuestos automáticos)

Como la plataforma opera en **Estados Unidos**, cada estado tiene sus propios impuestos (Sales Tax). Stripe puede calcularlos automáticamente.

### Paso a paso:

1. Andá a: **[https://dashboard.stripe.com/test/settings/tax](https://dashboard.stripe.com/test/settings/tax)**
   - O menú: **Settings** → **Tax**
2. Hacé click en **"Get started"** o **"Add a registration"**
3. Configurá:

| Campo | Qué poner |
|-------|-----------|
| **Origin address** | La dirección física de tu empresa en EEUU |
| **Country** | United States |
| **State** | El estado donde está registrada tu empresa |

4. Si tu empresa está registrada para cobrar Sales Tax en algún estado, agregá esos estados como **"Tax registrations"**
5. Guardá los cambios

> [!WARNING]
> La configuración de impuestos depende del estado donde tu empresa esté registrada y en cuáles estados vendés. **Consultá con tu contador** para saber en qué estados debés registrarte para cobrar Sales Tax. Stripe calcula los montos automáticamente, pero vos tenés que decirle en qué estados estás registrado.

---

## 8. Pasar a Producción (cuando todo esté listo)

Una vez que hayamos probado todo y funcione bien en modo test, hay que activar el **modo producción** para empezar a cobrar de verdad.

### Paso a paso:

1. En el Dashboard de Stripe, andá a: **Settings** → **Business details**
2. Stripe te va a pedir completar datos reales:
   - Tipo de empresa (LLC, Corporation, etc.)
   - Dirección legal
   - Datos bancarios (cuenta donde recibir los pagos)
   - Número EIN (tax ID de tu empresa en EEUU)
   - Datos de identidad del representante legal
3. Una vez aprobado (Stripe revisa los datos, puede tardar 1-3 días):
   - Cambiar el switch de **"Test mode"** a **"Live mode"**
   - Repetir los pasos 3, 4 y 5 de esta guía pero ahora en modo **Live** (las claves van a empezar con `pk_live_`, `sk_live_`, y `whsec_...` para live)
   - Mandame las nuevas claves de producción

> [!CAUTION]
> **En modo Live se cobra dinero REAL.** Nunca actives el modo Live hasta que hayamos verificado juntos que todo funciona correctamente en modo Test.

---

## 9. Resumen de datos que necesito

Acá tenés un resumen de **todo lo que tenés que mandarme** una vez que completes los pasos anteriores:

### 🔑 Claves API (Paso 3)

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = TU_CLAVE_PUBLICA_AQUI
STRIPE_SECRET_KEY                  = TU_CLAVE_SECRETA_AQUI
```

### 💰 Price IDs de cada plan (Paso 4)

| Nombre del Plan | Precio Mensual (USD) | Price ID de Stripe |
|-----------------|---------------------|--------------------|
| (nombre)        | $(precio)           | price_1Pxxxxxxxx   |
| (nombre)        | $(precio)           | price_1Pxxxxxxxx   |
| (nombre)        | $(precio)           | price_1Pxxxxxxxx   |

### 🔔 Webhook Secret (Paso 5)

```
STRIPE_WEBHOOK_SECRET = TU_WEBHOOK_SECRET_AQUI
```

### 🌐 URL del Webhook (Paso 5)

Necesito que me confirmes el **dominio final** del sitio, por ejemplo:
```
https://app.tuempresa.com
```
Para configurar el webhook apuntando a:
```
https://app.tuempresa.com/api/stripe/webhook
```

---

## ❓ Preguntas Frecuentes

### ¿Stripe cobra comisión?
Sí. Stripe cobra **2.9% + 30¢ por transacción exitosa** en EEUU. No hay cuota mensual fija. Solo pagás cuando cobrás.

### ¿Cuánto tarda en llegar el dinero a mi cuenta bancaria?
En EEUU, los pagos se depositan en tu cuenta bancaria en un plazo de **2 días hábiles**.

### ¿Puedo ofrecer pruebas gratuitas (free trial)?
Sí. Cuando creás el precio en Stripe, podés agregar un **free trial** de X días. Avisame si querés activar esto y por cuántos días.

### ¿Puedo cambiar los precios después?
Sí. Podés crear nuevos precios en cualquier momento. Los clientes existentes mantienen su precio original salvo que migres sus suscripciones manualmente.

### ¿Qué pasa si una tarjeta falla?
Stripe reintenta el cobro automáticamente varias veces durante los siguientes 3-7 días. Si el pago sigue fallando, la suscripción se marca como **impaga** y la plataforma restringe el acceso automáticamente.

### ¿Los clientes reciben factura por email?
Sí. Stripe envía automáticamente un recibo por email después de cada cobro exitoso. También pueden descargar facturas desde el portal de cliente.

---

> **¿Dudas?** Contactame y lo resolvemos juntos. Toda esta configuración es un proceso de una sola vez; una vez que esté andando, el cobro y la activación de planes es todo automático. 🚀
