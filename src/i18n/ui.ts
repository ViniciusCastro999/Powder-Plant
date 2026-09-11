import type { Locale } from "./locale.svelte";

/**
 * Every fixed bit of UI text, keyed by a short name and translated into
 * each supported language. Material names and hint copy live in their own
 * files (`materials.ts`, `materialInfo.ts`) since they're keyed by
 * `MaterialId` instead.
 *
 * A `{n}` / `{name}` placeholder is filled in by the caller with
 * `format()` from `./index`.
 */
export type UIStrings = {
  languageLabel: string;

  // BottomPanel
  erase: string;
  tools: string;
  gravity: string;
  shapePoint: string;
  shapeLine: string;
  shapeSquare: string;
  shapeCircle: string;
  shapeDrag: string;
  hints: string;
  maps: string;
  clearAll: string;
  pause: string;
  play: string;
  gravityOn: string;
  gravityOff: string;

  // HintsModal
  materialHints: string;
  back: string;
  close: string;
  hintsIntro: string;
  interactions: string;

  // MapsModal
  mapsDialogLabel: string;
  mapNamePlaceholder: string;
  saveCurrentMap: string;
  mapSaved: string; // {name}
  simStillLoading: string;
  couldNotSaveMap: string;
  mapNotFound: string;
  couldNotReadFile: string;
  storageFull: string;
  invalidMapFile: string;
  noMapsYet: string;
  confirm: string;
  cancel: string;
  load: string;
  exportTitle: string;
  exportLabel: string;
  deleteTitle: string;
  importFile: string;
  mapNumber: string; // {n}
  untitledMap: string;
};

export const UI: Record<Locale, UIStrings> = {
  en: {
    languageLabel: "Language",

    erase: "Erase",
    tools: "Tools",
    gravity: "Gravity",
    shapePoint: "Point",
    shapeLine: "Line",
    shapeSquare: "Area (square)",
    shapeCircle: "Area (circle)",
    shapeDrag: "Drag",
    hints: "Hints",
    maps: "Maps",
    clearAll: "Clear all",
    pause: "Pause",
    play: "Play",
    gravityOn: "Gravity on",
    gravityOff: "Gravity off",

    materialHints: "Material hints",
    back: "Back",
    close: "Close",
    hintsIntro: "Tap a material to see what it does and how it reacts with the others.",
    interactions: "Interactions",

    mapsDialogLabel: "Save and load maps",
    mapNamePlaceholder: "Map name",
    saveCurrentMap: "Save current map",
    mapSaved: '"{name}" saved.',
    simStillLoading: "The simulation is still loading.",
    couldNotSaveMap: "Could not save the map.",
    mapNotFound: "Map not found.",
    couldNotReadFile: "Could not read the file.",
    storageFull: "Storage is full. Delete a map and try again.",
    invalidMapFile: "That file isn't a Powder & Plant map.",
    noMapsYet: 'No maps saved yet. Paint something and click "Save current map".',
    confirm: "Confirm",
    cancel: "Cancel",
    load: "Load",
    exportTitle: "Download as a file",
    exportLabel: "Export",
    deleteTitle: "Delete",
    importFile: "Import file",
    mapNumber: "Map {n}",
    untitledMap: "Untitled map",
  },

  pt: {
    languageLabel: "Idioma",

    erase: "Apagar",
    tools: "Ferramentas",
    gravity: "Gravidade",
    shapePoint: "Ponto",
    shapeLine: "Linha",
    shapeSquare: "Área (quadrado)",
    shapeCircle: "Área (círculo)",
    shapeDrag: "Arrastar",
    hints: "Dicas",
    maps: "Mapas",
    clearAll: "Limpar tudo",
    pause: "Pausar",
    play: "Continuar",
    gravityOn: "Gravidade ligada",
    gravityOff: "Gravidade desligada",

    materialHints: "Dicas de materiais",
    back: "Voltar",
    close: "Fechar",
    hintsIntro: "Toque em um material para ver a descrição e como ele interage com os outros.",
    interactions: "Interações",

    mapsDialogLabel: "Salvar e carregar mapas",
    mapNamePlaceholder: "Nome do mapa",
    saveCurrentMap: "Salvar mapa atual",
    mapSaved: '"{name}" salvo.',
    simStillLoading: "A simulação ainda está carregando.",
    couldNotSaveMap: "Não foi possível salvar o mapa.",
    mapNotFound: "Mapa não encontrado.",
    couldNotReadFile: "Não foi possível ler o arquivo.",
    storageFull: "Armazenamento cheio. Apague algum mapa e tente de novo.",
    invalidMapFile: "Arquivo não é um mapa de Powder & Plant.",
    noMapsYet: "Nenhum mapa salvo ainda. Pinte alguma coisa e clique em “Salvar mapa atual”.",
    confirm: "Confirmar",
    cancel: "Cancelar",
    load: "Carregar",
    exportTitle: "Baixar como arquivo",
    exportLabel: "Exportar",
    deleteTitle: "Excluir",
    importFile: "Importar arquivo",
    mapNumber: "Mapa {n}",
    untitledMap: "Mapa sem nome",
  },

  ja: {
    languageLabel: "言語",

    erase: "消す",
    tools: "道具",
    gravity: "重力",
    shapePoint: "点",
    shapeLine: "線",
    shapeSquare: "範囲（四角）",
    shapeCircle: "範囲（円）",
    shapeDrag: "ドラッグ",
    hints: "ヒント",
    maps: "マップ",
    clearAll: "すべて消去",
    pause: "一時停止",
    play: "再開",
    gravityOn: "重力オン",
    gravityOff: "重力オフ",

    materialHints: "素材のヒント",
    back: "戻る",
    close: "閉じる",
    hintsIntro: "素材をタップすると、その説明と他の素材との反応が見られます。",
    interactions: "相互作用",

    mapsDialogLabel: "マップの保存と読み込み",
    mapNamePlaceholder: "マップ名",
    saveCurrentMap: "現在のマップを保存",
    mapSaved: "「{name}」を保存しました。",
    simStillLoading: "シミュレーションはまだ読み込み中です。",
    couldNotSaveMap: "マップを保存できませんでした。",
    mapNotFound: "マップが見つかりません。",
    couldNotReadFile: "ファイルを読み込めませんでした。",
    storageFull: "保存領域がいっぱいです。マップを削除してからもう一度お試しください。",
    invalidMapFile: "このファイルは Powder & Plant のマップではありません。",
    noMapsYet: "保存されたマップはまだありません。何か描いて「現在のマップを保存」を押してください。",
    confirm: "確定",
    cancel: "キャンセル",
    load: "読み込む",
    exportTitle: "ファイルとしてダウンロード",
    exportLabel: "エクスポート",
    deleteTitle: "削除",
    importFile: "ファイルを読み込む",
    mapNumber: "マップ{n}",
    untitledMap: "名称未設定マップ",
  },
};
