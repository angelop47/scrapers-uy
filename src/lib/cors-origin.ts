/**
 * Decide si una petición con header `Origin` puede usar la API.
 *
 * - Sin `Origin` (curl, servidor a servidor): permitido.
 * - Mismo origen que el servidor (el panel servido por esta misma app, se
 *   acceda por localhost, IP de LAN o dominio): permitido. El navegador manda
 *   `Origin` en los POST aunque sea el mismo origen.
 * - Cualquier otro: solo si está en la lista de orígenes permitidos.
 */
export function isOriginAllowed(
  origin: string | undefined,
  requestHost: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  try {
    return !!requestHost && new URL(origin).host === requestHost;
  } catch {
    // Origin inválido (por ejemplo "null" desde un file://).
    return false;
  }
}
