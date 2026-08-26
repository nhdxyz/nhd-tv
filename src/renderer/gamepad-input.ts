import type { RemoteAction } from "../main/contracts";

const AXIS_DEAD_ZONE = 0.55;
const INITIAL_REPEAT_DELAY_MS = 420;
const REPEAT_INTERVAL_MS = 115;

export interface GamepadButtonLike {
  pressed: boolean;
  value: number;
}

export interface GamepadLike {
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
  connected: boolean;
  id: string;
  index: number;
  mapping: string;
}

function pressed(gamepad: GamepadLike, index: number): boolean {
  const button = gamepad.buttons[index];
  return button?.pressed === true || (button?.value ?? 0) >= 0.5;
}

function dominantDirection(gamepads: readonly GamepadLike[]): RemoteAction | null {
  for (const gamepad of gamepads) {
    const dpadX = Number(pressed(gamepad, 15)) - Number(pressed(gamepad, 14));
    const dpadY = Number(pressed(gamepad, 13)) - Number(pressed(gamepad, 12));
    const rawAxisX = gamepad.axes[0] ?? 0;
    const rawAxisY = gamepad.axes[1] ?? 0;
    const axisX = Math.abs(rawAxisX) >= AXIS_DEAD_ZONE ? rawAxisX : 0;
    const axisY = Math.abs(rawAxisY) >= AXIS_DEAD_ZONE ? rawAxisY : 0;
    const x = dpadX === 0 ? axisX : dpadX;
    const y = dpadY === 0 ? axisY : dpadY;

    if (x === 0 && y === 0) {
      continue;
    }

    if (Math.abs(x) > Math.abs(y)) {
      return x < 0 ? "left" : "right";
    }

    return y < 0 ? "up" : "down";
  }

  return null;
}

function actionPressed(gamepads: readonly GamepadLike[], action: "back" | "home" | "select"): boolean {
  return gamepads.some((gamepad) => {
    if (action === "select") {
      return pressed(gamepad, 0);
    }

    if (action === "back") {
      return pressed(gamepad, 1);
    }

    return pressed(gamepad, 16) || (pressed(gamepad, 8) && pressed(gamepad, 9));
  });
}

export class GamepadActionMapper {
  #direction: RemoteAction | null = null;
  #nextRepeatAt = 0;
  #pressedActions = new Set<RemoteAction>();

  update(gamepads: readonly GamepadLike[], now: number): RemoteAction[] {
    const connected = gamepads.filter((gamepad) => gamepad.connected);
    const actions: RemoteAction[] = [];
    const direction = dominantDirection(connected);

    if (direction === null) {
      this.#direction = null;
      this.#nextRepeatAt = 0;
    } else if (direction !== this.#direction) {
      this.#direction = direction;
      this.#nextRepeatAt = now + INITIAL_REPEAT_DELAY_MS;
      actions.push(direction);
    } else if (now >= this.#nextRepeatAt) {
      this.#nextRepeatAt = now + REPEAT_INTERVAL_MS;
      actions.push(direction);
    }

    for (const action of ["select", "back", "home"] as const) {
      const isPressed = actionPressed(connected, action);
      if (isPressed && !this.#pressedActions.has(action)) {
        actions.push(action);
      }

      if (isPressed) {
        this.#pressedActions.add(action);
      } else {
        this.#pressedActions.delete(action);
      }
    }

    return actions;
  }
}

export class GamepadInput {
  readonly #onAction: (action: RemoteAction) => void;
  readonly #onStatusChanged: (gamepads: readonly GamepadLike[]) => void;
  readonly #mapper = new GamepadActionMapper();
  #lastStatus = "";
  #running = false;

  constructor(
    onAction: (action: RemoteAction) => void,
    onStatusChanged: (gamepads: readonly GamepadLike[]) => void
  ) {
    this.#onAction = onAction;
    this.#onStatusChanged = onStatusChanged;
  }

  start(): void {
    if (this.#running) {
      return;
    }

    this.#running = true;
    requestAnimationFrame((time) => this.#poll(time));
  }

  #poll(time: number): void {
    if (!this.#running) {
      return;
    }

    const gamepads = Array.from(navigator.getGamepads())
      .filter((gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected)
      .map((gamepad): GamepadLike => ({
        axes: [...gamepad.axes],
        buttons: gamepad.buttons.map((button) => ({
          pressed: button.pressed,
          value: button.value
        })),
        connected: gamepad.connected,
        id: gamepad.id,
        index: gamepad.index,
        mapping: gamepad.mapping
      }));
    const status = gamepads.map((gamepad) => `${gamepad.index}:${gamepad.id}`).join("|");

    if (status !== this.#lastStatus) {
      this.#lastStatus = status;
      this.#onStatusChanged(gamepads);
    }

    for (const action of this.#mapper.update(gamepads, time)) {
      this.#onAction(action);
    }

    requestAnimationFrame((nextTime) => this.#poll(nextTime));
  }
}
