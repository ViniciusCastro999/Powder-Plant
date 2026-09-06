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
    description: "Falls and piles up, like real sand.",
    interactions: ["Sinks through Water and Acid, slower than Stone.", "Melts in Lava."],
  },
  [MaterialId.Water]: {
    description: "A liquid that flows and seeks its own level.",
    interactions: [
      "Puts out Fire and turns Lava into Stone.",
      "Conducts Electricity (salt water conducts far better).",
      "Turns into salt water near Salt.",
      "Slowly rusts Metal (faster when salty).",
      "Soaked up by Dirt, turning it into Mud.",
      "Helps plants and seeds grow.",
      "Freezes near Ice, or on its own once the climate gets cold enough (only if not salty).",
      "Slowly boils above 100°C into rising Steam that condenses back to Water once the climate cools.",
    ],
  },
  [MaterialId.Stone]: {
    description: "Like Sand, but much heavier and tougher.",
    interactions: ["Sinks fast through liquids.", "Almost immune to Acid.", "Melts in Lava, but very slowly."],
  },
  [MaterialId.Wood]: {
    description: "A solid that stays put.",
    interactions: ["Catches fire and burns for a long time."],
  },
  [MaterialId.Fire]: {
    description: "A flame that rises and slowly burns out.",
    interactions: ["Ignites flammable things nearby.", "Goes out in Water.", "Can set off explosions in Gunpowder."],
  },
  [MaterialId.Plant]: {
    description: "A plant that grows in blocks, spreading near Water.",
    interactions: [
      "Catches fire on its own if the climate gets too hot.",
      "Grows faster and sometimes blooms at the temperature that's ideal for life.",
      "At the ideal temperature it blooms on its own now and then, even with no Water nearby.",
      "Frosts over with a layer of Ice if the climate gets too cold.",
    ],
  },
  [MaterialId.Dirt]: {
    description: "Dry soil.",
    interactions: ["Turns into Mud near Water.", "Seeds germinate into small dry sprouts in it."],
  },
  [MaterialId.Mud]: {
    description: "Already-wet soil, the best place to plant.",
    interactions: ["Seeds germinate into little flowering branches in it."],
  },
  [MaterialId.Seed]: {
    description: "Falls until it finds soil to germinate on.",
    interactions: [
      "On dry Dirt it becomes a small sprout.",
      "On Mud it becomes a flowering branch.",
      "Even if it germinates outside the ideal climate, it keeps growing slowly once the climate turns prosperous.",
      "If it touches Plant, Sprout, Wood or Flower, it's absorbed instead of piling up.",
    ],
  },
  [MaterialId.Electricity]: {
    description: "A bolt that falls and spreads like a swarm, slowly fading in the air.",
    interactions: [
      "On touching a conductor (Metal, Water) it starts travelling inside it.",
      "Salt water conducts better than plain Water.",
      "Ignites anything flammable, including Oil and Gunpowder.",
    ],
  },
  [MaterialId.Metal]: {
    description: "A solid, an excellent conductor of Electricity.",
    interactions: ["Slowly rusts near Water (faster with salt water).", "Resistant to Acid.", "Melts fast in Lava."],
  },
  [MaterialId.Acid]: {
    description: "A corrosive liquid that's used up as it eats through things.",
    interactions: [
      "Dissolves whatever it touches; resistant materials (Stone, Metal) hold out longer.",
      "Slowly boils above 83°C (before Water) into Acid Vapor, which rains back down as fresh Acid once the climate cools.",
    ],
  },
  [MaterialId.Gunpowder]: {
    description: "An unstable explosive powder.",
    interactions: [
      "Catches fire easily and blows up into flying shrapnel that shoves everything nearby (Sand, Water, etc.), but not very far.",
      "Sets off other Gunpowder or C4 nearby in a chain, a beat after the initial blast, so a big pile goes off in waves rather than all at once.",
    ],
  },
  [MaterialId.C4]: {
    description: "The same explosive as Gunpowder, but a solid block that stays put.",
    interactions: [
      "Catches fire easily and explodes exactly like Gunpowder, with the same shrapnel.",
      "Detonates along with nearby Gunpowder or other C4 in a chain, no matter which one lit first.",
      "Doesn't fall or move: stays exactly where it was placed until it explodes.",
    ],
  },
  [MaterialId.CombustibleGas]: {
    description: "A flammable gas that rises and spreads through the air.",
    interactions: [
      "Catches fire extremely easily and explodes, just like Gunpowder and C4.",
      "Ignites on its own if the climate warms up (far more heat-sensitive than any other flammable).",
      "Rises and disperses instead of falling, and vanishes fast if it isn't lit.",
    ],
  },
  [MaterialId.Oil]: {
    description: "A flammable liquid, lighter than Water.",
    interactions: ["Catches fire easily and burns for a very long time."],
  },
  [MaterialId.Salt]: {
    description: "Dissolves on contact with Water, making it salty.",
    interactions: ["Sinks slowly through Water.", "Salt water conducts more electricity and rusts metal faster."],
  },
  [MaterialId.Lava]: {
    description: "Molten rock, dense and very hot.",
    interactions: [
      "Melts Metal, Sand and Stone into more Lava (Metal melts fastest, Stone slowest).",
      "Ignites and blows up everything that Fire also ignites and blows up.",
      "Turns to Stone instantly on touching Water.",
    ],
  },
  [MaterialId.Vida]: {
    description: "A cellular organism that is born, survives and dies by the rules of Conway's Game of Life.",
    interactions: [
      "A live cell with 2 or 3 live neighbours survives; otherwise it dies. An empty space with exactly 3 live neighbours comes to life.",
      "Devours nearby Seed, Flower, Sprout, Plant and Wood, turning them into more Life, each at a different speed (Seed is fast, Wood very slow). It doubles as it eats.",
    ],
  },
  [MaterialId.Ice]: {
    description: "A frozen solid that stays put.",
    interactions: [
      "Freezes touching fresh Water into more Ice (salt water doesn't freeze).",
      "Melts back into Water near Fire or Lava, or on its own if the climate gets too hot.",
    ],
  },
  [MaterialId.Glass]: {
    description: "A fragile solid, but completely immune to Acid.",
    interactions: [
      "Explosion shrapnel and Electricity crack it one hit at a time; a few impacts on the same spot break it into Sand there, rather than the whole pane shattering at once.",
      "Immune to Acid: the acid doesn't even spend a charge trying to corrode it.",
    ],
  },
  [MaterialId.Clone]: {
    description: "A block that stays put and copies the first material to touch it.",
    interactions: [
      "Once touched by any material, it generates that same material endlessly, forever, Electricity included.",
      "Once locked to a material it never changes, even if the original that touched it disappears.",
      "A still-unlocked Clone block touching an already-locked Clone gradually copies the same material, and it only spreads through connected Clone blocks.",
      "Immune to Acid.",
    ],
  },
  [MaterialId.HeatBlock]: {
    description: "A solid, immovable block that warms the surroundings without ever changing itself.",
    interactions: [
      "Warms the climate like Fire and Lava, but doesn't catch fire, melt or ignite anything around it.",
      "Immune to everything (Acid, Electricity, shrapnel), built purely to control temperature.",
    ],
  },
  [MaterialId.ColdBlock]: {
    description: "A solid, immovable block that cools the surroundings without ever changing itself.",
    interactions: [
      "Cools the climate like Ice, but doesn't melt or freeze anything around it.",
      "Immune to everything (Acid, Electricity, shrapnel), built purely to control temperature.",
    ],
  },
};

const PT: InfoMap = {
  [MaterialId.Sand]: {
    description: "Cai e forma pilhas, como areia de verdade.",
    interactions: ["Afunda na Água e no Ácido, mais devagar que a Pedra.", "Derrete na Lava."],
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
      "Ferve lentamente a partir de 100°C, virando Vapor que sobe e volta a ser Água quando o clima esfriar de novo.",
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
    description: "Solo já molhado, o melhor lugar para plantar.",
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
    interactions: [
      "Enferruja aos poucos perto de Água (mais rápido com Água Salgada).",
      "Resistente a Ácido.",
      "Derrete rápido na Lava.",
    ],
  },
  [MaterialId.Acid]: {
    description: "Líquido corrosivo que se consome enquanto corrói.",
    interactions: [
      "Dissolve o que tocar; materiais resistentes (Pedra, Metal) aguentam mais.",
      "Ferve lentamente a partir de 83°C (antes da Água) virando Vapor de Ácido, que chove de volta como Ácido fresco quando o clima esfriar.",
    ],
  },
  [MaterialId.Gunpowder]: {
    description: "Pó explosivo instável.",
    interactions: [
      "Pega fogo fácil e explode em estilhaços que voam e empurram tudo que estiver por perto (Areia, Água, etc.), mas não muito longe.",
      "Detona outras Pólvoras ou C4 por perto em cadeia, um pouco depois da explosão inicial, então um monte grande delas explode em ondas, não tudo de uma vez.",
    ],
  },
  [MaterialId.C4]: {
    description: "Mesmo explosivo da Pólvora, só que em bloco sólido e parado no lugar.",
    interactions: [
      "Pega fogo fácil e explode exatamente como a Pólvora, com os mesmos estilhaços.",
      "Detona junto com Pólvora ou outro C4 por perto em cadeia, não importa qual dos dois acendeu primeiro.",
      "Não cai nem se move: fica exatamente onde foi colocado até explodir.",
    ],
  },
  [MaterialId.CombustibleGas]: {
    description: "Gás inflamável que sobe e se espalha pelo ar.",
    interactions: [
      "Pega fogo com muita facilidade e explode, igual Pólvora e C4.",
      "Pega fogo sozinho se o clima esquentar (bem mais sensível a calor que qualquer outro inflamável).",
      "Sobe e se dispersa em vez de cair, e some rápido se não for aceso.",
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
      "Devora Semente, Flor, Broto, Planta e Madeira ao redor, virando mais Vida, cada material numa velocidade diferente (Semente é rápida, Madeira é bem lenta). Ao comer, ela se duplica.",
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
      "Estilhaços de explosão e Eletricidade o trincam, um impacto de cada vez; alguns golpes no mesmo ponto o quebram em Areia ali, em vez de toda a placa se estilhaçar de uma vez.",
      "Imune a Ácido: o ácido nem gasta carga tentando corroê-lo.",
    ],
  },
  [MaterialId.Clone]: {
    description: "Bloco parado que copia o primeiro material que encostar nele.",
    interactions: [
      "Ao ser tocado por qualquer material, passa a gerar esse mesmo material sem parar, para sempre, inclusive Eletricidade.",
      "Uma vez travado em um material, nunca muda, mesmo que o original que o tocou desapareça.",
      "Um bloco de Clone ainda destravado, encostado em outro Clone já travado, aos poucos copia o mesmo material, e só se espalha por blocos de Clone conectados entre si.",
      "Imune a Ácido.",
    ],
  },
  [MaterialId.HeatBlock]: {
    description: "Bloco sólido e imóvel que esquenta o ambiente, sem nunca sofrer nenhuma alteração.",
    interactions: [
      "Esquenta o clima como Fogo e Lava, mas não pega fogo, não derrete e não incendeia nada ao redor.",
      "Imune a tudo (Ácido, Eletricidade, estilhaços), feito só para controlar a temperatura.",
    ],
  },
  [MaterialId.ColdBlock]: {
    description: "Bloco sólido e imóvel que esfria o ambiente, sem nunca sofrer nenhuma alteração.",
    interactions: [
      "Esfria o clima como o Gelo, mas não derrete e não congela nada ao redor.",
      "Imune a tudo (Ácido, Eletricidade, estilhaços), feito só para controlar a temperatura.",
    ],
  },
};

const JA: InfoMap = {
  [MaterialId.Sand]: {
    description: "本物の砂のように落ちて積もる。",
    interactions: ["水や酸の中を沈む。石より遅い。", "溶岩で溶ける。"],
  },
  [MaterialId.Water]: {
    description: "流れて水平を求める液体。",
    interactions: [
      "火を消し、溶岩を石に変える。",
      "電気を通す（塩水のほうがはるかによく通す）。",
      "塩のそばで塩水になる。",
      "金属を少しずつ錆びさせる（塩水だと速い）。",
      "土に吸われて泥になる。",
      "植物や種の成長を助ける。",
      "氷のそばで凍る。気候が十分に冷えれば単独でも凍る（塩水でない場合のみ）。",
      "100℃を超えるとゆっくり沸騰して上昇する蒸気になり、気候が冷えると再び水に戻る。",
    ],
  },
  [MaterialId.Stone]: {
    description: "砂に似ているが、はるかに重くて丈夫。",
    interactions: ["液体の中を速く沈む。", "酸にほぼ耐性がある。", "溶岩で溶けるが、とても遅い。"],
  },
  [MaterialId.Wood]: {
    description: "その場に留まる固体。",
    interactions: ["火がつき、長時間燃える。"],
  },
  [MaterialId.Fire]: {
    description: "上に昇り、少しずつ消えていく炎。",
    interactions: ["近くの燃えやすいものに引火する。", "水で消える。", "火薬で爆発を引き起こすことがある。"],
  },
  [MaterialId.Plant]: {
    description: "ブロック状に成長し、水のそばで広がる植物。",
    interactions: [
      "気候が暑くなりすぎると自然に発火する。",
      "生命に最適な温度では成長が速くなり、時々花を咲かせる。",
      "最適な温度では、近くに水がなくても時々ひとりでに花を咲かせる。",
      "気候が冷えすぎると外側が凍り、氷の層をまとう。",
    ],
  },
  [MaterialId.Dirt]: {
    description: "乾いた土。",
    interactions: ["水のそばで泥になる。", "種がその中で乾いた小さな芽に発芽する。"],
  },
  [MaterialId.Mud]: {
    description: "すでに湿った土。植えるのに最適な場所。",
    interactions: ["種がその中で花のついた小さな枝に発芽する。"],
  },
  [MaterialId.Seed]: {
    description: "発芽できる土に着くまで落ちる。",
    interactions: [
      "乾いた土では小さな芽になる。",
      "泥では花のついた枝になる。",
      "最適でない気候で発芽しても、その後気候が好条件になれば少しずつ成長を続ける。",
      "植物・芽・木・花に触れると、積もらずに吸収される。",
    ],
  },
  [MaterialId.Electricity]: {
    description: "落ちてきて群れのように広がり、空気中で少しずつ消えていく稲妻。",
    interactions: [
      "導体（金属、水）に触れると、その内部を伝わって進む。",
      "塩水はふつうの水よりよく通す。",
      "油や火薬を含め、燃えやすいものに引火させる。",
    ],
  },
  [MaterialId.Metal]: {
    description: "固体で、電気の優れた導体。",
    interactions: [
      "水のそばで少しずつ錆びる（塩水だと速い）。",
      "酸に強い。",
      "溶岩で速く溶ける。",
    ],
  },
  [MaterialId.Acid]: {
    description: "腐食しながら自らも消費されていく液体。",
    interactions: [
      "触れたものを溶かす。耐性のある素材（石、金属）ほど長く持ちこたえる。",
      "83℃を超えると（水より先に）ゆっくり沸騰して酸の蒸気になり、気候が冷えると新鮮な酸となって降り戻る。",
    ],
  },
  [MaterialId.Gunpowder]: {
    description: "不安定な爆発性の粉。",
    interactions: [
      "簡単に引火し、破片となって飛び散り、近くのすべて（砂、水など）を押しのける。ただしそれほど遠くまでは飛ばない。",
      "近くの他の火薬や C4 を、最初の爆発の少し後に連鎖的に誘爆させる。大きな山は一度にではなく波状に爆発する。",
    ],
  },
  [MaterialId.C4]: {
    description: "火薬と同じ爆発物だが、その場に留まる固体ブロック。",
    interactions: [
      "簡単に引火し、火薬とまったく同じ破片で爆発する。",
      "近くの火薬や他の C4 と連鎖的に誘爆する。どちらが先に着火したかは関係ない。",
      "落ちも動きもしない：爆発するまで置かれた場所にとどまる。",
    ],
  },
  [MaterialId.CombustibleGas]: {
    description: "上昇して空気中に広がる可燃性ガス。",
    interactions: [
      "非常に簡単に引火し、火薬や C4 と同じように爆発する。",
      "気候が暖まると自然に発火する（他のどの可燃物よりも熱に敏感）。",
      "落ちるのではなく上昇して拡散する。着火されなければすぐに消える。",
    ],
  },
  [MaterialId.Oil]: {
    description: "水より軽い可燃性の液体。",
    interactions: ["簡単に引火し、非常に長く燃える。"],
  },
  [MaterialId.Salt]: {
    description: "水に触れると溶け、水を塩水にする。",
    interactions: ["水の中をゆっくり沈む。", "塩水はより多くの電気を通し、金属をより速く錆びさせる。"],
  },
  [MaterialId.Lava]: {
    description: "溶けた岩。密度が高く、とても熱い。",
    interactions: [
      "金属・砂・石を溶かしてさらに溶岩にする（金属が最も速く、石が最も遅い）。",
      "火が引火・爆発させるものすべてを、同じように引火・爆発させる。",
      "水に触れると即座に石になる。",
    ],
  },
  [MaterialId.Vida]: {
    description: "コンウェイのライフゲームのルールに従って生まれ、生き残り、死ぬ細胞状の生命体。",
    interactions: [
      "生きたセルは 2 または 3 個の生きた隣接セルがあれば生き残り、それ以外では死ぬ。空きマスはちょうど 3 個の生きた隣接セルがあると誕生する。",
      "周囲の種・花・芽・植物・木を食べてさらにライフになる。素材ごとに食べる速さが違い（種は速く、木は非常に遅い）、食べると倍に増える。",
    ],
  },
  [MaterialId.Ice]: {
    description: "その場に留まる凍った固体。",
    interactions: [
      "触れている真水を凍らせてさらに氷にする（塩水は凍らない）。",
      "火や溶岩のそばで水に戻る。気候が暑くなりすぎれば単独でも溶ける。",
    ],
  },
  [MaterialId.Glass]: {
    description: "もろい固体だが、酸には完全に耐性がある。",
    interactions: [
      "爆発の破片や電気は一撃ずつヒビを入れる。同じ場所に数回当たるとそこが砕けて砂になり、板全体が一度に割れることはない。",
      "酸に耐性がある。酸は腐食しようとして電荷を消費すらしない。",
    ],
  },
  [MaterialId.Clone]: {
    description: "その場に留まり、最初に触れた素材をコピーするブロック。",
    interactions: [
      "どの素材でも触れられると、その同じ素材を永遠に生成し続ける（電気も含む）。",
      "一度ある素材に固定されると、触れた元の素材が消えても決して変わらない。",
      "まだ固定されていないクローンブロックが、すでに固定されたクローンに触れていると、少しずつ同じ素材をコピーする。つながったクローンブロックの間だけで広がる。",
      "酸に耐性がある。",
    ],
  },
  [MaterialId.HeatBlock]: {
    description: "自らは一切変化せず、周囲を暖める、動かない固体ブロック。",
    interactions: [
      "火や溶岩のように気候を暖めるが、発火も融解もせず、周囲の何も燃やさない。",
      "すべてに耐性があり（酸、電気、破片）、純粋に温度を操作するために作られている。",
    ],
  },
  [MaterialId.ColdBlock]: {
    description: "自らは一切変化せず、周囲を冷やす、動かない固体ブロック。",
    interactions: [
      "氷のように気候を冷やすが、周囲の何も溶かさず凍らせない。",
      "すべてに耐性があり（酸、電気、破片）、純粋に温度を操作するために作られている。",
    ],
  },
};

export const MATERIAL_INFO: Record<Locale, InfoMap> = { en: EN, pt: PT, ja: JA };
