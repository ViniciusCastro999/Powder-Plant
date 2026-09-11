<div align="center">

# 🌱 Powder & Plant

**A browser-based falling-sand particle sandbox.**

[![Powder & Plant screenshot](docs/screenshot.png)](https://viniciuscastro999.github.io/Powder-Plant/)

[![Play in your browser](https://img.shields.io/badge/%E2%96%B6%20Play%20in%20your%20browser-2ea44f?style=for-the-badge)](https://viniciuscastro999.github.io/Powder-Plant/)

<br>

![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Pixi.js](https://img.shields.io/badge/Pixi.js-8-E91E63?logo=pixijs&logoColor=white)

<br>

[![English](https://img.shields.io/badge/lang-English-2ea44f?style=for-the-badge)](README.md)
[![Português](https://img.shields.io/badge/lang-Portugu%C3%AAs-6e7781?style=for-the-badge)](README.pt-BR.md)
[![日本語](https://img.shields.io/badge/lang-%E6%97%A5%E6%9C%AC%E8%AA%9E-6e7781?style=for-the-badge)](README.ja.md)

</div>

---

Paint sand, water, fire, lava, acid, gunpowder, plants and dozens of other
materials onto a grid and watch them interact. Liquids seek their own level,
powders pile up, fire spreads, explosives chain-detonate, seeds germinate, and a
global **ambient temperature** shifts with whatever you place, driving
spontaneous combustion, freezing, boiling and plant growth.

> The UI is available in English, Portuguese and Japanese (switcher in the bottom-left corner).

## Features

- **~35 materials** across 10 thematic categories, each with its own physics.
- **Falling-sand simulation** written from scratch: a cellular automaton with
  density-based movement, fire and acid propagation, and sleep/wake optimisation.
- **Electricity** that travels through conductors as pulses.
- **Impulse-based explosions**. A detonation sweeps the whole connected charge in
  one fast crack, then physically hurls the surrounding sand, water and debris
  outward as gravity-bound projectiles that arc, scatter and pile back down,
  digging a real crater with a rim (Gunpowder, C4, gas).
- **Creatures** with goal-driven behaviour and a small food web: **Ants** walk
  surfaces, follow food scent, gnaw wood and burrow; **Birds** soar, then **swoop**
  to hunt ants and surfacing fish, and scatter seeds; **Fish** school and dive deep
  from a hovering bird. They feed, breed and thin out when the food runs low.
- **Pip**: little upright figures, not dots, each working a trade and heading
  straight for the nearest job rather than milling about. The **Builder** levels a
  patch of ground and raises a whole house on it at once (the frame is conjured,
  so hillsides and beaches stay whole). Six shapes and sizes, with peaked, hipped,
  mono-pitch or battlemented roofs, lit windows and a chimney (brick, timber or
  ice, by what's nearby). It keeps houses patched when a fire or a blast knocks a
  hole in one; the folk walk straight through house walls and shelter inside, up
  to each house's capacity, when the climate turns hostile. Once the village has
  a woodpile it also decks a real-shaped timber bridge across water in its way:
  a short ramp off each bank, then one dead-level span, a touch above the water.
  The **Lumberjack** sows a seed on open soil, *leaves it to grow*, and fells the
  mature tree into a block of timber, the woodpile a Builder needs before it will
  bridge. The **Farmer** grades a furrow and sows **wheat**, the village's staple
  crop that every hungry Pip heads for. The **Warrior** guards the village, sword
  in one hand and shield in the other: it charges any **Skeleton** it sees and
  trades blows (one point a strike, about once a second; a working Pip has 5 hit
  points, a Warrior 10, a Skeleton 5). A Skeleton hunts the folk; it's slower
  than they are, so a working Pip backs away when one gets close. **Magic**
  landing on a Warrior or Skeleton empowers it: twice the size, twice the bite.
- **Painting Pip** drops one figure per click, whatever the brush size, so a
  crowd is something you place deliberately rather than flood the map with.
- **Magic**: a drifting mote that transmutes its surroundings toward life and
  order. It quenches fire, weathers stone to soil, greens dirt, defuses explosives.
- **Conway's Game of Life** as a material of its own ("Vida").
- **Global temperature** with 8 bands. Warm the grid into the *prosperous* band
  and plants bloom into flowers.
- **Save / load / export / import** scenes as `.pnp.json` files (via `localStorage`).

## Tech stack

| | |
|---|---|
| **UI** | [Svelte 5](https://svelte.dev/) (runes) + TypeScript |
| **Rendering** | [Pixi.js 8](https://pixijs.com/) drawing the cell grid |
| **Tooling** | [Vite](https://vite.dev/) as bundler and dev server |

No runtime dependencies beyond Pixi. The simulation is all first-party code.

## Getting started

Requires Node.js (20+ recommended).

```bash
npm install
npm run dev       # dev server with HMR at http://localhost:5173
```

Other scripts:

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build locally
npm run check     # Svelte + TypeScript type-check
```

## How to play

- **Pick a material** from the bottom bar (grouped by category).
- **Draw on the canvas** with mouse or touch. Brush shapes: Point, Line, Square
  area and Circle area, with adjustable size.
- **Eraser** removes cells; **Clear all** wipes the whole grid.
- **Maps** opens the save/load window: name and store the current scene in the
  browser, reload saved maps, export any map as a `.pnp.json` file, and import
  files back to share scenes between browsers.
- The panel shows the active-cell count and the **ambient temperature**, which
  rises with Fire/Lava/Heat and falls with Ice/Cold, affecting spontaneous
  combustion, freezing, boiling and plant growth.
- The **Hints** button opens a window describing every material and its interactions.
- The **language switch** (bottom-left, next to the temperature) toggles the UI
  between English, Portuguese and Japanese. The choice is remembered in the
  browser, and defaults to your browser language on first visit.

## Materials

| Category | Materials |
|---|---|
| Particles | Sand · Stone · Dirt · Mud · Salt |
| Solids | Wood · Metal · Glass · Brick |
| Liquids | Water · Oil · Acid |
| Life | Plant · Seed · Wheat · Life |
| Heat | Fire · Lava · Heat |
| Cold | Ice · Cold |
| Explosives | Gunpowder · C4 · Gas |
| Creatures | Ant · Bird · Fish · Skeleton |
| Pip | Builder · Lumberjack · Farmer · Warrior |
| Special | Electricity · Clone · Magic |

Some materials only appear as reactions: **Sprout** and **Flower** (from
germinating seeds), **Steam** (boiled water) and **Acid Vapor** (boiled acid).

## Project structure

```
src/
  main.ts              entry point, mounts the App
  App.svelte           layout: canvas + bottom panel + modals
  components/
    Canvas.svelte      creates the grid, runs the sim loop, handles the brush
    BottomPanel.svelte material picker, brush, stats, language switch
    HintsModal.svelte  help window with material descriptions
    MapsModal.svelte   save / load / export / import window
    Icon.svelte        SVG icons
  render/
    PixiStage.ts       draws the grid (and spark/explosion overlays) with Pixi
  sim/
    grid.ts            the core: cellular automaton, physics, reactions, temperature
    materials.ts       every material definition and the palette grouping
    temperature.ts     temperature bands shared between sim and UI
    storage.ts         RLE serialisation and map persistence in localStorage
    types.ts           MaterialId, categories, simulation buffers
  i18n/                UI translations (English / Portuguese / Japanese)
    locale.svelte.ts   the active-language state, persisted to localStorage
    ui.ts              fixed UI strings
    materials.ts       material names + category labels per language
    materialInfo.ts    hint descriptions and interactions per language
```

## How the simulation works

The core is [src/sim/grid.ts](src/sim/grid.ts): the grid stores `material` and
`meta` (one byte per cell) in flat `Uint8Array`s, and `step()` walks the grid
bottom-to-top each frame applying movement (powders, liquids, gases), fire, acid,
electricity (pulses), explosions (impulse + flying debris), creature behaviour
(ants, birds, fish, skeletons; and the Pips: builder, lumberjack, farmer, warrior), magic transmutation, Conway's Game of Life (the "Vida"
material) and the ambient-temperature effects.
