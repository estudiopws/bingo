function createNumberPool() {
  return Array.from({ length: 75 }, (_, index) => index + 1);
}

function createInitialState() {
  return {
    calledNumbers: [],
    availableNumbers: createNumberPool(),
  };
}

function isValidCalledNumbers(calledNumbers) {
  return Array.isArray(calledNumbers)
    && calledNumbers.length <= 75
    && new Set(calledNumbers).size === calledNumbers.length
    && calledNumbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 75);
}

function createStateFromCalledNumbers(calledNumbers) {
  const availableNumberSet = new Set(createNumberPool());

  for (const number of calledNumbers) {
    availableNumberSet.delete(number);
  }

  return {
    calledNumbers: [...calledNumbers],
    availableNumbers: Array.from(availableNumberSet),
  };
}

function loadState(storage, storageKey) {
  if (!storage) {
    return createInitialState();
  }

  try {
    const rawState = storage.getItem(storageKey);
    if (!rawState) {
      return createInitialState();
    }

    const parsedState = JSON.parse(rawState);
    if (!isValidCalledNumbers(parsedState?.calledNumbers)) {
      return createInitialState();
    }

    return createStateFromCalledNumbers(parsedState.calledNumbers);
  } catch {
    return createInitialState();
  }
}

export function getBingoLetter(number) {
  if (number <= 15) return 'B';
  if (number <= 30) return 'I';
  if (number <= 45) return 'N';
  if (number <= 60) return 'G';
  return 'O';
}

export function formatBingoCall(number) {
  return `${getBingoLetter(number)}-${number}`;
}

export function createGameState({ random = Math.random, storage = null, storageKey = 'bingo-game-state' } = {}) {
  const state = loadState(storage, storageKey);

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
      const initialState = createInitialState();

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