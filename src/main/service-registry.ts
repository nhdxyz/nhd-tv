import {
  assertValidServiceDefinition,
  type ServiceDefinition
} from "./security/navigation-policy";

const services: readonly ServiceDefinition[] = [
  {
    allowedOrigins: ["https://shaka-project.github.io"],
    id: "shaka-demo",
    name: "Shaka Player DRM Demo",
    partition: "persist:service-shaka-demo",
    startUrl: "https://shaka-project.github.io/shaka-player-release/demo/"
  }
];

for (const service of services) {
  assertValidServiceDefinition(service);
}

export function getServiceDefinition(serviceId: string): ServiceDefinition | null {
  return services.find((service) => service.id === serviceId) ?? null;
}

export function getServiceDefinitions(): readonly ServiceDefinition[] {
  return services;
}
