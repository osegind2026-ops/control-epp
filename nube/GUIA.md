# Guía: instalar el servidor de Control EPP en Google Sheets

Tiempo estimado: 10 minutos. Hágalo con la **cuenta de Google de la oficina**, en una PC.

## 1. Crear la hoja

1. Inicie sesión en Google con la cuenta de la oficina.
2. Abra <https://sheets.new> (crea una hoja de cálculo en blanco).
3. Arriba a la izquierda, cambie el nombre «Hoja de cálculo sin título» por **Control EPP - Base de datos**.

## 2. Pegar el código del servidor

1. En la hoja, menú **Extensiones → Apps Script**. Se abre el editor en otra pestaña.
2. Arriba a la izquierda, cambie «Proyecto sin título» por **Control EPP servidor**.
3. En el archivo `Código.gs`, **borre todo** lo que tenga (`function myFunction() {…}`).
4. Pegue el contenido completo del archivo `app/nube/Codigo.gs` (empieza con
   `/** Control EPP · Oficina de Seguridad Industrial…`).
5. Guarde con **Ctrl + S** (o el ícono de disquete).

## 3. Configurar y autorizar (solo una vez)

1. En la barra superior del editor, en la lista de funciones, elija **configurar**.
2. Presione **Ejecutar**.
3. Google pedirá permisos:
   - **Revisar permisos** → elija la cuenta de la oficina.
   - Verá «Google no ha verificado esta app»: es normal porque el script es de ustedes.
     Presione **Configuración avanzada** → **Ir a Control EPP servidor (no seguro)**.
   - Presione **Permitir**.
4. Abajo, en el «Registro de ejecución», aparecerá: `Clave de la oficina: XXXX-XXXX-XXXX`.
   También queda en la pestaña **Configuración** de la hoja.
   **Esta clave no se comparte conmigo ni fuera de la oficina**: se escribe en cada equipo.

## 4. Publicar como aplicación web

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. Junto a «Seleccionar tipo», el ícono de engrane → **Aplicación web**.
3. Llene así:
   - Descripción: `Servidor Control EPP`
   - Ejecutar como: **Yo** (la cuenta de la oficina)
   - Quién tiene acceso: **Cualquier usuario**
4. Presione **Implementar** y, si lo pide, autorice otra vez.
5. Copie la **URL de la aplicación web**. Tiene esta forma:
   `https://script.google.com/macros/s/AKfy…/exec`

> «Cualquier usuario» permite que los celulares se conecten sin iniciar sesión en Google.
> Aun así, nadie puede leer ni escribir datos sin la clave de la oficina; la hoja sigue
> siendo privada de la cuenta.

## 5. Comprobar

Pegue la URL en el navegador. Debe mostrar:

```
{"ok":true,"app":"control-epp","version":"2.0.0"}
```

## 6. Enviar la URL

Envíe **solo la URL** (la que termina en `/exec`). No envíe la contraseña ni la clave.

---

### Si más adelante cambia el código

**Implementar → Gestionar implementaciones** → lápiz (editar) → Versión: **Nueva versión** →
**Implementar**. Así la URL sigue siendo la misma y no hay que reconfigurar los equipos.

### Qué hay en la hoja

- **Entregas, Detalle de entregas, Existencias, Resguardos, Movimientos, Personal…**: se llenan
  solas desde la app. Úselas para consultar, filtrar o hacer tablas dinámicas.
- **Equipos a resguardo** y **Bitácora equipos** (servidor 2.2): catálogo de explosímetros,
  higrómetros, etc., y cada salida y regreso con quién lo tiene, su contacto y cómo regresó.
- El correo diario (función `activarAvisosDiarios`) avisa de préstamos vencidos, equipos que no
  han regresado, calibraciones próximas y materiales por reabastecer.
- **Equipos**: los celulares y PC conectados. Para quitarle el acceso a uno, cambie su columna
  «Activo» de `SI` a `NO`.
- No edite a mano las demás pestañas: los cambios se hacen desde la app.

## 7. Puente con la PC de la oficina (versión 2.6.0 del código)

La red de la oficina bloquea `script.google.com`, así que las PCs no pueden hablar con este servidor.
El puente lo resuelve solo, cada 5 minutos, usando `docs.google.com` (que sí pasa):

- el servidor de la **PC host** manda lo nuevo de las PCs como respuestas de un **formulario**
  (firmadas con la clave de la oficina; lo que no trae la firma correcta se descarta);
- Google deja lo nuevo de los celulares en una **hoja aparte** que solo tiene **datos cifrados**
  con la clave de la oficina. Esa hoja se comparte como «Lector con el enlace» para que la PC la
  lea sin iniciar sesión; sin la clave su contenido no se puede leer.

Pasos (una sola vez):

1. Pegue el `Codigo.gs` nuevo (paso 2), guarde y publique una **versión nueva** de la
   aplicación web (paso 4, «Gestionar implementaciones → Editar → Nueva versión»).
2. Recargue la hoja. En el menú **Control EPP** elija **Instalar / ver puente con la PC** y
   acepte los permisos (Formularios, Drive y disparadores).
3. En la pestaña **Configuración** aparece la fila **«Puente con la PC · enlace»**. En la PC host:
   Ajustes → **Puente con los celulares**, pegue ese enlace y la clave de la oficina.

Lo que se crea:

- Formulario «Control EPP · puente con la PC (no editar)» y hoja «Control EPP · puente (solo
  datos cifrados)» en su Drive. No los edite ni los borre.
- Disparador cada 5 minutos (`puenteCiclo`) y respaldo diario a las 2:00 (`respaldoDiario`): una
  copia de esta hoja en la carpeta «Control EPP · respaldos» de Drive; se conservan las últimas 30.

Si cambia la clave con «nuevaClave», escríbala también en la PC host (la PC avisa si no coincide).
