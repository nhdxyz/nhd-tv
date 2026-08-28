import {
  isAllowedServiceUrl,
  type ServiceDefinition
} from "../security/navigation-policy";
import type { ServiceOperationToken } from "../service-operation-owner";
import type { VoiceCommandPlan } from "./voice-command-router";
import { voiceProviderDestinationRoute } from "./voice-provider-destination";

export type VoiceProviderDestinationPlan = Extract<
  VoiceCommandPlan,
  { kind: "open-provider-destination" }
>;

export interface VoiceProviderDestinationExecutionHost {
  readonly activeServiceId: string | null;
  readonly isBackgrounded: boolean;
  navigate(
    url: string,
    signal?: AbortSignal,
    operationToken?: ServiceOperationToken
  ): Promise<void>;
  restoreFromHome(): boolean;
}

export interface VoiceProviderDestinationExecutionOptions {
  enabledServiceIds: readonly string[];
  getServiceDefinition: (serviceId: string) => ServiceDefinition | null;
  host: VoiceProviderDestinationExecutionHost | null;
  onProgress?: (detail: string) => void;
  openService: (
    definition: ServiceDefinition,
    initialUrl: string,
    signal?: AbortSignal,
    operationToken?: ServiceOperationToken
  ) => Promise<void>;
  operationToken?: ServiceOperationToken;
  signal?: AbortSignal;
}

export interface VoiceProviderDestinationExecutionResult {
  detail: string;
  handled: boolean;
}

/** Executes a planned destination only after revalidating its fixed route and enabled service. */
export async function executeVoiceProviderDestination(
  plan: VoiceProviderDestinationPlan,
  options: VoiceProviderDestinationExecutionOptions
): Promise<VoiceProviderDestinationExecutionResult> {
  options.signal?.throwIfAborted();
  if (!options.enabledServiceIds.includes(plan.serviceId)) {
    return {
      detail: `${plan.serviceName} is not enabled in this profile.`,
      handled: false
    };
  }

  const route = voiceProviderDestinationRoute(plan.serviceId, plan.destination);
  const definition = options.getServiceDefinition(plan.serviceId);
  if (
    route === null ||
    definition === null ||
    definition.id !== route.serviceId ||
    !isAllowedServiceUrl(
      route.url,
      definition.allowedOrigins,
      definition.allowedSubdomainHosts
    )
  ) {
    return {
      detail: `${plan.serviceName} cannot open that destination safely.`,
      handled: false
    };
  }
  if (options.host === null) {
    return { detail: "The service host is not ready.", handled: false };
  }

  options.onProgress?.(`Opening ${definition.name} ${route.destination}…`);
  if (options.host.activeServiceId === route.serviceId) {
    if (options.host.isBackgrounded && !options.host.restoreFromHome()) {
      return {
        detail: `${definition.name} could not be restored from the background.`,
        handled: false
      };
    }
    options.signal?.throwIfAborted();
    await options.host.navigate(route.url, options.signal, options.operationToken);
  } else {
    await options.openService(
      definition,
      route.url,
      options.signal,
      options.operationToken
    );
  }
  options.signal?.throwIfAborted();
  return {
    detail: `Opened your ${route.destination} on ${definition.name}.`,
    handled: true
  };
}
