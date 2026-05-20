import { describe, it, expect } from 'vitest';
import { createGameState } from './game-state.js';

describe('createGameState', () => {
  it('initial state has correct available numbers count', () => {
    const game = createGameState({ maxNumber: 75 });
    expect(game.hasRemainingNumbers()).toBe(true);
    // Draw all 75
    const drawn = [];
    for (let i = 0; i < 75; i++) {
      drawn.push(game.draw());
    }
    expect(drawn.every((n) => n >= 1 && n <= 75)).toBe(true);
    expect(new Set(drawn).size).toBe(75);
    expect(game.hasRemainingNumbers()).toBe(false);
  });

  it('drawing a number removes it from available and adds to called', () => {
    let callCount = 0;
    const game = createGameState({ maxNumber: 5, random: () => 0 });
    const n = game.draw();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(5);
    expect(game.getCalledNumbers()).toContain(n);
    expect(game.getLastCalled()).toBe(n);
  });

  it('cannot draw when no numbers available', () => {
    const game = createGameState({ maxNumber: 2 });
    game.draw();
    game.draw();
    expect(game.draw()).toBeNull();
  });

  it('reset restores initial state', () => {
    const game = createGameState({ maxNumber: 10 });
    game.draw();
    game.draw();
    const prev = game.reset();
    expect(prev.length).toBe(2);
    expect(game.getCalledNumbers()).toEqual([]);
    expect(game.getLastCalled()).toBeNull();
    expect(game.hasRemainingNumbers()).toBe(true);
    // Can draw all 10 again
    for (let i = 0; i < 10; i++) game.draw();
    expect(game.hasRemainingNumbers()).toBe(false);
  });

  it('state serialization/deserialization works correctly', () => {
    const storage = new Map();
    const fakeStorage = {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    };

    const game1 = createGameState({ maxNumber: 10, storage: fakeStorage });
    const n1 = game1.draw();
    const n2 = game1.draw();

    // Create new instance from same storage — should restore state
    const game2 = createGameState({ maxNumber: 10, storage: fakeStorage });
    expect(game2.getCalledNumbers()).toEqual([n1, n2]);
    expect(game2.getLastCalled()).toBe(n2);
  });
});
