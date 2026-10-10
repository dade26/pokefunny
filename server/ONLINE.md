# Modo online

## Probabilidad de cartas FESTA

La probabilidad configurada se sortea al empezar el turno y tras cada skip, al mostrar el siguiente encuentro. Por ejemplo, 40% significa una tirada independiente del 40% por encuentro; no garantiza una carta en cada turno. Pueden salir varias cartas en el mismo turno si las anteriores no consumen el pick. Resolver una carta devuelve al encuentro actual sin hacer otra tirada; el siguiente skip vuelve a sortear. Las cartas empiezan a salir cuando todos los jugadores tienen al menos un Pokémon.

Este cambio requiere actualizar el servidor Online. `/health` debe mostrar `gameEngineVersion: 5` y la revisión desplegada.

## Resultados y animaciones FESTA

Durante los sorteos, los equipos y el historial muestran el estado anterior para no adelantar el resultado. Al revelarse, los objetos, habilidades y movimientos se aplican con una animaci?n sobre el Pok?mon destinatario. El temporizador visual usa tiempo transcurrido en el navegador para no depender de que su reloj coincida con el servidor.

Local y Online comparten el filtro de objetos FESTA: se excluyen MT/DT, Pok? Balls, correo, bayas sin efecto en combate y objetos de uso externo (evoluci?n, venta o entrenamiento). Las bayas de combate y Tarjeta Roja siguen disponibles. Estos cambios requieren publicar tanto la web como el servidor.

Los sorteos FESTA se ven en el host y los móviles: rival, Pokémon destinatario, objeto, forma y reroll. La animación recorre candidatos y termina mostrando el resultado real del servidor. En las cartas de Rival, primero se sortea quién elige; al terminar los tres segundos, ese rival recibe los controles y el host muestra quién elige el Pokémon para quién. Reconectarse conserva el mismo rival y el mismo resultado.

En el host, el Pokémon elegido aparece destacado con una animación. Si tiene mote, su etiqueta entra después y se pega sobre la imagen. La etiqueta permanece visible junto al resumen del turno; con movimiento reducido se muestra directamente.

Tras elegir un Pokémon, el host y los móviles muestran los diez encuentros del turno. El resultado permanece visible hasta que su jugador pulsa el botón para continuar desde el móvil; el host y los demás jugadores solo lo ven. El resumen también aparece antes de terminar la partida.

Al resolverse una carta FESTA se muestra su resultado durante tres segundos, sincronizado en el host y los móviles. El servidor bloquea nuevas acciones durante la animación y reanuda el turno al terminar. Las reconexiones recuperan el resumen o la animación vigente. Requiere actualizar la web y el servidor (motor Online versión 4).

## Borrar una partida y mostrar favoritos

En el móvil, «Salir de la partida» está arriba y desconecta el dispositivo. Se conserva la sesión guardada para volver a entrar en la misma sala y recuperar el equipo. Durante la partida, los picks y sus acciones aparecen antes que los Pokémon del equipo.

El host puede usar «Borrar partida» en la sala de espera, durante la partida o al terminar. Tras confirmar, se elimina la sala del servidor y su copia guardada en el dispositivo del host; los jugadores conectados reciben un aviso y sus sesiones de esa sala se limpian. Si falla la conexión, se muestra el error y el host puede volver a intentarlo.

Cada móvil envía su Pokémon favorito al entrar o reconectarse. Su icono acompaña al nombre en la sala, el orden de turnos, los equipos y la vista del jugador. Se conservan las formas de Vivillon. Estos cambios requieren actualizar tanto la web como el servidor Online.

## Comprobar la versión publicada

La web y el backend se despliegan por separado. Hacer push o publicar la web no actualiza necesariamente el proceso de Render. Tras cambiar el motor Online, despliega también el último commit de `main` en el servicio `pokefunny.onrender.com`.

`https://pokefunny.onrender.com/health` debe incluir `gameEngineVersion: 5` y `revision` con el commit desplegado. Si solo responde `{"ok":true}`, sigue ejecutando una versión antigua. Esa versión puede enviar `festa-wait` al jugador activo al resolver cartas de transformación u objetos, dejando la partida bloqueada.

Comprueba en Render que el servicio usa la rama `main`, instala con `npm ci` y arranca con `npm run start:server`. El reinicio elimina las salas en memoria, por lo que las partidas anteriores deben crearse de nuevo.

Cualquier visitante puede crear una sala desde «Jugar Online» en Ten Pick, Monotype o Festa. Solo configura las opciones de la partida; no introduce nombres ni un número de jugadores. Comparte el enlace `/join/CODIGO`, cada persona entra con su nombre y el host empieza cuando estén todos. Se fija la lista de participantes con los jugadores conectados al empezar. Después solo pueden volver a entrar los participantes de esa partida.

El host es el organizador de una sala en el navegador. El servidor Node es el servicio común que sincroniza todas las salas. Los visitantes no necesitan instalar Node ni ejecutar un servidor. El host observa y dirige; si quiere jugar también debe entrar por el enlace desde otro navegador o dispositivo. Recargar `/host/CODIGO` recupera la sala en el navegador que la creó. Las conexiones recuperan su sesión automáticamente tras un corte de red.

## Probar en tu ordenador

Desde la raíz del repositorio, ejecuta `npm ci`. Abre dos terminales:

```powershell
npm run start:server
```

```powershell
npm start
```

Abre `http://localhost:4200`. Angular reenvía `/socket.io/` al puerto 3000 mediante `proxy.conf.json`. Mantén ambas terminales abiertas.

## Probar entre ordenadores de la misma red

Ejecuta el servidor igual y arranca Angular con:

```powershell
npm start -- --host 0.0.0.0
```

Consulta la IPv4 de tu ordenador con `ipconfig`, por ejemplo `192.168.1.50`. Todos abren `http://192.168.1.50:4200` y comparten enlaces con esa dirección. Permite el puerto TCP 4200 en el firewall de Windows para la red privada. El navegador conecta a la misma dirección de la web, y Angular reenvía la conexión al servidor: no hace falta configurar cada ordenador ni abrir el puerto 3000 a la red.

## Publicarlo en Internet con un backend separado

Si tu web sigue alojada en Vercel u otro alojamiento estático:

1. Despliega este repositorio en un servicio Node que mantenga un proceso activo y admita WebSockets. Instala con `npm ci` y arranca con `npm run start:server` desde la raíz. Incluye `server`, `src/app/models` y `public/data`: el motor lee el catálogo del repositorio. El comando usa `tsx`, así que también deben instalarse las dependencias de desarrollo. El servidor usa `MULTIPLAYER_PORT`, o `PORT` si el alojamiento lo asigna.
2. Configura `CLIENT_ORIGIN=https://pokefunny.dade.es` en el backend, sin barra final. Es el origen autorizado y la base de sus enlaces. Dale una URL HTTPS pública al backend, por ejemplo `https://online.tu-dominio.es`. Debe tener TLS y permitir conexiones WebSocket y HTTP a `/socket.io/`.
3. Edita `public/multiplayer-config.js` con la dirección real del backend:

   ```js
   globalThis.ngMultiplayerUrl = 'https://online.tu-dominio.es';
   ```

4. Ejecuta `npm run build` y publica `dist/pokefunny/browser`. Esa configuración se carga para todos los visitantes, sin ajustes en sus navegadores. Configura el alojamiento para servir `index.html` en las rutas de Angular, incluidas `/host/*`, `/join/*` y `/play/*`.
5. Comprueba `https://online.tu-dominio.es/health` (debe responder `{"ok":true}`) y prueba una sala con dos navegadores o dispositivos. Cualquiera puede abrir «Jugar Online» y crear otra sala independiente.

Conserva el backend en una única instancia: las salas están en memoria. Al reiniciarlo se pierden, y varias instancias independientes no comparten partidas. Para persistencia o varias instancias habría que añadir almacenamiento compartido y coordinación de eventos.

## Publicarlo con el mismo dominio

Puedes dejar `public/multiplayer-config.js` sin asignación y reenviar `/socket.io/` desde el dominio de la web al proceso Node. Por ejemplo, dentro del bloque HTTPS de Nginx que sirve la web:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 75s;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

Configura `CLIENT_ORIGIN` con el origen HTTPS de la web. Ejecuta el proceso Node de forma permanente mediante el gestor de procesos de tu servidor. El cliente usa automáticamente el dominio desde el que se abre la página.

Documentación: [CORS de Socket.IO](https://socket.io/docs/v4/handling-cors/) y [WebSockets con Nginx](https://nginx.org/en/docs/http/websocket.html).

Si habías configurado manualmente `pokefunny.multiplayer.url` en el almacenamiento local del navegador, bórralo para usar la configuración nueva. Una asignación en `multiplayer-config.js` tiene prioridad sobre ese valor.
