import 'dotenv/config';
import { notifyError } from './logger.js';
console.log('Generando error intencional para probar FormSubmit...');
// Llamamos a la función de error con un mensaje de prueba
notifyError('Esto es un error de prueba para verificar que las alertas por correo con FormSubmit están funcionando correctamente.');
setTimeout(() => {
  console.log('Revisa tu bandeja de entrada (y la de spam).');
  process.exit(0);
}, 3000);
