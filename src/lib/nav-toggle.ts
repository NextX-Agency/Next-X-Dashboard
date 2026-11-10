/**
 * Sidebar groups the user opened or closed by hand, keyed by group id.
 * A group with no entry follows the page: open when it holds the current page.
 */
export type NavToggles = Record<string, boolean>;

export function isGroupOpen(
  toggles: NavToggles,
  groupId: string,
  currentGroup: string | undefined,
): boolean {
  return toggles[groupId] ?? groupId === currentGroup;
}

/**
 * After navigating, drop any manual choice for the group that now holds the current page,
 * so the active link is never hidden inside a group closed earlier. Other groups keep the
 * state the user gave them. Returns the same object when nothing changes.
 */
export function revealCurrentGroup(
  toggles: NavToggles,
  currentGroup: string | undefined,
): NavToggles {
  if (!currentGroup || !(currentGroup in toggles)) return toggles;
  const { [currentGroup]: _dropped, ...rest } = toggles;
  return rest;
}
