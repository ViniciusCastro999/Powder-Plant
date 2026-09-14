<script lang="ts">
  import Modal from "./Modal.svelte";
  import { t } from "../i18n";
  import paintImg from "../assets/onboarding/paint.png";
  import boomImg from "../assets/onboarding/boom.png";
  import villageImg from "../assets/onboarding/village.png";

  interface Props {
    open: boolean;
    onclose: () => void;
  }
  let { open, onclose }: Props = $props();

  const slides = [
    { img: paintImg, titleKey: "onboardTitle1", bodyKey: "onboardBody1" },
    { img: boomImg, titleKey: "onboardTitle2", bodyKey: "onboardBody2" },
    { img: villageImg, titleKey: "onboardTitle3", bodyKey: "onboardBody3" },
  ] as const;

  let step = $state(0);
  const last = $derived(step === slides.length - 1);

  function close(): void {
    step = 0;
    onclose();
  }

  function next(): void {
    if (last) close();
    else step++;
  }
</script>

<Modal {open} onclose={close} ariaLabel={t("welcomeTour")} width="440px" maxHeight="560px">
  <button class="skip" onclick={close}>{t("onboardSkip")}</button>

  <div class="art">
    <img src={slides[step].img} alt="" />
  </div>

  <div class="body">
    <div class="dots">
      {#each slides as _, i (i)}
        <span class="dot" class:active={i === step}></span>
      {/each}
    </div>
    <h2>{t(slides[step].titleKey)}</h2>
    <p>{t(slides[step].bodyKey)}</p>
    <button class="next" onclick={next}>{last ? t("onboardStart") : t("onboardNext")}</button>
  </div>
</Modal>

<style>
  .skip {
    position: absolute;
    top: 12px;
    right: 12px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 6px 8px;
    border-radius: 8px;
    z-index: 1;
  }

  .skip:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  .art {
    aspect-ratio: 500 / 127;
    background: #05070a;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex: none;
  }

  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: pixelated;
  }

  .body {
    padding: 22px 26px 26px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
  }

  .dots {
    display: flex;
    gap: 6px;
    margin-bottom: 4px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
  }

  .dot.active {
    background: rgba(106, 160, 255, 0.9);
  }

  h2 {
    margin: 0;
    font-size: 19px;
    font-weight: 800;
    color: #fff;
  }

  p {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: rgba(255, 255, 255, 0.68);
    max-width: 34ch;
  }

  .next {
    margin-top: 10px;
    padding: 10px 22px;
    border-radius: 10px;
    border: 1px solid rgba(106, 160, 255, 0.45);
    background: rgba(106, 160, 255, 0.18);
    color: #fff;
    font-size: 13.5px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .next:hover {
    background: rgba(106, 160, 255, 0.28);
  }
</style>
