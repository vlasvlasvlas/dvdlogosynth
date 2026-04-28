# dvdlogosynth

logos DVD rebotando donde cada logo es un sinte con identidad propia (color, trayectoria, timbre, drone). Estrellas como puntos de gravedad que curvan o repelen las trayectorias.

## Demo

https://vlasvlasvlas.github.io/dvdlogosynth

## Como se usa

1. Click o tap en la escena para habilitar el audio (los navegadores requieren un gesto del usuario antes de empezar audio).
2. `+` / `-` para sumar o quitar logos. Cada accion suena: ping agudo al sumar, blip grave al quitar.
3. `★+` / `★-` para sumar o quitar estrellas de gravedad.
4. Click en un logo o en una estrella para seleccionar y editar.
5. Drag de una estrella para moverla por la escena.
6. `?` abre la ayuda. `⚙` abre el panel de configuracion.

### Logos

Por logo: tono, velocidad, sonido on/off, waveform, reverb send, delay (mix + time independientes por canal), drone (volumen, frecuencia, waveform, filtro con cutoff/Q, LFO rate/depth).

Trail por logo:
- `off`: sin estela.
- `ghost`: copia desvanecida del logo.
- `line`: linea suave que sigue al logo.
- `line-only`: oculta el logo, deja solo la linea opaca. Con length al maximo se ve el path completo de los rebotes.

### Estrellas (gravedad)

Por estrella:
- **Force**: rango -100 a +100 con readout. Positivo atrae, negativo repele, 0 sin efecto. +50 default.
- **Radius**: zona donde la estrella afecta a los logos. Falloff lineal en el borde.
- **Display**: estrella + anillo (default), solo estrella, u oculta (la fisica sigue activa).

Las estrellas son drageables: tocalas y arrastralas para reposicionar.

### Presets

- **Solo**: un logo, modo TV clasica.
- **Classic**: dos logos, sin colisiones, sin efectos.
- **Neon**: nueve logos con colisiones, reverb y delay altos.
- **Drone**: seis logos en frecuencias afinadas con drone activo.

### Atajos de teclado

- `+` / `-` agregar / quitar logo
- `?` ayuda
- `R` randomize
- `P` performance mode (reduce coste de FX y trails al caer FPS)
- `C` toggle de colisiones logo-logo

## Stack

HTML + CSS + JavaScript vanilla con ES modules. Sin build, sin bundler, sin dependencias en runtime.

```
index.html                    # markup, sidebar, dialog de ayuda
styles.css                    # tema oscuro monoespaciado
dvdlogo.png                   # logo base (RGBA, fondo transparente)
js/
  config.js                   # constantes globales (CONFIG, TRAIL_MODES, STAR_*)
  utils.js                    # clamp, randomBetween
  logo.js                     # clase Logo + helpers de mute/solo
  audio.js                    # AudioEngine (Web Audio: master, comp, limiter, reverb,
                              #  canal de delay per-logo, drones, pings UI)
  physics.js                  # rebotes, colisiones logo-logo, gravedad de estrellas
  renderer.js                 # canvas 2D, trails, mascara de dvdlogo.png, render de estrellas
  app.js                      # orquestador: estado, presets, UI, scene save/load, loop,
                              #  drag de estrellas, cleanup de audio en pagehide
.github/workflows/pages.yml   # deploy a GitHub Pages
```

`index.html` carga `js/app.js` con `<script type="module">`.

## Desarrollo local

ES modules requieren servir el sitio por HTTP. Abrir `index.html` con doble click no funciona: los modulos quedan bloqueados por restricciones CORS de `file://`.

Recomendado:

```bash
# desde la raiz del repo
python3 -m http.server 8000
```

o:

```bash
npx serve .
```

Despues abrir `http://localhost:8000/` en el navegador.

## Deploy a GitHub Pages

El repo incluye el workflow `.github/workflows/pages.yml` que despliega en push a `main`.

Para activarlo en GitHub:

1. Settings -> Pages -> Source: **GitHub Actions**.
2. Push a `main`.
3. El workflow corre, publica y devuelve la URL.

## Estado

Hecho:
- Fases 1-5 base + V2.1 (CRT/OSD) + V2.2 (channel bay hasta 64 logos).
- Per-logo delay channel con time + mix independientes (mix al maximo da feedback ~0.95 cuasi infinito).
- Reverb mas espacial (impulso 4.5s, send escalado per-voice).
- Trail per-logo con length variable (2-1000) y modo line-only.
- Estrellas de gravedad drageables con force signed (-100..+100), radius y modos de display.
- Cleanup de AudioContext en pagehide / beforeunload.

Pendiente:
- V2.3 synth modular por logo, V2.4 visual generativo, V2.5 performance profunda.

Detalle: `docs/01-fases-roadmap.md` y `docs/03-backlog-inmediato.md` (no se publican: estan en `.gitignore`).
