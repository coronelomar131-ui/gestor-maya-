# Gestor Maya Backend

Backend Express para Mercado Libre integration con Firebase Admin SDK.

## Setup

1. Instalar dependencias:
```bash
npm install
```

2. Crear archivo `.env` basado en `.env.example`:
```bash
cp .env.example .env
```

3. Llenar variables de entorno:
   - `ML_APP_ID` - ID de app en Mercado Libre
   - `ML_SECRET_KEY` - Secret key de Mercado Libre
   - `FIREBASE_SERVICE_ACCOUNT` - JSON de credenciales Firebase
   - `CORS_ORIGIN` - URL del frontend
   - `FRONTEND_URL` - URL base del frontend

## Desarrollo

```bash
npm run dev
```

Servidor correrá en `http://localhost:3000`

## Endpoints

### OAuth
- `GET /ml/login-url` - Obtener URL de autorización
- `GET /ml/callback?code=...` - Callback de Mercado Libre (OAuth exchange)

### Productos
- `GET /ml/productos/:mlUserId` - Listar productos de ML

### Sync
- `POST /ml/sync` - Sincronizar producto a ML
  - Body: `{ mlUserId, itemId, quantity, price }`

### Webhooks
- `POST /ml/webhook` - Recibir eventos de Mercado Libre

### Health
- `GET /health` - Verificar estado del servidor

## Deployment en Railway

1. Conectar repo en Railway
2. Agregar variables de entorno
3. Railway detectará `Procfile` y usará `node server.js`

## Arquitectura

- **Tokens**: Almacenados en Firestore (nunca en URLs o localStorage)
- **Auto-refresh**: Si token expira, se refresca automáticamente con refresh_token
- **CORS**: Configurado para gestor-maya.vercel.app
- **Errors**: Manejo consistente de errores de ML
