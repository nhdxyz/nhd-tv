import { siNetflix, siYoutube } from "simple-icons";

interface BrandDefinition {
  path?: string;
  presentation: "icon" | "monogram" | "wordmark";
  value: string;
}

const brands: Readonly<Record<string, BrandDefinition>> = {
  "disney-plus": {
    presentation: "wordmark",
    value: "Disney+"
  },
  netflix: {
    path: siNetflix.path,
    presentation: "icon",
    value: "Netflix"
  },
  "shaka-demo": {
    presentation: "monogram",
    value: "S"
  },
  youtube: {
    path: siYoutube.path,
    presentation: "icon",
    value: "YouTube"
  }
};

function brandFor(serviceId: string, serviceName: string): BrandDefinition {
  return brands[serviceId] ?? {
    presentation: "monogram",
    value: serviceName.slice(0, 1).toUpperCase()
  };
}

function iconElement(serviceId: string, brand: BrandDefinition): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "service-logo";
  wrapper.dataset.brand = serviceId;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", brand.path ?? "");
  svg.append(path);
  wrapper.append(svg);
  return wrapper;
}

export function createServiceMark(serviceId: string, serviceName: string): HTMLElement {
  const brand = brandFor(serviceId, serviceName);

  if (brand.presentation === "icon") {
    return iconElement(serviceId, brand);
  }

  const mark = document.createElement("span");
  mark.dataset.brand = serviceId;

  if (brand.presentation === "wordmark") {
    mark.className = "service-wordmark";
    mark.textContent = brand.value;
    return mark;
  }

  mark.className = "service-monogram";
  mark.textContent = brand.value;
  return mark;
}

export function createServiceLockup(serviceId: string, serviceName: string): HTMLElement {
  const brand = brandFor(serviceId, serviceName);
  const lockup = document.createElement("span");
  lockup.className = "featured-lockup";

  if (brand.presentation === "wordmark") {
    lockup.append(createServiceMark(serviceId, serviceName));
    return lockup;
  }

  lockup.append(createServiceMark(serviceId, serviceName));
  const name = document.createElement("span");
  name.className = "featured-service-name";
  name.textContent = serviceName;
  lockup.append(name);
  return lockup;
}
