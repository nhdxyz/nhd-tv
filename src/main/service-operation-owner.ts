export interface ServiceOperationToken {
  readonly generation: number;
}

export class ServiceOperationOwner {
  #generation = 0;

  begin(): ServiceOperationToken {
    this.#generation += 1;
    return Object.freeze({ generation: this.#generation });
  }

  owns(token: ServiceOperationToken): boolean {
    return token.generation === this.#generation;
  }

  throwIfSuperseded(token: ServiceOperationToken): void {
    if (!this.owns(token)) {
      throw new Error("Service operation was superseded");
    }
  }

  runIfOwned(token: ServiceOperationToken, action: () => void): boolean {
    if (!this.owns(token)) return false;
    action();
    return true;
  }
}
