# NO MIRES ATRÁS: horror y supervivencia con realidad aumentada

En esta actividad desarrollé **NO MIRES ATRÁS**, un prototipo móvil de horror que explora cómo la realidad aumentada puede transformar el espacio cercano en un escenario de supervivencia. La mecánica principal es sencilla, pero busca generar tensión: el monstruo se detiene mientras permanece dentro del campo de visión del jugador y avanza cuando deja de observarlo. Para sobrevivir, hay que encontrar tres llaves antes de que termine el tiempo.

El juego tiene tres niveles principales con dificultad progresiva. En cada nivel se reduce el tiempo disponible y el monstruo puede acercarse más rápido; además, hay menos cajas de munición. La pistola y las balas son recursos limitados que permiten ganar distancia, pero no reemplazan el objetivo de encontrar las llaves. La cuarta etapa presenta dos perseguidores desde direcciones opuestas como adelanto de una posible segunda parte.

Construí el prototipo con **HTML, CSS, JavaScript y Three.js**, e integré la ruta de **WebXR Hit Test** para intentar detectar una superficie real y colocar la arena y sus objetos en el espacio. También incorporé un modo de simulación 3D para probar la lógica en dispositivos o navegadores que no disponen de una sesión de realidad aumentada compatible. Es importante distinguir ambos modos: la simulación permite comprobar las mecánicas, pero no ancla los objetos al entorno físico como lo intenta hacer la ruta WebXR.

La experiencia incluye menú e instrucciones, cronómetro, recolección táctil de llaves, inventario de recursos, disparo limitado, audio ambiental y efectos de sonido para las acciones y los desenlaces. También trabajé en áreas táctiles más accesibles para los objetos y en una interfaz vertical adaptada al teléfono.

Uno de los retos fue equilibrar la exploración y el riesgo. Mirar al monstruo ayuda a mantenerlo quieto, pero deja menos oportunidades para buscar llaves; apartar la vista facilita explorar, aunque aumenta el peligro. La prueba debe hacerse en un espacio despejado y sin caminar a ciegas mientras se mira la pantalla.

Como siguiente paso quiero probar el seguimiento espacial en diferentes dispositivos compatibles, ajustar la distribución de objetos y evaluar cómo responde la tensión del juego con usuarios reales.

**Video de demostración:** []

**Repositorio del proyecto:** [https://github.com/luisdaniel691/Actividad4_NoMiresAtras_RVyA.git]

#RealidadAumentada #WebXR #ThreeJS #DesarrolloDeVideojuegos #GameDesign #ExperienciaInteractiva
