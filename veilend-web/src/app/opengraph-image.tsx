import { ImageResponse } from 'next/og';

export const alt = 'VeilLend private lending campaign on Stellar';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          background: '#f7faf9',
          color: '#101817',
          display: 'flex',
          fontFamily: 'Arial, sans-serif',
          height: '100%',
          justifyContent: 'center',
          padding: 72,
          width: '100%',
        }}
      >
        <div
          style={{
            border: '2px solid #bbd6d0',
            borderRadius: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
            height: '100%',
            justifyContent: 'space-between',
            padding: 56,
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ color: '#0f766e', fontSize: 30, fontWeight: 700 }}>VeilLend</div>
            <div style={{ color: '#52605d', fontSize: 28 }}>Built on Stellar</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 860 }}>
            <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.04 }}>
              Private lending infrastructure for Stellar contributors
            </div>
            <div style={{ color: '#3d4a47', fontSize: 34, lineHeight: 1.35 }}>
              Soroban contracts, campaign analytics, and privacy-first product tracks for the
              VeilLend OSS campaign.
            </div>
          </div>
          <div style={{ color: '#0f766e', display: 'flex', fontSize: 28, gap: 24 }}>
            <span>Soroban contracts</span>
            <span>Web campaign UX</span>
            <span>Mobile lending flows</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
