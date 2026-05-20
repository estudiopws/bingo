import './styles.css';
import { createCageScene } from './cage-scene.js';
import { createGameState, formatBingoCall, getBingoLetter, getMaxNumber, setMaxNumber } from './game-state.js';
import { openSettingsModal, closeSettingsModal } from './modal.js';

const board = document.getElementById('master-board');
const display = document.getElementById('last-ball-display');
const drawButton = document.getElementById('draw-ball-button');
const rollButton = document.getElementById('roll-cage-button');
const undoButton = document.getElementById('undo-button');
const newGameButton = document.getElementById('new-game-button');
const threeContainer = document.getElementById('threejs-container');
const footerSignoff = document.getElementById('footer-signoff');
const modalTriggers = Array.from(document.querySelectorAll('[data-modal-trigger]'));
const modalCloseButtons = Array.from(document.querySelectorAll('[data-modal-close]'));

const baseCellClassName = 'flex items-center justify-center rounded-lg aspect-square font-body-lg text-body-lg font-bold transition-all duration-300 border border-outline-variant bg-surface-container text-on-surface-variant';
const activeCellClassName = 'flex items-center justify-center rounded-lg aspect-square font-body-lg text-body-lg font-bold transition-all duration-300 text-on-primary bg-primary shadow-md border-primary-container scale-110 z-10';
const boardLetterClassName = 'bingo-grid__letter';

const modalContent = {
  historial: { title: 'Historial' },
  reglas: {
    title: 'Reglas',
    body: `
      <div class="space-y-5 text-body-md text-on-surface">
        <p>El operador saca una bola a la vez y anuncia el numero. Cada extraccion queda registrada en el tablero y en el historial.</p>
        <div class="grid gap-4 md:grid-cols-3">
          <article class="rounded-3xl border border-outline-variant bg-surface-container-low p-5">
            <p class="text-label-md font-label-md uppercase tracking-[0.18em] text-on-surface-variant">1. Inicio</p>
            <p class="mt-3">Pulsa <strong>Sacar bola</strong> para extraer un numero aleatorio que no haya salido antes.</p>
          </article>
          <article class="rounded-3xl border border-outline-variant bg-surface-container-low p-5">
            <p class="text-label-md font-label-md uppercase tracking-[0.18em] text-on-surface-variant">2. Seguimiento</p>
            <p class="mt-3">El tablero principal resalta la bola mas reciente y el historial conserva la secuencia completa de llamadas.</p>
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
        <p>Cada bola restante tiene exactamente la misma probabilidad de salir en la siguiente extraccion.</p>
      </div>
    `,
  },
  ajustes: { title: 'Ajustes' },
};

function createBoard(maxNumber) {
  board.replaceChildren();

  const isBingo75 = maxNumber === 75;
  const cols = isBingo75 ? 5 : Math.ceil(maxNumber / 10);
  const rowsPerCol = Math.ceil(maxNumber / cols);
  board.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  for (let row = 0; row < rowsPerCol; row++) {
    for (let col = 0; col < cols; col++) {
      const number = col * rowsPerCol + row + 1;
      if (number > maxNumber) {
        board.appendChild(document.createElement('div'));
        continue;
      }
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
  if (!cell) return;
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
  const maxNumber = getMaxNumber();
  const game = createGameState({ storage: window.localStorage, maxNumber });
  let cageScene = null;
  const cageReady = createCageScene(threeContainer).then((s) => {
    cageScene = s;
    if (!s) threeContainer.style.display = 'none';
  });
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
      return `<div class="rounded-[28px] border border-dashed border-outline-variant bg-surface-container-low px-6 py-10 text-center text-on-surface-variant">
          Aun no se ha cantado ninguna bola.</div>`;
    }
    const pills = calledNumbers.map((n) => `<div class="history-pill">${formatBingoCall(n)}</div>`).join('');
    return `<div class="space-y-5">
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
      </div>`;
  }

  function renderSettings() {
    return `<div class="space-y-5 text-body-md text-on-surface">
      <label class="block">
        <span class="text-label-md font-label-md uppercase tracking-[0.18em] text-on-surface-variant">Cantidad de bolas</span>
        <input id="settings-max-number" type="number" min="1" max="999" value="${maxNumber}"
          class="mt-2 block w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-headline-lg font-headline-lg text-primary focus:outline-none focus:ring-2 focus:ring-primary"/>
      </label>
      <button id="settings-save" type="button"
        class="w-full py-4 rounded-xl bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider">
        GUARDAR Y REINICIAR PARTIDA
      </button>
    </div>`;
  }

  function getModalMarkup(modalKey) {
    if (modalKey === 'historial') return renderHistory();
    if (modalKey === 'ajustes') return renderSettings();
    return modalContent[modalKey]?.body ?? '';
  }

  function closeModal() {
    activeModalKey = null;
    closeSettingsModal();
  }

  function openModal(modalKey, trigger) {
    activeModalKey = modalKey;
    const config = modalContent[modalKey];
    if (!config) return;
    openSettingsModal({ title: config.title, bodyHtml: getModalMarkup(modalKey), trigger });

    if (modalKey === 'ajustes') {
      document.getElementById('settings-save')?.addEventListener('click', handleSettingsSave);
    }
  }

  function refreshHistoryModal() {
    if (activeModalKey === 'historial') {
      openModal(activeModalKey);
    }
  }

  function handleModalTriggerClick(event) {
    openModal(event.currentTarget.dataset.modalTrigger, event.currentTarget);
  }

  function handleModalCloseClick() {
    closeModal();
  }

  function handleWindowKeydown(event) {
    if (event.key === 'Escape' && activeModalKey) closeModal();
  }

  function handleSettingsSave() {
    const input = document.getElementById('settings-max-number');
    const val = parseInt(input?.value, 10);
    if (!val || val < 1 || val > 999) return;
    setMaxNumber(val);
    window.localStorage.removeItem('bingo-game-state');
    closeModal();
    cleanup();
    unmountApp = mountApp();
  }

  function drawBall() {
    if (pendingReveal !== null) return;
    const number = game.draw();
    if (!number) return;

    drawButton.disabled = true;
    undoButton.disabled = true;
    cageScene?.roll(3000);

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
    if (!undoneNumber) return;
    setCellState(undoneNumber, false);
    setDisplay(game.getLastCalled());
    drawButton.disabled = false;
    refreshHistoryModal();
  }

  function rollCage() {
    cageScene?.roll(2000);
  }

  function startNewGame() {
    if (!window.confirm('Se borrara la partida actual. Quieres empezar una nueva partida?')) return;
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
    cageScene?.dispose();
  }

  createBoard(maxNumber);
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

  function cleanup() {
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

    cageScene?.dispose();
    board.replaceChildren();
    setDisplay(null);
  }

  return cleanup;
}

let unmountApp = mountApp();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    unmountApp();
  });
}
