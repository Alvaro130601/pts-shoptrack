# PTS ShopTrack

Planta 3D de PTS con las **órdenes abiertas y en cola por centro de mecanizado**, leídas de Zoho Projects.

![Prototipo v0](docs/referencia/prototipo-v0.png)

## Correr
```bash
npm install
cp .env.example .env      # DATA_SOURCE=seed para datos simulados
npm run dev               # http://localhost:5173
```
Para datos reales: crear un *Self Client* en https://api-console.zoho.com, generar el refresh token con los
scopes de `.env.example`, poner `DATA_SOURCE=zoho` y completar `config/maquinas.json` → `zoho_nombre`.

## Estructura
| Carpeta | Qué hay |
|---|---|
| `web/` | Escena R3F (`escena/`) + HUD (`hud/`) |
| `server/` | API Express y fuentes de datos (`fuentes/zoho.ts`, `fuentes/seed.ts`) |
| `shared/` | Tipos y reglas de negocio (buffer, cola, semáforo) |
| `data/layout/` | Layout real de la planta exportado del CAD |
| `config/` | Máquinas, mapeo de Zoho, feriados |
| `docs/` | Especificación, integración Zoho, plan de trabajo y referencias |
