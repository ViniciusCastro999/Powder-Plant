import { MaterialId } from "../sim/types";
import type { Locale } from "./locale.svelte";

export interface MaterialInfo {
  description: string;
  interactions: string[];
}

type InfoMap = Partial<Record<MaterialId, MaterialInfo>>;

/**
 * Player-facing description + interaction notes for the hints popup, kept
 * short and general, not simulation internals. One map per language.
 */
const EN: InfoMap = {
  [MaterialId.Sand]: {
    description: "Falls and piles up.",
    interactions: ["Sinks in water. Melts in lava."],
  },
  [MaterialId.Water]: {
    description: "Flows and seeks its own level.",
    interactions: ["Freezes, boils, and conducts electricity."],
  },
  [MaterialId.Stone]: {
    description: "Heavier, tougher sand.",
    interactions: ["Barely reacts to anything."],
  },
  [MaterialId.Wood]: {
    description: "A solid that stays put.",
    interactions: ["Burns for a long time."],
  },
  [MaterialId.Fire]: {
    description: "Rises, spreads, and burns out.",
    interactions: ["Water puts it out."],
  },
  [MaterialId.Plant]: {
    description: "Grows in blocks, spreads near water.",
    interactions: ["Reacts to the climate."],
  },
  [MaterialId.Dirt]: {
    description: "Dry soil.",
    interactions: ["Wets into Mud. Good for seeds."],
  },
  [MaterialId.Mud]: {
    description: "Wet soil, the best place to plant.",
    interactions: ["Seeds sprout faster here."],
  },
  [MaterialId.Seed]: {
    description: "Falls until it finds soil.",
    interactions: ["Becomes a sprout, or a flowering branch."],
  },
  [MaterialId.Electricity]: {
    description: "A bolt that spreads and fades.",
    interactions: ["Travels through conductors."],
  },
  [MaterialId.Metal]: {
    description: "A strong conductor.",
    interactions: ["Rusts slowly. Melts fast in lava."],
  },
  [MaterialId.Acid]: {
    description: "Dissolves almost anything it touches.",
    interactions: ["Gets used up as it eats through things."],
  },
  [MaterialId.Gunpowder]: {
    description: "An unstable explosive powder.",
    interactions: ["Catches fire easily. Chains into nearby charges."],
  },
  [MaterialId.C4]: {
    description: "Explosive, but stays exactly where it's placed.",
    interactions: ["Chains with nearby Gunpowder and C4."],
  },
  [MaterialId.CombustibleGas]: {
    description: "A flammable gas that rises and spreads.",
    interactions: ["Extremely easy to set off."],
  },
  [MaterialId.Oil]: {
    description: "A flammable liquid, lighter than water.",
    interactions: ["Burns for a very long time."],
  },
  [MaterialId.Salt]: {
    description: "Dissolves in water.",
    interactions: ["Salt water conducts and rusts differently."],
  },
  [MaterialId.Lava]: {
    description: "Molten rock, dense and very hot.",
    interactions: ["Melts things. Turns to stone in water."],
  },
  [MaterialId.Vida]: {
    description: "A living cell, born and dying by its own rules.",
    interactions: ["Spreads by devouring nearby plants and wood."],
  },
  [MaterialId.Ice]: {
    description: "A frozen solid that stays put.",
    interactions: ["Freezes fresh water. Melts near heat."],
  },
  [MaterialId.Glass]: {
    description: "Fragile, but immune to Acid.",
    interactions: ["Shatters after a few hits."],
  },
  [MaterialId.Brick]: {
    description: "A sturdy building block.",
    interactions: ["Fireproof and acid-resistant."],
  },
  [MaterialId.Wheat]: {
    description: "The Farmer's crop.",
    interactions: ["Ripens from green to gold."],
  },
  [MaterialId.Clone]: {
    description: "Copies the first material to touch it.",
    interactions: ["Then makes more of it, forever."],
  },
  [MaterialId.HeatBlock]: {
    description: "Warms its surroundings.",
    interactions: ["Never changes itself."],
  },
  [MaterialId.ColdBlock]: {
    description: "Cools its surroundings.",
    interactions: ["Never changes itself."],
  },
  [MaterialId.Ant]: {
    description: "A tiny walker that follows surfaces.",
    interactions: ["Eats plants. Watch out for birds."],
  },
  [MaterialId.Bird]: {
    description: "Soars lazily, then swoops on prey.",
    interactions: ["Hunts ants and fish."],
  },
  [MaterialId.Fish]: {
    description: "Swims only in water.",
    interactions: ["Something above hunts it too."],
  },
  [MaterialId.Magic]: {
    description: "A drifting mote of enchantment.",
    interactions: ["Transforms whatever it touches."],
  },
  [MaterialId.Mason]: {
    description: "One of the folk. The Builder.",
    interactions: ["Raises houses, and bridges rivers with timber."],
  },
  [MaterialId.Lumberjack]: {
    description: "One of the folk. A forester.",
    interactions: ["Grows and fells trees for timber."],
  },
  [MaterialId.Farmer]: {
    description: "One of the folk. Turns bare ground into cropland.",
    interactions: ["Grows and harvests Wheat."],
  },
  [MaterialId.Warrior]: {
    description: "One of the folk. The village guard.",
    interactions: ["Fights off anything undead."],
  },
  [MaterialId.Skeleton]: {
    description: "A shambling undead.",
    interactions: ["Hunts the folk."],
  },
  [MaterialId.Lever]: {
    description: "A switch.",
    interactions: ["Right-click to flip it on or off."],
  },
  [MaterialId.Wire]: {
    description: "Carries power.",
    interactions: ["From a Lever to a Gate."],
  },
  [MaterialId.GateGeneral]: {
    description: "Open until powered — then blocks Powder, Liquid AND Folk/Wildlife at once.",
    interactions: ["Also blocks the wind itself while active."],
  },
  [MaterialId.GateCreature]: {
    description: "Open until powered — then blocks only Folk and Wildlife.",
    interactions: ["Lets Powder and Liquid through either way.", "Also blocks the wind itself while active."],
  },
  [MaterialId.GateLiquid]: {
    description: "Open until powered — then blocks only Liquid.",
    interactions: ["Lets Powder and Folk/Wildlife through either way.", "Also blocks the wind itself while active."],
  },
  [MaterialId.GatePowder]: {
    description: "Open until powered — then blocks only Powder.",
    interactions: ["Lets Liquid and Folk/Wildlife through either way.", "Also blocks the wind itself while active."],
  },
  [MaterialId.LightningRod]: {
    description: "Pulls in stray electricity.",
    interactions: ["Grounds it safely before it can start a fire."],
  },
  [MaterialId.Fan]: {
    description: "Blows a steady draft.",
    interactions: ["Right-click to flip which way it faces."],
  },
  [MaterialId.DefenseTower]: {
    description: "Shoots anything undead in range.",
    interactions: ["Only works while powered."],
  },
  [MaterialId.Drain]: {
    description: "Sucks in touching Liquid.",
    interactions: [
      "With no Pipe connected, the liquid just vanishes.",
      "Connected to a Pipe, it flows out an open Faucet, or fills up the Pipe as storage until one opens.",
    ],
  },
  [MaterialId.Pipe]: {
    description: "A conduit for a connected Drain's liquid.",
    interactions: ["Fills up and stores liquid when no open Faucet is reachable."],
  },
  [MaterialId.Torneira]: {
    description: "The outlet of a Pipe network.",
    interactions: [
      "Releases liquid, freshly arriving or already stored in the Pipe, while powered.",
      "Several open Faucets on one network split the flow between them evenly.",
    ],
  },
  [MaterialId.Virus]: {
    description: "A slow, stationary infection.",
    interactions: [
      "Quickly claims a touching Wood/Plant/Sprout/Flower/Wheat/Seed, or a touching animal/Pip (Skeleton is immune), turning it into more Virus.",
      "Can also claim anything else it touches — Solids, Liquids, Gases, Wire, Pipe, Faucet, Gates, all of it — just at a crawl. Glass is the one true exception, immune outright.",
      "Fire/Lava sterilizes it on contact. Magic purifies it outright.",
      "Fades away on its own if it goes too long without a fresh host.",
      "Right-click the tile to pick its rival, Pink Virus, for the right mouse button — the two convert each other on contact, fast, wherever they meet.",
    ],
  },
  [MaterialId.VirusPink]: {
    description: "A rival strain of Virus.",
    interactions: [
      "Identical to Virus in every way, except it fights the purple strain: the two convert each other, fast, wherever they touch.",
      "Only reachable by right-clicking the Virus tile — it has no palette tile of its own.",
    ],
  },
  [MaterialId.Fungus]: {
    description: "A mycelium network that spreads through several materials.",
    interactions: [
      "Spreads slowly into any touching Wood, Plant, Brick, Sand, Dirt, Mud, Stone or Gunpowder — each infection keeps that material's own color and texture instead of one flat look.",
      "Immune to Virus outright; the two don't compete.",
      "Flammable, like any organic matter — Fire burns through it.",
      "Occasionally sprouts a Spore Puff on open ground right above it. Never decays on its own.",
    ],
  },
  [MaterialId.Spore]: {
    description: "A drifting cloud of spores, a real gas.",
    interactions: [
      "Painted just like Fire or Gas — fills the open air the brush passes over immediately, no solid core underneath, just the cloud itself.",
      "Carried by a Fan's draft, same as Steam.",
      "Settles against one of Fungus's eight hosts (Wood, Plant, Brick, Sand, Dirt, Mud, Stone, Gunpowder), or against a Virus cell, with a chance to claim it as a fresh Fungus cell — a Virus cell claimed this way stops reproducing for good.",
      "Killed outright by touching Fire or Lava, same as they sterilize Virus.",
      "Drifts and thins out on its own over time.",
      "A Fungus patch also puffs this out on its own every so often.",
    ],
  },
};

const PT: InfoMap = {
  [MaterialId.Sand]: {
    description: "Cai e forma pilhas.",
    interactions: ["Afunda na água. Derrete na lava."],
  },
  [MaterialId.Water]: {
    description: "Flui e busca o próprio nível.",
    interactions: ["Congela, ferve e conduz eletricidade."],
  },
  [MaterialId.Stone]: {
    description: "Uma areia mais pesada e resistente.",
    interactions: ["Quase não reage a nada."],
  },
  [MaterialId.Wood]: {
    description: "Sólido parado no lugar.",
    interactions: ["Queima por bastante tempo."],
  },
  [MaterialId.Fire]: {
    description: "Sobe, se espalha e se apaga.",
    interactions: ["A água apaga."],
  },
  [MaterialId.Plant]: {
    description: "Cresce em blocos, se espalha perto da água.",
    interactions: ["Reage ao clima."],
  },
  [MaterialId.Dirt]: {
    description: "Solo seco.",
    interactions: ["Vira Barro na água. Boa para sementes."],
  },
  [MaterialId.Mud]: {
    description: "Solo molhado, o melhor lugar para plantar.",
    interactions: ["Sementes germinam mais rápido aqui."],
  },
  [MaterialId.Seed]: {
    description: "Cai até encontrar solo.",
    interactions: ["Vira um broto, ou um galho com flores."],
  },
  [MaterialId.Electricity]: {
    description: "Um raio que se espalha e some.",
    interactions: ["Viaja por condutores."],
  },
  [MaterialId.Metal]: {
    description: "Um ótimo condutor.",
    interactions: ["Enferruja devagar. Derrete rápido na lava."],
  },
  [MaterialId.Acid]: {
    description: "Dissolve quase tudo que toca.",
    interactions: ["Se consome enquanto corrói."],
  },
  [MaterialId.Gunpowder]: {
    description: "Pó explosivo instável.",
    interactions: ["Pega fogo fácil. Detona em cadeia."],
  },
  [MaterialId.C4]: {
    description: "Explosivo, mas fica parado no lugar.",
    interactions: ["Detona em cadeia com Pólvora e C4 perto."],
  },
  [MaterialId.CombustibleGas]: {
    description: "Gás inflamável que sobe e se espalha.",
    interactions: ["Explode com muita facilidade."],
  },
  [MaterialId.Oil]: {
    description: "Líquido inflamável, mais leve que a água.",
    interactions: ["Queima por muito tempo."],
  },
  [MaterialId.Salt]: {
    description: "Se dissolve na água.",
    interactions: ["Água salgada conduz e enferruja diferente."],
  },
  [MaterialId.Lava]: {
    description: "Rocha derretida, densa e muito quente.",
    interactions: ["Derrete coisas. Vira pedra na água."],
  },
  [MaterialId.Vida]: {
    description: "Uma célula viva, que nasce e morre por regras próprias.",
    interactions: ["Se espalha devorando plantas e madeira perto."],
  },
  [MaterialId.Ice]: {
    description: "Sólido gelado, parado no lugar.",
    interactions: ["Congela água doce. Derrete perto de calor."],
  },
  [MaterialId.Glass]: {
    description: "Frágil, mas imune a ácido.",
    interactions: ["Estilhaça depois de alguns golpes."],
  },
  [MaterialId.Brick]: {
    description: "Um bloco de parede resistente.",
    interactions: ["À prova de fogo e ácido."],
  },
  [MaterialId.Wheat]: {
    description: "A plantação do Fazendeiro.",
    interactions: ["Amadurece de verde a dourado."],
  },
  [MaterialId.Clone]: {
    description: "Copia o primeiro material que encostar nele.",
    interactions: ["Depois gera mais dele, para sempre."],
  },
  [MaterialId.HeatBlock]: {
    description: "Esquenta o ambiente.",
    interactions: ["Nunca muda de si mesmo."],
  },
  [MaterialId.ColdBlock]: {
    description: "Esfria o ambiente.",
    interactions: ["Nunca muda de si mesmo."],
  },
  [MaterialId.Ant]: {
    description: "Uma andarilha minúscula que segue superfícies.",
    interactions: ["Come plantas. Cuidado com os pássaros."],
  },
  [MaterialId.Bird]: {
    description: "Plana no céu, depois dá um bote na presa.",
    interactions: ["Caça formigas e peixes."],
  },
  [MaterialId.Fish]: {
    description: "Só nada dentro da água.",
    interactions: ["Algo lá em cima também caça."],
  },
  [MaterialId.Magic]: {
    description: "Uma centelha de encantamento à deriva.",
    interactions: ["Transforma o que tocar."],
  },
  [MaterialId.Mason]: {
    description: "Do povo. O Construtor.",
    interactions: ["Ergue casas e faz pontes de madeira."],
  },
  [MaterialId.Lumberjack]: {
    description: "Do povo. Um silvicultor.",
    interactions: ["Planta e derruba árvores por madeira."],
  },
  [MaterialId.Farmer]: {
    description: "Do povo. Transforma terreno estéril em lavoura.",
    interactions: ["Planta e colhe Trigo."],
  },
  [MaterialId.Warrior]: {
    description: "Do povo. A guarda da vila.",
    interactions: ["Enfrenta qualquer morto-vivo."],
  },
  [MaterialId.Skeleton]: {
    description: "Um morto-vivo cambaleante.",
    interactions: ["Caça o povo."],
  },
  [MaterialId.Lever]: {
    description: "Um interruptor.",
    interactions: ["Clique com o botão direito para ligar ou desligar."],
  },
  [MaterialId.Wire]: {
    description: "Leva energia.",
    interactions: ["De uma Alavanca até um Portão."],
  },
  [MaterialId.GateGeneral]: {
    description: "Aberto até ser energizado — aí bloqueia Pó, Líquido E Povo/Fauna de uma vez.",
    interactions: ["Também bloqueia o próprio vento enquanto ativado."],
  },
  [MaterialId.GateCreature]: {
    description: "Aberto até ser energizado — aí bloqueia só Povo e Fauna.",
    interactions: ["Deixa Pó e Líquido passarem de qualquer jeito.", "Também bloqueia o próprio vento enquanto ativado."],
  },
  [MaterialId.GateLiquid]: {
    description: "Aberto até ser energizado — aí bloqueia só Líquido.",
    interactions: ["Deixa Pó e Povo/Fauna passarem de qualquer jeito.", "Também bloqueia o próprio vento enquanto ativado."],
  },
  [MaterialId.GatePowder]: {
    description: "Aberto até ser energizado — aí bloqueia só Pó.",
    interactions: ["Deixa Líquido e Povo/Fauna passarem de qualquer jeito.", "Também bloqueia o próprio vento enquanto ativado."],
  },
  [MaterialId.LightningRod]: {
    description: "Atrai eletricidade perdida.",
    interactions: ["Aterra ela antes que cause um incêndio."],
  },
  [MaterialId.Fan]: {
    description: "Sopra um vento constante.",
    interactions: ["Clique com o botão direito para virar de lado."],
  },
  [MaterialId.DefenseTower]: {
    description: "Atira em qualquer morto-vivo por perto.",
    interactions: ["Só funciona enquanto energizada."],
  },
  [MaterialId.Drain]: {
    description: "Suga Líquido que encoste nele.",
    interactions: [
      "Sem Cano conectado, o líquido simplesmente some.",
      "Conectado a um Cano, o líquido sai por uma Torneira aberta, ou fica armazenado dentro do Cano até que uma abra.",
    ],
  },
  [MaterialId.Pipe]: {
    description: "Um conduto para o líquido de um Ralo conectado.",
    interactions: ["Enche e armazena líquido quando nenhuma Torneira aberta é alcançada."],
  },
  [MaterialId.Torneira]: {
    description: "A saída de uma rede de Canos.",
    interactions: [
      "Libera o líquido, seja o que está chegando agora ou o que já estava armazenado no Cano, enquanto energizada.",
      "Várias Torneiras abertas na mesma rede dividem o fluxo igualmente entre elas.",
    ],
  },
  [MaterialId.Virus]: {
    description: "Uma infecção lenta e parada no lugar.",
    interactions: [
      "Toma conta rápido de Madeira/Planta/Broto/Flor/Trigo/Semente ou de um bicho/Pip tocando (Esqueleto é imune), virando mais Vírus.",
      "Também pode tomar conta de qualquer outra coisa que tocar — Sólidos, Líquidos, Gases, Fio, Cano, Torneira, Portão, tudo — só que bem devagar. Vidro é a única exceção, imune de verdade.",
      "Fogo/Lava esteriliza no contato. Magia purifica na hora.",
      "Some sozinho se passar tempo demais sem achar um hospedeiro novo.",
      "Clique com o botão direito no quadradinho pra escolher o rival, o Vírus Rosa, pro botão direito do mouse — os dois se convertem, rápido, onde quer que se encontrem.",
    ],
  },
  [MaterialId.VirusPink]: {
    description: "Uma cepa rival do Vírus.",
    interactions: [
      "Igual ao Vírus em tudo, só que rival da cepa roxa: os dois se convertem, rápido, onde quer que se toquem.",
      "Só se chega a ele clicando com o botão direito no quadradinho do Vírus — ele não tem quadradinho próprio.",
    ],
  },
  [MaterialId.Fungus]: {
    description: "Uma rede de micélio que se espalha por vários materiais.",
    interactions: [
      "Se espalha devagar por Madeira, Planta, Tijolo, Areia, Terra, Barro, Pedra ou Pólvora tocando — cada infecção mantém a cor e a textura do material original em vez de um visual único.",
      "Imune ao Vírus de verdade; os dois não competem.",
      "Inflamável, que nem qualquer matéria orgânica — o Fogo queima ele.",
      "De vez em quando brota um Esporos no chão aberto bem em cima dele. Nunca some sozinho.",
    ],
  },
  [MaterialId.Spore]: {
    description: "Uma nuvem de esporos à deriva, um gás de verdade.",
    interactions: [
      "Pintado igual Fogo ou Gás, preenche o ar aberto por onde o pincel passa na hora, sem nenhum bloco sólido embaixo, só a nuvem mesmo.",
      "Levado pela corrente de um Ventilador, que nem o Vapor.",
      "Encostando em um dos oito hospedeiros do Fungo (Madeira, Planta, Tijolo, Areia, Terra, Barro, Pedra, Pólvora), ou num Vírus, tem chance de tomar aquela célula como Fungo novo, um Vírus contaminado assim para de se reproduzir de vez.",
      "Morre na hora se encostar em Fogo ou Lava, que nem esteriliza o Vírus.",
      "Vai à deriva e se dissipando sozinho com o tempo.",
      "Uma rede de Fungo também solta isso sozinha de vez em quando.",
    ],
  },
};

const JA: InfoMap = {
  [MaterialId.Sand]: {
    description: "落ちて積もる。",
    interactions: ["水に沈む。溶岩で溶ける。"],
  },
  [MaterialId.Water]: {
    description: "流れて水平を求める液体。",
    interactions: ["凍り、沸騰し、電気を通す。"],
  },
  [MaterialId.Stone]: {
    description: "重くて丈夫な砂。",
    interactions: ["ほとんど何にも反応しない。"],
  },
  [MaterialId.Wood]: {
    description: "その場に留まる固体。",
    interactions: ["長時間燃える。"],
  },
  [MaterialId.Fire]: {
    description: "上に昇り、広がり、消えていく。",
    interactions: ["水で消える。"],
  },
  [MaterialId.Plant]: {
    description: "ブロック状に育ち、水のそばで広がる。",
    interactions: ["気候に反応する。"],
  },
  [MaterialId.Dirt]: {
    description: "乾いた土。",
    interactions: ["水で泥になる。種によい。"],
  },
  [MaterialId.Mud]: {
    description: "湿った土。植えるのに最適。",
    interactions: ["種がここで速く発芽する。"],
  },
  [MaterialId.Seed]: {
    description: "土に着くまで落ちる。",
    interactions: ["芽になるか、花のついた枝になる。"],
  },
  [MaterialId.Electricity]: {
    description: "広がって消えていく稲妻。",
    interactions: ["導体を伝って進む。"],
  },
  [MaterialId.Metal]: {
    description: "優れた導体。",
    interactions: ["ゆっくり錆びる。溶岩で速く溶ける。"],
  },
  [MaterialId.Acid]: {
    description: "触れたものをほぼ何でも溶かす。",
    interactions: ["腐食しながら自らも消費される。"],
  },
  [MaterialId.Gunpowder]: {
    description: "不安定な爆発性の粉。",
    interactions: ["簡単に引火し、連鎖的に誘爆する。"],
  },
  [MaterialId.C4]: {
    description: "爆発物だが、その場に留まる。",
    interactions: ["近くの火薬やC4と連鎖する。"],
  },
  [MaterialId.CombustibleGas]: {
    description: "上昇して広がる可燃性ガス。",
    interactions: ["非常に簡単に爆発する。"],
  },
  [MaterialId.Oil]: {
    description: "水より軽い可燃性の液体。",
    interactions: ["非常に長く燃える。"],
  },
  [MaterialId.Salt]: {
    description: "水に溶ける。",
    interactions: ["塩水は通電も錆びも違ってくる。"],
  },
  [MaterialId.Lava]: {
    description: "溶けた岩。密度が高く、とても熱い。",
    interactions: ["物を溶かす。水に触れると石になる。"],
  },
  [MaterialId.Vida]: {
    description: "独自のルールで生まれ、死ぬ細胞。",
    interactions: ["近くの植物や木を食べて広がる。"],
  },
  [MaterialId.Ice]: {
    description: "その場に留まる凍った固体。",
    interactions: ["真水を凍らせる。熱で溶ける。"],
  },
  [MaterialId.Glass]: {
    description: "もろいが、酸には耐性がある。",
    interactions: ["何度か当たると砕ける。"],
  },
  [MaterialId.Brick]: {
    description: "丈夫な壁ブロック。",
    interactions: ["燃えず、酸にも強い。"],
  },
  [MaterialId.Wheat]: {
    description: "農夫の作物。",
    interactions: ["緑から黄金へ熟す。"],
  },
  [MaterialId.Clone]: {
    description: "最初に触れた素材をコピーする。",
    interactions: ["その後は永遠に生成し続ける。"],
  },
  [MaterialId.HeatBlock]: {
    description: "周囲を暖める。",
    interactions: ["自らは決して変化しない。"],
  },
  [MaterialId.ColdBlock]: {
    description: "周囲を冷やす。",
    interactions: ["自らは決して変化しない。"],
  },
  [MaterialId.Ant]: {
    description: "表面をたどる小さな歩行者。",
    interactions: ["植物を食べる。鳥に注意。"],
  },
  [MaterialId.Bird]: {
    description: "悠々と滑空し、獲物に急降下する。",
    interactions: ["アリや魚を狩る。"],
  },
  [MaterialId.Fish]: {
    description: "水の中だけを泳ぐ。",
    interactions: ["頭上からも狙われている。"],
  },
  [MaterialId.Magic]: {
    description: "漂う、短命な魔法の粒。",
    interactions: ["触れたものを変質させる。"],
  },
  [MaterialId.Mason]: {
    description: "住民のひとり。建築家。",
    interactions: ["家を建て、木の橋も架ける。"],
  },
  [MaterialId.Lumberjack]: {
    description: "住民のひとり。林業者。",
    interactions: ["木を育て、伐って材木にする。"],
  },
  [MaterialId.Farmer]: {
    description: "住民のひとり。不毛の地を畑に変える。",
    interactions: ["小麦を育てて収穫する。"],
  },
  [MaterialId.Warrior]: {
    description: "住民のひとり。村の守り手。",
    interactions: ["不死者と戦う。"],
  },
  [MaterialId.Skeleton]: {
    description: "よろめく不死者。",
    interactions: ["住民を狩る。"],
  },
  [MaterialId.Lever]: {
    description: "スイッチ。",
    interactions: ["右クリックでオン・オフを切り替える。"],
  },
  [MaterialId.Wire]: {
    description: "電力を運ぶ。",
    interactions: ["レバーからゲートまで。"],
  },
  [MaterialId.GateGeneral]: {
    description: "通電するまでは開いている。通電すると粉体・液体・住民/動物すべてを一度にブロックする。",
    interactions: ["通電中は風そのものもブロックする。"],
  },
  [MaterialId.GateCreature]: {
    description: "通電するまでは開いている。通電すると住民と動物だけをブロックする。",
    interactions: ["粉体と液体はどちらでも通り抜ける。", "通電中は風そのものもブロックする。"],
  },
  [MaterialId.GateLiquid]: {
    description: "通電するまでは開いている。通電すると液体だけをブロックする。",
    interactions: ["粉体と住民/動物はどちらでも通り抜ける。", "通電中は風そのものもブロックする。"],
  },
  [MaterialId.GatePowder]: {
    description: "通電するまでは開いている。通電すると粉体だけをブロックする。",
    interactions: ["液体と住民/動物はどちらでも通り抜ける。", "通電中は風そのものもブロックする。"],
  },
  [MaterialId.LightningRod]: {
    description: "迷った電気を引き寄せる。",
    interactions: ["火事になる前に安全に逃がす。"],
  },
  [MaterialId.Fan]: {
    description: "一定の風を送る。",
    interactions: ["右クリックで向きを変える。"],
  },
  [MaterialId.DefenseTower]: {
    description: "近くの不死者を撃つ。",
    interactions: ["通電中だけ動く。"],
  },
  [MaterialId.Drain]: {
    description: "触れた液体を吸い込む。",
    interactions: [
      "パイプがつながっていないと、液体はそのまま消える。",
      "パイプにつながっていると、開いた蛇口から流れ出るか、蛇口が開くまでパイプの中にたまる。",
    ],
  },
  [MaterialId.Pipe]: {
    description: "つながった排水口の液体を通す管。",
    interactions: ["開いた蛇口がないと、液体がたまって貯蔵される。"],
  },
  [MaterialId.Torneira]: {
    description: "パイプ網の出口。",
    interactions: [
      "通電中は、新しく届いた液体もパイプにたまっていた液体も外に流れ出る。",
      "同じ網に開いた蛇口が複数あると、流れを均等に分け合う。",
    ],
  },
  [MaterialId.Virus]: {
    description: "ゆっくり広がる、その場から動かない感染体。",
    interactions: [
      "触れた木・植物・芽・花・小麦・種、または動物・住民（骸骨は免疫）を素早く乗っ取り、ウイルスに変える。",
      "触れた他の何か（固体、液体、気体、ワイヤー、パイプ、蛇口、ゲートなど）も乗っ取れるが、ものすごく遅い。ガラスだけは本当に免疫。",
      "火や溶岩に触れると滅菌される。魔法は完全に浄化する。",
      "新しい宿主が長く見つからないと自然に消える。",
      "アイコンを右クリックすると、右クリック用にライバルのピンクウイルスを選べる。二つは触れ合うと素早く互いを変換し合う。",
    ],
  },
  [MaterialId.VirusPink]: {
    description: "ウイルスのライバル株。",
    interactions: [
      "ウイルスと全く同じだが、紫の株のライバル。二つは触れ合うと素早く互いを変換し合う。",
      "ウイルスのアイコンを右クリックすることでしか選べない。専用のアイコンは無い。",
    ],
  },
  [MaterialId.Fungus]: {
    description: "いくつもの素材に広がる菌糸ネットワーク。",
    interactions: [
      "触れた木・植物・レンガ・砂・土・泥・石・火薬にゆっくり広がる。感染した素材はそれぞれ元の色と質感を保つ。",
      "ウイルスには完全に免疫。二つは競合しない。",
      "有機物なので燃える — 火で焼ける。",
      "たまに真上の開いた地面に胞子雲を生やす。自然には消えない。",
    ],
  },
  [MaterialId.Spore]: {
    description: "漂う胞子の雲、本物の気体。",
    interactions: [
      "火やガスと同じく、筆が通った空いた場所にすぐ広がる — 下に固体の塊はなく、雲そのものだけ。",
      "扇風機の風で運ばれる、蒸気と同じように。",
      "菌類の8つの宿主(木材、植物、レンガ、砂、土、泥、石、火薬)、またはウイルスに触れると、そこを新しい菌類として乗っ取ることがある — こうして乗っ取られたウイルスは二度と増殖しない。",
      "火や溶岩に触れると、ウイルスを滅菌するのと同じようにその場で消える。",
      "時間とともに漂い、薄れて消えていく。",
      "菌類のネットワークも時々これを自分で放つ。",
    ],
  },
};

export const MATERIAL_INFO: Record<Locale, InfoMap> = { en: EN, pt: PT, ja: JA };
