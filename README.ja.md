<div align="center">

# 🌱 Powder & Plant

**ブラウザで動く「落下砂（falling-sand）」パーティクル・サンドボックス。**

[![Powder & Plant スクリーンショット](docs/screenshot.png)](https://viniciuscastro999.github.io/Powder-Plant/)

[![ブラウザでプレイ](https://img.shields.io/badge/%E2%96%B6%20%E3%83%96%E3%83%A9%E3%82%A6%E3%82%B6%E3%81%A7%E3%83%97%E3%83%AC%E3%82%A4-2ea44f?style=for-the-badge)](https://viniciuscastro999.github.io/Powder-Plant/)

<br>

![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Pixi.js](https://img.shields.io/badge/Pixi.js-8-E91E63?logo=pixijs&logoColor=white)

<br>

[![English](https://img.shields.io/badge/lang-English-6e7781?style=for-the-badge)](README.md)
[![Português](https://img.shields.io/badge/lang-Portugu%C3%AAs-6e7781?style=for-the-badge)](README.pt-BR.md)
[![日本語](https://img.shields.io/badge/lang-%E6%97%A5%E6%9C%AC%E8%AA%9E-2ea44f?style=for-the-badge)](README.ja.md)

</div>

---

砂・水・火・溶岩・酸・火薬・植物など数十種類の素材をグリッドに描き、それらが
反応し合う様子を眺めます。液体は水平を求め、粉は積もり、火は燃え広がり、爆発物は
連鎖爆発し、種は発芽します。そして置いたものに応じて **周囲の温度** が変化し、
自然発火・凍結・沸騰・植物の成長を左右します。

> インターフェースは英語・ポルトガル語・日本語に対応しています（画面左下のスイッチで切り替え）。

## 特徴

- **約 25 種類の素材** を 8 つのテーマ別カテゴリに分類。それぞれ独自の物理挙動を持ちます。
- **落下砂シミュレーション** をゼロから実装。密度ベースの移動、火と酸の伝播、
  スリープ／ウェイク最適化を備えたセルオートマトンです。
- 導体の中をパルスとして伝わる **電気**。
- 衝撃波・破片・連鎖反応を伴う **爆発**（火薬、C4、ガス）。
- 独立した 1 つの素材としての **コンウェイのライフゲーム**（「ライフ」）。
- 8 段階の **全体温度**。グリッドを *好条件* の帯まで暖めると植物が花を咲かせます。
- シーンを `.pnp.json` ファイルとして **保存／読み込み／エクスポート／インポート**（`localStorage` 経由）。

## 技術スタック

| | |
|---|---|
| **UI** | [Svelte 5](https://svelte.dev/)（runes）+ TypeScript |
| **描画** | セルのグリッドを描く [Pixi.js 8](https://pixijs.com/) |
| **ツール** | バンドラー兼開発サーバーの [Vite](https://vite.dev/) |

Pixi 以外にランタイム依存はありません。シミュレーションはすべて自前のコードです。

## 始め方

Node.js（推奨 20 以上）が必要です。

```bash
npm install
npm run dev       # HMR 付き開発サーバー http://localhost:5173
```

その他のスクリプト:

```bash
npm run build     # dist/ に本番ビルド
npm run preview   # 本番ビルドをローカルで配信
npm run check     # Svelte + TypeScript の型チェック
```

## 遊び方

- 下部バーから **素材を選ぶ**（カテゴリごとにまとまっています）。
- マウスまたはタッチで **キャンバスに描く**。ブラシ形状は 点・線・範囲（四角）・
  範囲（円）で、サイズ調整が可能。
- **消しゴム** でセルを消去、**すべて消去** でグリッド全体をリセット。
- **マップ** で保存／読み込みウィンドウを開く：現在のシーンに名前を付けて
  ブラウザに保存、保存済みマップの読み込み、任意のマップを `.pnp.json`
  ファイルとしてエクスポート、ファイルの読み込みで別のブラウザとシーンを共有。
- パネルにはアクティブセル数と **周囲の温度** が表示されます。温度は
  火／溶岩／熱で上がり、氷／冷で下がり、自然発火・凍結・沸騰・植物の成長に
  影響します。
- **ヒント** ボタンで、各素材の説明と相互作用を記したウィンドウが開きます。
- **言語スイッチ**（左下、温度表示の隣）で UI を英語・ポルトガル語・日本語に
  切り替えます。選択はブラウザに記憶され、初回訪問時はブラウザの言語が使われます。

## 素材

| カテゴリ | 素材 |
|---|---|
| 粒子 | 砂・石・土・泥・塩 |
| 固体 | 木・金属・ガラス |
| 液体 | 水・油・酸 |
| 生命 | 植物・種・ライフ |
| 熱 | 火・溶岩・熱 |
| 冷 | 氷・冷 |
| 爆発物 | 火薬・C4・ガス |
| 特殊 | 電気・クローン |

一部の素材は反応でのみ現れます：**芽** と **花**（発芽した種から）、
**蒸気**（沸騰した水）、**酸の蒸気**（沸騰した酸）。

## プロジェクト構成

```
src/
  main.ts              エントリーポイント。App をマウント
  App.svelte           レイアウト：キャンバス + 下部パネル + モーダル
  components/
    Canvas.svelte      グリッド生成、シミュレーションループ、ブラシ処理
    BottomPanel.svelte 素材選択、ブラシ、統計、言語スイッチ
    HintsModal.svelte  素材説明のヘルプウィンドウ
    MapsModal.svelte   保存 / 読み込み / エクスポート / インポート
    Icon.svelte        SVG アイコン
  render/
    PixiStage.ts       グリッド（と火花／爆発オーバーレイ）を Pixi で描画
  sim/
    grid.ts            中核：セルオートマトン、物理、反応、温度
    materials.ts       全素材の定義とパレットのグループ分け
    temperature.ts     sim と UI で共有する温度帯
    storage.ts         RLE シリアライズと localStorage へのマップ永続化
    types.ts           MaterialId、カテゴリ、シミュレーションバッファ
  i18n/                UI 翻訳（英語 / ポルトガル語 / 日本語）
    locale.svelte.ts   現在の言語の状態。localStorage に永続化
    ui.ts              固定 UI 文字列
    materials.ts       言語別の素材名 + カテゴリラベル
    materialInfo.ts    言語別のヒント説明と相互作用
```

## シミュレーションの仕組み

中核は [src/sim/grid.ts](src/sim/grid.ts) です。グリッドは `material` と `meta`
（1 セルあたり 1 バイト）をフラットな `Uint8Array` に保持し、`step()` が毎フレーム
グリッドを下から上へ走査して、移動（粉・液体・気体）、火、酸、電気（パルス）、
爆発（衝撃波）、コンウェイのライフゲーム（「ライフ」素材）、周囲温度の効果を
適用します。
