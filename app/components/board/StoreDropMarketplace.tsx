"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search, ShoppingBag, Star, X } from "lucide-react";
import {
  isStoreDropBookmarked,
  toggleStoreDropBookmark,
} from "@/lib/board/storeDrops";

type Aura =
  | "all"
  | "pink"
  | "blue"
  | "red"
  | "yellow"
  | "black"
  | "green"
  | "neutral";

type StoreDrop = {
  id: string;
  artifactId: string;
  title: string;
  price: string;
  href: string;
  image: string;
  aura: Exclude<Aura, "all">;
  category: string;
  description: string;
};

const STORE_DROPS: StoreDrop[] = [
  {
    id: "artifact-001",
    artifactId: "Artifact 001",
    title: "AGENT ADAMS Smartwatch",
    price: "$42.99",
    href: "https://store.jabvisions.com/products/full-screen-ip68-waterproof-ultra-thin-smartwatch-1408113393",
    image: "/store-drops/artifact-001-smartwatch.png",
    aura: "black",
    category: "Devices",
    description: "A wearable monitoring device selected for daily use.",
  },
  {
    id: "artifact-002",
    artifactId: "Artifact 002",
    title: "Field Power Unit (v4.D)",
    price: "$27.99",
    href: "https://store.jabvisions.com/products/roaming-solar-power-bank-phone-or-tablet-charger-1415771305",
    image: "/store-drops/artifact-002-field-power-unit.png",
    aura: "green",
    category: "Devices",
    description: "A portable energy reserve designed for extended operation.",
  },
  {
    id: "artifact-003",
    artifactId: "Artifact 003",
    title: "Ryderz Steadyhand Sleeve",
    price: "$8.77",
    href: "https://store.jabvisions.com/products/compression-arthritis-glove-unisex-joint-pain-relief-half-finger-brace",
    image: "/store-drops/artifact-003-steadyhand-sleeve.png",
    aura: "neutral",
    category: "Wearables",
    description: "A stabilizing sleeve for pressure and control.",
  },
  {
    id: "artifact-005",
    artifactId: "Artifact 005",
    title: "Zoe Folie's Evil Eye Socks",
    price: "$14.99",
    href: "https://store.jabvisions.com/products/evil-eye-unisex-novelty-crew-socks",
    image: "/store-drops/artifact-005-zoe-evil-eye-socks.png",
    aura: "blue",
    category: "Wearables",
    description: "A charm-coded wardrobe artifact from Zoe's orbit.",
  },
  {
    id: "artifact-006",
    artifactId: "Artifact 006",
    title: "Signal Halo",
    price: "$12.99",
    href: "https://store.jabvisions.com/products/portable-selfie-ring-clip-on-for-mobile-phone-1142523575",
    image: "/store-drops/artifact-006-signal-halo.png",
    aura: "yellow",
    category: "Devices",
    description: "A portable illumination device.",
  },
  {
    id: "artifact-007",
    artifactId: "Artifact 007",
    title: "Keven Hart's Lightning Socks",
    price: "$18.99",
    href: "https://store.jabvisions.com/products/pink-lightning-bolt-unisex-novelty-crew-socks",
    image: "/store-drops/artifact-007-keven-lightning-socks.png",
    aura: "pink",
    category: "Wearables",
    description: "Pink current stabilized into wearable form.",
  },
  {
    id: "artifact-008",
    artifactId: "Artifact 008",
    title: "Vibe-Lite Atmospheric Device",
    price: "$19.99",
    href: "https://store.jabvisions.com/products/sunset-lamp-rgb-16-color-app-remote-control-atmosphere-projection-lamp-659413514",
    image: "/store-drops/artifact-008-vibe-lite.png",
    aura: "yellow",
    category: "Environment",
    description: "A device for shifting room energy.",
  },
  {
    id: "artifact-009",
    artifactId: "Artifact 009",
    title: "Rubi Wong's Harem Pants",
    price: "$26.99",
    href: "https://store.jabvisions.com/products/burgundy-elephant-pants-women-boho-pants-hippie-pants-yoga-483931983",
    image: "/store-drops/artifact-009-rubi-harem-pants.png",
    aura: "red",
    category: "Wearables",
    description: "A crimson movement artifact.",
  },
  {
    id: "artifact-010",
    artifactId: "Artifact 010",
    title: "Wayfarer Pack (All-Weather Carry Unit)",
    price: "$29.99",
    href: "https://store.jabvisions.com/products/ultimate-waterproof-travel-backpack-camping-hiking-trecking-bag-842085962",
    image: "/store-drops/artifact-010-wayfarer-pack.png",
    aura: "black",
    category: "Wearables",
    description: "A mobile containment system for movement and survival.",
  },
  {
    id: "artifact-011",
    artifactId: "Artifact 011",
    title: "Oasis Patch (Living Surface)",
    price: "$18.99",
    href: "https://store.jabvisions.com/products/fine-plastic-grass-artificial-turf-sheet-door-mat-green-1455098886",
    image: "/store-drops/artifact-011-oasis-patch.png",
    aura: "green",
    category: "Environment",
    description: "A grounding surface for artificial environments.",
  },
  {
    id: "artifact-012",
    artifactId: "Artifact 012",
    title: "Power Core Magnetic Wireless Charger",
    price: "$36.99",
    href: "https://store.jabvisions.com/products/xyst-5000-mah-magsafe-magnetic-wireless-5w-power-bank",
    image: "/store-drops/artifact-012-power-core.png",
    aura: "green",
    category: "Devices",
    description: "A compact magnetic power module for keeping signal alive.",
  },
  {
    id: "artifact-013-vapor-bloom",
    artifactId: "Artifact 013",
    title: "JAB Visions Vapor Bloom Unit",
    price: "$12.99",
    href: "https://store.jabvisions.com/products/portable-ultrasonic-humidifier-usb-aroma-essential-oil-diffuser-led-1678300427",
    image: "/store-drops/artifact-013-vapor-bloom.png",
    aura: "blue",
    category: "Environment",
    description: "A small atmosphere unit for mist, softness, and ambience.",
  },
  {
    id: "artifact-013-dump-him-tee",
    artifactId: "Artifact 013",
    title: "Zoe Folie's 'Dump Him' Tee",
    price: "$24.99",
    href: "https://store.jabvisions.com/products/artifact-051-zoe-folie-dump-him-tee",
    image: "/store-drops/artifact-013-dump-him-tee.png",
    aura: "blue",
    category: "Wearables",
    description: "A fitted blue statement tee from Zoe Folie's orbit.",
  },
  {
    id: "artifact-014",
    artifactId: "Artifact 014",
    title: "Aaron's Shadow Stripe Knit",
    price: "$59.99",
    href: "https://store.jabvisions.com/products/mens-loose-fashion-brand-crew-neck-casual-sweater-mens",
    image: "/store-drops/artifact-014-shadow-stripe-knit.png",
    aura: "black",
    category: "Wearables",
    description: "A structured streetwear layer inspired by Aaron Addams.",
  },
  {
    id: "artifact-015",
    artifactId: "Artifact 015",
    title: "Signal Crown Headphones",
    price: "$26.95",
    href: "https://store.jabvisions.com/products/wireless-sport-bluetooth-headphones-with-in-ear-detect-function",
    image: "/store-drops/artifact-015-signal-crown-headphones.png",
    aura: "pink",
    category: "Devices",
    description: "A sound artifact for private signal and movement.",
  },
  {
    id: "artifact-016",
    artifactId: "Artifact 016",
    title: "Aaron Black Seal Pendant",
    price: "$34.99",
    href: "https://store.jabvisions.com/products/dragon-necklace-dragon-claw-seal-black-dragon-pandant-adorned-with",
    image: "/store-drops/artifact-016-aaron-black-seal-pendant.png",
    aura: "black",
    category: "Wearables",
    description: "A dark pendant artifact aligned with Aaron's shadow aura.",
  },
  {
    id: "artifact-017",
    artifactId: "Artifact 017",
    title: "Divine Femme Top",
    price: "$12.99",
    href: "https://store.jabvisions.com/products/women-casual-short-sleeve-square-collar-crop-top-summer-chiffon-blouse",
    image: "/store-drops/artifact-017-divine-femme-top.png",
    aura: "green",
    category: "Wearables",
    description: "A soft cropped statement top with multiple colorways.",
  },
  {
    id: "artifact-018",
    artifactId: "Artifact 018",
    title: "Aura Strip LED Light Kit",
    price: "$34.99",
    href: "https://store.jabvisions.com/products/5m-5050-led-auto-sensing-light-strip-with-bluetooth-remote-control",
    image: "/store-drops/artifact-018-aura-strip-led-kit.png",
    aura: "yellow",
    category: "Environment",
    description: "A customizable LED kit for changing room atmosphere.",
  },
];

const auraStyles: Record<Exclude<Aura, "all">, string> = {
  pink: "hover:border-pink-400/60 hover:shadow-pink-400/20",
  blue: "hover:border-blue-400/60 hover:shadow-blue-400/20",
  red: "hover:border-red-400/60 hover:shadow-red-400/20",
  yellow: "hover:border-yellow-300/60 hover:shadow-yellow-300/20",
  black: "hover:border-white/40 hover:shadow-white/15",
  green: "hover:border-lime-300/60 hover:shadow-lime-300/20",
  neutral: "hover:border-white/30 hover:shadow-white/10",
};

const filters: Aura[] = [
  "all",
  "pink",
  "blue",
  "red",
  "yellow",
  "black",
  "green",
  "neutral",
];

export default function StoreDropMarketplace() {
  const [query, setQuery] = useState("");
  const [activeAura, setActiveAura] = useState<Aura>("all");
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    return new Set(STORE_DROPS.filter((drop) => isStoreDropBookmarked(drop.id)).map((drop) => drop.id));
  });

  const visibleDrops = useMemo(() => {
    return STORE_DROPS.filter((drop) => {
      const matchesAura = activeAura === "all" || drop.aura === activeAura;
      const searchText = `${drop.title} ${drop.category} ${drop.description} ${drop.aura}`.toLowerCase();
      const matchesQuery = searchText.includes(query.toLowerCase());
      return matchesAura && matchesQuery;
    });
  }, [query, activeAura]);

  const renderedDrops = visibleDrops.slice(0, 9);
  const hasMore = visibleDrops.length > 9;

  function handleQueryChange(value: string) {
    setQuery(value);
  }

  function handleAuraChange(value: Aura) {
    setActiveAura(value);
  }

  function handleBookmark(drop: StoreDrop) {
    const saved = toggleStoreDropBookmark({
      id: drop.id,
      title: drop.title,
      artifactNumber: drop.artifactId,
      imageUrl: drop.image,
      productUrl: drop.href,
      price: drop.price,
    });

    setSavedIds((current) => {
      const next = new Set(current);
      if (saved) next.add(drop.id);
      else next.delete(drop.id);
      return next;
    });
  }

  function renderDropCard(drop: StoreDrop) {
    const saved = savedIds.has(drop.id);

    return (
      <article
        key={drop.id}
        className={`group relative rounded-2xl overflow-hidden border border-white/10 bg-[#111] transition hover:-translate-y-1 ${auraStyles[drop.aura]}`}
      >
        <button
          type="button"
          onClick={() => handleBookmark(drop)}
          className={`absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur-md transition ${
            saved
              ? "border-yellow-200/70 bg-yellow-300/22 text-yellow-100 shadow-[0_0_24px_rgba(250,204,21,0.38)]"
              : "border-white/16 bg-black/52 text-white/72 hover:border-yellow-200/55 hover:text-yellow-100"
          }`}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${drop.title} from saved artifacts` : `Save ${drop.title}`}
        >
          <Star className={`h-3.5 w-3.5 ${saved ? "fill-yellow-300 text-yellow-300" : ""}`} />
          {saved ? "Saved" : "Save"}
        </button>

        <a href={drop.href} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={drop.image} className="w-full aspect-[4/3] object-cover" alt={drop.title} />
          <div className="border-t border-white/10 p-4">
            <p className="text-xs text-lime-300/70">{drop.artifactId}</p>
            <h3 className="font-bold text-white">{drop.title}</h3>
            <p className="mt-1 text-sm text-white/50">{drop.description}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-black">{drop.price}</span>
              <span className="text-xs uppercase flex items-center gap-1 text-white/60">
                View <ExternalLink className="h-3 w-3" />
              </span>
            </div>
          </div>
        </a>
      </article>
    );
  }

  return (
    <section className="relative mx-auto max-w-[1150px] overflow-hidden rounded-[30px] border border-white/10 bg-[#08080d]/95 p-4 text-white shadow-2xl md:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-lime-300/70">
            <ShoppingBag className="h-4 w-4" />
            Store Drops
          </div>
          <h2 className="mt-2 text-2xl font-black md:text-3xl">Artifact Marketplace</h2>
          <p className="mt-2 max-w-xl text-sm text-white/55">
            A curated library of sellable artifacts embedded into Board.
          </p>
        </div>
        <a
          href="https://store.jabvisions.com/"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-lime-300/30 bg-lime-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-lime-100 transition hover:bg-lime-300/20"
        >
          Visit Store
        </a>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
          <Search className="h-4 w-4 text-white/40" />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search artifacts..."
            className="bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => handleAuraChange(f)}
              className={`px-3 py-1.5 text-[11px] uppercase rounded-full border transition ${
                activeAura === f
                  ? "border-lime-300 bg-lime-300/15 text-lime-100"
                  : "border-white/10 text-white/50 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {renderedDrops.map((drop) => renderDropCard(drop))}
      </div>

      {hasMore ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setInventoryOpen(true)}
            className="rounded-full border border-white/12 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white/82 backdrop-blur-md transition hover:bg-white/12"
          >
            See More
          </button>
        </div>
      ) : null}

      {inventoryOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(3,5,12,0.74)] px-4 py-8 backdrop-blur-md">
          <div className="absolute inset-0" onClick={() => setInventoryOpen(false)} />

          <div className="relative z-10 w-full max-w-6xl overflow-hidden rounded-[34px] border border-white/14 bg-[linear-gradient(180deg,rgba(16,18,28,0.92),rgba(8,10,18,0.88))] shadow-[0_30px_120px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.14)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),transparent)] opacity-70" />
            <div className="pointer-events-none absolute -left-16 top-12 h-48 w-48 rounded-full bg-lime-300/10 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 top-24 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

            <div className="relative z-10 flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-6">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-lime-300/68">
                  Projected Inventory
                </div>
                <h3 className="mt-2 text-2xl font-black text-white">Store Drop Marketplace</h3>
                <p className="mt-2 max-w-2xl text-sm text-white/55">
                  Full filtered artifact inventory projected from Explore.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInventoryOpen(false)}
                className="rounded-full border border-white/12 bg-white/8 p-2 text-white/72 transition hover:bg-white/12 hover:text-white"
                aria-label="Close projected inventory"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative z-10 max-h-[78vh] overflow-y-auto px-5 py-5 md:px-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleDrops.map((drop) => renderDropCard(drop))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
