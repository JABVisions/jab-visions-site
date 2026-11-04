'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import {
  DOSSIER_SECTIONS,
  SECTION_LABEL,
  allDossiers,
  hostAttributes,
  ryderAttributes,
  type Dossier,
  type DossierSection,
} from '@/lib/ryderz-raid/database/dossiers';
import { INPUT_SLOTS, type RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import { RYDER_THEME } from './theme';
import { useMenuKeys, wrap } from './useMenuKeys';
import menu from './PauseMenu.module.css';
import styles from './DatabasePanel.module.css';

const THREAT_LABEL = ['', 'Nuisance', 'Street', 'Block', 'District', 'Catastrophic'];

/**
 * The Database: a journal of everyone the signal has touched. Sections run
 * across the top, files down the left, the open dossier on the right. Left and
 * Right change section, Up and Down walk the files, Escape goes back. Focusing
 * a playable character puts their figure on the showcase.
 */
export default function DatabasePanel({
  manager,
  activeRyder,
  active,
  onPreview,
  onBack,
}: {
  manager: RyderManager;
  activeRyder: RyderId;
  active: boolean;
  onPreview: (id: RyderId | null) => void;
  onBack: () => void;
}) {
  const entries = useMemo(() => allDossiers(), []);
  const sections = useMemo(() => DOSSIER_SECTIONS.filter((section) => entries.some((entry) => entry.section === section)), [entries]);
  const [section, setSection] = useState<DossierSection>(() => entries.find((entry) => entry.id === activeRyder)?.section ?? sections[0]);
  const files = useMemo(() => entries.filter((entry) => entry.section === section), [entries, section]);
  const [row, setRow] = useState(() => Math.max(0, files.findIndex((entry) => entry.id === activeRyder)));
  const detail = useRef<HTMLElement>(null);

  const file: Dossier | undefined = files[Math.min(row, files.length - 1)];

  useEffect(() => {
    onPreview(file?.ryderId ?? null);
  }, [file, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);
  useEffect(() => {
    detail.current?.scrollTo({ top: 0 });
  }, [file?.id]);

  const changeSection = (next: DossierSection) => {
    setSection(next);
    setRow(0);
  };

  useMenuKeys((key) => {
    if (key === 'back') {
      onBack();
      return true;
    }
    if (key === 'left' || key === 'right') {
      const index = sections.indexOf(section);
      changeSection(sections[wrap(index + (key === 'right' ? 1 : -1), sections.length)]);
      return true;
    }
    if (key === 'up' || key === 'down') {
      setRow((r) => wrap(r + (key === 'down' ? 1 : -1), files.length));
      return true;
    }
    if (key === 'confirm') {
      // Enter pages the open dossier so long files read without a mouse.
      const node = detail.current;
      if (node) {
        const atEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 4;
        node.scrollBy({ top: atEnd ? -node.scrollHeight : node.clientHeight * 0.8, behavior: 'smooth' });
      }
      return true;
    }
    return false;
  }, active);

  const spec = file?.ryderId ? RYDERZ[file.ryderId] : null;
  const theme = file?.ryderId ? RYDER_THEME[file.ryderId] : null;
  const attributes = file?.ryderId ? ryderAttributes(file.ryderId) : file?.enemy ? hostAttributes(file.enemy) : [];
  const deck = file?.ryderId ? manager.loadout(file.ryderId) : null;
  const read = entries.filter((entry) => !entry.sealed).length;

  return (
    <section className={`${menu.panel} ${styles.database}`} aria-label="Database" style={theme ? { ['--file' as string]: theme.aura } : undefined}>
      <header className={`${menu.panelHead} ${styles.head}`}>
        <div>
          <p className={menu.eyebrow}>Database · {read} of {entries.length} files open</p>
          <h2>Journal</h2>
          <p>Everyone the signal has touched. Profiles, field notes, and the kit as recorded on the block.</p>
        </div>
        <nav className={styles.sections} aria-label="Sections">
          {sections.map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.section} ${id === section ? styles.sectionActive : ''}`}
              aria-pressed={id === section}
              onClick={() => changeSection(id)}
            >
              <b>{SECTION_LABEL[id].code}</b>
              {SECTION_LABEL[id].title}
            </button>
          ))}
        </nav>
      </header>

      <div className={styles.body}>
        <ol className={styles.files} aria-label={SECTION_LABEL[section].title}>
          <li className={styles.filesHead}>
            <strong>{SECTION_LABEL[section].title}</strong>
            <small>{SECTION_LABEL[section].blurb}</small>
          </li>
          {files.map((entry, i) => {
            const focused = entry.id === file?.id;
            const tint = entry.ryderId ? RYDER_THEME[entry.ryderId].aura : entry.sealed ? '#8a8fa3' : '#9bd6c4';
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`${styles.file} ${focused ? styles.fileFocused : ''} ${entry.sealed ? styles.fileSealed : ''}`}
                  aria-current={focused}
                  style={{ ['--file' as string]: tint }}
                  onMouseEnter={() => setRow(i)}
                  onClick={() => setRow(i)}
                >
                  <span className={styles.fileNo}>{entry.entry}</span>
                  <strong>{entry.name}</strong>
                  <small>{entry.sealed ? 'Sealed' : entry.codename}</small>
                </button>
              </li>
            );
          })}
        </ol>

        <article ref={detail} className={styles.dossier} aria-live="polite">
          {file && (
            <>
              <header className={styles.dossierHead}>
                <div className={styles.stamp} data-sealed={file.sealed ? 'true' : 'false'}>
                  {spec?.icon ? <Image src={spec.icon} alt="" fill unoptimized sizes="120px" /> : <span>{file.sealed ? '?' : SECTION_LABEL[file.section].code}</span>}
                </div>
                <div className={styles.identity}>
                  <p className={menu.eyebrow}>
                    File {file.entry} · {SECTION_LABEL[file.section].title}
                  </p>
                  <h3>{file.name}</h3>
                  <p className={styles.codename}>{file.codename}</p>
                  <ul className={styles.tags}>
                    {file.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                </div>
              </header>

              <dl className={styles.facts}>
                <div>
                  <dt>Designation</dt>
                  <dd>{file.designation}</dd>
                </div>
                <div>
                  <dt>Affiliation</dt>
                  <dd>{file.affiliation}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{file.status}</dd>
                </div>
                <div>
                  <dt>Threat</dt>
                  <dd className={styles.threat} aria-label={`Threat ${file.threat} of 5`}>
                    <span>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <i key={n} data-on={n <= file.threat ? 'true' : 'false'} />
                      ))}
                    </span>
                    {file.sealed ? 'Unknown' : THREAT_LABEL[file.threat]}
                  </dd>
                </div>
                {spec && (
                  <div>
                    <dt>Weapon</dt>
                    <dd>{spec.weapon}</dd>
                  </div>
                )}
                {file.performer && (
                  <div>
                    <dt>Performed by</dt>
                    <dd>{file.performer}</dd>
                  </div>
                )}
              </dl>

              {file.sealed ? (
                <section className={styles.block}>
                  <h4>Profile</h4>
                  <div className={styles.redacted} aria-label="Redacted">
                    <i style={{ width: '92%' }} />
                    <i style={{ width: '71%' }} />
                    <i style={{ width: '84%' }} />
                    <i style={{ width: '46%' }} />
                  </div>
                  <p className={styles.sealedNote}>Clearance pending. This file opens when the character drops into the raid.</p>
                </section>
              ) : (
                <>
                  <section className={styles.block}>
                    <h4>Signal reading</h4>
                    <p className={styles.signal}>{file.signal}</p>
                  </section>

                  <section className={styles.block}>
                    <h4>Profile</h4>
                    {file.profile.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </section>

                  <section className={styles.block}>
                    <h4>Field notes</h4>
                    <ul className={styles.notes}>
                      {file.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </section>

                  {attributes.length > 0 && (
                    <section className={styles.block}>
                      <h4>Attributes</h4>
                      <ul className={styles.attributes}>
                        {attributes.map((attr) => (
                          <li key={attr.label}>
                            <span>{attr.label}</span>
                            <i>
                              <b style={{ transform: `scaleX(${attr.max > 0 ? Math.max(0.04, Math.min(1, attr.value / attr.max)) : 0})` }} />
                            </i>
                            <em>{Number.isInteger(attr.value) ? attr.value : attr.value.toFixed(1)}</em>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {spec && (
                    <section className={styles.block}>
                      <h4>Recorded kit</h4>
                      <ul className={styles.kit}>
                        {spec.moves.map((move, i) => {
                          const bound = deck ? INPUT_SLOTS.find((slot) => deck[slot] === move.id) : null;
                          return (
                            <li key={move.id}>
                              <b>{bound ?? INPUT_SLOTS[i]}</b>
                              <div>
                                <strong>{move.name}</strong>
                                <p>{move.description}</p>
                                <small>{move.drain > 0 ? `Drains ${move.drain} aura/s` : `${move.auraCost} aura`}</small>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          <button type="button" className={`${menu.ghostBtn} ${styles.back}`} onClick={onBack}>
            Back
          </button>
        </article>
      </div>
    </section>
  );
}
