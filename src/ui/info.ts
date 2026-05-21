import type { GalaxyNode } from "../galaxy/types";
import type { RepoMeta } from "../github/types";
import { formatBytes, formatNumber } from "./format";

export interface InfoPanelHooks {
  /** Click handler for the path → opens the in-galaxy viewer. */
  onOpen(): void;
}

export function renderInfoPanel(
  panel: HTMLElement,
  nameEl: HTMLElement,
  pathEl: HTMLElement,
  statsEl: HTMLElement,
  node: GalaxyNode,
  meta: RepoMeta,
  hooks: InfoPanelHooks,
): void {
  panel.classList.remove("hidden");
  nameEl.textContent = node.name || meta.fullName;

  pathEl.innerHTML = "";
  const a = document.createElement("button");
  a.type = "button";
  a.className = "info-path-button";
  a.textContent = node.path || meta.fullName;
  a.title = "Open contents in viewer";
  a.addEventListener("click", () => hooks.onOpen());
  pathEl.appendChild(a);

  const rows: Array<{ label: string; value: string; swatch?: string }> = [];
  if (node.kind === "file") {
    rows.push({ label: "Type", value: "file" });
    rows.push({
      label: "Language",
      value: node.language,
      swatch: node.color,
    });
    rows.push({ label: "Size", value: formatBytes(node.size) });
  } else {
    rows.push({ label: "Type", value: "directory" });
    rows.push({ label: "Files", value: formatNumber(node.subtreeCount) });
    rows.push({
      label: "Total size",
      value: formatBytes(node.subtreeSize),
    });
    rows.push({ label: "Depth", value: node.depth.toString() });
  }

  statsEl.innerHTML = "";
  for (const row of rows) {
    const div = document.createElement("div");
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = row.label;
    const value = document.createElement("span");
    value.className = "value";
    if (row.swatch) {
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = row.swatch;
      sw.style.color = row.swatch;
      value.appendChild(sw);
    }
    value.appendChild(document.createTextNode(row.value));
    div.append(label, value);
    statsEl.appendChild(div);
  }
}

export function hideInfoPanel(panel: HTMLElement): void {
  panel.classList.add("hidden");
}
