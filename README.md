<div align="center">

# 🌱 Powder & Plant

**A browser-based falling-sand particle sandbox.**
_Um simulador de partículas do tipo falling-sand que roda no navegador._

![Powder & Plant screenshot](docs/screenshot.png)

![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Pixi.js](https://img.shields.io/badge/Pixi.js-8-E91E63?logo=pixijs&logoColor=white)

**[English](#english) · [Português](#português)**

</div>

---

## English

Paint sand, water, fire, lava, acid, gunpowder, plants and dozens of other
materials onto a grid and watch them interact. Liquids seek their own level,
powders pile up, fire spreads, explosives chain-detonate, seeds germinate, and a
global **ambient temperature** shifts with whatever you place — driving
spontaneous combustion, freezing, boiling and plant growth.

> The in-game UI and all material names are in Portuguese.

### Features

- **~25 materials** across 8 thematic categories, each with its own physics.
- **Falling-sand simulation** written from scratch — a cellular automaton with
  density-based movement, fire and acid propagation, and sleep/wake optimisation.
- **Electricity** that travels through conductors as pulses.
- **Explosions** with blast waves, shrapnel and chain reactions (Gunpowder, C4, gas).
- **Conway's Game of Life** as a material of its own ("Vida").
- **Global temperature** with 8 bands — warm the grid into the *prosperous* band
  and plants bloom into flowers.
- **Save / load / export / import** scenes as `.pnp.json` files (via `localStorage`).

### Tech stack

| | |
|---|---|
| **UI** | [Svelte 5](https://svelte.dev/) (runes) + TypeScript |
| **Rendering** | [Pixi.js 8](https://pixijs.com/) drawing the cell grid |
| **Tooling** | [Vite](https://vite.dev/) as bundler and dev server |

No runtime dependencies beyond Pixi — the simulation is all first-party code.

### Getting started

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

### How to play

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

### Materials

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

### Project structure

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

### How the simulation works

The core is [src/sim/grid.ts](src/sim/grid.ts): the grid stores `material` and
`meta` (one byte per cell) in flat `Uint8Array`s, and `step()` walks the grid
bottom-to-top each frame applying movement (powders, liquids, gases), fire, acid,
electricity (pulses), explosions (blast waves), Conway's Game of Life (the "Vida"
material) and the ambient-temperature effects.

---

## Português

Pinte areia, água, fogo, lava, ácido, pólvora, plantas e dezenas de outros
materiais numa grade e veja tudo interagir. Líquidos buscam o próprio nível, pós
formam pilhas, o fogo se espalha, explosivos detonam em cadeia, sementes germinam
e uma **temperatura ambiente** global muda conforme o que você coloca no cenário
— comandando combustão espontânea, congelamento, fervura e o crescimento das
plantas.

> Toda a interface e os nomes dos materiais estão em português.

### Recursos

- **~25 materiais** em 8 categorias temáticas, cada um com física própria.
- **Simulação falling-sand** feita do zero — um autômato celular com movimento
  por densidade, propagação de fogo e ácido, e otimização de dormir/acordar.
- **Eletricidade** que percorre condutores em forma de pulsos.
- **Explosões** com ondas de choque, estilhaços e reações em cadeia (Pólvora, C4, gás).
- **Jogo da Vida de Conway** como um material próprio ("Vida").
- **Temperatura global** com 8 faixas — aqueça a grade até a faixa *Próspero* e
  as plantas florescem.
- **Salvar / carregar / exportar / importar** cenários como arquivos `.pnp.json`
  (via `localStorage`).

### Stack

| | |
|---|---|
| **UI** | [Svelte 5](https://svelte.dev/) (runes) + TypeScript |
| **Renderização** | [Pixi.js 8](https://pixijs.com/) desenhando a grade de células |
| **Ferramentas** | [Vite](https://vite.dev/) como bundler e dev server |

Sem dependências de runtime além do Pixi — a simulação é toda código próprio.

### Como rodar

Requer Node.js (recomendado 20+).

```bash
npm install
npm run dev       # dev server com HMR em http://localhost:5173
```

Outros scripts:

```bash
npm run build     # build de produção em dist/
npm run preview   # serve o build de produção localmente
npm run check     # type-check do Svelte + TypeScript
```

### Como jogar

- **Escolha um material** na barra inferior (organizada por categorias).
- **Desenhe na tela** com o mouse ou toque. As formas de pincel são Ponto, Linha,
  Área (quadrado) e Área (círculo), com tamanho ajustável.
- **Borracha** apaga células; **Limpar tudo** zera a grade inteira.
- **Mapas** abre a janela de salvar/carregar: guarde o cenário atual com um nome
  (fica salvo no navegador), recarregue mapas salvos, exporte qualquer um como
  arquivo `.pnp.json` e importe arquivos de volta para compartilhar cenários
  entre navegadores.
- O painel mostra a contagem de células ativas e a **temperatura ambiente**, que
  sobe com Fogo/Lava/Calor e desce com Gelo/Frio, afetando combustão espontânea,
  congelamento, fervura e o crescimento das plantas.
- O botão **Dicas** abre uma janela com a descrição e as interações de cada material.

### Materiais

| Categoria | Materiais |
|---|---|
| Partículas | Areia · Pedra · Terra · Barro · Sal |
| Sólidos | Madeira · Metal · Vidro |
| Líquidos | Água · Óleo · Ácido |
| Vida | Planta · Semente · Vida |
| Calor | Fogo · Lava · Calor |
| Frio | Gelo · Frio |
| Explosivos | Pólvora · C4 · Gás |
| Especiais | Eletricidade · Clone |

Alguns materiais só aparecem como reação: **Broto** e **Flor** (de sementes que
germinam), **Vapor** (água fervida) e **Vapor de Ácido** (ácido fervido).

### Estrutura do projeto

```
src/
  main.ts              ponto de entrada, monta o App
  App.svelte           layout: canvas + painel inferior + modais
  components/
    Canvas.svelte      cria a grade, roda o loop de simulação, trata o pincel
    BottomPanel.svelte seletor de material, pincel, stats, botões
    HintsModal.svelte  janela de ajuda com descrições dos materiais
    MapsModal.svelte   janela de salvar / carregar / exportar / importar mapas
    Icon.svelte        ícones SVG
  render/
    PixiStage.ts       desenha a grade (e overlays de faíscas/explosão) no Pixi
  sim/
    grid.ts            o coração: autômato celular, física, reações, temperatura
    materials.ts       definição de cada material e agrupamento da paleta
    materialInfo.ts    textos de descrição/interação para o modal de dicas
    temperature.ts     faixas de temperatura compartilhadas entre sim e UI
    storage.ts         serialização (RLE) e persistência de mapas no localStorage
    types.ts           MaterialId, categorias, buffers da simulação
```

### Como a simulação funciona

O núcleo é [src/sim/grid.ts](src/sim/grid.ts): a grade guarda `material` e `meta`
(um byte por célula) em `Uint8Array` planos, e `step()` percorre a grade de baixo
para cima a cada frame aplicando movimento (pós, líquidos, gases), fogo, ácido,
eletricidade (pulsos), explosões (ondas de choque), o Jogo da Vida de Conway (o
material "Vida") e os efeitos de temperatura ambiente.
