
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

### Variables de entorno

1. `DATABASE_URL`: conexion a PostgreSQL en Neon.
2. `UBIBOT_ACCOUNT_KEY`: clave de Ubibot para sincronizacion periodica.

### Inicializacion de base de datos

```bash
npm run db:init
```

### Cargar historico desde CSV

```bash
npm run db:import:csv
```

Este comando lee archivos en `public/csv/*.csv` y los inserta en Neon.

### Sincronizar datos recientes desde Ubibot

```bash
npm run db:sync:api
```

Este comando actualiza catalogo de sensores y agrega/actualiza lecturas recientes en Neon.

### Operacion sugerida

1. Ejecutar una vez `npm run db:init`.
2. Ejecutar una vez `npm run db:import:csv`.
3. Programar `npm run db:sync:api` cada cierto tiempo (cron) para mantener datos al dia.
4. Levantar la app con `npm run dev` o `npm start`.

## Requisitos

- Node.js 14+
- npm 6+

## Contribuir

Las contribuciones son bienvenidas. Por favor, abre un issue o envía un pull request.

## Licencia

MIT
