import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'VeilLend — Private Liquidity on Stellar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#030712',
          padding: '60px 80px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -200,
            left: 100,
            width: 500,
            height: 500,
            borderRadius: 9999,
            background: 'rgba(99, 102, 241, 0.15)',
            filter: 'blur(120px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -200,
            right: 100,
            width: 600,
            height: 600,
            borderRadius: 9999,
            background: 'rgba(16, 185, 129, 0.10)',
            filter: 'blur(160px)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 32,
            border: '1px solid rgba(51, 65, 85, 0.8)',
            borderRadius: 9999,
            padding: '10px 24px',
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          <span
            style={{
              height: 12,
              width: 12,
              borderRadius: 9999,
              backgroundColor: '#10b981',
            }}
          />
          <span style={{ color: '#34d399', fontSize: 20, fontWeight: 600 }}>
            VeilLend Contributor Campaign Is Live
          </span>
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: '#f1f5f9',
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          VeilLend | GrantFox Campaign
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#94a3b8',
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: 800,
            marginTop: 24,
          }}
        >
          Privacy-first contributor campaign for building VeilLend on Stellar
          with anonymous first-party analytics.
        </div>
        <div
          style={{
            marginTop: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#10b981',
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          Private Liquidity on Stellar
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}