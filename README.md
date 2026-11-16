# Recreo

App web para iPhone que enseña solo lo que hace falta de Pasen: los mensajes con el profesorado, el horario y la tutoría de cada hijo.

No es una app de la Junta de Andalucía. Usa la misma conexión que la app oficial iPasen (usuario y contraseña de iPasen, no el certificado digital), que no es pública ni está documentada. Si la Junta la cambia, Recreo puede dejar de funcionar hasta que se ajuste.

## Cómo está montada

- **La app** (esta carpeta) se publica en GitHub Pages y se instala en la pantalla de inicio del iPhone.
- **El intermediario** (`worker/worker.js`) es un Cloudflare Worker gratuito. Hace falta porque Séneca no acepta peticiones directas desde una web de otra dirección. Solo reenvía las rutas que usa la app y no guarda nada.
- El usuario, la contraseña y la sesión se guardan únicamente en el iPhone. El repositorio no contiene ningún dato.

## Puesta en marcha

### 1. Intermediario en Cloudflare

1. Crea una cuenta gratuita en https://dash.cloudflare.com/sign-up.
2. Entra en **Workers & Pages** › **Create** › **Create Worker** (plantilla «Hello World»).
3. Llámalo `recreo` y pulsa **Deploy**.
4. Pulsa **Edit code**, borra todo, pega el contenido de `worker/worker.js` y pulsa **Deploy**.
5. Copia la dirección del worker. Será algo como `https://recreo.tunombre.workers.dev`.

Para los avisos en el iPhone (opcional):

6. En **Storage & Databases** › **KV** › **Create**, crea un espacio llamado `RECREO`.
7. En el worker: **Settings** › **Bindings** › **Add** › **KV namespace**. Nombre de la variable `RECREO`, espacio `RECREO`.
8. En el worker: **Settings** › **Trigger events** › **Add** › **Cron Triggers**, con `*/15 * * * *` (cada 15 minutos).
9. En el iPhone, con Recreo instalada: **Ajustes** › **Activar avisos**.

Al activarlos, el worker guarda tu usuario y contraseña de iPasen en ese KV, dentro de tu cuenta de Cloudflare, para poder mirar Séneca con la app cerrada. Los avisos viajan cifrados hasta el iPhone. Si cierras sesión en Recreo, los avisos se desactivan y la cuenta se borra del KV.

### 2. Dirección del intermediario en la app

Pon esa dirección en `js/config.js` (`INTERMEDIARIO`). Si la dejas vacía, la app la pide la primera vez.

### 3. GitHub Pages

En el repositorio: **Settings** › **Pages** › **Deploy from a branch** › rama `main`, carpeta `/ (root)`.

La app quedará en `https://rayayrodriguez.github.io/recreo/`.

Si la publicas en otra dirección, añádela a `ORIGENES_PERMITIDOS` en `worker/worker.js` y vuelve a desplegar el worker.

### 4. Instalación en el iPhone

Abre la dirección en **Safari** › botón **Compartir** › **Añadir a pantalla de inicio**.

## Qué hace

- Elegir hijo con las etiquetas de arriba. Cada hijo tiene su color, y toda la app cambia a ese color para que no te equivoques de niño.
- Mensajes recibidos, con aviso de los no leídos. Al abrir uno se marca como leído.
- Responder y escribir mensajes nuevos al profesorado. Antes de enviar, la app siempre pide confirmación.
- Mensajes enviados.
- Horario por días, con la clase que toca ahora.
- Notas de exámenes y trabajos, la más reciente primero: materia, actividad, fecha y nota.
- Lo pendiente arriba de los mensajes: autorizaciones (se responden con Autorizo o No autorizo) y documentos para firmar.
- Avisar de que un niño va a faltar: un día, varios días o solo algunas horas, con el motivo. También se puede retirar el aviso.
- Avisos en el iPhone de mensajes, notas, autorizaciones y documentos nuevos, entre las 7:30 y las 22:00.
- Tutoría: tutor o tutora, horario de atención a familias, faltas de asistencia, próximos días y profesorado.
- Datos de ejemplo para ver la app sin conectarse.

## Lo que no hace

- No envía archivos adjuntos.
- No justifica las faltas que ya ha puesto el colegio.
- No firma documentos con firma manuscrita. Avisa de que están y hay que firmarlos en la app oficial.
