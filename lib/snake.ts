export const DEFAULT_BOARD_SIZE = 12;

export type Point = {
  x: number;
  y: number;
};

export type Direction = "up" | "down" | "left" | "right";

export type GameStatus = "ready" | "running" | "paused" | "over";

export type SnakeGameState = {
  boardSize: number;
  snake: Point[];
  direction: Direction;
  queuedDirection: Direction;
  food: Point | null;
  score: number;
  status: GameStatus;
};

export type RandomSource = () => number;

const OPPOSITE_DIRECTIONS: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left"
};

export function createInitialGameState(
  boardSize = DEFAULT_BOARD_SIZE,
  randomSource: RandomSource = Math.random
): SnakeGameState {
  const middle = Math.floor(boardSize / 2);
  const snake = [
    { x: middle, y: middle },
    { x: middle - 1, y: middle },
    { x: middle - 2, y: middle }
  ];

  return {
    boardSize,
    snake,
    direction: "right",
    queuedDirection: "right",
    food: pickFoodPosition(boardSize, snake, randomSource),
    score: 0,
    status: "ready"
  };
}

export function startGame(state: SnakeGameState): SnakeGameState {
  if (state.status === "ready" || state.status === "paused") {
    return {
      ...state,
      status: "running"
    };
  }

  return state;
}

export function togglePause(state: SnakeGameState): SnakeGameState {
  if (state.status === "running") {
    return {
      ...state,
      status: "paused"
    };
  }

  if (state.status === "paused") {
    return {
      ...state,
      status: "running"
    };
  }

  return state;
}

export function setNextDirection(state: SnakeGameState, direction: Direction): SnakeGameState {
  if (state.snake.length > 1 && OPPOSITE_DIRECTIONS[state.direction] === direction) {
    return state;
  }

  return {
    ...state,
    queuedDirection: direction
  };
}

export function stepGame(
  state: SnakeGameState,
  randomSource: RandomSource = Math.random
): SnakeGameState {
  if (state.status !== "running") {
    return state;
  }

  const direction = state.queuedDirection;
  const nextHead = movePoint(state.snake[0], direction);
  const willGrow = state.food ? pointsEqual(nextHead, state.food) : false;
  const collisionBody = willGrow ? state.snake : state.snake.slice(0, -1);

  if (
    isOutOfBounds(nextHead, state.boardSize) ||
    collisionBody.some((segment) => pointsEqual(segment, nextHead))
  ) {
    return {
      ...state,
      direction,
      queuedDirection: direction,
      status: "over"
    };
  }

  const snake = [nextHead, ...state.snake];
  if (!willGrow) {
    snake.pop();
  }

  if (!willGrow) {
    return {
      ...state,
      snake,
      direction,
      queuedDirection: direction
    };
  }

  const food = pickFoodPosition(state.boardSize, snake, randomSource);

  return {
    ...state,
    snake,
    direction,
    queuedDirection: direction,
    food,
    score: state.score + 1,
    status: food ? "running" : "over"
  };
}

export function pickFoodPosition(
  boardSize: number,
  snake: Point[],
  randomSource: RandomSource = Math.random
): Point | null {
  const occupied = new Set(snake.map(getCellId));
  const openCells: Point[] = [];

  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      const point = { x, y };
      if (!occupied.has(getCellId(point))) {
        openCells.push(point);
      }
    }
  }

  if (openCells.length === 0) {
    return null;
  }

  const index = Math.min(openCells.length - 1, Math.floor(randomSource() * openCells.length));
  return openCells[index];
}

export function getCellId(point: Point): string {
  return `${point.x}:${point.y}`;
}

function movePoint(point: Point, direction: Direction): Point {
  switch (direction) {
    case "up":
      return { x: point.x, y: point.y - 1 };
    case "down":
      return { x: point.x, y: point.y + 1 };
    case "left":
      return { x: point.x - 1, y: point.y };
    case "right":
      return { x: point.x + 1, y: point.y };
  }
}

function isOutOfBounds(point: Point, boardSize: number): boolean {
  return point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize;
}

function pointsEqual(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}
