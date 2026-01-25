import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from 'remotion';

// --- Types & Interfaces ---
type TitleProps = {
  title: string;
  subtitle: string;
};

type GraphDataPoint = {
  year: number;
  value: number;
};

// --- Helper Components ---

// 1. Title Card Component
const TitleCard: React.FC<TitleProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 200 },
  });

  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        textAlign: 'center',
        color: 'white',
      }}
    >
      <h1 style={{ fontSize: 80, fontWeight: 'bold', margin: 0, textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
        {title}
      </h1>
      <h2 style={{ fontSize: 40, marginTop: 20, color: '#F59E0B' }}>{subtitle}</h2>
    </div>
  );
};

// 2. Temperature Graph Component
const TempGraph: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  
  // Animation duration for this scene
  const duration = 180; // 6 seconds
  const progress = interpolate(frame, [0, duration], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
  
  // Data points (simplified for visualization)
  const data: GraphDataPoint[] = [
    { year: 1920, value: -0.2 },
    { year: 1940, value: 0.1 },
    { year: 1960, value: 0.0 },
    { year: 1980, value: 0.3 },
    { year: 2000, value: 0.6 },
    { year: 2024, value: 1.2 },
  ];

  const graphWidth = 800;
  const graphHeight = 400;
  const padding = 60;
  
  // Generate SVG Path
  const pathD = data.map((point, index) => {
    const x = padding + (point.year - 1920) / (2024 - 1920) * graphWidth;
    const y = graphHeight - padding - (point.value + 0.5) * (graphHeight / 2.5);
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  // Animate the line drawing
  const drawLength = progress * 2000; // Approximate path length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h2 style={{ color: 'white', fontSize: 48, marginBottom: 40 }}>Global Temperature Anomaly (°C)</h2>
      <svg width={graphWidth + padding * 2} height={graphHeight + padding * 2} style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10 }}>
        {/* Axes */}
        <line x1={padding} y1={graphHeight - padding} x2={graphWidth + padding} y2={graphHeight - padding} stroke="white" strokeWidth={2} />
        <line x1={padding} y1={padding} x2={padding} y2={graphHeight - padding} stroke="white" strokeWidth={2} />
        
        {/* Labels */}
        <text x={padding} y={graphHeight - padding + 30} fill="white" fontSize={20}>1920</text>
        <text x={graphWidth + padding - 50} y={graphHeight - padding + 30} fill="white" fontSize={20}>2024</text>
        
        {/* Data Line */}
        <path d={pathD} fill="none" stroke="#DC2626" strokeWidth={5} strokeDasharray={drawLength} strokeDashoffset={0} strokeLinecap="round" />
        
        {/* Current Year Indicator */}
        {progress > 0.1 && (
          <circle 
            cx={padding + (Math.min(1920 + (2024 - 1920) * progress * 1.5, 2024) - 1920) / (2024 - 1920) * graphWidth} 
            cy={graphHeight - padding - ((Math.min(1920 + (2024 - 1920) * progress * 1.5, 2024) > 2000 ? 1.2 : 0.6) + 0.5) * (graphHeight / 2.5)} 
            r="8" 
            fill="#F59E0B" 
          />
        )}
      </svg>
    </div>
  );
};

// 3. Ice & Weather Component
const IceWeather: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const iceHeight = interpolate(frame, [0, 90], [300, 100], { extrapolateRight: 'clamp' });
  const stormOpacity = interpolate(frame, [30, 90], [0, 1], { extrapolateRight: 'clamp' });
  const stormScale = spring({ frame: frame - 60, fps, config: { damping: 15 } });

  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', width: '100%', height: '100%', padding: 100 }}>
      {/* Ice Mass Visualization */}
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ color: '#60A5FA', fontSize: 32, marginBottom: 20 }}>Ice Mass Volume</h3>
        <div style={{ width: 200, height: 400, border: '4px solid white', display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
          <div style={{ width: '100%', height: iceHeight, backgroundColor: '#60A5FA', transition: 'height 0.1s' }} />
          <div style={{ position: 'absolute', top: -50, left: 0, width: '100%', color: 'white', fontSize: 24 }}>
            {Math.round(interpolate(frame, [0, 90], [100, 30], { extrapolateRight: 'clamp' }))}%
          </div>
        </div>
      </div>

      {/* Extreme Weather Visualization */}
      <div style={{ textAlign: 'center', opacity: stormOpacity }}>
        <h3 style={{ color: '#DC2626', fontSize: 32, marginBottom: 20 }}>Extreme Events</h3>
        <div style={{ fontSize: 120, transform: `scale(${stormScale})` }}>🌪️</div>
        <div style={{ fontSize: 120, transform: `scale(${spring({ frame: frame - 80, fps, config: { damping: 15 } })})` }}>🔥</div>
      </div>
    </div>
  );
};

// 4. Sea Level Component
const SeaLevel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const seaLevelY = interpolate(frame, [0, 90], [500, 200], { extrapolateRight: 'clamp' });
  const cityOpacity = interpolate(frame, [0, 60], [1, 0.2], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <h2 style={{ position: 'absolute', top: 50, left: 100, color: 'white', fontSize: 48, zIndex: 10 }}>
        Rising Sea Levels
      </h2>
      
      {/* City Skyline Silhouette */}
      <div style={{ position: 'absolute', bottom: 100, left: 0, width: '100%', height: 400, opacity: cityOpacity, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div style={{ width: 100, height: 300, backgroundColor: '#374151', marginRight: 20 }} />
        <div style={{ width: 150, height: 400, backgroundColor: '#374151', marginRight: 20 }} />
        <div style={{ width: 80, height: 250, backgroundColor: '#374151', marginRight: 20 }} />
        <div style={{ width: 200, height: 350, backgroundColor: '#374151', marginRight: 20 }} />
        <div style={{ width: 120, height: 280, backgroundColor: '#374151' }} />
      </div>

      {/* Rising Water */}
      <div 
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: seaLevelY,
          backgroundColor: 'rgba(30, 58, 138, 0.8)',
          borderTop: '4px solid #60A5FA',
          transition: 'height 0.1s linear'
        }}
      />
      
      {/* Gauge */}
      <div style={{ position: 'absolute', right: 100, top: 200, height: 400, width: 40, border: '2px solid white', borderRadius: 20, overflow: 'hidden' }}>
        <div style={{ width: '100%', height: `${interpolate(frame, [0, 90], [0, 100], { extrapolateRight: 'clamp' })}%`, backgroundColor: '#DC2626', position: 'absolute', bottom: 0 }} />
      </div>
    </div>
  );
};

// 5. Summary Component
const Summary: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const items = [
    "Temperatures are rising faster than ever.",
    "Ice caps are melting at accelerating rates.",
    "Coastal cities face imminent flooding threats.",
    "Action is required NOW."
  ];

  return (
    <div style={{ padding: 100, color: 'white' }}>
      <h1 style={{ fontSize: 64, marginBottom: 60, color: '#F59E0B' }}>The Urgency</h1>
      <ul style={{ listStyle: 'none', padding: 0, fontSize: 36 }}>
        {items.map((item, index) => {
          const startFrame = index * 15;
          const opacity = interpolate(frame, [startFrame, startFrame + 15], [0, 1], { extrapolateRight: 'clamp' });
          const translateX = interpolate(frame, [startFrame, startFrame + 15], [50, 0], { extrapolateRight: 'clamp' });
          
          return (
            <li key={index} style={{ 
              opacity, 
              transform: `translateX(${translateX}px)`, 
              marginBottom: 30,
              display: 'flex',
              alignItems: 'center'
            }}>
              <span style={{ color: '#DC2626', marginRight: 20, fontSize: 40 }}>⚠️</span>
              {item}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// --- Main Video Component ---
export const GlobalWarmingVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#111827' }}>
      {/* Scene 1: Title (0-90) */}
      <Sequence from={0} durationInFrames={90}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(to bottom, #1E3A8A, #111827)' }}>
          <TitleCard title="Global Warming" subtitle="A Crisis in Motion" />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 2: Data (90-270) */}
      <Sequence from={90} durationInFrames={180}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <TempGraph />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 3: Ice & Weather (270-450) */}
      <Sequence from={270} durationInFrames={180}>
        <AbsoluteFill style={{ background: '#1F2937' }}>
          <IceWeather />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 4: Sea Level (450-540) */}
      <Sequence from={450} durationInFrames={90}>
        <AbsoluteFill>
          <SeaLevel />
        </AbsoluteFill>
      </Sequence>

      {/* Scene 5: Summary (540-600) */}
      <Sequence from={540} durationInFrames={60}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', background: '#000' }}>
          <Summary />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

// --- Root Component ---
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GlobalWarmingVideo"
        component={GlobalWarmingVideo}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

// --- Register Root ---
registerRoot(RemotionRoot);