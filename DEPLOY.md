# Deployment a Vercel — Instrucciones paso a paso

## 📋 Requisitos previos

- Cuenta en [Vercel](https://vercel.com) (OAuth con GitHub)
- Repositorio GitHub con los cambios pusheados a `main`
- Variables de entorno configuradas (ver abajo)

## 🔐 Variables de entorno requeridas

Copiar y completar según las claves que tengas:

```
# Obligatorias (sin estas, la app corre en modo DEMO)
API_FOOTBALL_KEY=<tu-key-de-api-football.com>
ODDSPAPI_API_KEY=<tu-key-de-oddspapi.com>
SPORTSGAMEODDS_API_KEY=<tu-key-de-sportsgameodds.com>

# Opcionales (no impactan si no están)
BALLDONTLIE_API_KEY=<tu-key-si-tienes>
```

### Dónde obtener claves

| API | Gratuito | URL |
|---|---|---|
| API-Football v3 | Sí (100/día) | https://www.api-football.com |
| OddsPapi | Sí (250/mes) | https://oddspapi.com |
| SportsGameOdds | Contactar | https://sportsgameodds.com |
| BALLDONTLIE | Sí | https://balldontlie.io |

## 🚀 Pasos de deployment

### 1. Conectar repo a Vercel

```bash
# En CLI (opcional, puedes hacerlo en web)
npm install -g vercel
vercel login
vercel
```

O desde el dashboard: https://vercel.com/new → selecciona el repo

### 2. Configurar variables de entorno en Vercel

**En el dashboard de Vercel:**

1. Abrí tu proyecto → Settings → Environment Variables
2. Pegá cada variable de la lista arriba:
   - Variable name: `API_FOOTBALL_KEY`
   - Value: `<tu-clave>`
   - Environments: marcar ✓ Production
3. Repetir para cada variable
4. Guardar

### 3. Configurar `vercel.json` (ya incluido)

El archivo ya existe y contiene:

```json
{
  "buildCommand": "npm run build",
  "env": {
    "NODE_ENV": "production"
  },
  "functions": {
    "api/**/*.js": {
      "runtime": "nodejs20.x",
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

**No cambiar** a menos que necesites Edge Functions (que ya está configurado en `runtime: 'edge'` dentro de cada `/api/*.js`).

### 4. Pushear a GitHub y triggear deploy

```bash
git push origin main
```

Vercel auto-detecta y deployea automáticamente.

### 5. Verificar deploy

**URL de tu app:**
```
https://<tu-proyecto>.vercel.app
```

Checkeo:
- ✅ Partidos cargan (ESPN en vivo)
- ✅ Sliders what-if funcionan
- ✅ Bet Slip guarda en localStorage
- ✅ Toast aparecen sin errores en consola
- ✅ PWA manifest válido (abrí DevTools → Application → Manifest)
- ✅ Service Worker registrado (`console` en DevTools debe mostrar `[SW] registered`)

## ⚡ CI/CD automatizado (GitHub Actions)

Opcional: deploying automático on push to main.

**Crear `.github/workflows/deploy.yml`:**

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: vercel/action@v4
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

Luego en Vercel dashboard → Settings → Integrations → GitHub, autogenera los secrets.

## 🔧 Rollback si algo falla

En Vercel dashboard → Deployments → seleccionar el deployment anterior → Click "Promote to Production"

## 📊 Monitoreo post-deploy

- **Vercel Analytics**: Dashboard → Analytics (Performance, Web Vitals)
- **Console errors**: DevTools → Console (chequeá en prod también)
- **Network tab**: Verify `/api/*` calls (cachés correctos)

## 🎯 Checklist final antes de deployment

- [ ] `npm run build` verde
- [ ] `npm test` 99/99 verde
- [ ] Variables de entorno cargadas en Vercel dashboard
- [ ] `vercel.json` presente y correcto
- [ ] Último commit pusheado a main
- [ ] Ningún `.env` en el repo (solo `.env.example`)

---

**Timestamp**: 2026-06-20 · Phase 5 completo, listo para deploy
