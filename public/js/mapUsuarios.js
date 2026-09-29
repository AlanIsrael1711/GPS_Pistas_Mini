// =======================================================
// mapUsuarios.js - Presencia de usuarios conectados
// =======================================================
// Todas las personas con sesión iniciada comparten su posición con el
// servidor mientras están conectadas. Solo el ADMINISTRADOR recibe la
// lista de los demás usuarios y los ve en el mapa con su nombre y rol.
// El servidor vuelve a validar el rol del lado del servidor: ocultar el
// interruptor en pantalla no es lo que protege los datos.
(function iniciarPresenciaUsuarios() {
    'use strict';

    const INTERVALO_REVISION_MS = 5000;   // cada cuánto se revisa si hay posición nueva
    const DISTANCIA_MINIMA_M = 5;         // no se reenvía si casi no se movió...
    const LATIDO_MS = 30000;              // ...salvo cada 30 s, para seguir "vivo"
    const SIN_SENAL_MS = 2 * 60 * 1000;   // pasado este tiempo se marca sin señal

    const NOMBRES_ROL = {
        admin: 'Administrador',
        reporteador: 'Reporteador',
        monitoreo: 'Monitoreo'
    };

    const socket = window.gpsSocket || io({ transports: ['websocket', 'polling'] });
    window.gpsSocket = socket;

    const capaUsuarios = L.layerGroup();
    const marcadores = new Map(); // id de usuario -> { marcador, datos }

    let sesion = null;            // usuario con sesión activa (o null)
    let temporizador = null;
    let ultimoEnvio = null;       // { lat, lng, en }
    let reconexiones = 0;         // reconexiones hechas para este inicio de sesión
    let visible = true;           // estado del interruptor del panel de filtros

    const esAdmin = () => Boolean(sesion && sesion.rol === 'admin');

    // ---------------------------------------------------
    // Envío de la posición propia (todos los roles)
    // ---------------------------------------------------
    function enviarPosicion(forzar = false) {
        if (!sesion || !socket.connected) return;
        if (typeof window.obtenerUbicacionUsuarioActual !== 'function') return;

        const pos = window.obtenerUbicacionUsuarioActual();
        if (!pos) return;

        const ahora = Date.now();
        if (!forzar && ultimoEnvio) {
            const metros = L.latLng(ultimoEnvio.lat, ultimoEnvio.lng)
                .distanceTo(L.latLng(pos.lat, pos.lng));
            if (metros < DISTANCIA_MINIMA_M && ahora - ultimoEnvio.en < LATIDO_MS) return;
        }

        socket.emit('presencia:posicion', {
            lat: pos.lat,
            lng: pos.lng,
            precision: pos.accuracy
        });
        ultimoEnvio = { lat: pos.lat, lng: pos.lng, en: ahora };
    }

    function iniciarPresencia() {
        if (!sesion || !socket.connected) return;
        socket.emit('presencia:iniciar', (respuesta) => {
            if (respuesta && respuesta.ok) {
                reconexiones = 0;
                return;
            }
            // El socket se conectó antes de iniciar sesión: su handshake no
            // lleva la cookie de sesión y el servidor no sabe quién es. Se
            // reconecta UNA vez (el nuevo handshake sí trae la cookie).
            if (sesion && reconexiones < 1) {
                reconexiones++;
                socket.disconnect().connect();
            }
        });
        if (esAdmin()) socket.emit('presencia:suscribir');

        clearInterval(temporizador);
        temporizador = setInterval(() => {
            if (!document.hidden) enviarPosicion();
        }, INTERVALO_REVISION_MS);
        ultimoEnvio = null;
        // Pequeña espera para que el servidor termine de validar la sesión.
        setTimeout(() => enviarPosicion(true), 800);
    }

    function detenerPresencia() {
        clearInterval(temporizador);
        temporizador = null;
        ultimoEnvio = null;
        if (socket.connected) socket.emit('presencia:detener');
        limpiarMapa();
    }

    // ---------------------------------------------------
    // Dibujo de usuarios conectados (solo admin)
    // ---------------------------------------------------
    function nombreRol(rol) {
        return NOMBRES_ROL[rol] || rol || 'Sin rol';
    }

    function claseRol(rol) {
        return NOMBRES_ROL[rol] ? `usuario-conectado--${rol}` : 'usuario-conectado--otro';
    }

    // Se arma con nodos DOM y textContent (no con innerHTML): el nombre lo
    // escribe una persona y no debe poder inyectar HTML en el mapa.
    function crearIcono(datos) {
        const contenedor = document.createElement('div');
        contenedor.className = `usuario-conectado ${claseRol(datos.rol)}`;
        if (Date.now() - datos.actualizadoEn > SIN_SENAL_MS) {
            contenedor.classList.add('usuario-conectado--sin-senal');
        }

        const punto = document.createElement('span');
        punto.className = 'usuario-conectado__punto';

        const etiqueta = document.createElement('span');
        etiqueta.className = 'usuario-conectado__etiqueta';

        const nombre = document.createElement('strong');
        nombre.textContent = datos.nombre;
        const rol = document.createElement('small');
        rol.textContent = nombreRol(datos.rol);

        etiqueta.append(nombre, rol);
        contenedor.append(punto, etiqueta);

        return L.divIcon({
            className: 'icono-usuario-conectado',
            html: contenedor,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });
    }

    function contenidoPopup(datos) {
        const caja = document.createElement('div');
        caja.className = 'usuario-conectado-popup';

        const nombre = document.createElement('strong');
        nombre.textContent = datos.nombre;
        const rol = document.createElement('div');
        rol.textContent = nombreRol(datos.rol);

        const segundos = Math.max(0, Math.round((Date.now() - datos.actualizadoEn) / 1000));
        const hace = document.createElement('small');
        hace.textContent = segundos < 60
            ? `Actualizado hace ${segundos} s`
            : `Actualizado hace ${Math.round(segundos / 60)} min`;

        caja.append(nombre, rol, hace);
        if (Number.isFinite(datos.precision)) {
            const precision = document.createElement('small');
            precision.textContent = `Precisión ±${Math.round(datos.precision)} m`;
            caja.append(precision);
        }
        return caja;
    }

    function actualizarResumen(total, enMapa) {
        const resumen = document.getElementById('usuariosConectadosResumen');
        if (!resumen) return;
        const sinUbicacion = total - enMapa;
        resumen.textContent = total === 0
            ? 'Nadie más conectado'
            : `${total} conectado${total === 1 ? '' : 's'}`
                + (sinUbicacion > 0 ? ` · ${sinUbicacion} sin ubicación` : '');
    }

    function limpiarMapa() {
        capaUsuarios.clearLayers();
        marcadores.clear();
        if (window.map.hasLayer(capaUsuarios)) window.map.removeLayer(capaUsuarios);
        actualizarResumen(0, 0);
    }

    function dibujar(lista) {
        if (!esAdmin()) return;
        const propios = sesion && sesion.id;
        const usuarios = (Array.isArray(lista) ? lista : []).filter((u) => u && u.id !== propios);
        const conPosicion = usuarios.filter((u) => Number.isFinite(u.lat) && Number.isFinite(u.lng));
        const vigentes = new Set(conPosicion.map((u) => u.id));

        for (const [id, entrada] of marcadores) {
            if (!vigentes.has(id)) {
                capaUsuarios.removeLayer(entrada.marcador);
                marcadores.delete(id);
            }
        }

        for (const datos of conPosicion) {
            const existente = marcadores.get(datos.id);
            if (existente) {
                existente.marcador.setLatLng([datos.lat, datos.lng]);
                existente.marcador.setIcon(crearIcono(datos));
                existente.datos = datos;
            } else {
                const marcador = L.marker([datos.lat, datos.lng], {
                    icon: crearIcono(datos),
                    keyboard: false,
                    zIndexOffset: 600
                });
                const entrada = { marcador, datos };
                marcador.bindPopup(() => contenidoPopup(entrada.datos));
                marcador.addTo(capaUsuarios);
                marcadores.set(datos.id, entrada);
            }
        }

        if (visible && !window.map.hasLayer(capaUsuarios)) capaUsuarios.addTo(window.map);
        actualizarResumen(usuarios.length, conPosicion.length);
    }

    // ---------------------------------------------------
    // Eventos
    // ---------------------------------------------------
    socket.on('presencia:lista', dibujar);

    // Si el socket se reconecta (o se conecta después de iniciar sesión),
    // se vuelve a anunciar la presencia.
    socket.on('connect', iniciarPresencia);

    window.addEventListener('gps:sesion-lista', (evento) => {
        sesion = (evento && evento.detail) || window.usuarioActual || null;
        reconexiones = 0;
        iniciarPresencia();
    });

    window.addEventListener('gps:sesion-cerrada', () => {
        detenerPresencia();
        sesion = null;
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) enviarPosicion(true);
    });

    document.addEventListener('DOMContentLoaded', () => {
        const interruptor = document.getElementById('chkUsuariosConectados');
        if (!interruptor) return;
        visible = interruptor.checked;
        interruptor.addEventListener('change', () => {
            visible = interruptor.checked;
            if (visible && marcadores.size) capaUsuarios.addTo(window.map);
            else if (window.map.hasLayer(capaUsuarios)) window.map.removeLayer(capaUsuarios);
        });
    });

    window.capaUsuariosConectados = capaUsuarios;
})();
