'use strict';

// Uso:  node scripts/crearUsuario.js <usuario> <rol> <contraseña> ["Nombre completo"]
// Ejemplo: node scripts/crearUsuario.js lupita reporteador clave123 "Lupita Pérez"
// Si el usuario ya existe, se reemplaza. Roles: admin, reporteador, monitoreo.

const { guardarUsuario, ARCHIVO } = require('../usuarios');

const [usuario, rol, password, ...resto] = process.argv.slice(2);
if (!usuario || !rol || !password) {
    console.error('Uso: node scripts/crearUsuario.js <usuario> <rol> <contraseña> ["Nombre completo"]');
    process.exit(1);
}
try {
    const creado = guardarUsuario({ usuario, rol, password, nombre: resto.join(' ') });
    console.log(`Listo: ${creado.usuario} (${creado.rol}) guardado en ${ARCHIVO}`);
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
