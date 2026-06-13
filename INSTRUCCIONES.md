# JTZ Running Club — Instrucciones de inicio

## Requisitos previos
- Node.js 18+ instalado (https://nodejs.org)
- Cuenta de Stripe (gratis en https://dashboard.stripe.com) — opcional para pagos en línea

---

## 1. Configurar el Backend

Abre una terminal y ejecuta:

```bash
cd C:\Users\52646\Downloads\JTZ\backend

npm install
npx prisma generate
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
npm run dev
```

El servidor correrá en http://localhost:3001

---

## 2. Configurar el Frontend

Abre **otra** terminal:

```bash
cd C:\Users\52646\Downloads\JTZ\frontend

npm install
npm run dev
```

La app estará en http://localhost:5173

---

## 3. Acceder a la aplicación

Abre http://localhost:5173

**Credenciales de prueba:**
| Rol     | Correo              | Contraseña | Acceso |
|---------|---------------------|------------|--------|
| Coach   | coach@jtz.mx        | coach123   | Panel completo |
| Corredor| ana.garcia@jtz.mx   | runner123  | Vista personalizada |

Los runners también pueden auto-registrarse desde `/registro`

---

## 4. Activar pagos con Stripe (opcional)

1. Entra a https://dashboard.stripe.com/apikeys
2. Copia tu **Secret key** (empieza con `sk_test_...`)
3. Edita el archivo `backend/.env`:
   ```
   STRIPE_SECRET_KEY="sk_test_TU_CLAVE_AQUI"
   ```
4. Para probar webhooks localmente, instala el Stripe CLI:
   https://stripe.com/docs/stripe-cli
   ```bash
   stripe listen --forward-to localhost:3001/api/stripe/webhook
   ```
   Copia el `whsec_...` que te da y ponlo en `STRIPE_WEBHOOK_SECRET`

**Tarjeta de prueba Stripe:** `4242 4242 4242 4242` · cualquier fecha futura · cualquier CVC

---

## Módulos y acceso por rol

| Módulo           | Coach | Runner |
|------------------|-------|--------|
| Panel general    | ✅ Estadísticas completas | ✅ Mi plan + mis pagos + eventos |
| Corredores       | ✅ CRUD completo | ❌ No visible |
| Entrenamientos   | ✅ Crear y asignar planes | ❌ No visible (ve su plan en el panel) |
| Eventos          | ✅ Crear + gestionar | ✅ Ver + inscribirse |
| Pagos            | ✅ Registrar + marcar pagado | ✅ Ver + pagar con Stripe |
| Tienda           | ✅ Inventario + pedidos | ❌ No visible |
| Comunicación     | ✅ Publicar anuncios | ✅ Leer anuncios |
| Mi perfil        | ❌ | ✅ Editar datos personales |

---

## Explorar la base de datos

```bash
cd backend
npx prisma studio
```

Abre http://localhost:5555 para ver y editar los datos.
