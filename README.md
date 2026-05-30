# Automatizaciónes Uruguay

Este repositorio contiene scripts automáticos que extraen información en tiempo real. 

### Cotización del Dólar (BROU)
Los datos históricos del dólar se guardan en la carpeta `dollar/` divididos por mes (por ejemplo, `05-2026.csv`). 

- Se extraen de la pizarra oficial del [Banco República (BROU)](https://www.brou.com.uy/cotizaciones).
- **Frecuencia:** Se ejecuta de manera automática cada 15 minutos, **exclusivamente de Lunes a Viernes**.
- **Qué guarda:** Detecta cambios en la cotización y guarda el precio de compra, venta, y estadísticas del día (apertura, mínimo y máximo).

### Ejecución
El proyecto usa Node.js y `node-cron` de forma interna. Para iniciarlo, basta con:
```bash
npm install
npm run start
```
