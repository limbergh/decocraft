// Crea o cambia la cuenta del panel. Se ejecuta en el VPS como root:
//
//   node /opt/decocraft-panel/credenciales.mjs marianaherreralugo7@gmail.com
//
// Pide la contraseña sin mostrarla y escribe /etc/decocraft/panel.json, que
// el servicio lee pero no puede escribir (systemd lo tiene en solo lectura).
//
// La contraseña no se guarda: se guarda su scrypt con una sal propia. scrypt
// está hecho para ser lento y para no poderse acelerar con tarjetas gráficas,
// así que una lista robada no se convierte en contraseñas.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';

const ARCHIVO = process.env.DECOCRAFT_CUENTA || '/etc/decocraft/panel.json';
const usuario = process.argv[2];

if (!usuario) {
  console.error('Uso: node credenciales.mjs <correo>');
  process.exit(1);
}

function preguntarClave(mensaje) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Sin eco: la contraseña no queda en pantalla ni en el historial.
    rl.output.write(mensaje);
    rl._writeToOutput = () => {};
    rl.question('', (valor) => { rl.close(); process.stdout.write('\n'); resolve(valor); });
  });
}

const clave = process.env.DECOCRAFT_CLAVE || await preguntarClave('Contraseña nueva: ');
if (!process.env.DECOCRAFT_CLAVE) {
  const repetida = await preguntarClave('Repítela: ');
  if (clave !== repetida) { console.error('No coinciden.'); process.exit(1); }
}
if (clave.length < 8) { console.error('Muy corta: mínimo 8 caracteres.'); process.exit(1); }

const sal = randomBytes(16).toString('base64');
// El secreto firma las sesiones. Se conserva si ya existía, para que cambiar
// la contraseña no eche fuera a quien ya estaba dentro en otro dispositivo.
const previo = existsSync(ARCHIVO) ? JSON.parse(readFileSync(ARCHIVO, 'utf8')) : {};
const cuenta = {
  usuario,
  sal,
  hash: scryptSync(clave, sal, 64).toString('base64'),
  secreto: previo.secreto || randomBytes(32).toString('base64'),
};

mkdirSync(ARCHIVO.replace(/\/[^/]+$/, ''), { recursive: true, mode: 0o750 });
writeFileSync(ARCHIVO, JSON.stringify(cuenta, null, 2), { mode: 0o640 });
console.log(`Listo: ${usuario} guardado en ${ARCHIVO}`);
console.log('Falta darle el archivo al servicio:  chown root:www-data ' + ARCHIVO);
