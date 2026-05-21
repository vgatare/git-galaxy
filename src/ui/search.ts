import type { GalaxyData, GalaxyNode } from "../galaxy/types";

export interface SearchHit {
  node: GalaxyNode;
  score: number;
}

const MAX_HITS = 12;

/**
 * Naive but fast fuzzy-ish search. Ranks by:
 *  - exact basename match (best)
 *  - basename prefix
 *  - basename substring
 *  - path substring
 * Files outrank directories of equal match quality.
 */
export function searchNodes(galaxy: GalaxyData, raw: string): SearchHit[] {
  const q = raw.trim().toLowerCase();
  if (q.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const node of galaxy.nodes) {
    if (node.depth === 0) continue;
    const name = node.name.toLowerCase();
    const path = node.path.toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80 - (name.length - q.length) * 0.5;
    else if (name.includes(q)) score = 60 - (name.length - q.length) * 0.3;
    else if (path.includes(q)) score = 40 - (path.length - q.length) * 0.15;
    if (score <= 0) continue;
    if (node.kind === "dir") score -= 8;
    score -= node.depth * 0.5;
    hits.push({ node, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, MAX_HITS);
}

export interface SearchUI {
  setEnabled(enabled: boolean): void;
  setGalaxy(galaxy: GalaxyData | null): void;
  /** Called when the user picks a hit (Enter or click). */
  onPick(handler: (hit: SearchHit) => void): void;
}

export function createSearch(
  input: HTMLInputElement,
  results: HTMLElement,
): SearchUI {
  let galaxy: GalaxyData | null = null;
  let pickHandler: ((hit: SearchHit) => void) | null = null;
  let currentHits: SearchHit[] = [];
  let activeIdx = -1;

  function render() {
    if (currentHits.length === 0) {
      if (input.value.trim().length === 0) {
        results.classList.add("hidden");
        results.innerHTML = "";
        return;
      }
      results.classList.remove("hidden");
      results.innerHTML = `<div class="empty">No matches.</div>`;
      return;
    }
    results.classList.remove("hidden");
    const html = currentHits
      .map((hit, i) => {
        const cls = i === activeIdx ? "item active" : "item";
        return `
          <div class="${cls}" data-index="${i}" role="option" aria-selected="${i === activeIdx}">
            <span class="swatch" style="background:${hit.node.color}; color:${hit.node.color}"></span>
            <span class="name">${escape(hit.node.name)}</span>
            <span class="path">${escape(hit.node.path)}</span>
          </div>
        `;
      })
      .join("");
    results.innerHTML = html;
    for (const el of Array.from(results.querySelectorAll<HTMLElement>(".item"))) {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const idx = Number(el.dataset.index);
        if (Number.isFinite(idx) && currentHits[idx] && pickHandler) {
          pickHandler(currentHits[idx]);
          hide();
        }
      });
    }
  }

  function hide() {
    results.classList.add("hidden");
  }

  function update() {
    if (!galaxy) {
      currentHits = [];
      hide();
      return;
    }
    currentHits = searchNodes(galaxy, input.value);
    activeIdx = currentHits.length > 0 ? 0 : -1;
    render();
  }

  input.addEventListener("input", update);
  input.addEventListener("focus", () => {
    if (input.value.trim().length > 0) update();
  });
  input.addEventListener("blur", () => {
    // Tiny delay so click handlers in the dropdown fire first.
    window.setTimeout(hide, 120);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentHits.length === 0) return;
      activeIdx = (activeIdx + 1) % currentHits.length;
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentHits.length === 0) return;
      activeIdx = (activeIdx - 1 + currentHits.length) % currentHits.length;
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && currentHits[activeIdx] && pickHandler) {
        pickHandler(currentHits[activeIdx]);
        hide();
      }
    } else if (e.key === "Escape") {
      // Stop bubbling so the global Escape handler doesn't also clear the
      // selected star / info panel — Esc in the search only closes the dropdown.
      e.stopPropagation();
      hide();
      input.blur();
    }
  });

  return {
    setEnabled(enabled) {
      input.disabled = !enabled;
      if (!enabled) {
        input.value = "";
        hide();
      }
    },
    setGalaxy(g) {
      galaxy = g;
      input.value = "";
      currentHits = [];
      activeIdx = -1;
      hide();
    },
    onPick(handler) {
      pickHandler = handler;
    },
  };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
