import Phaser from "phaser";
import { avatarPalette } from "@/lib/anderzone/avatar";
import { speciesById } from "@/lib/anderzone/dooboo/species";
import { stepPet } from "@/lib/anderzone/dooboo/pet";
import { petBedCenter } from "@/lib/anderzone/homePod";
import { sharesDistrict } from "@/lib/anderzone/room";
import type { AnderzoneDebug, AnderzoneSession } from "@/lib/anderzone/session";
import { enterRegion, moveBody, nearestInteractable, TILE, tileKind } from "@/lib/anderzone/world";

const TILE_COLOR: Record<string, number> = {
  floor: 0x12343a,
  plaza: 0x1d5a52,
  wall: 0x243044,
  door: 0xe7c36a,
  sign: 0xf2d36b,
  npc: 0x12343a,
  portal: 0x7d5cff,
};

export function mountAnderzone(parent: HTMLElement, session: AnderzoneSession, publish: () => void) {
  let mapEpoch = -1;
  let avatarKey = "";
  const remotes = new Map<string, Phaser.GameObjects.Container>();
  const furniture = new Map<string, Phaser.GameObjects.Rectangle>();
  let ground: Phaser.GameObjects.Graphics | null = null;
  let player: Phaser.GameObjects.Container | null = null;
  let petSprite: Phaser.GameObjects.Container | null = null;
  let label: Phaser.GameObjects.Text | null = null;
  let destroyed = false;
  let interactHeld = false;

  class DistrictScene extends Phaser.Scene {
    constructor() {
      super("anderzone");
    }

    create() {
      this.cameras.main.setBackgroundColor("#071018");
      this.cameras.main.setRoundPixels(true);
      this.scale.on("resize", () => this.cameras.main.setZoom(this.scale.width < 720 ? 2 : 2.4));
      this.cameras.main.setZoom(this.scale.width < 720 ? 2 : 2.4);
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (!session.editing) return;
        const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        session.picked = { x: Math.floor(world.x / TILE), y: Math.floor(world.y / TILE) };
        publish();
      });
      this.rebuild();
    }

    rebuild() {
      ground?.destroy();
      player?.destroy();
      petSprite?.destroy();
      label?.destroy();
      furniture.forEach((sprite) => sprite.destroy());
      furniture.clear();
      const entered = enterRegion(session.regionId);
      if (!entered.ok) return;
      const region = entered.region;
      const rows = region.rows ?? [];
      ground = this.add.graphics();
      rows.forEach((row, y) => {
        row.split("").forEach((_cell, x) => {
          const kind = tileKind(region, x, y) ?? "wall";
          ground?.fillStyle(TILE_COLOR[kind] ?? TILE_COLOR.floor, 1);
          ground?.fillRect(x * TILE, y * TILE, TILE, TILE);
        });
      });
      session.player = { ...session.player, x: region.spawn?.x ?? session.player.x, y: region.spawn?.y ?? session.player.y };
      player = this.add.container(session.player.x, session.player.y);
      label = this.add.text(session.player.x, session.player.y - 28, session.name, {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#f4fff8",
      }).setOrigin(0.5, 1);
      this.drawAvatar();
      const width = (rows[0]?.length ?? 1) * TILE;
      const height = rows.length * TILE;
      this.cameras.main.setBounds(0, 0, width, height);
      this.cameras.main.startFollow(player, true, session.reducedMotion ? 1 : 0.18, session.reducedMotion ? 1 : 0.18);
      this.cameras.main.centerOn(session.player.x, session.player.y);
      mapEpoch = session.mapEpoch;
      avatarKey = "";
    }

    drawAvatar() {
      if (!player) return;
      player.removeAll(true);
      const palette = avatarPalette(session.avatar);
      const cloth = this.add.rectangle(0, 6, 16, 14, Phaser.Display.Color.HexStringToColor(palette.cloth).color);
      const head = this.add.rectangle(0, -8, 14, 12, Phaser.Display.Color.HexStringToColor(palette.skin).color);
      player.add(this.add.rectangle(0, 0, 20, 28, 0xf4fff8, 0.01));
      player.add([cloth, head]);
      if (session.avatar.hair !== "none") {
        const hair = this.add.rectangle(0, -11, session.avatar.hair === "long" ? 12 : 8, 4, 0x1b2430);
        player.add(hair);
      }
      const eye = session.avatar.eyes === "soft" ? 1 : 2;
      player.add(this.add.rectangle(-2, -6, eye, eye, 0x101418));
      player.add(this.add.rectangle(2, -6, eye, eye, 0x101418));
      if (session.avatar.accessory === "visor") player.add(this.add.rectangle(0, -6, 10, 2, 0x9be7ff));
      if (session.avatar.accessory === "pin") player.add(this.add.rectangle(3, 2, 2, 2, 0xffe27a));
      avatarKey = JSON.stringify(session.avatar);
    }

    drawPet() {
      petSprite?.destroy();
      petSprite = null;
      if (!session.pet) return;
      const species = speciesById(session.pet.speciesId);
      const color = Phaser.Display.Color.HexStringToColor(species?.fur ?? "#cccccc").color;
      const sprite = this.add.container(session.pet.x, session.pet.y);
      const earY = species?.ears === "floppy" ? -4 : -8;
      sprite.add(this.add.ellipse(-4, earY, 4, species?.ears === "tall" ? 7 : 4, color));
      sprite.add(this.add.ellipse(4, earY, 4, species?.ears === "tall" ? 7 : 4, color));
      sprite.add(this.add.ellipse(0, 0, 12, 9, color));
      sprite.add(this.add.rectangle(-2, -1, 2, 2, 0x1a1a1a));
      sprite.add(this.add.rectangle(2, -1, 2, 2, 0x1a1a1a));
      sprite.add(this.add.rectangle(-3, 3, 2, 2, color));
      sprite.add(this.add.rectangle(3, 3, 2, 2, color));
      petSprite = sprite;
    }

    update(_time: number, delta: number) {
      if (destroyed || !player) return;
      if (session.mapEpoch !== mapEpoch) this.rebuild();
      if (avatarKey !== JSON.stringify(session.avatar)) this.drawAvatar();
      const region = enterRegion(session.regionId);
      if (!region.ok) return;
      const dt = Math.min(0.05, delta / 1000);
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
      let dirX = session.direction.x;
      let dirY = session.direction.y;
      const keyboard = this.input.keyboard;
      if (keyboard && !typing && dirX === 0 && dirY === 0) {
        const left = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT).isDown || keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A).isDown;
        const right = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT).isDown || keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D).isDown;
        const up = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP).isDown || keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W).isDown;
        const down = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN).isDown || keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S).isDown;
        dirX = (right ? 1 : 0) - (left ? 1 : 0);
        dirY = (down ? 1 : 0) - (up ? 1 : 0);
        const interact = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E).isDown || keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).isDown;
        if (interact && !interactHeld) session.interactQueued = true;
        interactHeld = interact;
      } else if (!session.direction.x && !session.direction.y) {
        interactHeld = false;
      }
      const moved = moveBody(region.region, session.player, dirX, dirY, dt);
      const walking = moved.x !== session.player.x || moved.y !== session.player.y;
      session.player = moved;
      const bob = !session.reducedMotion && walking ? Math.sin(_time / 80) * 1 : 0;
      player.setPosition(moved.x, moved.y + bob);
      label?.setPosition(moved.x, moved.y - 28);
      label?.setText(session.name);
      this.cameras.main.setLerp(session.reducedMotion ? 1 : 0.12, session.reducedMotion ? 1 : 0.12);
      if (session.pet) {
        session.pet = stepPet(session.pet, moved, dt, _time, petBedCenter(session.layout));
        if (!petSprite) this.drawPet();
        const hop = session.pet.behavior === "play" && !session.reducedMotion ? -3 : 0;
        petSprite?.setPosition(session.pet.x, session.pet.y + hop);
      } else if (petSprite) {
        petSprite.destroy();
        petSprite = null;
      }
      this.syncFurniture();
      this.syncRemotes(dt);
      (window as unknown as { __anderzone?: AnderzoneDebug }).__anderzone = {
        regionId: session.regionId,
        x: moved.x,
        y: moved.y,
        prompt: session.prompt,
        pet: session.pet
          ? { name: session.pet.name, behavior: session.pet.behavior, x: session.pet.x, y: session.pet.y }
          : null,
      };
      if (session.interactQueued) {
        session.interactQueued = false;
        const hit = nearestInteractable(region.region, moved.x, moved.y);
        session.prompt = hit?.prompt ?? null;
        session.action = hit?.action ?? null;
        if (hit?.action === "travel" && hit.to && (hit.to === "home-pod" || hit.to === "anderzone-central")) {
          session.regionId = hit.to;
          session.mapEpoch += 1;
          session.prompt = hit.prompt;
          if (!sharesDistrict(hit.to)) session.remote = [];
        }
        publish();
      }
    }

    syncFurniture() {
      const seen = new Set<string>();
      session.layout.forEach((item) => {
        seen.add(item.id);
        const color = item.kind === "bed" ? 0xf2d36b : item.kind === "plant" ? 0x7dce7a : 0x8ec8ff;
        let sprite = furniture.get(item.id);
        if (!sprite) {
          sprite = this.add.rectangle(0, 0, TILE - 8, TILE - 8, color);
          furniture.set(item.id, sprite);
        }
        sprite.setPosition(item.x * TILE + TILE / 2, item.y * TILE + TILE / 2);
      });
      furniture.forEach((sprite, id) => {
        if (!seen.has(id)) {
          sprite.destroy();
          furniture.delete(id);
        }
      });
    }

    syncRemotes(dt: number) {
      const seen = new Set<string>();
      session.remote.forEach((remote) => {
        if (remote.id === "self") return;
        seen.add(remote.id);
        let sprite = remotes.get(remote.id);
        if (!sprite) {
          sprite = this.add.container(remote.x, remote.y);
          sprite.add(this.add.rectangle(0, 0, 10, 12, 0xff8ad4));
          const tag = this.add.text(0, -16, remote.name, { fontFamily: "monospace", fontSize: "8px", color: "#ffffff" }).setOrigin(0.5, 1);
          sprite.add(tag);
          remotes.set(remote.id, sprite);
        }
        const nextX = sprite.x + (remote.x - sprite.x) * Math.min(1, dt * 8);
        const nextY = sprite.y + (remote.y - sprite.y) * Math.min(1, dt * 8);
        sprite.setPosition(session.reducedMotion ? remote.x : nextX, session.reducedMotion ? remote.y : nextY);
      });
      remotes.forEach((sprite, id) => {
        if (!seen.has(id)) {
          sprite.destroy();
          remotes.delete(id);
        }
      });
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    banner: false,
    pixelArt: true,
    backgroundColor: "#071018",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: Math.max(320, parent.clientWidth || 800),
      height: Math.max(280, parent.clientHeight || 520),
    },
    scene: DistrictScene,
  });

  const debug = () => ({
    regionId: session.regionId,
    x: session.player.x,
    y: session.player.y,
    prompt: session.prompt,
    pet: session.pet ? { name: session.pet.name, behavior: session.pet.behavior, x: session.pet.x, y: session.pet.y } : null,
  }) satisfies AnderzoneDebug;

  return {
    destroy() {
      destroyed = true;
      game.destroy(true);
    },
    debug,
  };
}
