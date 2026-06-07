# Automatizaciones Uruguay

Este repositorio contiene scripts automáticos que extraen información en tiempo real. 

### Cotización del Dólar (BROU)
Los datos históricos del dólar se guardan en la carpeta `dollar/` divididos por mes (por ejemplo, `05-2026.csv`). 

- Se extraen de la pizarra oficial del [Banco República (BROU)](https://www.brou.com.uy/cotizaciones).
- **Frecuencia:** Se ejecuta de manera automática cada 15 minutos, de Lunes a Viernes entre las 09:00 y las 18:00 (hora de Uruguay).
- **Qué guarda:** Detecta cambios en la cotización y guarda el precio de compra, venta, y estadísticas del día (apertura, mínimo y máximo).

### Precio del Petróleo (Brent)
Los datos históricos del petróleo se guardan en la carpeta `petroleo/` divididos por mes (por ejemplo, `05-2026.csv`).

- Se extraen de [OilPrice.com](https://oilprice.com/).
- **Frecuencia:** Se ejecuta de manera automática cada 1 hora, de Lunes a Viernes (hora de Nueva York).
- **Qué guarda:** Detecta cambios en el precio del crudo Brent y guarda el precio actual junto con las estadísticas del día (apertura, mínimo y máximo).

### Sistema de Logs y Alertas

> [!NOTE]
> El sistema implementa una rotación de logs de forma autónoma para evitar archivos pesados y conflictos con el control de versiones. La carpeta se ignora por defecto.

- Los logs se guardan en la carpeta `logs/` bajo el formato `scraper-YYYY-MM-DD.log`.
- La carpeta `logs/` y los logs antiguos se encuentran en `.gitignore` para no interferir con el estado local de Git.

#### Alertas por Correo Electrónico
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

### Sincronización Automática con Git
El proyecto incluye automatizaciones diseñadas para ejecutarse en un servidor sin intervención manual:

- **Auto-Pull:** Al iniciarse y cada hora, el sistema verifica si hay actualizaciones en el repositorio remoto de GitHub. Si existen, ejecuta un stash temporal de los datos locales, realiza un `git pull --rebase`, y finalmente restaura el stash. Esto previene conflictos por cambios locales en los CSV y permite que PM2 reinicie la aplicación de forma automática y transparente con el nuevo código.
- **Auto-Commit:** De Lunes a Viernes a las 23:50 (hora de Montevideo), el sistema realiza un commit y push de todos los archivos generados en el día hacia GitHub mediante operaciones atómicas y seguras con bloqueo de procesos.

### Ejecución
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
