import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'VeilLend — privacy-first lending on Stellar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0b1220 0%, #0f172a 45%, #14532d 100%)',
          color: '#f8fafc',
          padding: 72,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#86efac',
            marginBottom: 18,
          }}
        >
          Stellar · Soroban · GrantFox
        </div>
        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>VeilLend</div>
        <div style={{ fontSize: 36, marginTop: 20, maxWidth: 900, color: '#cbd5e1' }}>
          Privacy-first lending on Stellar — built in the open.
        </div>
      </div>
    ),
    { ...size },
  );
}
