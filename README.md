# dvdlogosynth

logos DVD rebotando donde cada logo es un sinte con identidad propia (color, trayectoria, timbre, drone).

## Demo

https://vlasvlasvlas.github.io/dvdlogosynth

## Como se usa

1. Click o tap en la escena para habilitar el audio (los navegadores requieren un gesto del usuario antes de empezar audio).
2. `+` / `-` para sumar o quitar logos. Cada accion suena: ping agudo al sumar, blip grave al quitar.
3. Click en un logo para abrir el sidebar y editar sus parametros.
4. `?` abre la ayuda. `⚙` abre el panel de configuracion (master, escena, presets, parametros del logo seleccionado).

### Presets

- **Solo**: un solo logo, modo TV clasica.
- **Classic**: dos logos sin colisiones, sin efectos.
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
dvdlogo.png                   # logo base
js/
  config.js                   # constantes globales
  utils.js                    # clamp, randomBetween
  logo.js                     # clase Logo + helpers de mute/solo
  audio.js                    # AudioEngine (Web Audio: master, comp, limiter, reverb, delay, drones, pings)
  physics.js                  # rebotes y colisiones logo-logo
  renderer.js                 # canvas 2D, trails, carga de dvdlogo.png
  app.js                      # orquestador: estado, presets, UI, scene save/load, loop
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

- Hecho: fases 1-5, V2.1 (CRT/OSD), V2.2 (channel bay con mute/solo/lock/duplicar hasta 64 logos).
- Pendiente: V2.3 synth modular por logo, V2.4 visual generativo, V2.5 performance profunda.

Detalle: `docs/01-fases-roadmap.md` y `docs/03-backlog-inmediato.md` (no se publican: estan en `.gitignore`).
