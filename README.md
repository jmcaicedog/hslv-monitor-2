
# HSLV Monitor 2

## Descripción

HSLV Monitor 2 es una herramienta de monitoreo diseñada para supervisar y gestionar sistemas en tiempo real. Proporciona una interfaz intuitiva para rastrear métricas clave y mantener la salud del sistema.

## Características

- Monitoreo en tiempo real de métricas del sistema
- Panel de control interactivo
- Alertas configurables
- Historial de eventos
- Interfaz web responsive

## Instalación

```bash
git clone https://github.com/jmcaicedog/hslv-monitor-2.git
cd hslv-monitor-2
npm install
```

## Uso

```bash
npm start
```

## Configuración de autenticación

La aplicación usa `Neon Auth` para el inicio de sesión.

1. Crea el archivo `.env.local` usando `.env.example` como base.
2. Configura `NEON_AUTH_BASE_URL` con la URL de Auth de tu proyecto Neon.
3. Configura `DATABASE_URL` con tu cadena PostgreSQL de Neon.

Importante (origenes permitidos en Neon Auth):
- En Neon Console > Auth, agrega en Trusted Origins las URLs desde las que abres la app.
- Ejemplos comunes en desarrollo: `http://localhost:3000` y `http://192.168.0.6:3000`.
- Si no estan permitidas, al iniciar sesion veras el error `Invalid origin`.

Notas:
- El endpoint local `/api/auth/[...path]` actúa como proxy hacia Neon Auth.
- Ya no se usa `NextAuth`, ni proveedores de Google en la app.

## Estrategia de datos (Neon)

La app ahora consulta sensores e historicos desde Neon. No consulta CSV ni API Ubibot desde la UI.

Arquitectura objetivo:
- Frontend: solo lee datos desde Neon (via endpoints internos `/api/sensors`).
- Ubibot: solo se consulta durante la sincronizacion.
- Sincronizacion: se ejecuta periodicamente por cron y persiste en Neon.

### Variables de entorno

1. `DATABASE_URL`: conexion a PostgreSQL en Neon.
2. `UBIBOT_ACCOUNT_KEY`: clave de Ubibot para sincronizacion periodica.
3. `UBIBOT_CHANNEL_API_KEYS_JSON` (opcional): mapa JSON de `channel_id -> api_key` para usar `/feeds` y obtener series completas por canal.
4. `CRON_SECRET`: secreto para proteger el endpoint `/api/cron/sync`.

### Inicializacion de base de datos

```bash
npm run db:init
```

### Sincronizar datos recientes desde Ubibot

```bash
npm run db:sync:api
```

Este comando actualiza catalogo de sensores y agrega/actualiza lecturas recientes en Neon.

Notas de sincronizacion Ubibot:
- Si solo usas `UBIBOT_ACCOUNT_KEY`, algunos canales pueden devolver datos parciales en `/summary` (por ejemplo solo `field4`).
- Para obtener series completas (temperatura/humedad/voltaje/etc.) configura `UBIBOT_CHANNEL_API_KEYS_JSON` con la `api_key` de cada canal.
- El script intenta primero `/feeds` con `api_key` por canal y, si no existe o falla, hace fallback a `/summary`.

### Cron en Vercel

El proyecto incluye `vercel.json` para ejecutar `GET /api/cron/sync` cada 10 minutos.

1. Configura en Vercel las variables de entorno:
	- `DATABASE_URL`
	- `UBIBOT_ACCOUNT_KEY`
	- `UBIBOT_CHANNEL_API_KEYS_JSON` (opcional)
	- `CRON_SECRET`
2. Vercel invocara automaticamente el endpoint cron.
3. El endpoint requiere header `Authorization: Bearer <CRON_SECRET>`.

### Operacion sugerida

1. Ejecutar una vez `npm run db:init`.
2. Programar `npm run db:sync:api` cada cierto tiempo (cron) para mantener datos al dia.
3. Levantar la app con `npm run dev` o `npm start`.

## Requisitos

- Node.js 14+
- npm 6+

## Contribuir

Las contribuciones son bienvenidas. Por favor, abre un issue o envía un pull request.

## Licencia

MIT
