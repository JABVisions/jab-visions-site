'use client';

import dynamic from 'next/dynamic';
import Navbar from '../../components/Navbar';

const RaidGame = dynamic(() => import('../../components/those-ryderz/RaidGame'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        height: '100%',
        color: '#77ffae',
        font: '800 0.78rem/1.3 monospace',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
      }}
    >
      Booting raid signal…
    </div>
  ),
});

export default function ThoseRyderzRaidPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#07040f',
        color: '#f5fff8',
      }}
    >
      <Navbar />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          top: 72,
        }}
      >
        <RaidGame layout="page" />
      </div>
    </main>
  );
}
