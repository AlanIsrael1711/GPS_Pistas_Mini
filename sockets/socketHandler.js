const presencia = require('../presencia/presenciaStore');

const SALA_ADMINS = 'presencia-admins';
const INTERVALO_DIFUSION_MS = 1000;      // agrupa cambios: máx. 1 envío por segundo
const INTERVALO_POSICION_MS = 1000;      // máx. 1 posición por segundo por conexión
const INTERVALO_REVISION_MS = 60 * 1000; // revalida que las conexiones admin sigan siendo admin

// La sesión de Express se comparte con Socket.IO (ver index.js). Se vuelve
// a leer del almacén en cada acción sensible porque el socket suele
// conectarse ANTES de que la persona inicie sesión, y para enterarse de
// cierres de sesión o cambios de rol.
function leerUsuarioDeSesion(socket) {
    return new Promise((resolve) => {
        const sesion = socket.request && socket.request.session;
        if (!sesion || typeof sesion.reload !== 'function') return resolve(null);
        sesion.reload((error) => {
            resolve(error || !sesion.usuario ? null : sesion.usuario);
        });
    });
}

module.exports = (io) => {
    let temporizadorDifusion = null;

    function enviarListaAdmins() {
        io.in(SALA_ADMINS).fetchSockets().then((sockets) => {
            for (const s of sockets) {
                const yo = presencia.usuarioDeSocket(s.id);
                s.emit('presencia:lista', presencia.listar({ excluirUsuarioId: yo && yo.id }));
            }
        }).catch(() => {});
    }

    function programarDifusion() {
        if (temporizadorDifusion) return;
        temporizadorDifusion = setTimeout(() => {
            temporizadorDifusion = null;
            enviarListaAdmins();
        }, INTERVALO_DIFUSION_MS);
    }

    // Si a alguien le quitan el rol admin (o cierra sesión en otra pestaña)
    // deja de recibir la lista sin esperar a que reconecte.
    const revision = setInterval(async () => {
        try {
            const sockets = await io.in(SALA_ADMINS).fetchSockets();
            for (const s of sockets) {
                const usuario = await leerUsuarioDeSesion(s);
                if (!usuario || usuario.rol !== 'admin') {
                    s.leave(SALA_ADMINS);
                    s.emit('presencia:lista', []);
                }
            }
        } catch (_) {}
    }, INTERVALO_REVISION_MS);
    if (revision.unref) revision.unref();

    io.on('connection', (socket) => {
        let ultimaPosicionEn = 0;

        // ---------------------------------------------------------------
        // Presencia: qué usuarios están conectados y dónde (solo admin).
        // ---------------------------------------------------------------
        // Responde con un acuse { ok }. Si la sesión que trae ESTA conexión no
        // corresponde a un usuario (p. ej. la página se abrió antes de iniciar
        // sesión, así que el handshake no llevaba la cookie), ok es false y el
        // cliente se reconecta una vez para que el servidor pueda identificarlo.
        socket.on('presencia:iniciar', async (acuse) => {
            const responder = (ok) => { if (typeof acuse === 'function') acuse({ ok }); };
            const usuario = await leerUsuarioDeSesion(socket);
            if (!usuario) {
                if (presencia.quitarSocket(socket.id)) programarDifusion();
                return responder(false);
            }
            presencia.registrar(socket.id, usuario);
            programarDifusion();
            responder(true);
        });

        socket.on('presencia:posicion', (datos) => {
            const ahora = Date.now();
            if (ahora - ultimaPosicionEn < INTERVALO_POSICION_MS) return;
            if (!datos || typeof datos !== 'object') return;
            const aceptada = presencia.actualizarPosicion(socket.id, {
                lat: datos.lat,
                lng: datos.lng,
                precision: datos.precision,
                rumbo: datos.rumbo
            }, ahora);
            if (!aceptada) return;
            ultimaPosicionEn = ahora;
            programarDifusion();
        });

        socket.on('presencia:detener', () => {
            socket.leave(SALA_ADMINS);
            if (presencia.quitarSocket(socket.id)) programarDifusion();
        });

        socket.on('presencia:suscribir', async () => {
            const usuario = await leerUsuarioDeSesion(socket);
            if (!usuario || usuario.rol !== 'admin') {
                socket.leave(SALA_ADMINS);
                return;
            }
            socket.join(SALA_ADMINS);
            // La lista se calcula sin el propio usuario admin.
            socket.emit('presencia:lista', presencia.listar({ excluirUsuarioId: usuario.id }));
        });

        socket.on('presencia:desuscribir', () => {
            socket.leave(SALA_ADMINS);
        });

        socket.on('disconnect', () => {
            if (presencia.quitarSocket(socket.id)) programarDifusion();
        });
    });
};
