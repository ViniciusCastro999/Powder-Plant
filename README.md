<div align="center">

# 🌱 Powder & Plant

**A browser-based falling-sand particle sandbox.**

![Powder & Plant screenshot](docs/screenshot.png)

![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Pixi.js](https://img.shields.io/badge/Pixi.js-8-E91E63?logo=pixijs&logoColor=white)

<br>

[![English](https://img.shields.io/badge/lang-English-2ea44f?style=for-the-badge)](README.md)
[![Português](https://img.shields.io/badge/lang-Portugu%C3%AAs-6e7781?style=for-the-badge)](README.pt-BR.md)

</div>

---

Paint sand, water, fire, lava, acid, gunpowder, plants and dozens of other
materials onto a grid and watch them interact. Liquids seek their own level,
powders pile up, fire spreads, explosives chain-detonate, seeds germinate, and a
global **ambient temperature** shifts with whatever you place — driving
spontaneous combustion, freezing, boiling and plant growth.

> The in-game UI and all material names are in Portuguese.

## Features

- **~25 materials** across 8 thematic categories, each with its own physics.
- **Falling-sand simulation** written from scratch — a cellular automaton with
  density-based movement, fire and acid propagation, and sleep/wake optimisation.
- **Electricity** that travels through conductors as pulses.
- **Explosions** with blast waves, shrapnel and chain reactions (Gunpowder, C4, gas).
- **Conway's Game of Life** as a material of its own ("Vida").
- **Global temperature** with 8 bands — warm the grid into the *prosperous* band
  and plants bloom into flowers.
- **Save / load / export / import** scenes as `.pnp.json` files (via `localStorage`).

## Tech stack

| | |
|---|---|
| **UI** | [Svelte 5](https://svelte.dev/) (runes) + TypeScript |
| **Rendering** | [Pixi.js 8](https://pixijs.com/) drawing the cell grid |
| **Tooling** | [Vite](https://vite.dev/) as bundler and dev server |

No runtime dependencies beyond Pixi — the simulation is all first-party code.

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
- **Eraser** removes cells; **Limpar tudo** clears the whole grid.
- **Mapas** opens the save/load window: name and store the current scene in the
  browser, reload saved maps, export any map as a `.pnp.json` file, and import
  files back to share scenes between browsers.
- The panel shows the active-cell count and the **ambient temperature**, which
  rises with Fire/Lava/Heat and falls with Ice/Cold, affecting spontaneous
  combustion, freezing, boiling and plant growth.
- The **Dicas** button opens a window describing every material and its interactions.

## Materials

| Category | Materials |
|---|---|
| Partículas (Particles) | Areia · Pedra · Terra · Barro · Sal |
| Sólidos (Solids) | Madeira · Metal · Vidro |
| Líquidos (Liquids) | Água · Óleo · Ácido |
| Vida (Life) | Planta · Semente · Vida |
| Calor (Heat) | Fogo · Lava · Calor |
| Frio (Cold) | Gelo · Frio |
| Explosivos (Explosives) | Pólvora · C4 · Gás |
| Especiais (Special) | Eletricidade · Clone |

Some materials only appear as reactions: **Broto** and **Flor** (from germinating
seeds), **Vapor** (boiled water) and **Vapor de Ácido** (boiled acid).

## Project structure

```
src/
  main.ts              entry point, mounts the App
  App.svelte           layout: canvas + bottom panel + modals
  components/
    Canvas.svelte      creates the grid, runs the sim loop, handles the brush
    BottomPanel.svelte material picker, brush, stats, buttons
    HintsModal.svelte  help window with material descriptions
    MapsModal.svelte   save / load / export / import window
    Icon.svelte        SVG icons
  render/
    PixiStage.ts       draws the grid (and spark/explosion overlays) with Pixi
  sim/
    grid.ts            the core: cellular automaton, physics, reactions, temperature
    materials.ts       every material definition and the palette grouping
    materialInfo.ts    description / interaction copy for the hints modal
    temperature.ts     temperature bands shared between sim and UI
    storage.ts         RLE serialisation and map persistence in localStorage
    types.ts           MaterialId, categories, simulation buffers
```

## How the simulation works

The core is [src/sim/grid.ts](src/sim/grid.ts): the grid stores `material` and
`meta` (one byte per cell) in flat `Uint8Array`s, and `step()` walks the grid
bottom-to-top each frame applying movement (powders, liquids, gases), fire, acid,
electricity (pulses), explosions (blast waves), Conway's Game of Life (the "Vida"
material) and the ambient-temperature effects.
