import type { CommitSummary } from "../github/types";
import { formatRelative } from "./format";

export interface TimelineController {
  setCommits(commits: CommitSummary[]): void;
  hide(): void;
  onScrub(handler: (commit: CommitSummary, index: number) => void): void;
}

export function createTimeline(
  container: HTMLElement,
  range: HTMLInputElement,
  label: HTMLElement,
): TimelineController {
  let commits: CommitSummary[] = [];
  let scrubHandler: ((c: CommitSummary, index: number) => void) | null = null;

  function update() {
    if (commits.length === 0) {
      container.classList.add("hidden");
      return;
    }
    const idx = parseInt(range.value, 10);
    const clamped = Math.max(0, Math.min(commits.length - 1, idx));
    const commit = commits[clamped];
    if (!commit) return;
    const short = commit.sha.slice(0, 7);
    label.textContent = `${short} · ${formatRelative(commit.date)}`;
    label.title = commit.message;
    if (scrubHandler) scrubHandler(commit, clamped);
  }

  range.addEventListener("input", update);

  return {
    setCommits(next) {
      commits = next.slice().sort((a, b) => {
        // ascending by date (oldest first)
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      if (commits.length === 0) {
        container.classList.add("hidden");
        return;
      }
      container.classList.remove("hidden");
      range.min = "0";
      range.max = String(commits.length - 1);
      range.value = String(commits.length - 1);
      update();
    },
    hide() {
      container.classList.add("hidden");
    },
    onScrub(handler) {
      scrubHandler = handler;
    },
  };
}
