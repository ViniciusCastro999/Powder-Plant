<div align="center">

# 🌱 Powder & Plant

**Um simulador de partículas do tipo falling-sand que roda no navegador.**

[![Powder & Plant screenshot](docs/screenshot.png)](https://viniciuscastro999.github.io/Powder-Plant/)

[![Jogar no navegador](https://img.shields.io/badge/%E2%96%B6%20Jogar%20no%20navegador-2ea44f?style=for-the-badge)](https://viniciuscastro999.github.io/Powder-Plant/)

<br>

![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Pixi.js](https://img.shields.io/badge/Pixi.js-8-E91E63?logo=pixijs&logoColor=white)

<br>

[![English](https://img.shields.io/badge/lang-English-6e7781?style=for-the-badge)](README.md)
[![Português](https://img.shields.io/badge/lang-Portugu%C3%AAs-2ea44f?style=for-the-badge)](README.pt-BR.md)
[![日本語](https://img.shields.io/badge/lang-%E6%97%A5%E6%9C%AC%E8%AA%9E-6e7781?style=for-the-badge)](README.ja.md)

</div>

---

Pinte areia, água, fogo, lava, ácido, pólvora, plantas e dezenas de outros
materiais numa grade e veja tudo interagir. Líquidos buscam o próprio nível, pós
formam pilhas, o fogo se espalha, explosivos detonam em cadeia, sementes germinam
e uma **temperatura ambiente** global muda conforme o que você coloca no cenário,
comandando combustão espontânea, congelamento, fervura e o crescimento das
plantas.

> A interface está disponível em inglês, português e japonês (seletor no canto inferior esquerdo).

## Recursos

- **~35 materiais** em 10 categorias temáticas, cada um com física própria.
- **Simulação falling-sand** feita do zero: um autômato celular com movimento
  por densidade, propagação de fogo e ácido, e otimização de dormir/acordar.
- **Eletricidade** que percorre condutores em forma de pulsos.
- **Explosões baseadas em impulso**: a detonação varre toda a carga conectada num
  estouro rápido e então arremessa a areia, a água e os destroços ao redor como
  projéteis sob gravidade, que voam em arco, se espalham e assentam de volta,
  cavando uma cratera de verdade com borda (Pólvora, C4, gás).
- **Criaturas** com comportamento próprio e uma pequena cadeia alimentar:
  **Formigas** andam pelas superfícies, seguem o cheiro de comida, roem madeira e
  escavam; **Pássaros** planam e então dão **botes** para caçar formigas e peixes
  na superfície, além de espalhar sementes; **Peixes** formam cardumes e mergulham
  fundo fugindo do pássaro. Comem, se reproduzem e diminuem quando falta comida.
- **Pip**: figurinhas em pé, não pontos, cada uma com um ofício e indo direto pro
  serviço mais próximo em vez de ficar andando à toa. O **Pedreiro** extrai terra
  de uma encosta, aplaina o chão e então levanta uma casa inteira de uma vez.
  Seis formas e tamanhos, com telhados de duas águas, tacaniço, de uma água ou
  ameado, janelas acesas e chaminé (tijolo, madeira ou gelo, conforme o que há
  por perto). Ele faz manutenção quando um Saqueador ou explosão abre um buraco;
  o povo se abriga dentro, até a lotação de cada casa, quando o clima fica
  hostil. O **Bombeiro** busca água e apaga o fogo. O **Fazendeiro** aplaina um
  sulco e semeia **trigo**, o sustento da vila, pro qual todo Pip com fome vai. O
  **Saqueador** incendeia, quebra tudo e caça o resto. Solte um Saqueador e veja
  os outros três responderem.
- **Pintar Pip** solta uma figura por clique, seja qual for o tamanho do pincel,
  então uma multidão é algo que você posiciona de propósito, não que inunda o mapa.
- **Magia**: uma centelha que vagueia transmutando o entorno rumo à vida e à
  ordem. Apaga o fogo, desgasta pedra em terra, verdeja terra, desarma explosivos.
- **Jogo da Vida de Conway** como um material próprio ("Vida").
- **Temperatura global** com 8 faixas. Aqueça a grade até a faixa *Próspero* e
  as plantas florescem.
- **Salvar / carregar / exportar / importar** cenários como arquivos `.pnp.json`
  (via `localStorage`).

## Stack

| | |
|---|---|
| **UI** | [Svelte 5](https://svelte.dev/) (runes) + TypeScript |
| **Renderização** | [Pixi.js 8](https://pixijs.com/) desenhando a grade de células |
| **Ferramentas** | [Vite](https://vite.dev/) como bundler e dev server |

Sem dependências de runtime além do Pixi. A simulação é toda código próprio.

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

## Como jogar

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
- O **seletor de idioma** (canto inferior esquerdo, ao lado da temperatura) troca a
  interface entre inglês, português e japonês. A escolha fica salva no navegador e,
  na primeira visita, usa o idioma do navegador.

## Materiais

| Categoria | Materiais |
|---|---|
| Partículas | Areia · Pedra · Terra · Barro · Sal |
| Sólidos | Madeira · Metal · Vidro · Tijolo |
| Líquidos | Água · Óleo · Ácido |
| Vida | Planta · Semente · Trigo · Vida |
| Calor | Fogo · Lava · Calor |
| Frio | Gelo · Frio |
| Explosivos | Pólvora · C4 · Gás |
| Criaturas | Formiga · Pássaro · Peixe |
| Pip | Pedreiro · Bombeiro · Fazendeiro · Saqueador |
| Especiais | Eletricidade · Clone · Magia |

Alguns materiais só aparecem como reação: **Broto** e **Flor** (de sementes que
germinam), **Vapor** (água fervida) e **Vapor de Ácido** (ácido fervido).

## Estrutura do projeto

```
src/
  main.ts              ponto de entrada, monta o App
  App.svelte           layout: canvas + painel inferior + modais
  components/
    Canvas.svelte      cria a grade, roda o loop de simulação, trata o pincel
    BottomPanel.svelte seletor de material, pincel, stats, troca de idioma
    HintsModal.svelte  janela de ajuda com descrições dos materiais
    MapsModal.svelte   janela de salvar / carregar / exportar / importar mapas
    Icon.svelte        ícones SVG
  render/
    PixiStage.ts       desenha a grade (e overlays de faíscas/explosão) no Pixi
  sim/
    grid.ts            o coração: autômato celular, física, reações, temperatura
    materials.ts       definição de cada material e agrupamento da paleta
    temperature.ts     faixas de temperatura compartilhadas entre sim e UI
    storage.ts         serialização (RLE) e persistência de mapas no localStorage
    types.ts           MaterialId, categorias, buffers da simulação
  i18n/                traduções da interface (inglês / português / japonês)
    locale.svelte.ts   o idioma ativo, salvo no localStorage
    ui.ts              textos fixos da interface
    materials.ts       nomes dos materiais + rótulos das categorias por idioma
    materialInfo.ts    descrições e interações das dicas por idioma
```

## Como a simulação funciona

O núcleo é [src/sim/grid.ts](src/sim/grid.ts): a grade guarda `material` e `meta`
(um byte por célula) em `Uint8Array` planos, e `step()` percorre a grade de baixo
para cima a cada frame aplicando movimento (pós, líquidos, gases), fogo, ácido,
eletricidade (pulsos), explosões (impulso + destroços voadores), comportamento das criaturas
(formigas, pássaros, peixes; e os Pip: pedreiro, bombeiro, fazendeiro, saqueador), transmutação da magia, o Jogo da Vida
de Conway (o material "Vida") e os efeitos de temperatura ambiente.
