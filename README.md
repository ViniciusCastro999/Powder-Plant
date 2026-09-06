# Powder & Plant

Um simulador de partículas do tipo *falling sand* rodando no navegador. Pinte
areia, água, fogo, lava, ácido, pólvora, plantas e dezenas de outros materiais
numa grade e veja tudo interagir: líquidos buscam o próprio nível, pós formam
pilhas, o fogo se espalha, explosivos detonam em cadeia, sementes germinam e o
clima global (temperatura) muda conforme o que você coloca no cenário.

Toda a interface e os textos do jogo estão em português.

## Stack

- **[Svelte 5](https://svelte.dev/)** (runes) + **TypeScript** para a UI
- **[Pixi.js 8](https://pixijs.com/)** para renderizar a grade de células
- **[Vite](https://vite.dev/)** como bundler e dev server
- Sem dependências de runtime além do Pixi; a simulação é código próprio

## Como rodar

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

## Como usar

- **Escolha um material** na barra inferior (organizada por categorias:
  Partículas, Sólidos, Líquidos, Vida, Calor, Frio, Explosivos, Especiais).
- **Desenhe na tela** com o mouse/toque. As formas de pincel disponíveis são
  Ponto, Linha, Área (quadrado) e Área (círculo), com tamanho ajustável.
- **Borracha** para apagar, **Limpar tudo** para zerar a grade.
- **Mapas** abre a janela de salvar/carregar: guarde o cenário atual com um nome
  (fica salvo no navegador, via `localStorage`), recarregue mapas salvos,
  exporte qualquer um como arquivo `.pnp.json` e importe arquivos de volta para
  compartilhar cenários entre navegadores.
- O painel mostra a contagem de células ativas e a **temperatura ambiente**, que
  sobe com Fogo/Lava/Calor e desce com Gelo/Frio, afetando combustão espontânea,
  congelamento, fervura e o crescimento das plantas.
- O botão de **dicas** abre uma janela com a descrição e as interações de cada
  material.

## Estrutura do projeto

```
src/
  main.ts              ponto de entrada, monta o App
  App.svelte           layout: canvas + painel inferior + modal de dicas
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

O núcleo da simulação é [src/sim/grid.ts](src/sim/grid.ts): a grade guarda
`material` e `meta` (um byte por célula) em `Uint8Array` planos, e `step()`
percorre a grade de baixo para cima a cada frame aplicando movimento (pós,
líquidos, gases), fogo, ácido, eletricidade (pulsos), explosões (ondas de
choque), o Jogo da Vida de Conway (material "Vida") e os efeitos de temperatura
ambiente.
# Powder-Plant
