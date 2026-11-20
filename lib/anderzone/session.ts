import type { AvatarAppearance } from "./avatar";
import type { Dooboo } from "./dooboo/pet";
import type { PlacedFurniture } from "./homePod";
import type { DistrictSnapshot } from "./room";
import type { Body, RegionId } from "./world";

export type AnderzoneSession = {
  regionId: Extract<RegionId, "anderzone-central" | "home-pod">;
  direction: { x: number; y: number };
  interactQueued: boolean;
  reducedMotion: boolean;
  name: string;
  avatar: AvatarAppearance;
  pet: Dooboo | null;
  layout: PlacedFurniture[];
  editing: boolean;
  remote: DistrictSnapshot["players"];
  player: Body;
  prompt: string | null;
  action: "read" | "talk" | "adopt" | "travel" | null;
  picked: { x: number; y: number } | null;
  mapEpoch: number;
};

export type AnderzoneDebug = {
  regionId: string;
  x: number;
  y: number;
  prompt: string | null;
  pet: { name: string; behavior: string; x: number; y: number } | null;
};
