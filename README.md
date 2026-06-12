# Automatizaciones Uruguay

Este repositorio contiene scripts automáticos que extraen información en tiempo real. 

## Cotización del Dólar (BROU)
Los datos históricos del dólar se guardan en la carpeta `dollar/` divididos por mes (por ejemplo, `05-2026.csv`). 

- Se extraen de la pizarra oficial del [Banco República (BROU)](https://www.brou.com.uy/cotizaciones).
- **Frecuencia:** Se ejecuta de manera automática cada 15 minutos, de Lunes a Viernes entre las 09:00 y las 18:00 (hora de Uruguay).
- **Qué guarda:** Detecta cambios en la cotización y guarda el precio de compra, venta, y estadísticas del día (apertura, mínimo y máximo).

## Precio del Petróleo (Brent)
Los datos históricos del petróleo se guardan en la carpeta `petroleo/` divididos por mes (por ejemplo, `05-2026.csv`).

- Se extraen de [OilPrice.com](https://oilprice.com/).
- **Frecuencia:** Se ejecuta de manera automática cada 1 hora, de Lunes a Viernes (hora de Nueva York).
- **Qué guarda:** Detecta cambios en el precio del crudo Brent y guarda el precio actual junto con las estadísticas del día (apertura, mínimo y máximo).

## Recopilación de Noticias con Inteligencia Artificial (Gemini)

El sistema incluye un scraper de noticias diseñado para construir una Línea del Tiempo de Uruguay.

- **Frecuencia:** Se ejecuta de manera automática 4 veces al día (06:00, 12:00, 18:00 y 22:00).
- **Proceso:**
  1. Recopila noticias mediante RSS de portales de Uruguay (Montevideo Portal, Teledoce) y BBC Mundo.
  2. Obtiene el contexto de los eventos más recientes de Supabase y las noticias locales de los últimos 7 días.
  3. Envía toda la información a **Google Gemini 2.5 Flash** (con sistema automático de reintentos y fallback a `gemini-2.0-flash` en caso de sobrecarga de servidores).
  4. La IA actúa como editora: filtra lo intrascendente, selecciona solo eventos de alto impacto para Uruguay, y devuelve un JSON estructurado redactado desde cero.
- **Qué guarda:** Los resultados aprobados se guardan localmente en la carpeta `noticias/` bajo el formato `YYYY-MM-DD.json`.
- **Interfaz Web (API y UI):** El proyecto levanta una API HTTP local y sirve una interfaz gráfica desde la carpeta `public/`. Al acceder a la raíz del servidor, se renderiza la línea de tiempo con las noticias parseadas a través de Markdown.

> [!NOTE]
> Para activar este módulo, requiere configurar la clave de Google GenAI en el archivo \`.env\` bajo la variable \`GEMINI_TOKEN\`.

## Sistema de Logs y Alertas

> [!NOTE]
> El sistema implementa una rotación de logs de forma autónoma para evitar archivos pesados y conflictos con el control de versiones. La carpeta se ignora por defecto.

- Los logs se guardan en la carpeta `logs/` bajo el formato `scraper-YYYY-MM-DD.log`.
- La carpeta `logs/` y los logs antiguos se encuentran en `.gitignore` para no interferir con el estado local de Git.

### Alertas por Correo Electrónico
El sistema está configurado para enviar alertas automáticas por correo electrónico en caso de errores críticos (por ejemplo, si cambian los selectores web o hay conflictos de Git). Para habilitarlas, crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:

```env
ALERT_EMAIL=correo-destino@ejemplo.com
```
> [!IMPORTANT]
> La primera vez que el sistema intente enviar un error, FormSubmit enviará un correo a tu casilla pidiéndote que "Actives" o "Confirmes" la dirección. Debes hacer clic en ese enlace para que los futuros correos de alerta lleguen correctamente.

**Para activar y probar el sistema por primera vez:**
Puedes generar un error intencional sin afectar el entorno de producción utilizando el script de prueba. Vale la pena hacerlo para recibir el correo de activación de FormSubmit:
```bash
node test-alert.js
```

## Sincronización Automática con Git
El proyecto incluye automatizaciones diseñadas para ejecutarse en un servidor sin intervención manual:

- **Auto-Pull:** Al iniciarse y a los 5 minutos de cada hora (ej. 10:05), el sistema verifica si hay actualizaciones en el repositorio remoto de GitHub. Si existen, ejecuta un stash temporal de los datos locales, realiza un `git pull --rebase`, y finalmente restaura el stash. Se ejecuta de forma escalonada respecto a los scrapers para prevenir condiciones de carrera al editar los CSV, y permite que PM2 reinicie la aplicación de forma automática y transparente con el nuevo código.
- **Auto-Commit:** De Lunes a Viernes a las 23:50 (hora de Montevideo), el sistema realiza un commit y push de todos los archivos generados en el día hacia GitHub mediante operaciones atómicas y seguras con bloqueo de procesos.

## Sincronización con Supabase

> [!NOTE]
> Este módulo de sincronización está específicamente diseñado para alimentar la base de datos y la plataforma de **[Línea del Tiempo Uruguay](https://lineadeltiempo.uy)**.

El sistema incluye un módulo de sincronización central (`supabase.js`) que se encarga de subir los datos recolectados hacia la base de datos principal en Supabase.

- **Frecuencia:** Se ejecuta de manera automática a las 23:55 (hora de Uruguay) de Lunes a Viernes.
- **Qué guarda:** 
  - Inserta el precio final del día del **Petróleo Brent** en la tabla `oil_prices`.
  - Inserta el último precio de venta del **Dólar** junto a sus estadísticas (apertura, mínimo y máximo) en la tabla `dollar_rates`.
- Para activarlo, es necesario configurar las variables `SUPABASE_URL` y `SUPABASE_KEY` (usando la service role key) en tu archivo `.env`.

## Ejecución
El proyecto usa Node.js y `node-cron` de forma interna. Para iniciarlo, basta con:
```bash
npm install
npm start
```

> [!TIP]
> Para ejecución en servidores y VPS, es altamente recomendable utilizar **PM2**. Además de mantener el script corriendo, es fundamental para que el sistema de actualizaciones (`Auto-Pull`) funcione sin intervención manual.

```bash
pm2 start index.js --name "scrapers"
```
