export type FriendZoneState =
  | "fresh"
  | "active"
  | "magnetic"
  | "echo"
  | "fractured"
  | "phantom";

export type FriendZoneOrbUser = {
  id?: string;
  name: string;
  username: string;
  avatarUrl: string;
  lastActiveLabel: string;
  relationshipState?: FriendZoneState;
  state?: FriendZoneState;
};

const STATE_LABELS: Record<FriendZoneState, string> = {
  fresh: "Fresh",
  active: "Active",
  magnetic: "Magnetic",
  echo: "Echo",
  fractured: "Fractured",
  phantom: "Phantom",
};

const STATE_DESCRIPTIONS: Record<FriendZoneState, string> = {
  fresh: "New or recently updated Board signal.",
  active: "Recent Board activity is moving right now.",
  magnetic: "High-signal Board drops are pulling attention.",
  echo: "A quieter Board signal with recent history.",
  fractured: "The Board signal is fading and needs attention.",
  phantom: "A dormant Board signal at the edge.",
};

export function getFriendZoneState(user: FriendZoneOrbUser): FriendZoneState {
  return user.relationshipState || user.state || "fresh";
}

export function getRelationshipLabel(state: FriendZoneState) {
  return STATE_LABELS[state];
}

export function getRelationshipDescription(state: FriendZoneState) {
  return STATE_DESCRIPTIONS[state];
}
