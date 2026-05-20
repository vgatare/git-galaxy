import { colorForPath } from "../galaxy/colors";
import type { GalaxyData } from "../galaxy/types";

interface LegendEntry {
  language: string;
  color: string;
  count: number;
}

export function buildLegend(galaxy: GalaxyData): LegendEntry[] {
  const counts = new Map<string, { count: number; color: string }>();
  for (const node of galaxy.nodes) {
    if (node.kind !== "file") continue;
    const existing = counts.get(node.language);
    if (existing) {
      existing.count++;
    } else {
      counts.set(node.language, {
        count: 1,
        color: colorForPath(node.path, false),
      });
    }
  }
  const entries: LegendEntry[] = [];
  for (const [language, { count, color }] of counts) {
    entries.push({ language, color, count });
  }
  entries.sort((a, b) => b.count - a.count);
  return entries;
}

export function renderLegend(
  list: HTMLUListElement,
  entries: LegendEntry[],
  maxEntries = 14,
): void {
  list.innerHTML = "";
  const visible = entries.slice(0, maxEntries);
  for (const e of visible) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = e.color;
    dot.style.color = e.color;
    const label = document.createElement("span");
    label.textContent = e.language;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = e.count.toString();
    li.append(dot, label, count);
    list.append(li);
  }
  if (entries.length > maxEntries) {
    const rest = entries
      .slice(maxEntries)
      .reduce((acc, e) => acc + e.count, 0);
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = "#666";
    dot.style.color = "#666";
    const label = document.createElement("span");
    label.textContent = `+${entries.length - maxEntries} more`;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = rest.toString();
    li.append(dot, label, count);
    list.append(li);
  }
}
