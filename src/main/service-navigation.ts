export interface ServiceBackState {
  editable: boolean;
  expanded: number;
  overlays: number;
  url: string;
}

export function serviceConsumedBack(
  before: ServiceBackState,
  after: ServiceBackState
): boolean {
  return before.editable ||
    after.url !== before.url ||
    after.overlays < before.overlays ||
    after.expanded < before.expanded;
}
