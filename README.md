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
- **Frecuencia:** Se ejecuta de manera automática cada 15 minutos, exclusivamente de Lunes a Viernes (hora de Nueva York).
- **Qué guarda:** Detecta cambios en el precio del crudo Brent y guarda el precio actual junto con las estadísticas del día (apertura, mínimo y máximo).

### Sincronización Automática con Git
El proyecto incluye automatizaciones diseñadas para ejecutarse en un servidor sin intervención manual:

- **Auto-Pull:** Al iniciarse y cada hora, el sistema verifica si hay actualizaciones en el repositorio remoto de GitHub. Si existen, ejecuta un `git pull` y termina el proceso. Esto permite que gestores como PM2 reinicien la aplicación con el nuevo código.
- **Auto-Commit:** De Lunes a Viernes a las 23:50 (hora de Montevideo), el sistema realiza un commit y push de todos los archivos generados en el día hacia GitHub.

### Ejecución
El proyecto usa Node.js y `node-cron` de forma interna. Para iniciarlo, basta con:
```bash
npm install
npm run start
```

Para ejecución en servidores, se recomienda utilizar PM2 para asegurar su continuidad:
```bash
pm2 start index.js --name "scrapers"
```
