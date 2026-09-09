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
  [MaterialId.Brick]: {
    description: "Fired masonry. A sturdy, inert wall block. What the Mason builds houses from, and paintable by hand.",
    interactions: [
      "Very acid-resistant and fireproof.",
      "A Brick, Stone or Wood roof overhead with a wall to each side is shelter. The folk crowd inside a house when the climate turns too hot or too cold to bear.",
      "The Raider smashes it like any other structure.",
    ],
  },
  [MaterialId.Wheat]: {
    description: "The Farmer's crop. A shoot sown on soil that grows a short stalk and ripens from green to gold.",
    interactions: [
      "Roots in Dirt or Mud; grows a cell or two taller with headroom, and a ripe head self-seeds onto bare soil nearby, so a sown row becomes a field.",
      "A ripe head is food. The folk (and the Farmer that grew it) eat it for a full meal; green shoots are left to grow up.",
      "Dry straw: burns readily and scorches from ambient heat. Withers unrooted or in a hard frost.",
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
  [MaterialId.Ant]: {
    description: "A tiny walker that follows surfaces. Climbs walls, trudges up slopes, and falls when nothing's underfoot.",
    interactions: [
      "Eats Plant, Sprout, Flower and Seed, and gnaws slowly through Wood and Mud; follows the scent of nearby food and gathers on it.",
      "Starves without food and multiplies when well fed.",
      "Burrows through loose Sand, Dirt and Mud, carving tunnels as the grains spill back.",
      "Drowns in Water, burns in Fire and Lava (fire sweeps a whole colony), dissolves in Acid.",
      "Hunted by Birds. Burrow underground to hide.",
    ],
  },
  [MaterialId.Bird]: {
    description: "Soars in a lazy band near the top of the scene, but swoops the moment it spots prey.",
    interactions: [
      "Hunts: a hungry Bird drops out of its cruise and dives at any Ant on the ground or Fish at the surface it spots, snatching it on contact.",
      "Also pecks Seed, and drops a Seed below it now and then. A moving seed-disperser that greens the ground it passes.",
      "Flees Fire and Lava, but burns if it can't get clear (fire sweeps a whole flock).",
    ],
  },
  [MaterialId.Fish]: {
    description: "Swims only inside Water, fresh or salty, schooling loosely with other Fish.",
    interactions: [
      "Nibbles submerged Plant, Sprout and Seed; breeds in roomy water when well fed.",
      "Bolts for deep water when a Bird hovers overhead. Staying down is its only escape from a swoop.",
      "Suffocates and flops out of water, cooks if the water boils, and is trapped by encroaching Ice.",
      "Dies on contact with Acid, Lava or Fire.",
    ],
  },
  [MaterialId.Magic]: {
    description: "A short-lived mote of enchantment that drifts upward and wanders, transmuting one neighbour per tick.",
    interactions: [
      "Quenches Fire, Lava and Acid; weathers Stone into Dirt and greens Dirt and Wood into Plant.",
      "Defuses Gunpowder and C4 into harmless Sand.",
      "Makes plants bloom and stalled sprouts grow again; rarely conjures a creature into open space.",
      "Fades after its lifespan, sometimes leaving a Flower behind.",
    ],
  },
  [MaterialId.Mason]: {
    description: "One of the folk, a builder. A focused worker that heads for the nearest job and clambers over what's in its way instead of pacing off it.",
    interactions: [
      "Quarries loose earth from a dune, hillside or pit. It won't dig the flat walking ground, only grade it.",
      "Levels the lot first, digging humps down and filling hollows, then raises a whole house at once on the flat ground: walls and a roof with a doorway.",
      "Six shapes and sizes, from a two-folk lean-to shed to an eighteen-folk hipped manor, by the room and supply the site offers. Peaked, hipped, mono-pitch and battlemented roofs, lit windows, a doubled wall base and a chimney.",
      "Style follows what's abundant: loose earth for a fired-Brick house, a stand of Wood for a timber cabin, a cold field of Ice for an igloo.",
      "Keeps standing houses in repair, patching a wall or roof knocked out by a Raider, a fire or a blast.",
      "The folk shelter in those houses when the climate turns too hot or too cold. Each house holds only so many, and a full one is passed over for the next. Folk squeeze straight through a thin house wall rather than getting boxed in.",
      "Drowns in deep Water, dies in Lava, catches fire from flame.",
    ],
  },
  [MaterialId.Firefighter]: {
    description: "One of the folk. Runs toward fire to put it out.",
    interactions: [
      "Scoops Water when it passes a pool. Carrying it, next to flame, it throws the water, clearing every touching Fire cell and leaving a splash.",
      "With no water it beats at the flames bare-handed, slower and at some risk of catching alight.",
      "Fire-resistant and never self-combusts, but flees Lava. The answer to a Raider's arson.",
    ],
  },
  [MaterialId.Farmer]: {
    description: "One of the folk. A planter, turning barren ground into cropland.",
    interactions: [
      "Carries Water from a pool to dry Dirt, turning it to Mud, then grades the furrow ahead flat and sows Wheat on it. Wheat only takes on level ground.",
      "A sown row ripens green to gold and self-seeds into a whole field. The Farmer harvests ripe heads (and stray mature Plant or Flower) for a full meal.",
      "The Wheat it grows is the village's staple. Every hungry folk heads for the nearest crop.",
    ],
  },
  [MaterialId.Raider]: {
    description: "One of the folk gone wrong. The wrecker.",
    interactions: [
      "Sets fires: lights a touching flammable, or drops a flame beside it.",
      "Smashes touching Wood, Glass and Brick to tear houses down, and chips Stone and Metal into Sand.",
      "Kills and eats a touching Ant, Fish, Mason, Firefighter or Farmer; roams toward the nearest of any of it.",
      "Barely flammable, so it walks through its own fires; only Lava stops it. Braves any weather, slowly dying of exposure in the worst of it.",
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
  [MaterialId.Brick]: {
    description: "Alvenaria queimada. Um bloco de parede resistente e inerte. É do que o Pedreiro constrói as casas, e dá pra pintar à mão.",
    interactions: [
      "Muito resistente a Ácido e à prova de fogo.",
      "Um teto de Tijolo, Pedra ou Madeira em cima com uma parede de cada lado é abrigo. O povo se recolhe dentro de uma casa quando o clima fica quente ou frio demais.",
      "O Saqueador o quebra como qualquer outra estrutura.",
    ],
  },
  [MaterialId.Wheat]: {
    description: "A plantação do Fazendeiro. Um broto semeado na terra que cria um colmo baixo e amadurece de verde a dourado.",
    interactions: [
      "Enraíza em Terra ou Barro; cresce um ou dois cells se tiver espaço, e uma espiga madura se semeia sozinha na terra nua ao lado, então uma fileira semeada vira uma lavoura.",
      "A espiga madura é alimento. O povo (e o Fazendeiro que a cultivou) come para uma refeição cheia; os brotos verdes ficam pra crescer.",
      "Palha seca: pega fogo fácil e queima com o calor ambiente. Murcha sem raiz ou numa geada forte.",
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
  [MaterialId.Ant]: {
    description: "Uma andarilha minúscula que segue superfícies. Sobe paredes, encara ladeiras e cai quando não tem chão embaixo.",
    interactions: [
      "Come Planta, Broto, Flor e Semente, e rói devagar Madeira e Barro; segue o cheiro de comida por perto e se junta em cima dela.",
      "Passa fome sem comida e se multiplica quando bem alimentada.",
      "Escava Areia, Terra e Barro soltos, abrindo túneis enquanto os grãos escorrem de volta.",
      "Se afoga na Água, queima no Fogo e na Lava (o fogo varre a colônia inteira), se dissolve no Ácido.",
      "É caçada pelos Pássaros. Cave um túnel para se esconder.",
    ],
  },
  [MaterialId.Bird]: {
    description: "Plana numa faixa preguiçosa perto do topo da cena, mas dá um bote assim que avista uma presa.",
    interactions: [
      "Caça: com fome, o Pássaro larga o voo tranquilo e mergulha em cima de qualquer Formiga no chão ou Peixe na superfície que avistar, agarrando no contato.",
      "Também bica Semente e de vez em quando solta uma abaixo de si. Um semeador ambulante que verdeja o chão por onde passa.",
      "Foge do Fogo e da Lava, mas queima se não escapar (o fogo varre o bando inteiro).",
    ],
  },
  [MaterialId.Fish]: {
    description: "Nada apenas dentro da Água, doce ou salgada, formando cardumes frouxos com outros Peixes.",
    interactions: [
      "Belisca Planta, Broto e Semente submersos; se reproduz em água com espaço quando bem alimentado.",
      "Dispara para a água funda quando um Pássaro paira acima. Ficar no fundo é sua única defesa contra o bote.",
      "Sufoca e se debate fora d'água, cozinha se a água ferver e fica preso pelo Gelo que avança.",
      "Morre ao encostar em Ácido, Lava ou Fogo.",
    ],
  },
  [MaterialId.Magic]: {
    description: "Uma centelha de encantamento de vida curta que sobe à deriva e vagueia, transmutando um vizinho por tick.",
    interactions: [
      "Apaga Fogo, Lava e Ácido; desgasta Pedra em Terra e verdeja Terra e Madeira em Planta.",
      "Desarma Pólvora e C4, virando Areia inofensiva.",
      "Faz plantas florescerem e brotos parados voltarem a crescer; raramente conjura uma criatura no espaço aberto.",
      "Some depois da sua vida útil, às vezes deixando uma Flor no lugar.",
    ],
  },
  [MaterialId.Mason]: {
    description: "Do povo. Um construtor. Trabalhador focado: vai direto pro serviço mais próximo e passa por cima do que estiver no caminho em vez de bater e voltar.",
    interactions: [
      "Extrai terra solta de uma duna, encosta ou cova. Não escava o chão plano onde anda, só o nivela.",
      "Primeiro aplaina o lote, cavando lombas e tapando buracos, e só então levanta a casa inteira de uma vez sobre o chão plano: paredes e teto com porta.",
      "Seis formas e tamanhos, do abrigo pra dois ao solar de telhado tacaniço pra dezoito, conforme o espaço e o material do lugar. Telhados de duas águas, tacaniço, de uma água e ameado, janelas acesas, base de parede dupla e chaminé.",
      "O estilo segue o que é abundante: terra solta vira casa de Tijolo, um bosque de Madeira vira cabana, um campo frio de Gelo vira iglu.",
      "Faz manutenção nas casas de pé, remendando parede ou teto derrubado por Saqueador, fogo ou explosão.",
      "O povo se abriga nessas casas quando o clima fica quente ou frio demais. Cada casa comporta um tanto, e uma cheia é deixada de lado pela próxima. O povo passa direto por uma parede fina de casa em vez de ficar preso.",
      "Se afoga em Água funda, morre na Lava, pega fogo com chama.",
    ],
  },
  [MaterialId.Firefighter]: {
    description: "Do povo. Corre até o fogo para apagá-lo.",
    interactions: [
      "Enche as mãos de Água quando passa por uma poça. Carregando, ao lado da chama, joga a água, limpando toda célula de Fogo encostada e deixando um respingo.",
      "Sem água, bate nas chamas com as próprias mãos, mais devagar e correndo o risco de pegar fogo.",
      "Resistente ao fogo e nunca se incendeia sozinho, mas foge da Lava. A resposta ao incêndio do Saqueador.",
    ],
  },
  [MaterialId.Farmer]: {
    description: "Do povo. Um fazendeiro, transformando terreno estéril em lavoura.",
    interactions: [
      "Leva Água da poça até a Terra seca virando Barro, depois aplaina o sulco à frente e semeia Trigo nele. O Trigo só pega em chão nivelado.",
      "Uma fileira semeada amadurece de verde a dourado e se semeia sozinha numa lavoura inteira; o Fazendeiro colhe as espigas maduras (e Planta/Flor madura solta) para uma refeição completa.",
      "O Trigo que ele cultiva é o sustento da vila. Todo povo com fome vai até a plantação mais próxima.",
    ],
  },
  [MaterialId.Raider]: {
    description: "Do povo, mas desviado. O vândalo.",
    interactions: [
      "Ateia fogo: acende um inflamável encostado, ou solta uma chama ao lado.",
      "Quebra Madeira, Vidro e Tijolo encostados (derrubando casas) e lasca Pedra e Metal em Areia.",
      "Mata e come Formiga, Peixe, Pedreiro, Bombeiro ou Fazendeiro encostado; vagueia até o mais próximo de qualquer um deles.",
      "Quase não pega fogo. Anda pelas próprias chamas; só a Lava o detém. Enfrenta qualquer clima (e morre aos poucos de exposição no pior deles).",
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
  [MaterialId.Brick]: {
    description: "焼いた組積材。丈夫で不活性な壁ブロック。石工が家を建てる材料で、手で描くこともできる。",
    interactions: [
      "酸にとても強く、燃えない。",
      "頭上にレンガ・石・木の屋根があり、左右に壁があれば「屋根の下」。気候が暑すぎたり寒すぎたりすると、住民は家の中に避難する。",
      "略奪者は他の建造物と同じように壊す。",
    ],
  },
  [MaterialId.Wheat]: {
    description: "農夫の作物。土に蒔かれた芽が短い茎を伸ばし、緑から黄金へと熟す。",
    interactions: [
      "土か泥に根を張る。頭上に空きがあれば1〜2セル伸び、熟した穂は隣の裸地に自分で種を落とすので、蒔いた列が畑になる。",
      "熟した穂は食料。住民（と育てた農夫）が食べて満腹になる。緑の芽は育つまで残される。",
      "乾いた藁：よく燃え、周囲の熱でも焦げる。根がなければ、また厳しい霜で枯れる。",
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
  [MaterialId.Ant]: {
    description: "表面をたどる小さな歩行者。壁を登り、坂を上り、足場がなくなると落ちる。",
    interactions: [
      "植物・芽・花・種を食べ、木や泥もゆっくりかじる。近くの餌の匂いをたどって群がる。",
      "餌がないと餓死し、十分に食べると増える。",
      "ゆるい砂・土・泥を掘り進み、こぼれ戻る粒がトンネルを作る。",
      "水で溺れ、火と溶岩で燃え（火はコロニー全体を走り抜ける）、酸で溶ける。",
      "鳥に狩られる。地中に潜って隠れられる。",
    ],
  },
  [MaterialId.Bird]: {
    description: "画面上部のゆるやかな帯を悠々と滑空するが、獲物を見つけた瞬間に急降下する。",
    interactions: [
      "狩り：腹をすかせた鳥は滑空をやめ、見つけた地上のアリや水面の魚に急降下し、触れた瞬間に捕らえる。",
      "種もついばみ、ときどき真下に落とす。通り道の地面を緑にする移動する種まき役。",
      "火と溶岩から逃げるが、逃げ切れないと燃える（火は群れ全体を走り抜ける）。",
    ],
  },
  [MaterialId.Fish]: {
    description: "真水でも塩水でも、水の中だけを泳ぎ、他の魚とゆるい群れを作る。",
    interactions: [
      "水中の植物・芽・種をかじる。十分に食べると、余裕のある水中で繁殖する。",
      "頭上に鳥が来ると深みへ逃げ込む。潜り続けるのが急降下からの唯一の逃げ道。",
      "水から出ると窒息して跳ね回り、水が沸くと煮え、迫る氷に閉じ込められる。",
      "酸・溶岩・火に触れると死ぬ。",
    ],
  },
  [MaterialId.Magic]: {
    description: "漂い昇りながらさまよう、短命な魔法の粒。毎ティック、隣の1マスを変質させる。",
    interactions: [
      "火・溶岩・酸を鎮め、石を土に風化させ、土や木を植物に変える。",
      "火薬と C4 を無害な砂に変えて不発にする。",
      "植物を咲かせ、止まった芽を再び育てる。まれに開けた場所に生き物を呼び出す。",
      "寿命が尽きると消え、ときおり跡に花を残す。",
    ],
  },
  [MaterialId.Mason]: {
    description: "住民のひとり。建築家。目的第一の働き手で、一番近い仕事へ直行し、壁にぶつかって引き返す代わりに乗り越えていく。",
    interactions: [
      "砂丘・斜面・くぼみからゆるい土を切り出し（平らな地面は掘らず均す）、建てる前に敷地を*整地する*。出っ張りを削り、へこみを埋める。",
      "平らな地面の上に家をまるごと一度に建てる。戸口のある壁と屋根。差し掛け小屋（2人用）から寄棟の館（18人用）まで六つの形と大きさ。切妻・寄棟・片流れ・胸壁付きの屋根、灯りのついた窓、二重の腰壁、煙突。",
      "様式は周囲に多い素材で決まる：ゆるい土 → 焼きレンガの家、木立 → 木の小屋、寒い氷原 → かまくら。",
      "建っている家を修繕する。略奪者・火・爆発で壊れた壁や屋根を塞ぐ。",
      "気候が暑すぎたり寒すぎたりすると、住民はその家に避難する。1軒に入れる人数には限りがあり、満員の家は避けて次の家へ向かう。住民は行き止まりで詰まる代わりに、薄い家の壁をすり抜けて進む。",
      "深い水で溺れ、溶岩で死に、炎で燃える。",
    ],
  },
  [MaterialId.Firefighter]: {
    description: "住民のひとり。火に向かって走り、消し止める。",
    interactions: [
      "水たまりのそばを通ると水をすくう。抱えて炎の隣に来ると水を投げ、触れているすべての火を消して水しぶきを残す。",
      "水がなければ素手で炎を叩く。遅く、自分も燃える危険がある。",
      "耐火性で自然発火はしないが、溶岩からは逃げる。略奪者の放火への答え。",
    ],
  },
  [MaterialId.Farmer]: {
    description: "住民のひとり。種をまき、不毛の地を畑に変える。",
    interactions: [
      "たまりから乾いた土へ水を運んで泥に変え、前方の畝を平らに均してから小麦をまく。小麦は平らな地面にしか根づかない。",
      "まいた列は緑から黄金へ熟し、自分で種を落として畑一面に広がる。農夫は熟した穂（と落ちている熟した植物・花）を収穫して腹を満たす。",
      "育てた小麦は村の主食。空腹の住民はみな一番近い畑へ向かう。",
    ],
  },
  [MaterialId.Raider]: {
    description: "道を外れた住民。破壊者。",
    interactions: [
      "火をつける：触れている可燃物に着火するか、隣に炎を落とす。",
      "触れている木・ガラス・レンガを壊して家を取り壊し、石と金属を砂に削る。",
      "触れているアリ・魚・石工・消防士・農夫を殺して食べる。近くのそれらに向かってうろつく。",
      "ほとんど燃えず、自分の炎の中を歩く。止められるのは溶岩だけ。どんな気候にも耐える（最悪の気候ではじわじわ凍死・熱死する）。",
    ],
  },
};

export const MATERIAL_INFO: Record<Locale, InfoMap> = { en: EN, pt: PT, ja: JA };
