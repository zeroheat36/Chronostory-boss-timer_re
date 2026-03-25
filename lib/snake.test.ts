import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialGameState,
  pickFoodPosition,
  setNextDirection,
  startGame,
  stepGame,
  type SnakeGameState
} from "./snake";

test("moves the snake forward one cell on each tick", () => {
  const state = startGame(createInitialGameState(6, () => 0));

  const next = stepGame(state, () => 0.5);

  assert.deepEqual(next.snake, [
    { x: 4, y: 3 },
    { x: 3, y: 3 },
    { x: 2, y: 3 }
  ]);
  assert.equal(next.score, 0);
  assert.equal(next.status, "running");
});

test("ignores an immediate reverse direction input", () => {
  const state = createInitialGameState(6, () => 0);

  const next = setNextDirection(state, "left");

  assert.equal(next.queuedDirection, "right");
});

test("grows and respawns food after eating", () => {
  const state: SnakeGameState = {
    boardSize: 5,
    snake: [
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 2 }
    ],
    direction: "right",
    queuedDirection: "right",
    food: { x: 3, y: 2 },
    score: 0,
    status: "running"
  };

  const next = stepGame(state, () => 0);

  assert.deepEqual(next.snake, [
    { x: 3, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
    { x: 0, y: 2 }
  ]);
  assert.equal(next.score, 1);
  assert.deepEqual(next.food, { x: 0, y: 0 });
});

test("ends the game on wall collision", () => {
  const state: SnakeGameState = {
    boardSize: 5,
    snake: [
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 2 }
    ],
    direction: "right",
    queuedDirection: "right",
    food: { x: 0, y: 0 },
    score: 2,
    status: "running"
  };

  const next = stepGame(state, () => 0.5);

  assert.equal(next.status, "over");
});

test("ends the game on self collision", () => {
  const state: SnakeGameState = {
    boardSize: 6,
    snake: [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
      { x: 1, y: 2 }
    ],
    direction: "up",
    queuedDirection: "right",
    food: { x: 0, y: 0 },
    score: 4,
    status: "running"
  };

  const next = stepGame(state, () => 0.5);

  assert.equal(next.status, "over");
});

test("places food only on open cells", () => {
  const food = pickFoodPosition(
    3,
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 }
    ],
    () => 0.8
  );

  assert.deepEqual(food, { x: 2, y: 2 });
});
