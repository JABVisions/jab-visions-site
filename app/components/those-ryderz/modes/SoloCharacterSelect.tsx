'use client';

import type { RyderId } from '@/lib/ryderz-raid/config';
import PremiereCharacterSelect from '../premiere/PremiereCharacterSelect';

/** Solo drops in through the premiere select. The sliding roster is gone. */
export default function SoloCharacterSelect({
  initialId,
  onBack,
  onPlay,
  onEquipSkin,
}: {
  initialId: RyderId;
  onBack: () => void;
  onPlay: (id: RyderId) => void;
  onEquipSkin?: (skinId: string) => void;
}) {
  return (
    <PremiereCharacterSelect
      mode="solo"
      initialId={initialId}
      confirmLabel="Choose map"
      onBack={onBack}
      onEquipSkin={onEquipSkin}
      onConfirm={(character) => {
        if (character.ryderId) onPlay(character.ryderId);
      }}
    />
  );
}
