import 'dotenv/config';
import { notifyError } from './logger.js';
console.log('Generating intentional error to test FormSubmit...');
// Llamamos a la función de error con un mensaje de prueba
notifyError(
  'This is a test error to verify that email alerts with FormSubmit are working correctly.',
);
setTimeout(() => {
  console.log('Check your inbox (and spam folder).');
  process.exit(0);
}, 3000);
