import { ImageResponse } from 'next/og';

export const alt = 'VeilLend | GrantFox Campaign';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #030712 0%, #0b1329 50%, #030712 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-50%',
            left: '-25%',
            width: '80%',
            height: '80%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-50%',
            right: '-25%',
            width: '80%',
            height: '80%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            marginBottom: '24px',
          }}
        >
          <svg width="80" height="80" viewBox="0 0 100 100" style={{ marginRight: '8px' }}>
            <rect width="100" height="100" rx="20" fill="#0A0A0A" />
            <path d="M50 15 L85 50 L50 85 L15 50 Z" fill="none" stroke="#10B981" strokeWidth="6" strokeLinejoin="round" />
            <path d="M50 30 L70 50 L50 70 L30 50 Z" fill="#10B981" opacity="0.3" />
            <path d="M50 42 L58 50 L50 58 L42 50 Z" fill="#10B981" />
          </svg>
          <span
            style={{
              fontSize: '64px',
              fontWeight: 900,
              color: 'white',
              letterSpacing: '-0.02em',
            }}
          >
            VeilLend
          </span>
        </div>
        <span
          style={{
            fontSize: '32px',
            color: '#94A3B8',
            textAlign: 'center',
            maxWidth: '700px',
            lineHeight: 1.3,
          }}
        >
          Privacy-first contributor campaign on Stellar
        </span>
      </div>
    ),
    { ...size },
  );
}
