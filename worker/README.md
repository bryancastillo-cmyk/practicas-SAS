# worker/ · servidor de estadísticas

Un Cloudflare Worker con una base D1 que recibe los eventos de uso que mandan el inicio y las
prácticas (ingresos, minutos activos, misiones, temas dominados, prácticas completas) y los
resume por estudiante para el admin.

## Despliegue (una vez)

1. Cuenta de Cloudflare (gratis): https://dash.cloudflare.com/sign-up
2. API token: perfil → "My Profile" → "API Tokens" → "Create Token" → plantilla **"Edit Cloudflare
   Workers"** → Continue → Create Token. Copiarlo.
3. Account ID: en el panel, "Workers & Pages" → a la derecha, "Account ID". Copiarlo.
4. En GitHub → repo → Settings → Secrets and variables → Actions, crear tres secrets:
   - `CLOUDFLARE_API_TOKEN` = el token del paso 2 (a la plantilla hay que agregarle el permiso Account / D1 / Edit)
   - `CLOUDFLARE_ACCOUNT_ID` = el ID del paso 3
   - `ESTADISTICAS_CLAVE` = una clave larga inventada (ej. 20 letras y números). Es la que el admin
     pide para ver las estadísticas.
5. GitHub → pestaña Actions → "Desplegar worker de estadísticas" → "Run workflow".

El workflow crea la base D1 si no existe, despliega el worker, guarda la clave como secreto del
worker y escribe la URL del worker en `docs/config.json` (`telemetria.url`). A partir de ahí los
navegadores empiezan a mandar eventos y el admin muestra la tarjeta "Estadísticas".

## Privacidad

Se guarda: alias, tipo de evento, nombre de archivo de la práctica, segundos activos, tema
dominado, fecha y hora. No se guardan respuestas, ni nombres reales, ni correos, ni IP.
