// Todo lo que guarda la app se queda en este iPhone (localStorage).
const PREFIJO = "recreo.";
const memoria = new Map();

export const almacen = {
  leer(clave) {
    try {
      const v = localStorage.getItem(PREFIJO + clave);
      return v === null ? null : JSON.parse(v);
    } catch {
      return memoria.has(clave) ? memoria.get(clave) : null;
    }
  },
  guardar(clave, valor) {
    try {
      if (valor === null || valor === undefined) localStorage.removeItem(PREFIJO + clave);
      else localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    } catch {
      memoria.set(clave, valor);
    }
  },
  borrarTodo(salvo = []) {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(PREFIJO) && !salvo.includes(k.slice(PREFIJO.length))) localStorage.removeItem(k);
      }
    } catch {
      for (const k of [...memoria.keys()]) if (!salvo.includes(k)) memoria.delete(k);
    }
  },
};
