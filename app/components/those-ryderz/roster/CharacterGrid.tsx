'use client';

import type { RaidCharacter, RosterFilter } from '@/lib/ryderz-raid/roster';
import { ROSTER_FILTERS } from '@/lib/ryderz-raid/roster';
import styles from './roster.module.css';

const FILTER_LABEL: Record<RosterFilter, string> = {
  all: 'All',
  ryder: 'Ryderz',
  villain: 'Villains',
  'jab-visions': 'JAB Visions',
  guest: 'Guests',
};

export function CharacterGrid({
  characters,
  selectedId,
  filter,
  onFilter,
  onSelect,
}: {
  characters: RaidCharacter[];
  selectedId: string | null;
  filter?: RosterFilter;
  onFilter?: (filter: RosterFilter) => void;
  onSelect: (character: RaidCharacter) => void;
}) {
  return (
    <div>
      {onFilter ? (
        <div className={styles.filters} role="tablist" aria-label="Roster categories">
          {ROSTER_FILTERS.map((id) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => onFilter(id)}>
              {FILTER_LABEL[id]}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.grid} role="listbox" aria-label="Characters">
        {characters.map((character) => {
          const locked = !character.playable || !character.unlocked;
          const selected = character.id === selectedId;
          return (
            <button
              key={character.id}
              type="button"
              role="option"
              aria-selected={selected}
              aria-disabled={locked}
              disabled={locked}
              className={[styles.card, selected ? styles.cardOn : '', locked ? styles.locked : ''].join(' ')}
              style={{ ['--swatch' as string]: character.primaryColor }}
              onClick={() => onSelect(character)}
            >
              <span className={styles.face}>
                {character.portrait ? (
                  <img src={character.portrait} alt="" />
                ) : (
                  <span className={styles.mono}>{character.name.slice(0, 1)}</span>
                )}
              </span>
              <span>
                <strong>{character.name}</strong>
                <small>{character.universe}</small>
                <em>{locked ? 'Soon' : character.category}</em>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
