import type { ReactNode } from 'react';

export default function BoardLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'black', color: 'white' }}>
      {children}
    </div>
  );
}
