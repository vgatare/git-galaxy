import * as THREE from "three";

import "./style.css";

import {
  GitHubError,
  fetchFullSnapshot,
  parseRepoInput,
  searchRepos,
  type FullRepoSnapshot,
  type RepoSearchResult,
  type RepoSlug,
} from "./github/api";
import { buildGalaxy } from "./galaxy/layout";
import type { GalaxyData } from "./galaxy/types";
import { createStage } from "./render/scene";
import { buildNebula } from "./render/nebula";
import { buildStarField, type StarFieldHandle } from "./render/stars";
import { buildConnections, type ConnectionsHandle } from "./render/connections";
import { Supernovas } from "./render/supernova";
import { createCameraRig } from "./interaction/camera";
import { StarPicker } from "./interaction/picking";
import { buildLegend, renderLegend } from "./ui/legend";
import { hideInfoPanel, renderInfoPanel } from "./ui/info";
import { createTimeline } from "./ui/timeline";
import { formatBytes, formatNumber } from "./ui/format";
import { createWarp } from "./render/warp";
import { createBlackHoleSystem } from "./render/blackhole";
import { createCometSystem } from "./render/comets";
import { createSonification } from "./audio/sonification";

// ---- DOM lookup helpers -------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const canvas = el<HTMLCanvasElement>("stage");
const repoForm = el<HTMLFormElement>("repo-form");
const repoInput = el<HTMLInputElement>("repo-input");
const searchResults = el<HTMLUListElement>("search-results");
const launchBtn = el<HTMLButtonElement>("launch-btn");
const loadingOverlay = el<HTMLDivElement>("loading");
const loadingText = el<HTMLDivElement>("loading-text");
const infoPanel = el<HTMLElement>("hud-info");
const infoName = el<HTMLElement>("info-name");
const infoPath = el<HTMLElement>("info-path");
const infoStats = el<HTMLElement>("info-stats");
const infoClose = el<HTMLButtonElement>("info-close");
const legendPanel = el<HTMLElement>("hud-legend");
const legendList = el<HTMLUListElement>("legend-list");
const metaEl = el<HTMLDivElement>("meta");
const metaRepo = el<HTMLDivElement>("meta-repo");
const metaStats = el<HTMLDivElement>("meta-stats");
const timelineContainer = el<HTMLDivElement>("timeline");
const timelineRange = el<HTMLInputElement>("timeline-range");
const timelineLabel = el<HTMLDivElement>("timeline-label");
const toast = el<HTMLDivElement>("toast");
const audioToggle = el<HTMLButtonElement>("audio-toggle");
const tokenBtn = el<HTMLButtonElement>("token-btn");
const tokenModal = el<HTMLDivElement>("token-modal");
const tokenInput = el<HTMLInputElement>("token-input");
const tokenSave = el<HTMLButtonElement>("token-save");
const tokenClear = el<HTMLButtonElement>("token-clear");
const tokenClose = el<HTMLButtonElement>("token-modal-close");
const tokenVisibility = el<HTMLButtonElement>("token-visibility");
const tokenStatus = el<HTMLDivElement>("token-status");

// ---- Toast --------------------------------------------------------------

let toastTimer: number | null = null;
function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.remove("hidden");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 4200);
}

// ---- Loading overlay ----------------------------------------------------

function setLoading(message: string | null): void {
  if (message) {
    loadingText.textContent = message;
    loadingOverlay.classList.remove("hidden");
  } else {
    loadingOverlay.classList.add("hidden");
  }
}

// ---- Three.js stage -----------------------------------------------------

const stage = createStage(canvas);
const cameraRig = createCameraRig(stage.camera, canvas);
const nebula = buildNebula();
stage.scene.add(nebula.mesh);

const supernovas = new Supernovas();
stage.scene.add(supernovas.group);

const warp = createWarp();
const blackHoles = createBlackHoleSystem();
const cometSystem = createCometSystem();
const sonification = createSonification();

// Insert custom post-processing (after bloom, before output)
stage.composer.insertPass(blackHoles.lensingPass, 2);
stage.composer.insertPass(warp.pass, 3);

stage.scene.add(blackHoles.group);
stage.scene.add(cometSystem.object);

audioToggle.addEventListener("click", () => {
  const enabled = sonification.toggle();
  audioToggle.classList.toggle("active", enabled);
  audioToggle.title = enabled ? "Mute ambient sound" : "Enable ambient sound";
});

// ---- Active state -------------------------------------------------------

interface ActiveScene {
  snapshot: FullRepoSnapshot;
  galaxy: GalaxyData;
  stars: StarFieldHandle;
  connections: ConnectionsHandle;
  picker: StarPicker;
  visibility: Float32Array;
  maxRadius: number;
}

let active: ActiveScene | null = null;
let highlightedIndex = -1;
let selectedIndex = -1;
let abortController: AbortController | null = null;

function clearScene(): void {
  if (!active) return;
  stage.scene.remove(active.stars.object);
  stage.scene.remove(active.connections.object);
  active.stars.dispose();
  active.connections.dispose();
  blackHoles.clearGalaxy();
  cometSystem.clear();
  active = null;
  highlightedIndex = -1;
  selectedIndex = -1;
  hideInfoPanel(infoPanel);
  legendPanel.classList.add("hidden");
  metaEl.classList.add("hidden");
  timelineCtrl.hide();
}

function setMeta(snapshot: FullRepoSnapshot, galaxy: GalaxyData): void {
  metaRepo.textContent = snapshot.meta.fullName;
  const parts = [
    `${formatNumber(galaxy.fileCount)} files`,
    `${formatNumber(galaxy.dirCount)} dirs`,
    `${formatBytes(galaxy.totalBytes)}`,
    `★ ${formatNumber(snapshot.meta.stars)}`,
  ];
  if (snapshot.truncated) parts.push("(tree truncated)");
  metaStats.textContent = parts.join(" · ");
  metaEl.classList.remove("hidden");
}

// ---- Timeline -----------------------------------------------------------

const timelineCtrl = createTimeline(
  timelineContainer,
  timelineRange,
  timelineLabel,
);

let lastScrubIndex = -1;
const tmpPos = new THREE.Vector3();

timelineCtrl.onScrub((commit, index) => {
  if (!active) return;
  if (index === lastScrubIndex) return;
  lastScrubIndex = index;

  // Map sha -> node index deterministically.
  let acc = 0;
  for (let i = 0; i < commit.sha.length; i++) {
    acc = (acc * 31 + commit.sha.charCodeAt(i)) >>> 0;
  }
  // Prefer files over root.
  const files = active.galaxy.nodes.filter((n) => n.kind === "file");
  if (files.length === 0) return;
  const targetNode = files[acc % files.length];
  const targetIdx = active.galaxy.byId.get(targetNode.id)!;
  active.stars.positionOf(targetIdx, tmpPos);
  supernovas.emit(tmpPos, targetNode.color, Math.max(8, targetNode.radius * 6));
  sonification.playSupernova();
});

// ---- Repo loading -------------------------------------------------------

function getStoredToken(): string | undefined {
  try {
    const t = window.localStorage.getItem("gh_token");
    return t && t.trim().length > 0 ? t.trim() : undefined;
  } catch {
    return undefined;
  }
}

function syncTokenButton(): void {
  tokenBtn.classList.toggle("has-token", !!getStoredToken());
}

// ---- Token modal --------------------------------------------------------

function setTokenStatus(msg: string, type: "success" | "error" | "info"): void {
  tokenStatus.textContent = msg;
  tokenStatus.className = `token-status ${type}`;
}

function openTokenModal(): void {
  const existing = getStoredToken();
  tokenInput.value = existing ?? "";
  tokenStatus.textContent = "";
  tokenStatus.className = "token-status";
  tokenModal.classList.remove("hidden");
  tokenInput.focus();
}

function closeTokenModal(): void {
  tokenModal.classList.add("hidden");
}

tokenBtn.addEventListener("click", openTokenModal);
tokenClose.addEventListener("click", closeTokenModal);
tokenModal.addEventListener("click", (e) => {
  if (e.target === tokenModal) closeTokenModal();
});

tokenVisibility.addEventListener("click", () => {
  const isPassword = tokenInput.type === "password";
  tokenInput.type = isPassword ? "text" : "password";
});

tokenSave.addEventListener("click", async () => {
  const val = tokenInput.value.trim();
  if (!val) {
    setTokenStatus("Enter a token first.", "error");
    return;
  }
  setTokenStatus("Verifying…", "info");
  try {
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${val}`,
    };
    const userRes = await fetch("https://api.github.com/user", { headers });
    if (userRes.ok) {
      const user = (await userRes.json()) as { login: string };
      window.localStorage.setItem("gh_token", val);
      syncTokenButton();
      setTokenStatus(`Authenticated as ${user.login}`, "success");
      return;
    }
    // Fine-grained tokens without read:user scope return 403 on /user
    // but still work for repo access. Verify via /rate_limit instead.
    if (userRes.status === 403) {
      const rlRes = await fetch("https://api.github.com/rate_limit", {
        headers,
      });
      if (rlRes.ok) {
        window.localStorage.setItem("gh_token", val);
        syncTokenButton();
        setTokenStatus("Token saved (repo access verified).", "success");
        return;
      }
    }
    setTokenStatus("Invalid token — GitHub rejected it.", "error");
  } catch {
    setTokenStatus("Network error verifying token.", "error");
  }
});

tokenClear.addEventListener("click", () => {
  window.localStorage.removeItem("gh_token");
  tokenInput.value = "";
  syncTokenButton();
  setTokenStatus("Token cleared.", "info");
});

syncTokenButton();

async function loadRepo(slug: RepoSlug): Promise<void> {
  if (abortController) abortController.abort();
  abortController = new AbortController();
  const signal = abortController.signal;

  launchBtn.disabled = true;
  setLoading(`Aiming for ${slug.owner}/${slug.name}…`);

  try {
    const snapshot = await fetchFullSnapshot(
      slug,
      { signal, token: getStoredToken() },
      (msg) => setLoading(msg),
    );
    if (signal.aborted) return;

    setLoading("Composing constellations…");
    // Allow paint of overlay before heavy work.
    await new Promise((r) => requestAnimationFrame(r));

    const galaxy = buildGalaxy(snapshot.tree);
    if (signal.aborted) return;

    clearScene();

    const stars = buildStarField(galaxy);
    const connections = buildConnections(galaxy);
    stage.scene.add(connections.object);
    stage.scene.add(stars.object);

    const picker = new StarPicker(stage.camera, galaxy);
    picker.setViewport(window.innerWidth, window.innerHeight);

    const visibility = new Float32Array(galaxy.nodes.length).fill(1);

    let maxRadius = 0;
    for (const n of galaxy.nodes) {
      const r = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
      if (r > maxRadius) maxRadius = r;
    }

    active = {
      snapshot,
      galaxy,
      stars,
      connections,
      picker,
      visibility,
      maxRadius,
    };

    setMeta(snapshot, galaxy);

    const legendEntries = buildLegend(galaxy);
    renderLegend(legendList, legendEntries);
    legendPanel.classList.remove("hidden");

    if (snapshot.commits.length > 0) {
      timelineCtrl.setCommits(snapshot.commits);
    } else {
      timelineCtrl.hide();
    }

    blackHoles.setGalaxy(galaxy);
    cometSystem.setGalaxy(galaxy);
    sonification.setGalaxy(galaxy.nodes);

    cameraRig.cinematicEntrance(maxRadius);

    // Update URL so the view is shareable.
    const url = new URL(window.location.href);
    url.searchParams.set("repo", `${slug.owner}/${slug.name}`);
    window.history.replaceState({}, "", url.toString());

    if (snapshot.truncated) {
      showToast(
        "This repository is large; the tree was truncated by the GitHub API.",
      );
    }
  } catch (err) {
    if (signal.aborted) return;
    let msg = "Failed to load repository.";
    if (err instanceof GitHubError) {
      if (err.status === 403) {
        msg = "GitHub rate-limited the request. Try again in a minute.";
      } else if (err.status === 404) {
        msg = getStoredToken()
          ? "Repository not found, or your token lacks access."
          : "Repository not found or private. Click \uD83D\uDD11 to add a GitHub token for private repos.";
      } else {
        msg = `GitHub error: ${err.message}`;
      }
    } else if (err instanceof Error) {
      msg = err.message;
    }
    showToast(msg);
  } finally {
    setLoading(null);
    launchBtn.disabled = false;
  }
}

// ---- Repo search dropdown -----------------------------------------------

let searchSeq = 0;
let searchDebounce: number | null = null;
let searchItems: RepoSearchResult[] = [];
let searchActive = -1;

function closeSearch(): void {
  searchResults.classList.add("hidden");
  repoInput.setAttribute("aria-expanded", "false");
  searchItems = [];
  searchActive = -1;
}

function renderSearchMessage(msg: string): void {
  searchResults.innerHTML = "";
  const li = document.createElement("li");
  li.className = "sr-empty";
  li.textContent = msg;
  searchResults.appendChild(li);
  searchResults.classList.remove("hidden");
  repoInput.setAttribute("aria-expanded", "true");
}

function renderSearchResults(items: RepoSearchResult[]): void {
  searchItems = items;
  searchActive = -1;
  if (items.length === 0) {
    renderSearchMessage("No repositories found.");
    return;
  }
  searchResults.innerHTML = "";
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.index = String(i);

    const top = document.createElement("div");
    top.className = "sr-top";
    const name = document.createElement("span");
    name.className = "sr-name";
    name.textContent = item.fullName;
    top.appendChild(name);
    if (item.isPrivate) {
      const badge = document.createElement("span");
      badge.className = "sr-badge";
      badge.textContent = "private";
      top.appendChild(badge);
    }
    if (item.language) {
      const lang = document.createElement("span");
      lang.className = "sr-lang";
      lang.textContent = item.language;
      top.appendChild(lang);
    }
    const stars = document.createElement("span");
    stars.className = "sr-stars";
    stars.textContent = `★ ${formatNumber(item.stars)}`;
    top.appendChild(stars);
    li.appendChild(top);

    if (item.description) {
      const desc = document.createElement("div");
      desc.className = "sr-desc";
      desc.textContent = item.description;
      li.appendChild(desc);
    }

    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      chooseSearchItem(item);
    });
    searchResults.appendChild(li);
  });
  searchResults.classList.remove("hidden");
  repoInput.setAttribute("aria-expanded", "true");
}

function chooseSearchItem(item: RepoSearchResult): void {
  repoInput.value = item.fullName;
  closeSearch();
  void loadRepo({ owner: item.owner, name: item.name });
}

function highlightSearch(next: number): void {
  const lis = searchResults.querySelectorAll<HTMLLIElement>("li[data-index]");
  if (lis.length === 0) return;
  searchActive = ((next % lis.length) + lis.length) % lis.length;
  lis.forEach((li, i) => {
    li.classList.toggle("active", i === searchActive);
    if (i === searchActive) li.scrollIntoView({ block: "nearest" });
  });
}

function runSearch(raw: string): void {
  const query = raw.trim();
  // If it already parses as an explicit repo reference, don't search.
  if (!query || parseRepoInput(query)) {
    closeSearch();
    return;
  }
  const seq = ++searchSeq;
  renderSearchMessage("Searching…");
  searchRepos(query, { token: getStoredToken() })
    .then((items) => {
      if (seq !== searchSeq) return; // stale response
      renderSearchResults(items);
    })
    .catch((err) => {
      if (seq !== searchSeq) return;
      const msg =
        err instanceof GitHubError && err.status === 403
          ? "GitHub rate-limited search. Add a token via 🔑."
          : "Search failed. Try again.";
      renderSearchMessage(msg);
    });
}

repoInput.addEventListener("input", () => {
  if (searchDebounce) window.clearTimeout(searchDebounce);
  const value = repoInput.value;
  searchDebounce = window.setTimeout(() => runSearch(value), 280);
});

repoInput.addEventListener("keydown", (e) => {
  const open = !searchResults.classList.contains("hidden");
  if (e.key === "ArrowDown") {
    if (open) {
      e.preventDefault();
      highlightSearch(searchActive + 1);
    }
  } else if (e.key === "ArrowUp") {
    if (open) {
      e.preventDefault();
      highlightSearch(searchActive - 1);
    }
  } else if (e.key === "Enter") {
    if (open && searchActive >= 0 && searchItems[searchActive]) {
      e.preventDefault();
      chooseSearchItem(searchItems[searchActive]);
    }
  } else if (e.key === "Escape") {
    if (open) {
      e.preventDefault();
      closeSearch();
    }
  }
});

repoInput.addEventListener("focus", () => {
  if (searchItems.length > 0) searchResults.classList.remove("hidden");
});

document.addEventListener("click", (e) => {
  if (!searchResults.contains(e.target as Node) && e.target !== repoInput) {
    closeSearch();
  }
});

// ---- Form handling ------------------------------------------------------

repoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  closeSearch();
  const slug = parseRepoInput(repoInput.value);
  if (!slug) {
    // Not a direct owner/repo; treat Enter as "load top search result".
    if (searchItems.length > 0) {
      chooseSearchItem(searchItems[0]);
      return;
    }
    showToast("Search for a repo, or enter owner/repo or a github.com URL.");
    return;
  }
  void loadRepo(slug);
});

document.querySelectorAll<HTMLButtonElement>(".suggest").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.repo ?? "";
    const slug = parseRepoInput(target);
    if (!slug) return;
    repoInput.value = `${slug.owner}/${slug.name}`;
    void loadRepo(slug);
  });
});

infoClose.addEventListener("click", () => {
  hideInfoPanel(infoPanel);
  if (active && selectedIndex >= 0) {
    active.stars.setSizeMultiplier(selectedIndex, 1);
  }
  selectedIndex = -1;
  if (active) {
    active.stars.setHighlight(-1);
  }
});

// ---- Mouse interaction --------------------------------------------------

const mouse = { x: 0, y: 0, inside: false };

canvas.addEventListener("pointermove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.inside = true;
});

canvas.addEventListener("pointerleave", () => {
  mouse.inside = false;
  if (active && highlightedIndex >= 0 && highlightedIndex !== selectedIndex) {
    active.stars.setSizeMultiplier(highlightedIndex, 1);
  }
  highlightedIndex = -1;
  if (active && selectedIndex < 0) active.stars.setHighlight(-1);
});

let lastDownX = 0;
let lastDownY = 0;
canvas.addEventListener("pointerdown", (e) => {
  lastDownX = e.clientX;
  lastDownY = e.clientY;
});

canvas.addEventListener("pointerup", (e) => {
  if (!active) return;
  const dx = e.clientX - lastDownX;
  const dy = e.clientY - lastDownY;
  if (dx * dx + dy * dy > 25) return; // dragged, not clicked
  active.picker.refresh();
  const idx = active.picker.pick(e.clientX, e.clientY, active.visibility);
  if (idx < 0) return;
  selectStar(idx);
});

function selectStar(idx: number): void {
  if (!active) return;
  if (selectedIndex >= 0 && selectedIndex !== idx) {
    active.stars.setSizeMultiplier(selectedIndex, 1);
  }
  selectedIndex = idx;
  active.stars.setHighlight(idx);
  active.stars.setSizeMultiplier(idx, 1.8);
  const node = active.galaxy.nodes[idx];
  renderInfoPanel(infoPanel, infoName, infoPath, infoStats, node, active.snapshot.meta);
  active.stars.positionOf(idx, tmpPos);
  cameraRig.focusOn(tmpPos, Math.max(12, node.radius * 8));
  // Emit a small supernova on selection.
  supernovas.emit(tmpPos, node.color, Math.max(6, node.radius * 4));
  warp.activate(0.8);
  sonification.playSelect();
  sonification.playWarp();
}

// ---- Keyboard shortcut --------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (selectedIndex >= 0 && active) {
      active.stars.setSizeMultiplier(selectedIndex, 1);
      active.stars.setHighlight(-1);
      selectedIndex = -1;
    }
    hideInfoPanel(infoPanel);
  } else if (e.key === "r" || e.key === "R") {
    if (active) cameraRig.resetView(active.maxRadius);
  } else if (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    repoInput.focus();
    repoInput.select();
  }
});

// ---- Resize -------------------------------------------------------------

function onResize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  stage.resize(w, h);
  nebula.resize(w, h);
  if (active) {
    active.picker.setViewport(w, h);
    active.stars.material.uniforms.uViewport.value = h * 0.5;
    active.stars.material.uniforms.uPixelRatio.value = Math.min(
      2,
      window.devicePixelRatio || 1,
    );
  }
}
window.addEventListener("resize", onResize);

// ---- Animation loop -----------------------------------------------------

const clock = new THREE.Clock();
let frameCount = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, clock.getDelta());
  const t = clock.elapsedTime;

  nebula.tick(t);
  cameraRig.tick(dt);
  supernovas.tick(dt, stage.camera.quaternion);

  warp.tick(dt, t);
  blackHoles.tick(t, stage.camera, window.innerWidth, window.innerHeight);
  cometSystem.tick(dt);
  sonification.tick(
    stage.camera.position.x,
    stage.camera.position.y,
    stage.camera.position.z,
  );

  if (active) {
    active.stars.tick(t);

    // Cheap hover picking every other frame.
    if (mouse.inside && frameCount % 2 === 0) {
      active.picker.refresh();
      const idx = active.picker.pick(mouse.x, mouse.y, active.visibility);
      if (idx !== highlightedIndex) {
        if (
          highlightedIndex >= 0 &&
          highlightedIndex !== selectedIndex
        ) {
          active.stars.setSizeMultiplier(highlightedIndex, 1);
        }
        highlightedIndex = idx;
        if (idx >= 0) {
          if (idx !== selectedIndex) {
            active.stars.setSizeMultiplier(idx, 1.5);
          }
          if (selectedIndex < 0) active.stars.setHighlight(idx);
          canvas.style.cursor = "pointer";
        } else {
          if (selectedIndex < 0) active.stars.setHighlight(-1);
          canvas.style.cursor = "";
        }
      }
    }
  }

  stage.composer.render(dt);
  frameCount++;
}

// ---- Boot ---------------------------------------------------------------

function bootstrap(): void {
  onResize();
  animate();

  const params = new URLSearchParams(window.location.search);
  const initial = params.get("repo") ?? "mrdoob/three.js";
  const slug = parseRepoInput(initial);
  if (slug) {
    repoInput.value = `${slug.owner}/${slug.name}`;
    void loadRepo(slug);
  }
}

bootstrap();
