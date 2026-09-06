<script lang="ts">
  import Canvas from "./components/Canvas.svelte";
  import BottomPanel from "./components/BottomPanel.svelte";
  import HintsModal from "./components/HintsModal.svelte";
  import MapsModal from "./components/MapsModal.svelte";
  import { BrushShape, MaterialId } from "./sim/types";
  import { NEUTRAL_TEMP } from "./sim/temperature";

  let selected = $state<MaterialId>(MaterialId.Sand);
  let brushSize = $state(6);
  let brushShape = $state<BrushShape>(BrushShape.Point);
  let pixelCount = $state(0);
  let temperature = $state(NEUTRAL_TEMP);
  let hintsOpen = $state(false);
  let mapsOpen = $state(false);
  let canvasRef: ReturnType<typeof Canvas> | undefined;
</script>

<main>
  <div class="stage-frame">
    <div class="stage-inner">
      <Canvas
        bind:this={canvasRef}
        selectedMaterial={selected}
        {brushSize}
        {brushShape}
        onCount={(n) => (pixelCount = n)}
        onTemperature={(c) => (temperature = c)}
      />
    </div>
  </div>

  <BottomPanel
    bind:selected
    bind:brushSize
    bind:brushShape
    {pixelCount}
    {temperature}
    onclear={() => canvasRef?.clear()}
    onhints={() => (hintsOpen = true)}
    onmaps={() => (mapsOpen = true)}
  />
  <HintsModal open={hintsOpen} onclose={() => (hintsOpen = false)} />
  <MapsModal
    open={mapsOpen}
    onclose={() => (mapsOpen = false)}
    getSnapshot={() => canvasRef?.snapshot() ?? null}
    onload={(snap) => canvasRef?.loadMap(snap)}
  />
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: #05070a;
    overflow: hidden;
  }

  .stage-frame {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
    min-height: 0;
    background: #12141d;
  }

  .stage-inner {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 18px;
    padding: 3px;
    background: linear-gradient(155deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.03));
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
  }

  .stage-inner > :global(.canvas-host) {
    width: 100%;
    height: 100%;
    border-radius: 15px;
    overflow: hidden;
  }
</style>
