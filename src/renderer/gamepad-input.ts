import {
  MEDIA_ACTIONS,
  type MediaAction,
  type RemoteAction
} from "../main/contracts";

const AXIS_DEAD_ZONE = 0.55;
const INITIAL_REPEAT_DELAY_MS = 420;
const REPEAT_INTERVAL_MS = 115;
const FORCE_HOME_HOLD_MS = 1_200;

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

const MEDIA_BUTTONS: Readonly<Record<MediaAction, number>> = {
  "fast-forward": 5,
  mute: 3,
  "play-pause": 2,
  rewind: 4,
  "volume-down": 6,
  "volume-up": 7
};

function actionPressed(
  gamepads: readonly GamepadLike[],
  action: "back" | "home" | "select" | MediaAction
): boolean {
  return gamepads.some((gamepad) => {
    if (action === "select") {
      return pressed(gamepad, 0);
    }

    if (action === "back") {
      return pressed(gamepad, 1);
    }

    if (action === "home") {
      return pressed(gamepad, 16) || (pressed(gamepad, 8) && pressed(gamepad, 9));
    }

    return pressed(gamepad, MEDIA_BUTTONS[action]);
  });
}

export class GamepadActionMapper {
  #backHeldSince: number | null = null;
  #backForceSent = false;
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

    for (const action of ["select", "back", "home", ...MEDIA_ACTIONS] as const) {
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

    const backHeld = actionPressed(connected, "back");
    if (!backHeld) {
      this.#backHeldSince = null;
      this.#backForceSent = false;
    } else if (this.#backHeldSince === null) {
      this.#backHeldSince = now;
    } else if (!this.#backForceSent && now - this.#backHeldSince >= FORCE_HOME_HOLD_MS) {
      this.#backForceSent = true;
      actions.push("force-home");
    }

    return actions;
  }
}

export class GamepadInput {
  readonly #onAction: (action: RemoteAction) => void;
  readonly #onStatusChanged: (gamepads: readonly GamepadLike[]) => void;
  readonly #mapper = new GamepadActionMapper();
  #frame: number | null = null;
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
    window.addEventListener("gamepadconnected", this.#onConnectionChanged);
    window.addEventListener("gamepaddisconnected", this.#onConnectionChanged);
    const gamepads = this.#readGamepads();
    this.#reportStatus(gamepads);
    if (gamepads.length > 0) this.#schedulePoll();
  }

  readonly #onConnectionChanged = (): void => {
    if (!this.#running) return;
    const gamepads = this.#readGamepads();
    this.#reportStatus(gamepads);
    if (gamepads.length > 0) this.#schedulePoll();
    else if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
      this.#frame = null;
    }
  };

  #readGamepads(): GamepadLike[] {
    return Array.from(navigator.getGamepads())
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
  }

  #reportStatus(gamepads: readonly GamepadLike[]): void {
    const status = gamepads.map((gamepad) => `${gamepad.index}:${gamepad.id}`).join("|");
    if (status === this.#lastStatus) return;
    this.#lastStatus = status;
    this.#onStatusChanged(gamepads);
  }

  #schedulePoll(): void {
    if (!this.#running || this.#frame !== null) return;
    this.#frame = requestAnimationFrame((time) => this.#poll(time));
  }

  #poll(time: number): void {
    this.#frame = null;
    if (!this.#running) {
      return;
    }

    const gamepads = this.#readGamepads();
    this.#reportStatus(gamepads);

    for (const action of this.#mapper.update(gamepads, time)) {
      this.#onAction(action);
    }

    if (gamepads.length > 0) this.#schedulePoll();
  }
}
