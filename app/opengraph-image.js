import { ImageResponse } from 'next/og';
import { person } from '@/content/profile';

export const alt = `${person.name} — ${person.title}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'radial-gradient(900px 500px at 90% -10%, rgba(139,92,246,0.45), transparent 60%), #07070c',
          color: '#f4f4f8',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #8b5cf6, #22d3ee 55%, #a3e635)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#07070c',
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            NC
          </div>
          <div style={{ fontSize: 26, color: '#a3a3b8' }}>chennunagavenkatasai.com</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }}>{person.name}</div>
          <div
            style={{
              marginTop: 18,
              fontSize: 52,
              fontWeight: 700,
              backgroundImage: 'linear-gradient(90deg, #8b5cf6, #22d3ee 55%, #a3e635)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {person.title}
          </div>
          <div style={{ marginTop: 22, fontSize: 28, color: '#a3a3b8', maxWidth: 980 }}>
            LLM agents · fine-tuning · model evaluation · RAG
          </div>
        </div>
      </div>
    ),
    size,
  );
}
