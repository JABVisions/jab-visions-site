export type DoobooSpecies = {
  id: string;
  label: string;
  fur: string;
  ears: "round" | "tall" | "floppy";
  eyes: "wide" | "bright" | "soft";
  marking: string;
  personality: string;
};

export const DOOBOO_SPECIES: DoobooSpecies[] = [
  { id: "mossnip", label: "Mossnip", fur: "#7dce7a", ears: "round", eyes: "wide", marking: "leaf speck", personality: "curious" },
  { id: "pebblepuff", label: "Pebblepuff", fur: "#b7b1c9", ears: "floppy", eyes: "soft", marking: "pebble dots", personality: "sleepy" },
  { id: "signalfluff", label: "Signalfluff", fur: "#c9a6ff", ears: "tall", eyes: "bright", marking: "star tuft", personality: "playful" },
  { id: "sunmote", label: "Sunmote", fur: "#f0c36a", ears: "tall", eyes: "wide", marking: "warm cheek", personality: "gentle" },
];

export function speciesById(id: string) {
  return DOOBOO_SPECIES.find((species) => species.id === id) ?? null;
}
