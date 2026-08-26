import type {
  ServiceFailureKind,
  ServiceRecoveryRequest
} from "./contracts";

const OFFLINE_ERROR_CODES = new Set([
  -109, // ERR_ADDRESS_UNREACHABLE
  -106, // ERR_INTERNET_DISCONNECTED
  -105, // ERR_NAME_NOT_RESOLVED
  -102  // ERR_CONNECTION_REFUSED
]);

export function classifyServiceFailure(
  fallback: Exclude<ServiceFailureKind, "offline">,
  online: boolean,
  errorCode?: number
): ServiceFailureKind {
  if (!online || (errorCode !== undefined && OFFLINE_ERROR_CODES.has(errorCode))) {
    return "offline";
  }

  return fallback;
}

export function serviceRecoveryRequest(
  kind: ServiceFailureKind,
  serviceId: string,
  serviceName: string
): ServiceRecoveryRequest {
  const detail: Record<ServiceFailureKind, string> = {
    crashed: `${serviceName} stopped unexpectedly. Your local sign-in data is still intact.`,
    "load-failed": `${serviceName} could not load this page. You can retry it or reopen the app home page.`,
    offline: `NHD-TV could not reach ${serviceName}. Check this computer's connection, then try again.`,
    "resume-failed": `${serviceName} did not recover after this computer woke up.`,
    unresponsive: `${serviceName} stopped responding. NHD-TV returned control to the television shell.`
  };

  return { detail: detail[kind], kind, serviceId, serviceName };
}
