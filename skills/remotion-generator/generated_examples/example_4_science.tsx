import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from 'remotion';

// --- Types & Interfaces ---
type BigBangProps = {
  title: string;
};

// --- Helper Components ---

// 1. Formula Display Component
const FormulaDisplay: React.FC<{ formula: string; label: string; frame: number; delay: number }> = ({ formula, label, frame, delay }) => {
  const { fps } = useVideoConfig();
  const opacity = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const translateY = interpolate(spring({ frame: frame - delay, fps, config: { damping: 60 } }), [0, 1], [20, 0]);

  return (
    <div style={{ opacity, transform: `translateY(${translateY}px)`, marginBottom: '20px' }}>
      <div style={{ fontSize: '24px', color: '#94a3b8', marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '48px', fontFamily: 'Georgia, serif', color: '#f59e0b', fontWeight: 'bold' }}>
        {formula}
      </div>
    </div>
  );
};

// 2. Redshift Visualization Component
const RedshiftVisual: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  
  // Animate wave stretching
  const waveScale = interpolate(progress, [0, 1], [1, 2.5]);
  const colorShift = interpolate(progress, [0, 1], [0, 120]); // 0 (Red) to 120 (Green) shift logic inverted for visual effect
  
  // We want to shift from Blue/Green to Red
  const r = Math.floor(interpolate(progress, [0, 1], [0, 255]));
  const gb = Math.floor(interpolate(progress, [0, 1], [255, 0]));
  const waveColor = `rgb(${r}, ${gb}, ${gb})`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ position: 'relative', width: 400, height: 100, border: '2px solid #334155', borderRadius: 8, overflow: 'hidden', background: '#0f172a' }}>
        {/* Grid lines */}
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ position: 'absolute', left: `${i * 25}%`, top: 0, bottom: 0, borderLeft: '1px dashed #334155' }} />
        ))}
        
        {/* The Wave */}
        <svg width="100%" height="100%" viewBox="0 0 400 100" preserveAspectRatio="none">
          <path
            d="M0,50 Q50,0 100,50 T200,50 T300,50 T400,50"
            fill="none"
            stroke={waveColor}
            strokeWidth={4}
            style={{
              transformOrigin: 'center',
              transform: `scaleX(${waveScale})`,
            }}
          />
        </svg>
        
        <div style={{ position: 'absolute', bottom: 5, right: 10, color: waveColor, fontSize: '14px', fontWeight: 'bold' }}>
          {progress > 0.5 ? "REDSHIFT (z > 0)" : "REST FRAME"}
        </div>
      </div>
    </div>
  );
};

// 3. CMB Heatmap Component
const CMBHeatmap: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  const opacity = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  
  // Generate random noise based on frame to simulate static/heat
  const noiseOpacity = interpolate(frame % 30, [0, 15, 30], [0.2, 0.5, 0.2], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ 
        width: 500, 
        height: 300, 
        borderRadius: '50%', 
        background: `radial-gradient(circle at 30% 30%, #ff6b6b, #845ef7, #4dabf7)`,
        opacity: opacity,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 0 50px rgba(132, 94, 247, 0.5)'
      }}>
        {/* Static Overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: noiseOpacity,
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"%3E%3Cfilter id="noiseFilter"%3E%3CfeTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/%3E%3C/filter%3E%3Crect width="100%25" height="100%25" filter="url(%23noiseFilter)" opacity="1"/%3E%3C/svg%3E")',
        }} />
      </div>
      <div style={{ position: 'absolute', bottom: 100, color: '#fff', fontSize: '24px', backgroundColor: 'rgba(0,0,0,0.7)', padding: '10px 20px', borderRadius: 8 }}>
        Cosmic Microwave Background (CMB)
      </div>
    </div>
  );
};

// 4. Timeline Component
const TimelineItem: React.FC<{ year: string; label: string; frame: number; startFrame: number; index: number }> = ({ year, label, frame, startFrame, index }) => {
  const { fps } = useVideoConfig();
  const delay = startFrame + (index * 15);
  const progress = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const x = interpolate(progress, [0, 1], [-50, 0]);
  const opacity = progress;

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      marginBottom: '20px', 
      transform: `translateX(${x}px)`, 
      opacity 
    }}>
      <div style={{ width: 100, fontSize: '28px', fontWeight: 'bold', color: '#f59e0b', textAlign: 'right', marginRight: '20px' }}>
        {year}
      </div>
      <div style={{ height: 2, flex: 1, background: '#334155', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress * 100}%`, background: '#3b82f6' }} />
        <div style={{ position: 'absolute', right: -10, top: -6, width: 14, height: 14, borderRadius: '50%', background: '#60a5fa' }} />
      </div>
      <div style={{ marginLeft: '20px', fontSize: '20px', color: '#e2e8f0', width: 300 }}>
        {label}
      </div>
    </div>
  );
};

// --- Scene Components ---

// Scene 1: Title
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const scale = spring({ frame, fps, config: { damping: 15, stiffness: 80, mass: 2 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      {/* Singularity Effect */}
      <div style={{
        position: 'absolute', width: 20, height: 20, borderRadius: '50%',
        background: '#fff', boxShadow: '0 0 100px 50px rgba(255,255,255,0.8)',
        transform: `scale(${scale * 50})`, opacity: 1 - scale
      }} />
      
      <div style={{ zIndex: 10, textAlign: 'center', opacity }}>
        <h1 style={{ fontSize: 100, fontWeight: 900, color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '-2px' }}>
          The Big Bang
        </h1>
        <div style={{ fontSize: 40, color: '#f59e0b', marginTop: 20, fontWeight: 300 }}>
          The Origin of Everything
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: Expanding Universe
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const textOpacity = interpolate(frame, [0, 15, 60], [0, 1, 1]);
  const visualOpacity = interpolate(frame, [20, 40], [0, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 100, left: 100, opacity: textOpacity }}>
        <h2 style={{ fontSize: 60, color: '#fff', marginBottom: 20 }}>The Discovery</h2>
        <p style={{ fontSize: 30, color: '#cbd5e1', maxWidth: 600, lineHeight: 1.5 }}>
          Edwin Hubble observed that galaxies are moving away from us.
        </p>
        <p style={{ fontSize: 30, color: '#cbd5e1', maxWidth: 600, lineHeight: 1.5, marginTop: 20 }}>
          Space itself is stretching.
        </p>
      </div>

      <div style={{ opacity: visualOpacity, marginTop: 100 }}>
        <RedshiftVisual frame={frame} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: CMB
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textOpacity = interpolate(frame, [0, 15], [0, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 100, left: 100, zIndex: 10, opacity: textOpacity }}>
        <h2 style={{ fontSize: 60, color: '#fff', marginBottom: 20 }}>The Echo</h2>
        <p style={{ fontSize: 30, color: '#cbd5e1', maxWidth: 600, lineHeight: 1.5 }}>
          The universe was once incredibly hot and dense.
        </p>
        <p style={{ fontSize: 30, color: '#cbd5e1', maxWidth: 600, lineHeight: 1.5, marginTop: 20 }}>
          We can still see this afterglow today as the Cosmic Microwave Background.
        </p>
      </div>
      
      <CMBHeatmap frame={frame} />
    </AbsoluteFill>
  );
};

// Scene 4: Timeline
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 1000, padding: 50 }}>
        <h2 style={{ fontSize: 60, color: '#fff', marginBottom: 60, textAlign: 'center' }}>Cosmic Evolution</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <TimelineItem year="t=0" label="The Big Bang" frame={frame} startFrame={10} index={0} />
          <TimelineItem year="380k yrs" label="First Atoms (CMB)" frame={frame} startFrame={10} index={1} />
          <TimelineItem year="1B yrs" label="First Stars & Galaxies" frame={frame} startFrame={10} index={2} />
          <TimelineItem year="13.8B yrs" label="Today" frame={frame} startFrame={10} index={3} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: Summary
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, textAlign: 'center' }}>
        <h2 style={{ fontSize: 70, color: '#fff', marginBottom: 50 }}>Our Cosmic Address</h2>
        
        <div style={{ display: 'flex', gap: 40, justifyContent: 'center' }}>
          <FormulaDisplay formula="v = H₀d" label="Expansion" frame={frame} delay={10} />
          <FormulaDisplay formula="z > 0" label="Redshift" frame={frame} delay={20} />
          <FormulaDisplay formula="2.725 K" label="CMB Temp" frame={frame} delay={30} />
        </div>

        <div style={{ marginTop: 80, fontSize: 30, color: '#94a3b8' }}>
          We are made of starstuff, inhabiting a universe born of light.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// --- Main Composition Component ---
export const TheBigBangTheory: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  
  // Scene Durations (Total 540 frames)
  // Scene 1: 0-81 (81 frames)
  // Scene 2: 81-216 (135 frames)
  // Scene 3: 216-351 (135 frames)
  // Scene 4: 351-486 (135 frames)
  // Scene 5: 486-540 (54 frames)

  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={81}>
        <Scene1 />
      </Sequence>
      
      <Sequence from={81} durationInFrames={135}>
        <Scene2 />
      </Sequence>
      
      <Sequence from={216} durationInFrames={135}>
        <Scene3 />
      </Sequence>
      
      <Sequence from={351} durationInFrames={135}>
        <Scene4 />
      </Sequence>
      
      <Sequence from={486} durationInFrames={54}>
        <Scene5 />
      </Sequence>
    </AbsoluteFill>
  );
};

// --- Root Component ---
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TheBigBangTheory"
        component={TheBigBangTheory}
        durationInFrames={540}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ title: "The Big Bang Theory" }}
      />
    </>
  );
};

// --- Register Root ---
registerRoot(RemotionRoot);