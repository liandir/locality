import { thinkingPresentation, workPresentationForTurn } from "./workPresentation.js";

type TimelinePart = { id: string; startedAt?: number } & (
  | { kind: "text"; text: string }
  | { kind: "thought"; live: boolean }
  | { kind: "tool" | "steering" | "summary" | "abort" }
);

interface TimelineMessage<P extends TimelinePart> {
  id: string;
  parts: P[];
  workStartedAt?: number;
  workEndedAt?: number;
  workGroupExpanded?: Map<string, boolean>;
}

export interface ResolvedUnit<P extends TimelinePart> {
  kind: "work" | "inline";
  groupId?: string;
  parts: P[];
  expanded: boolean;
  live?: boolean;
  liveStatus?: string;
  collapsible?: boolean;
  conglomerate?: boolean;
  children?: ResolvedUnit<P>[];
  startedAt?: number;
  endedAt?: number;
}

/**
 * Split an assistant message's parts into chronological render units. Every
 * run of work before a model text output gets its own disclosure group. During
 * a live turn the top-level Worked-for summary is absent: completed sessions
 * stay collapsed, while the active session shows its current activity until
 * another tool or a following status switches it to the live summary. Once
 * the turn settles, every session moves under one collapsed Worked-for summary.
 */
export function resolveWorkTimeline<P extends TimelinePart>(m: TimelineMessage<P>, presentation: {
  showThinking: boolean;
  serverPending?: string;
  liveStatus?: string;
}): ResolvedUnit<P>[] {
  const parts = m.parts.filter(part => !isBlankTextPart(part)
    && (part.kind !== "thought" || thinkingPresentation(presentation.showThinking, part.live).visible));
  const turnLive = isAssistantTurnLive(m);
  const workPresentation = workPresentationForTurn(turnLive);
  if (!parts.some(isWorkPart)) {
    const inlineUnits: ResolvedUnit<P>[] = parts.map(part => ({
      kind: "inline" as const,
      parts: [part],
      expanded: false
    }));
    return wrapTurnWorkSummary(m, parts, inlineUnits);
  }

  const units: ResolvedUnit<P>[] = [];
  let workParts: P[] = [];
  let sessionIndex = 0;
  const flushWork = (endedAt: number | undefined, live: boolean): void => {
    if (workParts.length === 0) return;
    const stableId = `${m.id}:worked:${sessionIndex++}`;
    // Changing identity when the live session settles makes it collapse again,
    // even when the user had expanded it while watching the tools run.
    const groupId = live ? `${stableId}:live` : stableId;
    const firstPartStart = partStartedAt(workParts[0]);
    const startedAt = sessionIndex === 1 ? (m.workStartedAt ?? firstPartStart) : firstPartStart;
    const currentPart = workParts.at(-1);
    const liveStatus = live
      ? presentation.liveStatus
        ?? (!presentation.serverPending && currentPart?.kind === "thought" && currentPart.live ? "Thinking" : undefined)
      : undefined;
    units.push({
      kind: "work",
      groupId,
      parts: workParts,
      expanded: workPresentation.expandSessions ? true : (m.workGroupExpanded?.get(groupId) ?? false),
      live,
      liveStatus,
      collapsible: workPresentation.sessionsCollapsible,
      startedAt,
      endedAt
    });
    workParts = [];
  };

  for (const part of parts) {
    if (isWorkPart(part)) {
      workParts.push(part);
      continue;
    }
    flushWork(partStartedAt(part), false);
    units.push({ kind: "inline", parts: [part], expanded: false });
  }
  const trailingLive = workParts.length > 0 && isAssistantTurnLive(m);
  flushWork(trailingLive ? undefined : m.workEndedAt, trailingLive);
  return wrapTurnWorkSummary(m, parts, units);
}

function wrapTurnWorkSummary<P extends TimelinePart>(m: TimelineMessage<P>, parts: P[], units: ResolvedUnit<P>[]): ResolvedUnit<P>[] {
  if (m.workStartedAt === undefined) return units;
  if (!parts.some(part => isWorkPart(part) || part.kind === "steering")) return units;
  const live = isAssistantTurnLive(m);
  if (!workPresentationForTurn(live).showTurnSummary) return units;
  const finalPartIndex = lastFinalOutputIndex(parts);
  const finalPart = finalPartIndex >= 0 ? parts[finalPartIndex] : undefined;
  const finalUnitIndex = finalPart
    ? units.findIndex(unit => unit.kind === "inline" && unit.parts[0]?.id === finalPart.id)
    : -1;
  const hasTrailingAnswer = finalUnitIndex >= 0 && finalUnitIndex === units.length - 1;
  const children = hasTrailingAnswer ? units.slice(0, finalUnitIndex) : units;
  const outputUnits = hasTrailingAnswer ? units.slice(finalUnitIndex) : [];
  const stableId = `${m.id}:worked:all`;
  const summary: ResolvedUnit<P> = {
    kind: "work",
    groupId: stableId,
    parts: children.flatMap(unit => unit.parts),
    children,
    conglomerate: true,
    expanded: m.workGroupExpanded?.get(stableId) ?? false,
    live: false,
    startedAt: m.workStartedAt,
    endedAt: (hasTrailingAnswer && finalPart ? partStartedAt(finalPart) : undefined) ?? m.workEndedAt
  };
  return [summary, ...outputUnits];
}

/** Final text and terminal aborts remain visible outside collapsed work. */
function lastFinalOutputIndex(parts: TimelinePart[]): number {
  for (let index = parts.length - 1; index >= 0; index--) {
    if (parts[index].kind === "text" || parts[index].kind === "abort") return index;
  }
  return -1;
}

export function partStartedAt(part: TimelinePart): number | undefined {
  return part.kind === "text" || part.kind === "thought" || part.kind === "tool" || part.kind === "steering"
    ? part.startedAt
    : undefined;
}

export function isWorkPart<P extends { kind: string }>(part: P): part is Extract<P, { kind: "thought" | "tool" }> {
  return part.kind === "thought" || part.kind === "tool";
}

export function isAssistantTurnLive(m: { workStartedAt?: number; workEndedAt?: number }): boolean {
  return m.workEndedAt === undefined && m.workStartedAt !== undefined;
}

function isBlankTextPart(part: TimelinePart): boolean {
  return part.kind === "text" && !part.text.trim();
}
