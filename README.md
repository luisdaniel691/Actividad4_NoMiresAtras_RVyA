# NO MIRES ATRÁS — Proyecto 04

## Descripción

**NO MIRES ATRÁS** es un prototipo móvil de horror y supervivencia que explora la realidad aumentada sin marcadores. La regla central es que el monstruo avanza cuando queda fuera del campo de visión y se detiene mientras el jugador lo mantiene a la vista. El objetivo principal de los tres niveles es encontrar tres llaves antes de que se agote el tiempo y evitar que el monstruo alcance al jugador. La pistola y la munición son recursos limitados que pueden ayudar a ganar distancia.

El cuarto nivel, **Dos direcciones**, funciona como un adelanto de la Parte II y aumenta deliberadamente la dificultad con dos perseguidores y sin munición.

## Contenido

- Menú de inicio e instrucciones.
- Pantalla de escaneo y colocación del área de juego.
- Escena 3D construida con Three.js.
- Intento de seguimiento espacial por WebXR Hit Test.
- Cuatro etapas con temporizador, llaves, objetos y dificultad progresiva.
- Monstruo con comportamiento basado en si aparece en el campo de visión.
- Pistola, cajas de munición y disparo limitado.
- Música ambiental y efectos de sonido generados proceduralmente para el prototipo.
- Interfaz vertical y controles táctiles.
- Modo de simulación 3D para equipos o navegadores sin WebXR AR compatible.

## Reglas y dificultad

| Nivel | Tiempo | Velocidad indicada del monstruo si no se le ve | Munición | Objetivo |
|---|---:|---:|---:|---|
| 1 — El primer rastro | 75 s | 0.24 m/s | 3 cajas × 2 balas | Encontrar 3 llaves |
| 2 — Algo se despierta | 65 s | 0.36 m/s | 2 cajas × 2 balas | Encontrar 3 llaves |
| 3 — No hay escape | 55 s | 0.52 m/s | 1 caja × 2 balas | Encontrar 3 llaves |
| 4 — Dos direcciones | 36 s | Dos monstruos; dificultad extrema | Sin munición | Teaser de Parte II |

La pistola es un objeto que también debe encontrarse. La munición está en cajas separadas. Si el monstruo alcanza al jugador o termina el tiempo antes de recoger las tres llaves, la partida concluye.

## Tecnologías

- HTML, CSS y JavaScript.
- Three.js para la escena 3D.
- WebXR `immersive-ar` y Hit Test para intentar colocar objetos virtuales sobre una superficie real.
- API de cámara como alternativa de prueba en navegadores donde no se puede iniciar una sesión WebXR.


## Realidad aumentada y modo de respaldo

La ruta WebXR con Hit Test es la que intenta detectar un plano y anclar la arena y los objetos a una posición física. Si WebXR o el passthrough no están disponibles, puede abrirse un modo de cámara con objetos 3D superpuestos, o una simulación 3D sin cámara. Esas alternativas sirven para probar partes de la mecánica.

La estabilidad depende del teléfono, el navegador, la iluminación y la textura de las superficies. Si no aparece el aro de detección, la colocación aproximada permite continuar las pruebas, pero no equivale a un plano real detectado.

## Controles

- **Realidad aumentada:** gira el teléfono para mirar, toca objetos para recogerlos y pulsa **Disparar** con munición disponible.
- **Simulación:** arrastra para mirar, usa los controles en pantalla para moverte, toca objetos y prueba el disparo.
- **Pausa:** pulsa el botón de pausa para detener temporalmente el cronómetro.

## Audio y licencias

Los archivos WAV incluidos para ambiente, recogida, disparo, amenaza, cambio de nivel y derrota se generaron de forma procedural para este prototipo.

## Seguridad al probarlo

Utiliza el juego en un área despejada. Gira el teléfono despacio y evita caminar a ciegas, especialmente mientras miras al monstruo o buscas objetos. No es necesario caminar hacia atrás para jugar.

