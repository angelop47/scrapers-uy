# BROU Dollar Scraper

Automatización para el registro histórico de las cotizaciones del dólar del **Banco República Oriental del Uruguay (BROU)**.

## ¿Qué hace este proyecto?

Este repositorio utiliza **GitHub Actions** y **Playwright** para monitorear la cotización oficial del dólar en la [pizarra del BROU](https://www.brou.com.uy/cotizaciones) de forma automática.

### Características principales:

- **Frecuencia**: Se ejecuta cada **30 minutos** de lunes a viernes, entre las **10:00 y las 18:00** (hora Uruguay).
- **Eficiencia**: Solo guarda una nueva fila en el CSV si detecta un cambio en el precio de compra o venta. Si no hay cambios, no genera commits innecesarios.
- **Estadísticas Diarias**: Además de la cotización actual, calcula automáticamente para cada día:
  - **Apertura**: El primer valor registrado en el día.
  - **Mínimo**: El valor más bajo alcanzado durante el día.
  - **Máximo**: El valor más alto alcanzado durante el día.
- **Doble Trazabilidad**: Registra estadísticas (apertura/min/max) tanto para la **Compra** como para la **Venta**.

## Datos Registrados

Los datos se almacenan en el archivo [**cotizaciones.csv**](./cotizaciones.csv) con las siguientes columnas:

- `fecha`: YYYY-MM-DD
- `hora`: HH:mm (Uruguay)
- `moneda`: Siempre "Dólar"
- `compra`: Valor de compra actual
- `venta`: Valor de venta actual
- `compra_apertura / compra_minimo / compra_maximo`: Estadísticas basadas en el valor de compra.
- `venta_apertura / venta_minimo / venta_maximo`: Estadísticas basadas en el valor de venta.

## Logs de Ejecución

El archivo `scraper.log` permite auditar el funcionamiento del sistema:

- `SUCCESS`: Se detectó un cambio y se guardó la cotización.
- `SKIPPED`: El script corrió pero el precio no ha cambiado.
- `ERROR`: Hubo un problema técnico en la captura.
