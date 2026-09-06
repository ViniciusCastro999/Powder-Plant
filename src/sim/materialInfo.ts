import { MaterialId } from "./types";

export interface MaterialInfo {
  description: string;
  interactions: string[];
}

/** Player-facing description + interaction notes for the hints popup — kept short and general, not simulation internals. */
export const MATERIAL_INFO: Partial<Record<MaterialId, MaterialInfo>> = {
  [MaterialId.Sand]: {
    description: "Cai e forma pilhas, como areia de verdade.",
    interactions: ["Afunda na Água e no Ácido — mais devagar que a Pedra.", "Derrete na Lava."],
  },
  [MaterialId.Water]: {
    description: "Líquido que flui e busca o próprio nível.",
    interactions: [
      "Apaga o Fogo e transforma a Lava em Pedra.",
      "Conduz Eletricidade (Água Salgada conduz bem melhor).",
      "Vira Água Salgada perto de Sal.",
      "Enferruja o Metal aos poucos (mais rápido se estiver salgada).",
      "Absorvida pela Terra, virando Barro.",
      "Ajuda plantas e sementes a crescerem.",
      "Congela perto de Gelo, ou sozinha quando o clima esfria bastante (só se não estiver salgada).",
      "Ferve lentamente a partir de 100°C, virando Vapor que sobe — volta a ser Água quando o clima esfriar de novo.",
    ],
  },
  [MaterialId.Stone]: {
    description: "Como a Areia, só que bem mais pesada e resistente.",
    interactions: ["Afunda rápido em líquidos.", "Quase imune a Ácido.", "Derrete na Lava, mas bem devagar."],
  },
  [MaterialId.Wood]: {
    description: "Sólido parado no lugar.",
    interactions: ["Pega fogo e queima por bastante tempo."],
  },
  [MaterialId.Fire]: {
    description: "Chama que sobe e vai se apagando aos poucos.",
    interactions: ["Incendeia coisas inflamáveis por perto.", "Apaga na Água.", "Pode causar explosões na Pólvora."],
  },
  [MaterialId.Plant]: {
    description: "Planta que cresce em blocos, se espalhando perto da Água.",
    interactions: [
      "Pega fogo sozinha se o clima esquentar demais.",
      "Cresce mais rápido e às vezes floresce na temperatura ideal para a vida.",
      "Na temperatura ideal, floresce sozinha de vez em quando, mesmo sem Água por perto.",
      "Congela por fora, ganhando uma camada de Gelo, se o clima esfriar demais.",
    ],
  },
  [MaterialId.Dirt]: {
    description: "Solo seco.",
    interactions: ["Vira Barro perto de Água.", "Sementes germinam nela em brotinhos secos."],
  },
  [MaterialId.Mud]: {
    description: "Solo já molhado — o melhor lugar para plantar.",
    interactions: ["Sementes germinam nela em pequenos galhos com flores."],
  },
  [MaterialId.Seed]: {
    description: "Cai até encontrar solo para germinar.",
    interactions: [
      "Em Terra seca vira um brotinho pequeno.",
      "Em Barro vira um galho com flores.",
      "Mesmo germinando fora do clima ideal, continua crescendo aos poucos se depois o clima ficar próspero.",
      "Se encostar em Planta, Broto, Madeira ou Flor, é absorvida em vez de se acumular.",
    ],
  },
  [MaterialId.Electricity]: {
    description: "Um raio que cai e se espalha como um enxame, dissipando no ar aos poucos.",
    interactions: [
      "Ao tocar um condutor (Metal, Água) passa a viajar por dentro dele.",
      "Água Salgada conduz melhor que Água comum.",
      "Incendeia o que for inflamável, inclusive Óleo e Pólvora.",
    ],
  },
  [MaterialId.Metal]: {
    description: "Sólido, ótimo condutor de Eletricidade.",
    interactions: ["Enferruja aos poucos perto de Água (mais rápido com Água Salgada).", "Resistente a Ácido.", "Derrete rápido na Lava."],
  },
  [MaterialId.Acid]: {
    description: "Líquido corrosivo que se consome enquanto corrói.",
    interactions: [
      "Dissolve o que tocar; materiais resistentes (Pedra, Metal) aguentam mais.",
      "Ferve lentamente a partir de 83°C (antes da Água) virando Vapor de Ácido — chove de volta como Ácido fresco quando o clima esfriar.",
    ],
  },
  [MaterialId.Gunpowder]: {
    description: "Pó explosivo instável.",
    interactions: [
      "Pega fogo fácil e explode em estilhaços que voam e empurram tudo que estiver por perto (Areia, Água, etc.), mas não muito longe.",
      "Detona outras Pólvoras ou C4 por perto em cadeia, um pouco depois da explosão inicial — um monte grande delas explode em ondas, não tudo de uma vez.",
    ],
  },
  [MaterialId.C4]: {
    description: "Mesmo explosivo da Pólvora, só que em bloco sólido e parado no lugar.",
    interactions: [
      "Pega fogo fácil e explode exatamente como a Pólvora, com os mesmos estilhaços.",
      "Detona junto com Pólvora ou outro C4 por perto em cadeia — não importa qual dos dois acendeu primeiro.",
      "Não cai nem se move: fica exatamente onde foi colocado até explodir.",
    ],
  },
  [MaterialId.CombustibleGas]: {
    description: "Gás inflamável que sobe e se espalha pelo ar.",
    interactions: [
      "Pega fogo com muita facilidade e explode, igual Pólvora e C4.",
      "Pega fogo sozinho se o clima esquentar (bem mais sensível a calor que qualquer outro inflamável).",
      "Sobe e se dispersa em vez de cair — some rápido se não for aceso.",
    ],
  },
  [MaterialId.Oil]: {
    description: "Líquido inflamável, mais leve que a Água.",
    interactions: ["Pega fogo fácil e queima por muito tempo."],
  },
  [MaterialId.Salt]: {
    description: "Se dissolve ao encostar na Água, deixando-a salgada.",
    interactions: ["Afunda devagar na Água.", "Água Salgada conduz mais eletricidade e enferruja metal mais rápido."],
  },
  [MaterialId.Lava]: {
    description: "Rocha derretida, densa e muito quente.",
    interactions: [
      "Derrete Metal, Areia e Pedra, transformando-os em mais Lava (Metal derrete mais rápido, Pedra mais devagar).",
      "Incendeia e explode tudo que o Fogo também incendeia e explode.",
      "Vira Pedra instantaneamente ao encostar na Água.",
    ],
  },
  [MaterialId.Vida]: {
    description: "Um organismo celular que nasce, sobrevive e morre seguindo as regras do Jogo da Vida de Conway.",
    interactions: [
      "Uma célula viva com 2 ou 3 vizinhas vivas sobrevive; fora isso, morre. Um espaço vazio com exatamente 3 vizinhas vivas nasce.",
      "Devora Semente, Flor, Broto, Planta e Madeira ao redor, virando mais Vida — cada material é devorado numa velocidade diferente (Semente é rápida, Madeira é bem lenta). Ao comer, ela se duplica.",
    ],
  },
  [MaterialId.Ice]: {
    description: "Sólido gelado, parado no lugar.",
    interactions: [
      "Congela Água doce encostada, transformando-a em mais Gelo (Água Salgada não congela).",
      "Derrete de volta em Água perto do Fogo ou da Lava, ou sozinho se o clima esquentar demais.",
    ],
  },
  [MaterialId.Glass]: {
    description: "Sólido frágil, mas totalmente imune a Ácido.",
    interactions: [
      "Estilhaços de explosão e Eletricidade o quebram em Areia ao tocar.",
      "Imune a Ácido — o ácido nem gasta carga tentando corroê-lo.",
    ],
  },
  [MaterialId.Clone]: {
    description: "Bloco parado que copia o primeiro material que encostar nele.",
    interactions: [
      "Ao ser tocado por qualquer material, passa a gerar esse mesmo material sem parar, para sempre — inclusive Eletricidade.",
      "Uma vez travado em um material, nunca muda, mesmo que o original que o tocou desapareça.",
      "Um bloco de Clone ainda destravado, encostado em outro Clone já travado, aos poucos copia o mesmo material — só se espalha por blocos de Clone conectados entre si.",
      "Imune a Ácido.",
    ],
  },
  [MaterialId.HeatBlock]: {
    description: "Bloco sólido e imóvel que esquenta o ambiente, sem nunca sofrer nenhuma alteração.",
    interactions: [
      "Esquenta o clima como Fogo e Lava, mas não pega fogo, não derrete e não incendeia nada ao redor.",
      "Imune a tudo — Ácido, Eletricidade, estilhaços — feito só para controlar a temperatura.",
    ],
  },
  [MaterialId.ColdBlock]: {
    description: "Bloco sólido e imóvel que esfria o ambiente, sem nunca sofrer nenhuma alteração.",
    interactions: [
      "Esfria o clima como o Gelo, mas não derrete e não congela nada ao redor.",
      "Imune a tudo — Ácido, Eletricidade, estilhaços — feito só para controlar a temperatura.",
    ],
  },
};
