# GPS Pistas · versión mínima (prueba de usuarios conectados)

Mapa sencillo + login + la misma función de "usuarios conectados" del proyecto
principal. Sin base de datos: los usuarios viven en `users.json`.

## Usuarios de prueba (ya incluidos en `users.json`)

| Usuario | Contraseña | Rol         |
|---------|------------|-------------|
| admin   | admin123   | admin       |
| ana     | ana123     | reporteador |
| beto    | beto123    | monitoreo   |
| carla   | carla123   | reporteador |

En Render define `ADMIN_PASSWORD` para cambiar la clave del admin sin editar
el archivo. Si la URL es pública, cambia también las demás o bórralas.

## Subir a Render

1. Sube esta carpeta a un repositorio de GitHub.
2. En Render: **New → Blueprint** (usa `render.yaml`) o **New → Web Service**
   con *Build* `npm install` y *Start* `npm start`.
3. Define `ADMIN_PASSWORD` (y `NODE_ENV=production`, `SESSION_SECRET` si no usas el blueprint).
4. Abre la URL `https://…onrender.com` (la ubicación GPS solo funciona en HTTPS).

## Cómo probar

- Abre la app con **admin** en un navegador y con **ana** / **beto** en otro
  (ventana de incógnito, otro navegador o un celular). Dos usuarios en el mismo
  navegador comparten la sesión, así que no sirve.
- Cada usuario ve un punto azul "Tú". Sin GPS, activa **Simular mi posición** y
  toca el mapa.
- El admin ve a los demás con **nombre y rol** (interruptor "Ver Usuarios
  Conectados" con el conteo). Ana y Beto no ven a nadie.
- Al cerrar sesión, cerrar la pestaña o quedarse sin conexión, el usuario
  desaparece del mapa del admin en unos segundos.

## Agregar usuarios (antes de subir)

    node scripts/crearUsuario.js lupita reporteador clave123 "Lupita Pérez"

Roles: `admin`, `reporteador`, `monitoreo`. Vuelve a subir el repositorio.
El disco de Render se borra en cada despliegue, por eso `users.json` se usa solo
para lectura.

## Notas

- El plan gratuito de Render "duerme" el servicio tras un rato sin visitas; la
  primera carga tarda. Las sesiones están en memoria: al reiniciar hay que volver a entrar.
- `public/js/mapUsuarios.js`, `presencia/presenciaStore.js` y la parte de
  presencia de `sockets/socketHandler.js` son los mismos del proyecto principal.
- Pruebas: `npm test`.
