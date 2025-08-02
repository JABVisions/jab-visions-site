'use client';
import Navbar from '../components/Navbar';

export default function Home() {
  return (
    <>
      <Navbar />
      <main style={{
        minHeight: '100vh',
        background: 'black',
        color: '#0f0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <h1>Homepage</h1>
        <button
          style={{
            padding: 16,
            fontSize: 24,
            marginTop: 32,
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: '#0f0',
            border: '2px solid #0f0',
            borderRadius: 6
          }}
          onClick={() => window.location.href = '/those-ryderz'}
        >
          Enter Site
        </button>
      </main>
    </>
  );
}
