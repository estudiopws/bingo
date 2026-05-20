function createNumberPool(maxNumber) {
  return Array.from({ length: maxNumber }, (_, index) => index + 1);
}

function createInitialState(maxNumber) {
  return {
    calledNumbers: [],
    availableNumbers: createNumberPool(maxNumber),
  };
}

function isValidCalledNumbers(calledNumbers, maxNumber) {
  return Array.isArray(calledNumbers)
    && calledNumbers.length <= maxNumber
    && new Set(calledNumbers).size === calledNumbers.length
    && calledNumbers.every((number) => Number.isInteger(number) && number >= 1 && number <= maxNumber);
}

function createStateFromCalledNumbers(calledNumbers, maxNumber) {
  const availableNumberSet = new Set(createNumberPool(maxNumber));

  for (const number of calledNumbers) {
    availableNumberSet.delete(number);
  }

  return {
    calledNumbers: [...calledNumbers],
    availableNumbers: Array.from(availableNumberSet),
  };
}

function loadState(storage, storageKey, maxNumber) {
  if (!storage) {
    return createInitialState(maxNumber);
  }

  try {
    const rawState = storage.getItem(storageKey);
    if (!rawState) {
      return createInitialState(maxNumber);
    }

    const parsedState = JSON.parse(rawState);
    if (!isValidCalledNumbers(parsedState?.calledNumbers, maxNumber)) {
      return createInitialState(maxNumber);
    }

    return createStateFromCalledNumbers(parsedState.calledNumbers, maxNumber);
  } catch {
    return createInitialState(maxNumber);
  }
}

export function getMaxNumber(storage = localStorage) {
  try {
    const val = parseInt(storage.getItem('bingo-max-number'), 10);
    return val > 0 ? val : 90;
  } catch {
    return 90;
  }
}

export function setMaxNumber(value, storage = localStorage) {
  storage.setItem('bingo-max-number', String(value));
}

export function getBingoLetter(number) {
  if (number <= 15) return 'B';
  if (number <= 30) return 'I';
  if (number <= 45) return 'N';
  if (number <= 60) return 'G';
  if (number <= 75) return 'O';
  return '#';
}

export function formatBingoCall(number) {
  if (number <= 75) return `${getBingoLetter(number)}-${number}`;
  return String(number);
}

export function createGameState({ random = Math.random, storage = null, storageKey = 'bingo-game-state', maxNumber = 90 } = {}) {
  const state = loadState(storage, storageKey, maxNumber);

  function persistState() {
    if (!storage) {
      return;
    }

    try {
      storage.setItem(storageKey, JSON.stringify({ calledNumbers: state.calledNumbers }));
    } catch {
      // Ignore storage failures and keep the in-memory game playable.
    }
  }

  return {
    maxNumber,

    draw() {
      if (state.availableNumbers.length === 0) {
        return null;
      }

      const randomIndex = Math.floor(random() * state.availableNumbers.length);
      const [number] = state.availableNumbers.splice(randomIndex, 1);
      state.calledNumbers.push(number);
      persistState();
      return number;
    },

    undo() {
      if (state.calledNumbers.length === 0) {
        return null;
      }

      const number = state.calledNumbers.pop();
      state.availableNumbers.push(number);
      persistState();
      return number;
    },

    reset() {
      const previousCalledNumbers = [...state.calledNumbers];
      const initialState = createInitialState(maxNumber);

      state.calledNumbers.splice(0, state.calledNumbers.length, ...initialState.calledNumbers);
      state.availableNumbers.splice(0, state.availableNumbers.length, ...initialState.availableNumbers);

      persistState();
      return previousCalledNumbers;
    },

    getLastCalled() {
      return state.calledNumbers.at(-1) ?? null;
    },

    getCalledNumbers() {
      return [...state.calledNumbers];
    },

    hasRemainingNumbers() {
      return state.availableNumbers.length > 0;
    },
  };
}
