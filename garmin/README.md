# JTZ para Garmin (Connect IQ)

App nativa de reloj Garmin para JTZ Running Club. **Proyecto separado** del backend/frontend
(no afecta el build web ni la app de teléfono).

> ⚠️ **Estado:** esqueleto Fase 1 (conexión a JTZ + entreno del día). Escrito sin poder
> compilar aquí — necesita el SDK de Garmin para construir y probar. Espera iteración.

---

## Qué necesitas (una sola vez)

1. **Cuenta de desarrollador Garmin** (gratis): https://developer.garmin.com/connect-iq/
2. **Connect IQ SDK Manager** → instala el SDK y al menos un **device** (ej. Forerunner 265, Fenix 7).
   - https://developer.garmin.com/connect-iq/sdk/
3. **Editor:** VS Code + extensión oficial **"Monkey C"** (Garmin), o Eclipse con el plugin.
4. Un **developer key** (lo genera el SDK Manager: `openssl` o el botón "Generate a Key").

## Cómo construir y probar (en el simulador)

```bash
# desde la carpeta garmin/
# 1. compilar para un device (ej. fr265)
monkeyc -d fr265 -f monkey.jungle -o bin/jtz.prg -y /ruta/a/developer_key

# 2. abrir el simulador y cargar el .prg
connectiq            # abre el simulador
monkeydo bin/jtz.prg fr265
```
En VS Code: `Ctrl+Shift+P` → **"Monkey C: Build Current Project"** y **"Run"**.

## Cómo instalarlo en tu reloj real (para probar)
Copia `bin/jtz.prg` a la carpeta `GARMIN/APPS/` del reloj (conectado por USB). Para
distribuir a los corredores se publica en la **Connect IQ Store** (requiere revisión de Garmin).

---

## Autenticación con JTZ
El reloj no tiene login. Se usa un **token** de la API de JTZ, configurado desde
**Garmin Connect Mobile → JTZ → Ajustes** (ver `resources/settings/settings.xml`).
El backend de JTZ ya emite ese token al iniciar sesión (`POST /api/auth/login` → `token`).
La app lo lee de `Properties` y lo manda en el header `Authorization: Bearer <token>`.

Base API: `https://jtz-app-production.up.railway.app/api`

---

## Roadmap
- [x] **Fase 1** — Conexión a JTZ + pantalla "Entreno de hoy"
- [ ] **Fase 2** — Grabar actividad (Activity Recording API → FIT) y sincronizar
- [ ] **Fase 3** — Métricas en vivo + mensajes del coach (texto + vibración; Garmin no tiene bocina)
- [ ] **Fase 4** — Navegación de ruta GPX (course points, giros)

## Límites conocidos de Garmin
- **Sin audio:** los ánimos del coach se muestran como **texto + vibración**, no voz.
- **Red:** el reloj sale a internet por el teléfono (Garmin Connect Mobile, Bluetooth) o WiFi
  en algunos modelos. Las llamadas HTTP usan `Communications.makeWebRequest`.
- **Compatibilidad:** cada modelo tiene distinta pantalla/APIs; hay que listar los `products`
  soportados en `manifest.xml` y probar por modelo.
