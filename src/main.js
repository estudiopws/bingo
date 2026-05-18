import { createCageScene } from './cage-scene.js';
import { createGameState, formatBingoCall, getBingoLetter } from './game-state.js';

const board = document.getElementById('master-board');
const display = document.getElementById('last-ball-display');
const drawButton = document.getElementById('draw-ball-button');
const rollButton = document.getElementById('roll-cage-button');
const undoButton = document.getElementById('undo-button');
const newGameButton = document.getElementById('new-game-button');
const threeContainer = document.getElementById('threejs-container');
const footerSignoff = document.getElementById('footer-signoff');
const infoModal = document.getElementById('info-modal');
const infoModalTitle = document.getElementById('info-modal-title');
const infoModalBody = document.getElementById('info-modal-body');
const modalTriggers = Array.from(document.querySelectorAll('[data-modal-trigger]'));
const modalCloseButtons = Array.from(document.querySelectorAll('[data-modal-close]'));

const baseCellClassName = 'flex items-center justify-center rounded-lg aspect-square font-body-lg text-body-lg font-bold transition-all duration-300 border border-outline-variant bg-surface-container text-on-surface-variant';
const activeCellClassName = 'flex items-center justify-center rounded-lg aspect-square font-body-lg text-body-lg font-bold transition-all duration-300 text-on-primary bg-primary shadow-md border-primary-container scale-110 z-10';
const boardLetterClassName = 'bingo-grid__letter';

const modalContent = {
  historial: {
    title: 'Historial',
  },
  reglas: {
    title: 'Reglas',
    body: `
      <div class="space-y-5 text-body-md text-on-surface">
        <p>El operador saca una bola a la vez y anuncia la letra con el numero. Cada extraccion queda registrada en el tablero y en el historial.</p>
        <div class="grid gap-4 md:grid-cols-3">
          <article class="rounded-3xl border border-outline-variant bg-surface-container-low p-5">
            <p class="text-label-md font-label-md uppercase tracking-[0.18em] text-on-surface-variant">1. Inicio</p>
            <p class="mt-3">Pulsa <strong>Sacar bola</strong> para extraer un numero aleatorio que no haya salido antes.</p>
          </article>
          <article class="rounded-3xl border border-outline-variant bg-surface-container-low p-5">
            <p class="text-label-md font-label-md uppercase tracking-[0.18em] text-on-surface-variant">2. Seguimiento</p>
            <p class="mt-3">Las letras <strong>B-I-N-G-O</strong> identifican cada bloque de 15 numeros para ubicar rapido la bola correcta y anunciarla como llamada completa, por ejemplo <strong>G-52</strong>. El tablero principal resalta la bola mas reciente y el historial conserva la secuencia completa de llamadas.</p>
          </article>
          <article class="rounded-3xl border border-outline-variant bg-surface-container-low p-5">
            <p class="text-label-md font-label-md uppercase tracking-[0.18em] text-on-surface-variant">3. Correcciones</p>
            <p class="mt-3">Usa <strong>Undo</strong> si necesitas revertir la ultima extraccion antes de continuar con la partida.</p>
          </article>
        </div>
      </div>
    `,
  },
  probabilidades: {
    title: 'Probabilidades',
    body: `
      <div class="space-y-5 text-body-md text-on-surface">
        <p>Cada bola restante tiene exactamente la misma probabilidad de salir en la siguiente extraccion. El sistema elimina numeros repetidos y mantiene una bolsa uniforme de 75 opciones iniciales.</p>
        <div class="grid gap-4 md:grid-cols-2">
          <article class="rounded-3xl border border-outline-variant bg-surface-container-low p-5">
            <p class="text-label-md font-label-md uppercase tracking-[0.18em] text-on-surface-variant">Al comenzar</p>
            <p class="mt-3 text-headline-lg font-headline-lg text-primary">1 de 75</p>
            <p class="mt-2 text-on-surface-variant">Cada numero tiene una probabilidad de $1/75 \approx 1.33\%$.</p>
          </article>
          <article class="rounded-3xl border border-outline-variant bg-surface-container-low p-5">
            <p class="text-label-md font-label-md uppercase tracking-[0.18em] text-on-surface-variant">Despues de 20 bolas</p>
            <p class="mt-3 text-headline-lg font-headline-lg text-primary">1 de 55</p>
            <p class="mt-2 text-on-surface-variant">Cada numero pendiente pasa a una probabilidad de $1/55 \approx 1.82\%$.</p>
          </article>
        </div>
        <p class="text-on-surface-variant">La chance de que salga una letra depende de cuantas bolas queden disponibles en su rango: B, I, N, G u O.</p>
      </div>
    `,
  },
};

function createBoard() {
  board.replaceChildren();

  for (let rowStart = 1; rowStart <= 75; rowStart += 15) {
    const letterCell = document.createElement('div');
    letterCell.className = boardLetterClassName;
    letterCell.textContent = getBingoLetter(rowStart);
    board.appendChild(letterCell);

    for (let number = rowStart; number < rowStart + 15; number += 1) {
      const cell = document.createElement('div');
      cell.id = `ball-${number}`;
      cell.className = baseCellClassName;
      cell.textContent = number;
      board.appendChild(cell);
    }
  }
}

function setDisplay(number) {
  if (!number) {
    display.textContent = '--';
    return;
  }

  display.textContent = formatBingoCall(number);
  display.classList.remove('draw-anim');
  void display.offsetWidth;
  display.classList.add('draw-anim');
}

function setCellState(number, isActive) {
  const cell = document.getElementById(`ball-${number}`);
  if (!cell) {
    return;
  }

  cell.className = isActive ? activeCellClassName : baseCellClassName;
}

function setFooterYear() {
  const link = document.createElement('a');
  link.href = 'https://estudiopws.com';
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.ariaLabel = 'Estudio PWS';
  link.className = 'block opacity-70 hover:opacity-100 transition-opacity';

  const img = document.createElement('img');
  img.src = 'https://estudiopws.com/assets/logopws.svg';
  img.alt = 'Estudio PWS';
  img.className = 'h-8 w-auto';

  link.appendChild(img);
  footerSignoff.replaceChildren(link);
}

function mountApp() {
  const game = createGameState({ storage: window.localStorage });
  const cageScene = createCageScene(threeContainer);
  let activeModalKey = null;
  let pendingReveal = null;

  function hydrateBoardState() {
    for (const number of game.getCalledNumbers()) {
      setCellState(number, true);
    }

    setDisplay(game.getLastCalled());
    drawButton.disabled = !game.hasRemainingNumbers();
  }

  function resetBoardState(numbers) {
    for (const number of numbers) {
      setCellState(number, false);
    }

    setDisplay(null);
    drawButton.disabled = false;
  }

  function renderHistory() {
    const calledNumbers = game.getCalledNumbers().slice().reverse();

    if (calledNumbers.length === 0) {
      return `
        <div class="rounded-[28px] border border-dashed border-outline-variant bg-surface-container-low px-6 py-10 text-center text-on-surface-variant">
          Aun no se ha cantado ninguna bola. El historial aparecera aqui despues de la primera extraccion.
        </div>
      `;
    }

    const pills = calledNumbers
      .map((number) => `<div class="history-pill">${formatBingoCall(number)}</div>`)
      .join('');

    return `
      <div class="space-y-5">
        <div class="flex items-center justify-between gap-4 rounded-[28px] border border-outline-variant bg-surface-container-low px-5 py-4">
          <div>
            <p class="text-label-md font-label-md uppercase tracking-[0.18em] text-on-surface-variant">Ultima llamada</p>
            <p class="mt-2 text-headline-lg font-headline-lg text-primary">${formatBingoCall(game.getLastCalled())}</p>
          </div>
          <div class="text-right text-on-surface-variant">
            <p class="text-label-md font-label-md uppercase tracking-[0.18em]">Bolas cantadas</p>
            <p class="mt-2 text-headline-lg font-headline-lg text-primary">${calledNumbers.length}</p>
          </div>
        </div>
        <div class="history-list">${pills}</div>
      </div>
    `;
  }

  function getModalMarkup(modalKey) {
    if (modalKey === 'historial') {
      return renderHistory();
    }

    return modalContent[modalKey]?.body ?? '';
  }

  function renderModal(modalKey) {
    const config = modalContent[modalKey];
    if (!config) {
      return;
    }

    infoModalTitle.textContent = config.title;
    infoModalBody.innerHTML = getModalMarkup(modalKey);
  }

  function closeModal() {
    activeModalKey = null;
    infoModal.classList.remove('is-open');
    infoModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('overflow-hidden');
  }

  function openModal(modalKey) {
    activeModalKey = modalKey;
    renderModal(modalKey);
    infoModal.classList.add('is-open');
    infoModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('overflow-hidden');
  }

  function refreshHistoryModal() {
    if (activeModalKey === 'historial') {
      renderModal(activeModalKey);
    }
  }

  function handleModalTriggerClick(event) {
    const modalKey = event.currentTarget.dataset.modalTrigger;
    openModal(modalKey);
  }

  function handleModalCloseClick() {
    closeModal();
  }

  function handleWindowKeydown(event) {
    if (event.key === 'Escape' && activeModalKey) {
      closeModal();
    }
  }

  function drawBall() {
    // Ignore clicks while a roll and reveal are already in progress
    if (pendingReveal !== null) {
      return;
    }

    const number = game.draw();
    if (!number) {
      return;
    }

    // Lock controls for the duration of the roll
    drawButton.disabled = true;
    undoButton.disabled = true;

    cageScene.roll(3000);

    // Reveal number after the cage animation completes
    pendingReveal = setTimeout(() => {
      pendingReveal = null;
      setCellState(number, true);
      setDisplay(number);
      drawButton.disabled = !game.hasRemainingNumbers();
      undoButton.disabled = false;
      refreshHistoryModal();
    }, 3000);
  }

  function undoLast() {
    const undoneNumber = game.undo();
    if (!undoneNumber) {
      return;
    }

    setCellState(undoneNumber, false);
    setDisplay(game.getLastCalled());
    drawButton.disabled = false;
    refreshHistoryModal();
  }

  function rollCage() {
    cageScene.roll(2000);
  }

  function startNewGame() {
    if (!window.confirm('Se borrara la partida actual y el historial guardado. Quieres empezar una nueva partida?')) {
      return;
    }

    if (pendingReveal !== null) {
      clearTimeout(pendingReveal);
      pendingReveal = null;
    }

    const previousCalledNumbers = game.reset();
    resetBoardState(previousCalledNumbers);
    undoButton.disabled = false;
    refreshHistoryModal();
  }

  function handleBeforeUnload() {
    cageScene.dispose();
  }

  createBoard();
  hydrateBoardState();
  setFooterYear();

  drawButton.addEventListener('click', drawBall);
  rollButton.addEventListener('click', rollCage);
  undoButton.addEventListener('click', undoLast);
  newGameButton.addEventListener('click', startNewGame);
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('keydown', handleWindowKeydown);

  for (const trigger of modalTriggers) {
    trigger.addEventListener('click', handleModalTriggerClick);
  }

  for (const closeButton of modalCloseButtons) {
    closeButton.addEventListener('click', handleModalCloseClick);
  }

  return () => {
    if (pendingReveal !== null) {
      clearTimeout(pendingReveal);
      pendingReveal = null;
    }

    closeModal();
    drawButton.removeEventListener('click', drawBall);
    rollButton.removeEventListener('click', rollCage);
    undoButton.removeEventListener('click', undoLast);
    newGameButton.removeEventListener('click', startNewGame);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('keydown', handleWindowKeydown);

    for (const trigger of modalTriggers) {
      trigger.removeEventListener('click', handleModalTriggerClick);
    }

    for (const closeButton of modalCloseButtons) {
      closeButton.removeEventListener('click', handleModalCloseClick);
    }

    cageScene.dispose();
    board.replaceChildren();
    setDisplay(null);
    infoModalBody.replaceChildren();
  };
}

let unmountApp = mountApp();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    unmountApp();
  });
}