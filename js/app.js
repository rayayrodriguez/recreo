import { Pasen, ErrorPasen, SesionCaducada, Pide2FA } from "./api.js";
import { PasenDemo } from "./demo.js";
import { almacen } from "./almacen.js";
import { INTERMEDIARIO, VERSION } from "./config.js";

// ── Utilidades ──────────────────────────────────────────────────────────────

function h(etiqueta, props, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of hijos.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const svg = (d, extra = "") =>
  `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}${extra}</svg>`;
const ICONOS = {
  mensajes: svg('<path d="M4 6.5h16v11H4z"/><path d="m4.5 7 7.5 6 7.5-6"/>'),
  horario: svg('<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v3M16 3v3M7.5 13h3M13.5 13h3M7.5 16.5h3"/>'),
  notas: svg('<path d="M6 3.5h9l3 3v14H6z"/><path d="M9 11.5l2 2 4-4.5M9 17h6"/>'),
  tutoria: svg('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
  recargar: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4.5v4h-4"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  volver: svg('<path d="m14.5 5-7 7 7 7"/>'),
  clip: svg('<path d="m20 11.5-7.6 7.6a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3"/>'),
  escribir: svg('<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16z"/>'),
};
const icono = (nombre, clase = "icono") => {
  const s = h("span", { class: clase });
  s.innerHTML = ICONOS[nombre];
  return s;
};

const plegar = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Séneca escribe "Apellidos, Nombre (grupo)". Aquí se lee "Nombre Apellidos".
function nombrePersona(texto) {
  const t = String(texto || "").trim();
  const m = t.match(/^([^,(]+),\s*([^(]+?)\s*(\(.*\))?$/);
  if (!m) return t;
  return `${m[2].trim()} ${m[1].trim()}`;
}
const nombrePila = (texto) => nombrePersona(texto).split(/\s+/)[0] || "";

function textoDe(html) {
  const s = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n• ");
  const doc = new DOMParser().parseFromString(s, "text/html");
  doc.querySelectorAll("script, style, template").forEach((n) => n.remove());
  return (doc.body.textContent || "")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function conEnlaces(texto) {
  const frag = document.createDocumentFragment();
  const partes = String(texto).split(/(https?:\/\/[^\s<>"]+)/g);
  partes.forEach((p, i) => {
    if (i % 2 === 1) {
      const limpio = p.replace(/[.,;:)]+$/, "");
      frag.append(h("a", { href: limpio, target: "_blank", rel: "noopener noreferrer" }, limpio));
      if (limpio.length < p.length) frag.append(p.slice(limpio.length));
    } else if (p) {
      frag.append(p);
    }
  });
  return frag;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function leerFecha(texto) {
  const m = String(texto || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
}
const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const hora = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
const tieneHora = (texto) => /\d{1,2}:\d{2}/.test(String(texto || ""));

function fechaCorta(texto) {
  const d = leerFecha(texto);
  if (!d) return texto || "";
  const hoy = new Date();
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  if (mismoDia(d, hoy)) return tieneHora(texto) ? hora(d) : "Hoy";
  if (mismoDia(d, ayer)) return "Ayer";
  const dias = (hoy - d) / 86400000;
  if (dias > 0 && dias < 6) return DIAS_SEMANA[d.getDay()].replace(/^./, (c) => c.toUpperCase());
  const base = `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  return d.getFullYear() === hoy.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

function fechaLarga(texto) {
  const d = leerFecha(texto);
  if (!d) return texto || "";
  const hoy = new Date();
  let base = `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  if (d.getFullYear() !== hoy.getFullYear()) base += ` de ${d.getFullYear()}`;
  return tieneHora(texto) ? `${base}, a las ${hora(d)}` : base;
}

function avisar(texto) {
  const el = document.getElementById("aviso-flotante");
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.remove("visible"), 2600);
}

// ── Estado ──────────────────────────────────────────────────────────────────

const COLORES = ["--hijo-1", "--hijo-2", "--hijo-3", "--hijo-4"];
const VISTAS = { mensajes: "Mensajes", horario: "Horario", notas: "Notas", tutoria: "Tutoría" };

let api;
const estado = {
  hijos: [],
  matricula: null,
  vista: "mensajes",
  bandeja: "recibidos",
  noLeidos: {},
  mensajes: {},
  enviados: null,
  horario: {},
  tutoria: {},
  faltas: {},
  agenda: null,
  autorizaciones: {},
  notas: {},
  documentos: null,
  avisosFalta: {},
  dia: null,
  cargando: 0,
  error: null,
  ultimaCarga: 0,
};

const cache = {
  leer: (k) => almacen.leer("cache." + k),
  guardar: (k, v) => almacen.guardar("cache." + k, v),
};

const hijoActual = () => estado.hijos.find((x) => x.matricula === estado.matricula) || estado.hijos[0];
const colorDe = (matricula) => {
  const i = Math.max(0, estado.hijos.findIndex((x) => x.matricula === matricula));
  return COLORES[i % COLORES.length];
};

function aplicarColor() {
  const hijo = hijoActual();
  if (!hijo) return;
  const raiz = document.documentElement;
  raiz.style.setProperty("--acento", `var(${colorDe(hijo.matricula)})`);
  requestAnimationFrame(() => {
    const color = getComputedStyle(raiz).getPropertyValue("--acento").trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && color) meta.setAttribute("content", color);
  });
}

// ── Errores de sesión ───────────────────────────────────────────────────────

async function protegido(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Pide2FA) {
      pantallaCodigo(e.enviadoA, almacen.leer("credenciales"));
      throw e;
    }
    if (e instanceof SesionCaducada) {
      pantallaAcceso(e.message);
      throw e;
    }
    throw e;
  }
}

// ── Pantalla de acceso ──────────────────────────────────────────────────────

function pantallaAcceso(mensaje = "") {
  cerrarCapas();
  document.documentElement.style.removeProperty("--acento");
  const app = document.getElementById("app");
  const error = h("p", { class: "error", role: "alert" }, mensaje);
  const usuario = h("input", { id: "usuario", name: "username", autocomplete: "username", autocapitalize: "none", autocorrect: "off", spellcheck: "false", required: true });
  const clave = h("input", { id: "clave", name: "password", type: "password", autocomplete: "current-password", required: true });
  const recordar = h("input", { id: "recordar", type: "checkbox", checked: true });
  const faltaIntermediario = !almacen.leer("intermediario");
  const intermediario = h("input", { id: "intermediario", type: "url", inputmode: "url", autocapitalize: "none", autocorrect: "off", placeholder: "https://recreo.tunombre.workers.dev", value: almacen.leer("intermediario") || "" });
  const boton = h("button", { class: "boton primario", type: "submit" }, "Entrar");

  const form = h("form", { class: "formulario", onsubmit: async (ev) => {
    ev.preventDefault();
    error.textContent = "";
    if (faltaIntermediario) {
      if (!/^https:\/\//.test(intermediario.value.trim())) {
        error.textContent = "Escribe la dirección del intermediario. Empieza por https://";
        return;
      }
      almacen.guardar("intermediario", intermediario.value.trim());
    }
    boton.disabled = true;
    boton.textContent = "Entrando…";
    almacen.guardar("demo", null);
    api = new Pasen();
    const cred = { usuario: usuario.value.trim(), clave: clave.value };
    try {
      const res = await api.entrar(cred.usuario, cred.clave);
      if (!res.ok && res.codigo) {
        pantallaCodigo(res.enviadoA, cred, recordar.checked);
        return;
      }
      almacen.guardar("credenciales", recordar.checked ? cred : null);
      arrancar();
    } catch (e) {
      error.textContent = e.message;
      boton.disabled = false;
      boton.textContent = "Entrar";
    }
  } },
    h("label", { for: "usuario" }, "Usuario de iPasen"), usuario,
    h("label", { for: "clave" }, "Contraseña"), clave,
    faltaIntermediario && h("label", { for: "intermediario" }, "Dirección del intermediario"),
    faltaIntermediario && intermediario,
    h("label", { class: "casilla", for: "recordar" }, recordar, h("span", {}, "Recordar en este iPhone")),
    error,
    boton,
  );

  app.replaceChildren(
    h("main", { class: "acceso" },
      h("div", { class: "marca" },
        h("h1", {}, "Recreo"),
        h("p", {}, "Los mensajes del cole y el horario de tus hijos, sin menús de más."),
      ),
      form,
      h("details", { class: "ayuda" },
        h("summary", {}, "No tengo usuario de iPasen"),
        h("ol", {},
          h("li", {}, "Abre la app oficial iPasen o la web de Pasen y pulsa «No tengo acceso»."),
          h("li", {}, "Escribe tu NIF, una fecha de nacimiento (la tuya o la de uno de tus hijos) y el móvil que tiene el colegio."),
          h("li", {}, "Te llega un SMS con el usuario y una contraseña. Entra una vez en la app oficial para cambiarla."),
          h("li", {}, "Si no llega, pídelos en la secretaría del colegio."),
        ),
      ),
      h("button", { class: "boton enlace", type: "button", onclick: () => {
        almacen.guardar("demo", true);
        api = new PasenDemo();
        arrancar();
      } }, "Ver la app con datos de ejemplo"),
    ),
  );
}

function pantallaCodigo(enviadoA, cred, recordar = true) {
  cerrarCapas();
  const app = document.getElementById("app");
  const error = h("p", { class: "error", role: "alert" });
  const codigo = h("input", { id: "codigo", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "10", required: true });
  const detalle = h("p", { class: "detalle-tecnico" });
  const boton = h("button", { class: "boton primario", type: "submit" }, "Confirmar");
  app.replaceChildren(
    h("main", { class: "acceso" },
      h("div", { class: "marca" },
        h("h1", {}, "Código"),
        h("p", {}, enviadoA ? `Séneca ha enviado un código a ${enviadoA}. Escríbelo para terminar de entrar.` : "Séneca te ha enviado un código por SMS. Escríbelo para terminar de entrar."),
      ),
      h("form", { class: "formulario", onsubmit: async (ev) => {
        ev.preventDefault();
        boton.disabled = true;
        error.textContent = "";
        try {
          const res = await api.entrar(cred.usuario, cred.clave, codigo.value);
          if (!res.ok) throw new ErrorPasen("El código no es válido. Prueba otra vez.");
          detalle.textContent = "";
          if (recordar) almacen.guardar("credenciales", cred);
          arrancar();
        } catch (e) {
          error.textContent = e.message;
          detalle.textContent = "Detalle técnico: " + JSON.stringify(api.ultimaRespuesta || {});
          boton.disabled = false;
        }
      } },
        h("label", { for: "codigo" }, "Código de verificación"), codigo, error, detalle, boton,
      ),
      h("button", { class: "boton enlace", type: "button", onclick: () => pantallaAcceso() }, "Volver"),
    ),
  );
  setTimeout(() => codigo.focus(), 50);
}

// ── Estructura principal ────────────────────────────────────────────────────

let nodos = {};

function montarEstructura() {
  const app = document.getElementById("app");
  nodos.etiquetas = h("div", { class: "etiquetas", role: "tablist", "aria-label": "Hijos" });
  nodos.titulo = h("h1", { class: "titulo" });
  nodos.recargar = h("button", { class: "icono-boton", type: "button", "aria-label": "Actualizar", onclick: () => cargarVista(true) }, icono("recargar"));
  nodos.ajustes = h("button", { class: "icono-boton", type: "button", "aria-label": "Ajustes", onclick: abrirAjustes }, icono("ajustes"));
  nodos.vista = h("main", { class: "vista", id: "vista" });
  nodos.pestanas = h("nav", { class: "pestanas", "aria-label": "Secciones" },
    ...Object.entries(VISTAS).map(([clave, texto]) =>
      h("button", { type: "button", "data-vista": clave, onclick: () => cambiarVista(clave) }, icono(clave), h("span", {}, texto))),
  );
  app.replaceChildren(
    h("header", { class: "cabecera" },
      nodos.etiquetas,
      h("div", { class: "titular" }, nodos.titulo, h("div", { class: "acciones" }, nodos.recargar, nodos.ajustes)),
    ),
    nodos.vista,
    nodos.pestanas,
  );
}

function pintarEtiquetas() {
  nodos.etiquetas.replaceChildren(
    ...estado.hijos.map((hijo) => {
      const activo = hijo.matricula === estado.matricula;
      const pendientes = estado.noLeidos[hijo.matricula] || 0;
      return h("button", {
        class: "etiqueta" + (activo ? " activa" : ""),
        type: "button", role: "tab", "aria-selected": activo ? "true" : "false",
        style: `--color: var(${colorDe(hijo.matricula)})`,
        onclick: () => elegirHijo(hijo.matricula),
      },
        h("span", { class: "etiqueta-nombre" }, hijo.nombre),
        h("span", { class: "etiqueta-curso" }, hijo.grupo || hijo.curso),
        pendientes ? h("span", { class: "pendientes", "aria-label": `${pendientes} sin leer` }, pendientes) : null,
      );
    }),
  );
}

function pintarCabecera() {
  nodos.titulo.textContent = VISTAS[estado.vista];
  nodos.recargar.classList.toggle("girando", estado.cargando > 0);
  for (const b of nodos.pestanas.querySelectorAll("button")) {
    b.classList.toggle("activa", b.dataset.vista === estado.vista);
    b.setAttribute("aria-current", b.dataset.vista === estado.vista ? "page" : "false");
  }
}

function elegirHijo(matricula) {
  if (matricula === estado.matricula) return;
  estado.matricula = matricula;
  almacen.guardar("hijo", matricula);
  aplicarColor();
  pintarEtiquetas();
  cargarVista();
}

function cambiarVista(vista) {
  estado.vista = vista;
  nodos.vista.scrollTop = 0;
  window.scrollTo(0, 0);
  cargarVista();
}

// ── Arranque ────────────────────────────────────────────────────────────────

async function arrancar() {
  montarEstructura();
  estado.hijos = (api.demo ? null : cache.leer("hijos")) || [];
  estado.matricula = almacen.leer("hijo");
  if (estado.hijos.length) prepararHijos();
  pintarCabecera();
  pintarVista();

  try {
    const hijos = await protegido(() => api.hijos());
    estado.hijos = hijos;
    if (!api.demo) cache.guardar("hijos", hijos);
    prepararHijos();
    cargarVista();
    actualizarNoLeidos();
  } catch (e) {
    if (e instanceof SesionCaducada || e instanceof Pide2FA) return;
    estado.error = e.message;
    pintarVista();
  }
}

function prepararHijos() {
  if (!estado.hijos.some((x) => x.matricula === estado.matricula)) {
    estado.matricula = estado.hijos[0] ? estado.hijos[0].matricula : null;
  }
  aplicarColor();
  pintarEtiquetas();
}

async function actualizarNoLeidos() {
  try {
    estado.noLeidos = await api.noLeidosPorHijo();
    pintarEtiquetas();
  } catch {
    /* no es imprescindible */
  }
}

// Carga lo que necesita la vista actual. Primero pinta lo guardado y luego lo refresca.
async function cargarVista(forzar = false) {
  const hijo = hijoActual();
  pintarCabecera();
  if (!hijo) {
    pintarVista();
    return;
  }
  const m = hijo.matricula;
  const tareas = [];
  const unaVez = 12 * 3600 * 1000;

  if (estado.vista === "mensajes") {
    if (!estado.mensajes[m]) {
      const guardado = api.demo ? null : cache.leer("mensajes." + m);
      if (guardado) estado.mensajes[m] = { items: guardado, pagina: 1, fin: false, deCache: true };
    }
    tareas.push(async () => {
      const items = await api.mensajes(m, 1);
      estado.mensajes[m] = { items, pagina: 1, fin: items.length === 0 };
      if (!api.demo) cache.guardar("mensajes." + m, items);
    });
    if (estado.bandeja === "enviados") {
      tareas.push(async () => {
        estado.enviados = await api.enviados(1);
      });
    }
    // Lo pendiente no debe impedir ver los mensajes si falla.
    tareas.push(async () => {
      try {
        estado.autorizaciones[m] = await api.autorizaciones(m);
      } catch (e) {
        if (e instanceof SesionCaducada || e instanceof Pide2FA) throw e;
      }
    });
    if (forzar || !estado.documentos) {
      tareas.push(async () => {
        try {
          estado.documentos = await api.documentosPendientes();
        } catch (e) {
          if (e instanceof SesionCaducada || e instanceof Pide2FA) throw e;
        }
      });
    }
    if (forzar) tareas.push(actualizarNoLeidos);
  }

  if (estado.vista === "horario") {
    const clave = "horario." + m;
    const guardado = api.demo ? null : cache.leer(clave);
    if (guardado && !estado.horario[m]) estado.horario[m] = guardado.datos;
    if (forzar || !guardado || Date.now() - guardado.cuando > unaVez || !estado.horario[m]) {
      tareas.push(async () => {
        const datos = await api.horario(m);
        estado.horario[m] = datos;
        if (!api.demo) cache.guardar(clave, { cuando: Date.now(), datos });
      });
    }
  }

  if (estado.vista === "notas") {
    const clave = "notas." + m;
    const guardado = api.demo ? null : cache.leer(clave);
    if (guardado && !estado.notas[m]) estado.notas[m] = guardado.datos;
    if (forzar || !guardado || Date.now() - guardado.cuando > 3600000 || !estado.notas[m]) {
      tareas.push(async () => {
        const datos = await api.notas(m);
        estado.notas[m] = datos;
        if (!api.demo) cache.guardar(clave, { cuando: Date.now(), datos });
      });
    }
  }

  if (estado.vista === "tutoria") {
    for (const [nombre, fn] of [["tutoria", () => api.tutoria(m)], ["faltas", () => api.faltas(m)]]) {
      const clave = `${nombre}.${m}`;
      const guardado = api.demo ? null : cache.leer(clave);
      if (guardado && !estado[nombre][m]) estado[nombre][m] = guardado.datos;
      if (forzar || !guardado || Date.now() - guardado.cuando > (nombre === "faltas" ? 3600000 : unaVez) || !estado[nombre][m]) {
        tareas.push(async () => {
          const datos = await fn();
          estado[nombre][m] = datos;
          if (!api.demo) cache.guardar(clave, { cuando: Date.now(), datos });
        });
      }
    }
    tareas.push(async () => {
      try {
        estado.avisosFalta[m] = await api.avisosFalta(m);
      } catch (e) {
        if (e instanceof SesionCaducada || e instanceof Pide2FA) throw e;
      }
    });
    if (forzar || !estado.agenda) {
      tareas.push(async () => {
        const hoy = new Date();
        const fin = new Date(hoy.getTime() + 45 * 86400000);
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        try {
          estado.agenda = await api.agenda(iso(hoy), iso(fin));
        } catch {
          estado.agenda = [];
        }
      });
    }
  }

  pintarVista();
  if (!tareas.length) return;

  estado.cargando++;
  estado.error = null;
  pintarCabecera();
  try {
    await protegido(() => Promise.all(tareas.map((t) => t())));
    estado.ultimaCarga = Date.now();
  } catch (e) {
    if (e instanceof SesionCaducada || e instanceof Pide2FA) return;
    estado.error = e.message;
  } finally {
    estado.cargando = Math.max(0, estado.cargando - 1);
    if (document.getElementById("vista")) {
      pintarCabecera();
      if (hijoActual() && hijoActual().matricula === m) pintarVista();
    }
  }
}

function pintarVista() {
  if (!nodos.vista) return;
  const hijo = hijoActual();
  const contenido = [];
  if (estado.error) {
    contenido.push(h("div", { class: "fallo", role: "alert" },
      h("p", {}, estado.error),
      h("button", { class: "boton secundario", type: "button", onclick: () => cargarVista(true) }, "Reintentar"),
    ));
  }
  if (!hijo) {
    contenido.push(estado.cargando || !estado.error ? h("p", { class: "vacio" }, "Cargando…") : null);
    nodos.vista.replaceChildren(...contenido);
    return;
  }
  if (estado.vista === "mensajes") contenido.push(...vistaMensajes(hijo));
  if (estado.vista === "horario") contenido.push(...vistaHorario(hijo));
  if (estado.vista === "notas") contenido.push(...vistaNotas(hijo));
  if (estado.vista === "tutoria") contenido.push(...vistaTutoria(hijo));
  nodos.vista.replaceChildren(...contenido);
}

// ── Mensajes ────────────────────────────────────────────────────────────────

function agruparMensajes(items) {
  const vistos = new Map();
  for (const m of items) {
    const clave = `${m.id}`;
    if (!vistos.has(clave)) vistos.set(clave, m);
  }
  return [...vistos.values()];
}

function vistaMensajes(hijo) {
  const datos = estado.mensajes[hijo.matricula];
  const tutor = hijo.tutor ? nombrePila(hijo.tutor) : "";
  const fuera = [];

  const pendientes = bloquePendientes(hijo);
  if (pendientes) fuera.push(pendientes);

  fuera.push(h("button", { class: "boton primario ancho escribir", type: "button", onclick: () => abrirRedactar(hijo) },
    icono("escribir"), tutor ? `Escribir a ${tutor}` : "Escribir un mensaje"));

  fuera.push(h("div", { class: "segmentos", role: "tablist", "aria-label": "Bandeja" },
    ...[["recibidos", "Recibidos"], ["enviados", "Enviados"]].map(([clave, texto]) =>
      h("button", { type: "button", role: "tab", class: estado.bandeja === clave ? "activo" : "", "aria-selected": estado.bandeja === clave ? "true" : "false",
        onclick: () => { estado.bandeja = clave; cargarVista(); } }, texto)),
  ));

  if (estado.bandeja === "enviados") {
    fuera.push(...vistaEnviados());
    return fuera;
  }

  if (!datos) {
    fuera.push(h("p", { class: "vacio" }, "Cargando mensajes…"));
    return fuera;
  }
  const lista = agruparMensajes(datos.items);
  if (!lista.length) {
    fuera.push(h("p", { class: "vacio" }, `No hay mensajes sobre ${hijo.nombre}.`));
    return fuera;
  }

  fuera.push(h("ul", { class: "hoja lista-mensajes" },
    ...lista.map((m) => {
      const texto = textoDe(m.body_message);
      return h("li", {},
        h("button", { type: "button", class: "mensaje" + (m.isread ? "" : " nuevo"), onclick: () => abrirMensaje(m, hijo) },
          h("span", { class: "punto", "aria-hidden": "true" }),
          h("span", { class: "mensaje-cabeza" },
            h("span", { class: "remitente" }, nombrePersona(m.sender) || "Sin remitente"),
            h("time", {}, fechaCorta(m.date)),
          ),
          h("span", { class: "asunto" }, m.subject || "Sin asunto", m.has_adj ? icono("clip", "clip") : null),
          h("span", { class: "extracto" }, texto),
          m.isread ? null : h("span", { class: "solo-lector" }, "Sin leer"),
        ));
    }),
  ));

  if (!datos.fin) {
    fuera.push(h("button", { class: "boton secundario ancho", type: "button", onclick: async (ev) => {
      ev.currentTarget.disabled = true;
      ev.currentTarget.textContent = "Cargando…";
      try {
        const siguiente = datos.pagina + 1;
        const mas = await protegido(() => api.mensajes(hijo.matricula, siguiente));
        datos.items.push(...mas);
        datos.pagina = siguiente;
        datos.fin = mas.length === 0;
      } catch (e) {
        if (!(e instanceof SesionCaducada || e instanceof Pide2FA)) avisar(e.message);
      }
      pintarVista();
    } }, "Ver mensajes anteriores"));
  }
  return fuera;
}

// ── Pendiente: autorizaciones y documentos ──────────────────────────────────

function finDePlazo(periodo) {
  const fechas = String(periodo || "").match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
  return fechas && fechas.length ? fechas[fechas.length - 1] : "";
}

function bloquePendientes(hijo) {
  const auts = (estado.autorizaciones[hijo.matricula] || []).filter((a) => !a.signature);
  const docs = estado.documentos || [];
  if (!auts.length && !docs.length) return null;
  return h("section", { class: "pendiente", "aria-label": "Pendiente de responder" },
    h("h2", {}, auts.length + docs.length === 1 ? "Tienes algo pendiente" : `Tienes ${auts.length + docs.length} cosas pendientes`),
    h("ul", {},
      ...auts.map((a) => {
        const fin = finDePlazo(a.signaturePeriod);
        return h("li", {}, h("button", { type: "button", onclick: () => abrirAutorizacion(a, hijo) },
          h("span", { class: "tipo" }, "Autorización"),
          h("span", { class: "principal" }, a.motive || "Actividad"),
          fin ? h("span", { class: "secundario" }, `Hasta el ${fechaLarga(fin)}`) : null,
        ));
      }),
      ...docs.map((d) => h("li", {}, h("button", { type: "button", onclick: () => abrirDocumento(d) },
        h("span", { class: "tipo" }, "Documento para firmar"),
        h("span", { class: "principal" }, d.description || "Documento"),
        d.sendBy ? h("span", { class: "secundario" }, `Lo envía ${d.sendBy}`) : null,
      ))),
    ),
  );
}

function abrirDocumento(d) {
  let capa;
  capa = abrirCapa(
    h("div", { class: "confirmacion" },
      h("h2", {}, d.description || "Documento para firmar"),
      h("p", {}, "Este documento se firma dibujando tu firma, y eso de momento solo se puede hacer en la app oficial iPasen, en el apartado de firmas."),
      d.sendBy ? h("p", { class: "nota" }, `Lo envía ${d.sendBy}${d.date ? `, el ${fechaLarga(d.date)}` : ""}.`) : null,
      h("div", { class: "botones" }, h("button", { class: "boton secundario", type: "button", onclick: () => cerrarCapa(capa) }, "Entendido")),
    ),
    "dialogo",
  );
}

function abrirAutorizacion(a, hijo) {
  const detalle = h("div", { class: "detalle-autorizacion" }, h("p", { class: "nota" }, "Cargando detalles…"));
  const comentario = h("textarea", { id: "comentario", rows: "3", placeholder: "Opcional", autocapitalize: "sentences" });
  const error = h("p", { class: "error", role: "alert" });
  const si = h("button", { class: "boton primario ancho", type: "button" }, "Autorizo");
  const no = h("button", { class: "boton secundario ancho", type: "button" }, "No autorizo");
  const fin = finDePlazo(a.signaturePeriod);
  let capa;

  const responder = async (autoriza) => {
    error.textContent = "";
    const ok = await confirmar({
      titulo: autoriza ? "¿Autorizar esta actividad?" : "¿No autorizar esta actividad?",
      filas: [["Actividad", a.motive || ""], ["Alumno", `${hijo.nombre} (${hijo.grupo || hijo.curso})`], ["Respuesta", autoriza ? "Autorizo" : "No autorizo"],
        ...(comentario.value.trim() ? [["Comentario", comentario.value.trim()]] : [])],
      aceptar: autoriza ? "Autorizar" : "No autorizar",
    });
    if (!ok) return;
    si.disabled = no.disabled = true;
    try {
      await protegido(() => api.responderAutorizacion(a, autoriza, comentario.value.trim()));
      a.signature = true;
      avisar(autoriza ? "Autorización enviada" : "Respuesta enviada");
      cerrarCapa(capa);
      pintarVista();
      cargarVista();
    } catch (e) {
      if (e instanceof SesionCaducada || e instanceof Pide2FA) return;
      error.textContent = "No se ha enviado: " + e.message;
      si.disabled = no.disabled = false;
    }
  };
  si.addEventListener("click", () => responder(true));
  no.addEventListener("click", () => responder(false));

  capa = abrirCapa(h("div", { class: "hoja-capa" },
    barraCapa("Autorización", () => cerrarCapa(capa), "Volver"),
    h("div", { class: "formulario redactar" },
      h("p", { class: "sobre", style: `--color: var(${colorDe(hijo.matricula)})` }, `${hijo.nombre} (${hijo.grupo || hijo.curso})`),
      h("h2", { class: "titulo-ficha" }, a.motive || "Actividad"),
      fin ? h("p", { class: "nota" }, `Puedes responder hasta el ${fechaLarga(fin)}.`) : null,
      detalle,
      h("label", { for: "comentario" }, "Comentario para el colegio"), comentario,
      h("p", { class: "nota" }, "Una vez enviada, la respuesta no se puede cambiar desde la app."),
      error, si, no,
    ),
  ), "pantalla");

  api.detalleAutorizacion(a.aluatprotut).then((d) => {
    const filas = [];
    const descripcion = d && (d.description || d.descripcion || d.observations || d.detail);
    if (descripcion) filas.push(h("p", { class: "texto-ficha" }, conEnlaces(textoDe(descripcion))));
    const importe = d && (d.amount ?? d.importe);
    if (importe !== undefined && importe !== null && Number(importe) > 0) {
      filas.push(h("p", { class: "importe" }, `Importe: ${Number(importe).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`));
    } else if (a.hasAmount) {
      filas.push(h("p", { class: "importe" }, "Tiene coste. Consulta el importe con el colegio."));
    }
    detalle.replaceChildren(...filas);
  }).catch(() => detalle.replaceChildren(a.hasAmount ? h("p", { class: "importe" }, "Tiene coste.") : ""));
}

function destinoDe(m) {
  const v = m.receiver || m.receivers || m.recipient || m.recipients || m.destinatarios || m.destinatario || m.to || m.users;
  if (!v) return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? nombrePersona(x) : nombrePersona(x.name || x.nombre || ""))).filter(Boolean).join(", ");
  if (typeof v === "object") return nombrePersona(v.name || v.nombre || "");
  return String(v).split(/\s*;\s*/).map(nombrePersona).join(", ");
}

function vistaEnviados() {
  if (!estado.enviados) return [h("p", { class: "vacio" }, "Cargando enviados…")];
  if (!estado.enviados.length) return [h("p", { class: "vacio" }, "Todavía no has enviado mensajes desde iPasen.")];
  return [
    h("p", { class: "nota" }, "Aquí salen los mensajes que has enviado, de todos tus hijos."),
    h("ul", { class: "hoja lista-mensajes" },
      ...estado.enviados.map((m) => {
        const para = destinoDe(m);
        return h("li", {},
          h("div", { class: "mensaje enviado" },
            h("span", { class: "mensaje-cabeza" },
              h("span", { class: "remitente" }, para ? `Para ${para}` : "Enviado"),
              h("time", {}, fechaCorta(m.date || m.send_date || m.sendDate)),
            ),
            h("span", { class: "asunto" }, m.subject || m.asunto || "Sin asunto"),
            h("span", { class: "extracto" }, textoDe(m.body_message || m.message || m.body || "")),
          ));
      }),
    ),
  ];
}

// ── Capas (hojas que se abren encima) ───────────────────────────────────────

function abrirCapa(contenido, clase = "") {
  const capas = document.getElementById("capas");
  const capa = h("div", { class: `capa ${clase}`, role: "dialog", "aria-modal": "true" }, contenido);
  capas.append(capa);
  document.body.classList.add("con-capa");
  requestAnimationFrame(() => capa.classList.add("abierta"));
  return capa;
}

function cerrarCapa(capa) {
  if (!capa || !capa.isConnected) return;
  capa.classList.remove("abierta");
  const quitar = () => {
    capa.remove();
    if (!document.getElementById("capas").children.length) document.body.classList.remove("con-capa");
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) quitar();
  else setTimeout(quitar, 260);
}

function cerrarCapas() {
  document.getElementById("capas").replaceChildren();
  document.body.classList.remove("con-capa");
}

function barraCapa(titulo, alVolver, textoVolver = "Volver") {
  return h("div", { class: "barra-capa" },
    h("button", { class: "volver", type: "button", onclick: alVolver }, icono("volver"), h("span", {}, textoVolver)),
    h("span", { class: "barra-titulo" }, titulo),
  );
}

// Pregunta antes de enviar nada a Séneca.
function confirmar({ titulo, filas, aceptar = "Enviar" }) {
  return new Promise((resolver) => {
    let capa;
    const terminar = (valor) => {
      cerrarCapa(capa);
      resolver(valor);
    };
    capa = abrirCapa(
      h("div", { class: "confirmacion" },
        h("h2", {}, titulo),
        h("dl", {}, ...filas.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
        h("div", { class: "botones" },
          h("button", { class: "boton primario", type: "button", onclick: () => terminar(true) }, aceptar),
          h("button", { class: "boton secundario", type: "button", onclick: () => terminar(false) }, "Seguir escribiendo"),
        ),
      ),
      "dialogo",
    );
  });
}

function abrirMensaje(m, hijo) {
  const cuerpo = h("div", { class: "texto-mensaje" }, conEnlaces(textoDe(m.body_message)));
  const adjuntos = h("div", { class: "adjuntos" });
  const anteriores = h("div", { class: "anteriores" });
  const respuesta = h("textarea", { id: "respuesta", rows: "3", placeholder: "Escribe tu respuesta", "aria-label": "Respuesta" });
  const enviar = h("button", { class: "boton primario", type: "button" }, "Responder");
  let capa;

  enviar.addEventListener("click", async () => {
    const texto = respuesta.value.trim();
    if (!texto) {
      respuesta.focus();
      return;
    }
    const ok = await confirmar({
      titulo: "¿Enviar esta respuesta?",
      filas: [["Para", nombrePersona(m.sender)], ["Sobre", `${hijo.nombre} (${hijo.grupo || hijo.curso})`], ["Mensaje", texto.length > 220 ? texto.slice(0, 220) + "…" : texto]],
    });
    if (!ok) return;
    enviar.disabled = true;
    enviar.textContent = "Enviando…";
    try {
      await protegido(() => api.responder(m, texto));
      avisar("Respuesta enviada");
      estado.enviados = null;
      cerrarCapa(capa);
    } catch (e) {
      if (e instanceof SesionCaducada || e instanceof Pide2FA) return;
      avisar("No se ha enviado: " + e.message);
      enviar.disabled = false;
      enviar.textContent = "Responder";
    }
  });

  capa = abrirCapa(h("div", { class: "hoja-capa" },
    barraCapa("", () => cerrarCapa(capa), "Mensajes"),
    h("article", { class: "detalle" },
      h("h2", {}, m.subject || "Sin asunto"),
      h("p", { class: "de" }, h("strong", {}, nombrePersona(m.sender) || "Sin remitente")),
      h("p", { class: "cuando" }, fechaLarga(m.date)),
      h("p", { class: "sobre", style: `--color: var(${colorDe(hijo.matricula)})` }, `Sobre ${hijo.nombre}`),
      cuerpo,
      adjuntos,
      anteriores,
    ),
    h("div", { class: "responder" }, respuesta, enviar),
  ), "pantalla");

  if (!m.isread) {
    api.marcarLeido(m).then(() => {
      m.isread = true;
      if (estado.noLeidos[hijo.matricula]) estado.noLeidos[hijo.matricula]--;
      pintarEtiquetas();
      pintarVista();
    }).catch(() => {});
  }

  api.conversacion(m.id).then((conv) => {
    const delHijo = conv.filter((x) => !x.enrollment || String(x.enrollment) === String(hijo.matricula));
    const este = delHijo.find((x) => x.id === m.id) || conv.find((x) => x.id === m.id);
    if (este && este.body_message) cuerpo.replaceChildren(conEnlaces(textoDe(este.body_message)));
    const lista = (este && este.attachments) || [];
    if (lista.length) {
      adjuntos.replaceChildren(
        h("h3", {}, lista.length === 1 ? "Adjunto" : "Adjuntos"),
        ...lista.map((a) => h("a", { class: "adjunto", href: a.url, target: "_blank", rel: "noopener noreferrer" },
          icono("clip", "clip"), a.attachmentName || a.name || "Archivo")),
      );
    }
    const otros = delHijo.filter((x) => x.id !== m.id);
    if (otros.length) {
      anteriores.replaceChildren(
        h("details", {},
          h("summary", {}, `Conversación anterior (${otros.length})`),
          h("ol", { class: "hilo" },
            ...otros.map((x) => h("li", {},
              h("p", { class: "hilo-cabeza" }, h("strong", {}, nombrePersona(x.sender) || ""), " ", h("time", {}, fechaCorta(x.date))),
              x.subject ? h("p", { class: "hilo-asunto" }, x.subject) : null,
              h("p", { class: "hilo-texto" }, conEnlaces(textoDe(x.body_message))),
            )),
          ),
        ),
      );
    }
  }).catch(() => {});
}

async function abrirRedactar(hijo) {
  const para = h("select", { id: "para", "aria-label": "Para" }, h("option", {}, "Cargando profesorado…"));
  const asunto = h("input", { id: "asunto", maxlength: "200", autocapitalize: "sentences" });
  const texto = h("textarea", { id: "texto", rows: "8", autocapitalize: "sentences" });
  const enviar = h("button", { class: "boton primario ancho", type: "button", disabled: true }, "Enviar");
  const error = h("p", { class: "error", role: "alert" });
  let personas = [];
  let capa;

  capa = abrirCapa(h("div", { class: "hoja-capa" },
    barraCapa("Nuevo mensaje", () => cerrarCapa(capa), "Cancelar"),
    h("div", { class: "formulario redactar" },
      h("p", { class: "sobre", style: `--color: var(${colorDe(hijo.matricula)})` }, `Sobre ${hijo.nombre} (${hijo.grupo || hijo.curso})`),
      h("label", { for: "para" }, "Para"), para,
      h("label", { for: "asunto" }, "Asunto"), asunto,
      h("label", { for: "texto" }, "Mensaje"), texto,
      error,
      enviar,
    ),
  ), "pantalla");

  try {
    const grupos = await protegido(() => api.destinatarios(hijo.matricula));
    const opciones = [];
    let elegido = null;
    for (const g of grupos) {
      const grupo = h("optgroup", { label: g.grupo });
      for (const p of g.personas) {
        const clave = `${p.id}|${p.codigo}`;
        if (personas.some((x) => `${x.id}|${x.codigo}` === clave)) continue;
        personas.push(p);
        grupo.append(h("option", { value: clave }, nombrePersona(p.nombre)));
        if (!elegido && /tutor/i.test(g.grupo)) elegido = clave;
      }
      if (grupo.children.length) opciones.push(grupo);
    }
    if (!personas.length) throw new ErrorPasen("No hay profesorado al que escribir sobre este alumno.");
    para.replaceChildren(...opciones);
    para.value = elegido || `${personas[0].id}|${personas[0].codigo}`;
    enviar.disabled = false;
  } catch (e) {
    if (e instanceof SesionCaducada || e instanceof Pide2FA) return;
    para.replaceChildren(h("option", {}, "No se ha podido cargar"));
    error.textContent = e.message;
  }

  enviar.addEventListener("click", async () => {
    error.textContent = "";
    if (!asunto.value.trim()) {
      error.textContent = "Escribe un asunto.";
      asunto.focus();
      return;
    }
    if (!texto.value.trim()) {
      error.textContent = "Escribe el mensaje.";
      texto.focus();
      return;
    }
    const destino = personas.find((p) => `${p.id}|${p.codigo}` === para.value);
    if (!destino) {
      error.textContent = "Elige a quién va el mensaje.";
      return;
    }
    const ok = await confirmar({
      titulo: "¿Enviar este mensaje?",
      filas: [
        ["Para", nombrePersona(destino.nombre)],
        ["Sobre", `${hijo.nombre} (${hijo.grupo || hijo.curso})`],
        ["Asunto", asunto.value.trim()],
        ["Mensaje", texto.value.trim().length > 220 ? texto.value.trim().slice(0, 220) + "…" : texto.value.trim()],
      ],
    });
    if (!ok) return;
    enviar.disabled = true;
    enviar.textContent = "Enviando…";
    try {
      await protegido(() => api.enviarNuevo({ asunto: asunto.value, texto: texto.value, para: [destino] }));
      avisar("Mensaje enviado");
      estado.enviados = null;
      cerrarCapa(capa);
      if (estado.bandeja === "enviados") cargarVista();
    } catch (e) {
      if (e instanceof SesionCaducada || e instanceof Pide2FA) return;
      error.textContent = "No se ha enviado: " + e.message;
      enviar.disabled = false;
      enviar.textContent = "Enviar";
    }
  });
}

// ── Horario ─────────────────────────────────────────────────────────────────

const DIAS_LECTIVOS = [
  ["lunes", "Lun", "Lunes"], ["martes", "Mar", "Martes"], ["miercoles", "Mié", "Miércoles"],
  ["jueves", "Jue", "Jueves"], ["viernes", "Vie", "Viernes"],
];

function minutos(texto) {
  const m = String(texto || "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

function tramosDe(lista, dia) {
  const delDia = lista.filter((s) => plegar(s.day) === dia);
  const porTramo = new Map();
  for (const s of delDia) {
    const clave = `${s.section}|${s.hoursection}`;
    const previo = porTramo.get(clave);
    if (!previo) {
      porTramo.set(clave, { hora: s.hoursection || "", materias: [s.subject || ""], profes: s.prof ? [s.prof] : [], orden: s.section || 0 });
    } else {
      if (s.subject && !previo.materias.includes(s.subject)) previo.materias.push(s.subject);
      if (s.prof && !previo.profes.includes(s.prof)) previo.profes.push(s.prof);
    }
  }
  return [...porTramo.values()].sort((a, b) => (minutos(a.hora) ?? a.orden) - (minutos(b.hora) ?? b.orden) || a.orden - b.orden);
}

function vistaHorario(hijo) {
  const lista = estado.horario[hijo.matricula];
  const hoy = new Date();
  const indiceHoy = hoy.getDay() >= 1 && hoy.getDay() <= 5 ? hoy.getDay() - 1 : null;
  if (estado.dia === null) estado.dia = indiceHoy ?? 0;
  const [diaClave, , diaNombre] = DIAS_LECTIVOS[estado.dia];
  const fuera = [];

  fuera.push(h("div", { class: "segmentos dias", role: "tablist", "aria-label": "Día" },
    ...DIAS_LECTIVOS.map(([, corto, largo], i) =>
      h("button", { type: "button", role: "tab", "aria-label": largo, class: (i === estado.dia ? "activo" : "") + (i === indiceHoy ? " hoy" : ""),
        "aria-selected": i === estado.dia ? "true" : "false", onclick: () => { estado.dia = i; pintarVista(); } }, corto)),
  ));

  if (!lista) {
    fuera.push(h("p", { class: "vacio" }, "Cargando horario…"));
    return fuera;
  }
  const tramos = tramosDe(lista, diaClave);
  if (indiceHoy === null && estado.dia === 0) fuera.push(h("p", { class: "nota" }, "Hoy no hay clase. Este es el horario del lunes."));
  if (!tramos.length) {
    fuera.push(h("p", { class: "vacio" }, lista.length ? `${hijo.nombre} no tiene clases el ${diaNombre.toLowerCase()}.` : "El colegio no ha publicado el horario."));
    return fuera;
  }

  const ahora = hoy.getHours() * 60 + hoy.getMinutes();
  fuera.push(h("ol", { class: "hoja horario", "aria-label": `Horario del ${diaNombre.toLowerCase()}` },
    ...tramos.map((t) => {
      const [inicio, fin] = String(t.hora).split(/\s*-\s*/);
      const actual = estado.dia === indiceHoy && minutos(inicio) !== null && minutos(fin) !== null && ahora >= minutos(inicio) && ahora < minutos(fin);
      const recreo = t.materias.some((x) => plegar(x) === "recreo");
      return h("li", { class: "tramo" + (actual ? " ahora" : "") + (recreo ? " recreo" : "") },
        h("span", { class: "horas" }, h("span", { class: "inicio" }, inicio || t.hora), fin ? h("span", { class: "fin" }, fin) : null),
        h("span", { class: "clase" },
          h("span", { class: "materia" }, t.materias.join(" / ")),
          t.profes.length ? h("span", { class: "profe" }, t.profes.map(nombrePersona).join(", ")) : null,
        ),
        actual ? h("span", { class: "marca-ahora" }, "Ahora") : null,
      );
    }),
  ));
  return fuera;
}

// ── Notas ───────────────────────────────────────────────────────────────────

function textoNota(n) {
  const v = Number(String(n).replace(",", "."));
  return Number.isNaN(v) ? String(n) : v.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

function vistaNotas(hijo) {
  const lista = estado.notas[hijo.matricula];
  if (!lista) return [h("p", { class: "vacio" }, "Cargando notas…")];
  if (!lista.length) {
    return [h("p", { class: "vacio" }, `Todavía no hay notas de ${hijo.nombre}.`),
      h("p", { class: "nota centrada" }, "Aquí salen las notas de exámenes y trabajos en cuanto el profesorado las pone en Séneca.")];
  }
  const ordenadas = [...lista].sort((a, b) => (leerFecha(b.fecha) || 0) - (leerFecha(a.fecha) || 0));
  return [
    h("ol", { class: "hoja lista-notas" }, ...ordenadas.map((n) => {
      const v = Number(String(n.nota).replace(",", "."));
      const suspenso = !Number.isNaN(v) && v < 5;
      const que = n.actividad || n.tipo || "Actividad";
      return h("li", {},
        h("span", { class: "nota-texto" },
          h("span", { class: "materia" }, n.materia || "Sin materia"),
          h("span", { class: "actividad" }, que),
          n.fecha ? h("span", { class: "fecha" }, fechaLarga(n.fecha).replace(/^./, (c) => c.toUpperCase())) : null,
          n.comentario ? h("span", { class: "comentario" }, textoDe(n.comentario)) : null,
        ),
        h("span", { class: "nota-valor" + (suspenso ? " baja" : "") }, textoNota(n.nota)),
      );
    })),
  ];
}

// ── Tutoría ─────────────────────────────────────────────────────────────────

function vistaTutoria(hijo) {
  const t = estado.tutoria[hijo.matricula];
  const faltas = estado.faltas[hijo.matricula];
  const fuera = [];

  const nombreTutor = nombrePersona((t && t.tutorName) || hijo.tutor);
  fuera.push(h("section", { class: "hoja bloque tutor" },
    h("h2", {}, nombreTutor || "Sin tutor asignado"),
    h("p", { class: "nota-linea" }, [hijo.curso, hijo.grupo && hijo.grupo !== hijo.curso ? `grupo ${hijo.grupo}` : ""].filter(Boolean).join(", ")),
    hijo.centro ? h("p", { class: "nota-linea" }, hijo.centro) : null,
    h("button", { class: "boton primario ancho escribir", type: "button", onclick: () => abrirRedactar(hijo) },
      icono("escribir"), nombreTutor ? `Escribir a ${nombrePila(nombreTutor)}` : "Escribir un mensaje"),
  ));

  const horas = (t && t.activitys) || [];
  if (t) {
    fuera.push(h("section", { class: "bloque" },
      h("h3", {}, "Atención a familias"),
      horas.length
        ? h("ul", { class: "hoja lista-simple" }, ...horas.map((a) => h("li", {},
            h("span", { class: "principal" }, `${a.day ? a.day.charAt(0).toUpperCase() + a.day.slice(1) : ""}, de ${a.time_started || "?"} a ${a.time_end || "?"}`),
            a.activity ? h("span", { class: "secundario" }, a.activity) : null)))
        : h("p", { class: "vacio" }, "El colegio no ha publicado el horario de atención."),
    ));
  }

  fuera.push(h("section", { class: "bloque" },
    h("h3", {}, "Faltas de asistencia"),
    h("button", { class: "boton secundario ancho", type: "button", onclick: () => abrirAvisoFalta(hijo) }, `Avisar de que ${hijo.nombre} va a faltar`),
    ...bloqueAvisosFalta(hijo),
    ...bloqueFaltas(faltas),
  ));

  if (estado.agenda && estado.agenda.length) {
    const proximos = [...estado.agenda].sort((a, b) => (leerFecha(a.initdate) || 0) - (leerFecha(b.initdate) || 0)).slice(0, 8);
    fuera.push(h("section", { class: "bloque" },
      h("h3", {}, "Próximos días"),
      h("ul", { class: "hoja lista-simple" }, ...proximos.map((e) => h("li", {},
        h("span", { class: "principal" }, e.title || e.description || ""),
        h("span", { class: "secundario" }, fechaLarga(e.initdate) + (e.endDate && e.endDate !== e.initdate ? ` al ${fechaLarga(e.endDate)}` : ""))))),
    ));
  }

  if (t && t.teachingTeam && t.teachingTeam.length) {
    fuera.push(h("section", { class: "bloque" },
      h("h3", {}, "Profesorado"),
      h("ul", { class: "hoja lista-simple" }, ...t.teachingTeam.map((x) => h("li", {},
        h("span", { class: "principal" }, x.description || ""),
        h("span", { class: "secundario" }, String(x.teachers || "").split(/\s*;\s*/).map(nombrePersona).join(", "))))),
    ));
  }

  if (!t && !faltas) fuera.push(h("p", { class: "vacio" }, "Cargando…"));
  return fuera;
}

function bloqueFaltas(faltas) {
  if (!faltas) return [h("p", { class: "vacio" }, "Cargando faltas…")];
  const items = faltas.flatMap((g) => (g.items || []).map((x) => ({ ...x, mes: g.section })));
  if (!items.length) return [h("p", { class: "vacio" }, "No tiene faltas este curso.")];
  const sinJustificar = items.filter((x) => !x.codejustification).length;
  const porDia = new Map();
  for (const x of items) {
    const clave = x.dateabsence || "";
    if (!porDia.has(clave)) porDia.set(clave, []);
    porDia.get(clave).push(x);
  }
  const dias = [...porDia.entries()].sort((a, b) => (leerFecha(b[0]) || 0) - (leerFecha(a[0]) || 0));
  return [
    h("p", { class: "resumen-faltas" },
      `${items.length} ${items.length === 1 ? "falta" : "faltas"} en ${dias.length} ${dias.length === 1 ? "día" : "días"}`,
      sinJustificar ? h("span", { class: "sin-justificar" }, `${sinJustificar} sin justificar`) : null),
    h("ul", { class: "hoja lista-simple" }, ...dias.slice(0, 12).map(([dia, lista]) => {
      const justificadas = lista.every((x) => x.codejustification);
      return h("li", {},
        h("span", { class: "principal" }, fechaLarga(dia)),
        h("span", { class: "secundario" }, lista.map((x) => [x.section, x.subject].filter(Boolean).join(" ")).join(", ")),
        h("span", { class: "estado-falta" + (justificadas ? " justificada" : "") }, justificadas ? (lista[0].motive ? `Justificada: ${lista[0].motive}` : "Justificada") : "Sin justificar"),
      );
    })),
  ];
}

// ── Avisar de una falta ─────────────────────────────────────────────────────

const aIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deIso = (v) => {
  const [a, m, d] = String(v).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
};

function bloqueAvisosFalta(hijo) {
  const lista = estado.avisosFalta[hijo.matricula] || [];
  const hoy = new Date(new Date().toDateString());
  const vigentes = lista.filter((n) => (leerFecha(n.end_date || n.start_date) || hoy) >= hoy);
  if (!vigentes.length) return [];
  return [
    h("p", { class: "subtitulo" }, "Faltas que has avisado"),
    h("ul", { class: "hoja lista-simple" }, ...vigentes.map((n) => {
      const dias = n.end_date && n.end_date !== n.start_date ? `Del ${fechaLarga(n.start_date)} al ${fechaLarga(n.end_date)}` : fechaLarga(n.start_date);
      const horas = (n.sections || []).map((s) => s.description).filter(Boolean);
      return h("li", { class: "con-accion" },
        h("span", { class: "principal" }, dias),
        h("span", { class: "secundario" }, horas.length ? horas.join(", ") : "Todo el día"),
        n.observation ? h("span", { class: "secundario" }, n.observation.trim()) : null,
        h("button", { class: "boton enlace accion", type: "button", onclick: async () => {
          const ok = await confirmar({ titulo: "¿Retirar este aviso de falta?", filas: [["Alumno", hijo.nombre], ["Días", dias]], aceptar: "Retirar aviso" });
          if (!ok) return;
          try {
            await protegido(() => api.retirarAvisoFalta(n.codenotification));
            avisar("Aviso retirado");
            cargarVista(true);
          } catch (e) {
            if (!(e instanceof SesionCaducada || e instanceof Pide2FA)) avisar("No se ha retirado: " + e.message);
          }
        } }, "Retirar"),
      );
    })),
  ];
}

function abrirAvisoFalta(hijo) {
  const hoy = new Date();
  const desde = h("input", { id: "falta-desde", type: "date", value: aIso(hoy), min: aIso(new Date(hoy.getTime() - 30 * 86400000)) });
  const hasta = h("input", { id: "falta-hasta", type: "date", value: aIso(hoy) });
  const variosDias = h("input", { id: "falta-varios", type: "checkbox" });
  const todoElDia = h("input", { id: "falta-todo", type: "radio", name: "alcance", checked: true });
  const algunasHoras = h("input", { id: "falta-horas", type: "radio", name: "alcance" });
  const filaHasta = h("div", { class: "campo", hidden: true }, h("label", { for: "falta-hasta" }, "Hasta"), hasta);
  const alcance = h("fieldset", { class: "alcance" },
    h("legend", {}, "¿Cuánto tiempo?"),
    h("label", { class: "casilla", for: "falta-todo" }, todoElDia, h("span", {}, "Todo el día")),
    h("label", { class: "casilla", for: "falta-horas" }, algunasHoras, h("span", {}, "Solo algunas horas")),
  );
  const horas = h("div", { class: "horas-falta", hidden: true });
  const motivo = h("textarea", { id: "falta-motivo", rows: "3", placeholder: "Por ejemplo: cita en el médico", autocapitalize: "sentences" });
  const error = h("p", { class: "error", role: "alert" });
  const enviar = h("button", { class: "boton primario ancho", type: "button" }, "Avisar al colegio");
  let tramos = [];
  let capa;

  async function cargarHoras() {
    horas.replaceChildren(h("p", { class: "nota" }, "Cargando las clases de ese día…"));
    tramos = [];
    try {
      const lista = await protegido(() => api.tramosDia(hijo.matricula, deIso(desde.value)));
      const porTramo = new Map();
      for (const s of lista) {
        const clave = s.hoursection || s.section;
        const t = porTramo.get(clave) || { hora: s.hoursection || "", materias: [], codigos: [], orden: minutos(s.hoursection) ?? s.section ?? 0 };
        if (s.subject && !t.materias.includes(s.subject)) t.materias.push(s.subject);
        if (s.codesection !== undefined && !t.codigos.includes(s.codesection)) t.codigos.push(s.codesection);
        porTramo.set(clave, t);
      }
      tramos = [...porTramo.values()].filter((t) => t.codigos.length).sort((a, b) => a.orden - b.orden);
      if (!tramos.length) {
        horas.replaceChildren(h("p", { class: "nota" }, `${hijo.nombre} no tiene clases ese día.`));
        return;
      }
      horas.replaceChildren(...tramos.map((t, i) => h("label", { class: "casilla", for: `tramo-${i}` },
        h("input", { id: `tramo-${i}`, type: "checkbox", "data-i": String(i) }),
        h("span", {}, h("strong", {}, t.hora), " ", t.materias.join(" / ")))));
    } catch (e) {
      if (e instanceof SesionCaducada || e instanceof Pide2FA) return;
      horas.replaceChildren(h("p", { class: "error" }, "No se han podido cargar las clases: " + e.message));
    }
  }

  function actualizar() {
    filaHasta.hidden = !variosDias.checked;
    alcance.hidden = variosDias.checked;
    if (variosDias.checked) todoElDia.checked = true;
    if (!variosDias.checked) hasta.value = desde.value;
    if (hasta.value < desde.value) hasta.value = desde.value;
    hasta.min = desde.value;
    const verHoras = !variosDias.checked && algunasHoras.checked;
    if (verHoras && horas.hidden) cargarHoras();
    horas.hidden = !verHoras;
  }
  variosDias.addEventListener("change", actualizar);
  todoElDia.addEventListener("change", actualizar);
  algunasHoras.addEventListener("change", actualizar);
  desde.addEventListener("change", () => {
    actualizar();
    if (!horas.hidden) cargarHoras();
  });
  hasta.addEventListener("change", actualizar);

  enviar.addEventListener("click", async () => {
    error.textContent = "";
    const inicio = deIso(desde.value);
    const fin = variosDias.checked ? deIso(hasta.value) : inicio;
    if (!inicio || !fin) {
      error.textContent = "Elige el día.";
      return;
    }
    const dias = (leerFecha(fin) - leerFecha(inicio)) / 86400000;
    if (dias < 0) {
      error.textContent = "El último día no puede ser anterior al primero.";
      return;
    }
    if (dias > 31) {
      error.textContent = "Son más de 31 días. Para eso habla directamente con el colegio.";
      return;
    }
    let secciones = null;
    let textoHoras = "Todo el día";
    if (!variosDias.checked && algunasHoras.checked) {
      const marcados = [...horas.querySelectorAll("input:checked")].map((x) => tramos[+x.dataset.i]);
      if (!marcados.length) {
        error.textContent = "Marca las horas en las que va a faltar.";
        return;
      }
      secciones = marcados.flatMap((t) => t.codigos);
      textoHoras = marcados.map((t) => t.hora).join(", ");
    }
    const textoDias = inicio === fin ? fechaLarga(inicio) : `Del ${fechaLarga(inicio)} al ${fechaLarga(fin)}`;
    const ok = await confirmar({
      titulo: "¿Avisar de esta falta?",
      filas: [["Alumno", `${hijo.nombre} (${hijo.grupo || hijo.curso})`], ["Días", textoDias], ["Horas", textoHoras],
        ["Motivo", motivo.value.trim() || "Sin motivo"]],
      aceptar: "Avisar al colegio",
    });
    if (!ok) return;
    enviar.disabled = true;
    enviar.textContent = "Enviando…";
    try {
      await protegido(() => api.avisarFalta({ matricula: hijo.matricula, desde: inicio, hasta: fin, secciones, motivo: motivo.value.trim() }));
      avisar("Falta avisada");
      cerrarCapa(capa);
      cargarVista(true);
    } catch (e) {
      if (e instanceof SesionCaducada || e instanceof Pide2FA) return;
      error.textContent = "No se ha enviado: " + e.message;
      enviar.disabled = false;
      enviar.textContent = "Avisar al colegio";
    }
  });

  capa = abrirCapa(h("div", { class: "hoja-capa" },
    barraCapa("Avisar de una falta", () => cerrarCapa(capa), "Cancelar"),
    h("div", { class: "formulario redactar" },
      h("p", { class: "sobre", style: `--color: var(${colorDe(hijo.matricula)})` }, `${hijo.nombre} (${hijo.grupo || hijo.curso})`),
      h("div", { class: "campo" }, h("label", { for: "falta-desde" }, "Día"), desde),
      h("label", { class: "casilla", for: "falta-varios" }, variosDias, h("span", {}, "Varios días seguidos")),
      filaHasta,
      alcance,
      horas,
      h("label", { for: "falta-motivo" }, "Motivo"), motivo,
      h("p", { class: "nota" }, "El aviso le llega al colegio. Si al final no falta, puedes retirarlo desde la pestaña Tutoría."),
      error, enviar,
    ),
  ), "pantalla");
}

// ── Ajustes ─────────────────────────────────────────────────────────────────

function abrirAjustes() {
  const intermediario = h("input", { id: "ajuste-intermediario", type: "url", autocapitalize: "none", autocorrect: "off", value: almacen.leer("intermediario") || "" });
  const recordada = !!almacen.leer("credenciales");
  let capa;
  capa = abrirCapa(h("div", { class: "hoja-capa" },
    barraCapa("Ajustes", () => cerrarCapa(capa), "Volver"),
    h("div", { class: "formulario ajustes" },
      api.demo
        ? h("p", { class: "nota" }, "Estás viendo datos de ejemplo. Nada de esto viene de Séneca.")
        : [
          seccionAvisos(),
          h("h2", { class: "apartado" }, "Conexión"),
          h("label", { for: "ajuste-intermediario" }, "Dirección del intermediario"),
          intermediario,
          h("button", { class: "boton secundario", type: "button", onclick: () => {
            const v = intermediario.value.trim();
            if (!/^https:\/\//.test(v)) {
              avisar("La dirección tiene que empezar por https://");
              return;
            }
            almacen.guardar("intermediario", v);
            avisar("Dirección guardada");
          } }, "Guardar dirección"),
          h("p", { class: "nota" }, recordada
            ? "Tu contraseña está guardada en este iPhone para volver a entrar sola cuando caduque la sesión."
            : "Tu contraseña no está guardada. Cuando caduque la sesión tendrás que escribirla otra vez."),
          recordada ? h("button", { class: "boton secundario", type: "button", onclick: () => {
            almacen.guardar("credenciales", null);
            avisar("Contraseña olvidada");
            cerrarCapa(capa);
          } }, "Olvidar la contraseña") : null,
        ],
      h("button", { class: "boton peligro", type: "button", onclick: async () => {
        if (!api.demo && almacen.leer("avisos")) {
          await desactivarAvisos().catch(() => {});
        }
        api.salir();
        almacen.borrarTodo(["intermediario", "dispositivoDeConfianza"]);
        estado.mensajes = {}; estado.horario = {}; estado.tutoria = {}; estado.faltas = {}; estado.agenda = null; estado.enviados = null; estado.noLeidos = {};
        estado.autorizaciones = {}; estado.notas = {}; estado.documentos = null; estado.avisosFalta = {};
        estado.vista = "mensajes"; estado.bandeja = "recibidos"; estado.dia = null; estado.hijos = [];
        api = new Pasen();
        pantallaAcceso();
      } }, api.demo ? "Salir de los datos de ejemplo" : "Cerrar sesión y borrar los datos"),
      h("p", { class: "nota pie" }, `Recreo ${VERSION}. No es una app de la Junta de Andalucía: usa la misma conexión que la app oficial iPasen y puede dejar de funcionar si la Junta la cambia.`),
    ),
  ), "pantalla");
}

// ── Avisos en el iPhone ─────────────────────────────────────────────────────

function desdeB64url(cadena) {
  let s = String(cadena).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

async function suscripcionActual() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg && reg.pushManager ? reg.pushManager.getSubscription() : null;
}

async function desactivarAvisos() {
  const datos = almacen.leer("avisos");
  const cred = almacen.leer("credenciales");
  const sub = await suscripcionActual().catch(() => null);
  if (datos && cred) await api.avisos("baja", { usuario: cred.usuario, clave: cred.clave, endpoint: datos.endpoint });
  if (sub) await sub.unsubscribe().catch(() => {});
  almacen.guardar("avisos", null);
}

function seccionAvisos() {
  const caja = h("section", { class: "seccion-avisos" });
  const titulo = h("h2", { class: "apartado" }, "Avisos en el iPhone");
  const explicacion = "Recreo mira Séneca cada 15 minutos y te avisa de mensajes, notas, autorizaciones y documentos nuevos, entre las 7:30 y las 22:00. Para hacerlo con la app cerrada, el intermediario guarda tu usuario y contraseña de iPasen en tu cuenta de Cloudflare.";

  const pintar = (...contenido) => caja.replaceChildren(titulo, ...contenido.flat(Infinity).filter(Boolean));

  async function activar(cred, boton, error, codigo = "") {
    error.textContent = "";
    boton.disabled = true;
    try {
      if (!codigo) {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") throw new ErrorPasen("No has dado permiso. Puedes darlo en Ajustes del iPhone › Notificaciones › Recreo.");
      }
      const reg = await navigator.serviceWorker.ready;
      const { publica } = await api.avisos("clave");
      const claveServidor = desdeB64url(publica);
      let sub = await reg.pushManager.getSubscription();
      if (sub && sub.options && sub.options.applicationServerKey) {
        const actual = new Uint8Array(sub.options.applicationServerKey);
        if (actual.length !== claveServidor.length || actual.some((b, i) => b !== claveServidor[i])) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveServidor });
      const res = await api.avisos("alta", {
        usuario: cred.usuario, clave: cred.clave, codigo,
        confiable: almacen.leer("dispositivoDeConfianza"), suscripcion: sub.toJSON(),
      });
      if (res.codigo) {
        pedirCodigo(cred, res.enviadoA);
        return;
      }
      almacen.guardar("avisos", { endpoint: sub.endpoint, usuario: cred.usuario });
      avisar("Avisos activados");
      mostrar();
    } catch (e) {
      error.textContent = e.message || "No se han podido activar los avisos.";
      boton.disabled = false;
    }
  }

  function pedirCodigo(cred, enviadoA) {
    const codigo = h("input", { id: "avisos-codigo", inputmode: "numeric", autocomplete: "one-time-code", maxlength: "10" });
    const error = h("p", { class: "error", role: "alert" });
    const boton = h("button", { class: "boton primario", type: "button" }, "Confirmar código");
    boton.addEventListener("click", () => {
      if (!codigo.value.trim()) {
        codigo.focus();
        return;
      }
      activar(cred, boton, error, codigo.value.trim());
    });
    pintar(
      h("p", { class: "nota" }, `Séneca pide verificar este acceso. Te ha enviado un código${enviadoA ? ` a ${enviadoA}` : ""}.`),
      h("label", { for: "avisos-codigo" }, "Código"), codigo, error, boton,
    );
  }

  function formularioActivar(textoBoton = "Activar avisos", aviso = "") {
    const guardadas = almacen.leer("credenciales");
    const usuario = h("input", { id: "avisos-usuario", autocomplete: "username", autocapitalize: "none", autocorrect: "off" });
    const clave = h("input", { id: "avisos-clave", type: "password", autocomplete: "current-password" });
    const error = h("p", { class: "error", role: "alert" });
    const boton = h("button", { class: "boton primario", type: "button" }, textoBoton);
    boton.addEventListener("click", () => {
      const cred = guardadas || { usuario: usuario.value.trim(), clave: clave.value };
      if (!cred.usuario || !cred.clave) {
        error.textContent = "Escribe tu usuario y contraseña de iPasen.";
        return;
      }
      activar(cred, boton, error);
    });
    pintar(
      aviso ? h("p", { class: "aviso-pausa" }, aviso) : null,
      h("p", { class: "nota" }, explicacion),
      guardadas ? null : [h("label", { for: "avisos-usuario" }, "Usuario de iPasen"), usuario, h("label", { for: "avisos-clave" }, "Contraseña"), clave],
      error, boton,
    );
  }

  async function mostrar() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      pintar(h("p", { class: "nota" }, esIOS() && !instalada()
        ? "Para recibir avisos, primero añade Recreo a la pantalla de inicio (Compartir › Añadir a pantalla de inicio) y ábrela desde ahí."
        : "Este navegador no puede recibir avisos."));
      return;
    }
    if (esIOS() && !instalada()) {
      pintar(h("p", { class: "nota" }, "Para recibir avisos, primero añade Recreo a la pantalla de inicio (Compartir › Añadir a pantalla de inicio) y ábrela desde ahí."));
      return;
    }
    const datos = almacen.leer("avisos");
    const cred = almacen.leer("credenciales");
    if (!datos) {
      formularioActivar();
      return;
    }
    pintar(h("p", { class: "nota" }, "Comprobando…"));
    let estadoServidor = null;
    if (cred) {
      try {
        estadoServidor = await api.avisos("estado", { usuario: cred.usuario, clave: cred.clave, endpoint: datos.endpoint });
      } catch {
        estadoServidor = null;
      }
    }
    if (estadoServidor && (!estadoServidor.activo || estadoServidor.estado !== "ok")) {
      const motivo = estadoServidor.estado === "codigo" ? "Los avisos están en pausa: Séneca pide un código para seguir."
        : estadoServidor.estado === "clave" ? "Los avisos están en pausa: la contraseña de iPasen ha cambiado."
        : "Los avisos no están activos en este iPhone.";
      formularioActivar("Reactivar avisos", motivo);
      return;
    }
    const prueba = h("button", { class: "boton secundario", type: "button" }, "Mandar un aviso de prueba");
    const quitar = h("button", { class: "boton secundario", type: "button" }, "Desactivar avisos");
    const error = h("p", { class: "error", role: "alert" });
    prueba.addEventListener("click", async () => {
      error.textContent = "";
      const c = almacen.leer("credenciales");
      if (!c) {
        error.textContent = "Para la prueba hace falta tener la contraseña guardada en este iPhone.";
        return;
      }
      prueba.disabled = true;
      try {
        await api.avisos("prueba", { usuario: c.usuario, clave: c.clave, endpoint: datos.endpoint });
        avisar("Aviso enviado. Llegará en unos segundos.");
      } catch (e) {
        error.textContent = e.message;
      }
      prueba.disabled = false;
    });
    quitar.addEventListener("click", async () => {
      quitar.disabled = true;
      try {
        await desactivarAvisos();
        avisar("Avisos desactivados");
        mostrar();
      } catch (e) {
        error.textContent = e.message;
        quitar.disabled = false;
      }
    });
    pintar(
      h("p", { class: "estado-avisos" }, "Activados en este iPhone."),
      h("p", { class: "nota" }, "Te avisa de mensajes, notas, autorizaciones y documentos nuevos entre las 7:30 y las 22:00. Lo que llegue de noche te lo avisa a primera hora."),
      error, prueba, quitar,
    );
  }

  mostrar();
  return caja;
}

// ── Inicio ──────────────────────────────────────────────────────────────────

function iniciar() {
  if (!almacen.leer("intermediario") && INTERMEDIARIO) almacen.guardar("intermediario", INTERMEDIARIO);
  // Al abrir la app desde un aviso llega el hijo al que se refiere
  const desdeAviso = new URLSearchParams(location.search).get("hijo");
  if (desdeAviso) {
    almacen.guardar("hijo", desdeAviso);
    history.replaceState(null, "", location.pathname);
  }
  api = almacen.leer("demo") ? new PasenDemo() : new Pasen();
  if (api.demo || almacen.leer("token") || almacen.leer("credenciales")) arrancar();
  else pantallaAcceso();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && nodos.vista && nodos.vista.isConnected && Date.now() - estado.ultimaCarga > 120000) {
      cargarVista();
      actualizarNoLeidos();
    }
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    // Al tocar un aviso con la app ya abierta
    navigator.serviceWorker.addEventListener("message", (ev) => {
      if (ev.data && ev.data.tipo === "abrir") abrirDesdeAviso(ev.data.matricula);
    });
  }
}

function abrirDesdeAviso(matricula) {
  if (!nodos.vista || !nodos.vista.isConnected) return;
  cerrarCapas();
  if (matricula && estado.hijos.some((x) => x.matricula === matricula)) {
    estado.matricula = matricula;
    almacen.guardar("hijo", matricula);
    aplicarColor();
    pintarEtiquetas();
  }
  estado.vista = "mensajes";
  estado.bandeja = "recibidos";
  cargarVista(true);
}

iniciar();
