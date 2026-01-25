import React, { useMemo } from 'react';
import { Composition, registerRoot } from 'remotion';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from 'remotion';

// --- Types & Interfaces ---
type DataPoint = { x: number; y: number; };

// --- Helper Components ---

// 1. Formula Display Component
const Formula: React.FC<{ formula: string; subtext?: string; }> = ({ formula, subtext }) => {
  return (
    <div style={{ textAlign: 'center', fontFamily: 'Georgia, serif', color: '#1e293b' }}>
      <div style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '10px' }}>{formula}</div>
      {subtext && <div style={{ fontSize: '24px', color: '#64748b' }}>{subtext}</div>}
    </div>
  );
};

// 2. 2D Scatter Plot Component
const ScatterPlot: React.FC<{ 
  points: DataPoint[]; 
  slope: number; 
  intercept: number; 
  showResiduals?: boolean; 
  frame: number;
}> = ({ points, slope, intercept, showResiduals, frame }) => {
  // Animation for line drawing
  const lineProgress = Math.min(Math.max((frame - 10) / 30, 0), 1);
  
  // Animation for residuals
  const residualOpacity = showResiduals ? Math.min(Math.max((frame - 40) / 15, 0), 1) : 0;

  const width = 600;
  const height = 400;
  const padding = 40;
  
  // Scales
  const xScale = (val: number) => padding + (val / 10) * (width - 2 * padding);
  const yScale = (val: number) => height - padding - (val / 10) * (height - 2 * padding);

  const getY = (x: number) => slope * x + intercept;

  return (
    <svg width={width} height={height} style={{ backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
      {/* Axes */}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" strokeWidth={2} />
      <line x1={padding} y1={height - padding} x2={padding} y2={padding} stroke="#cbd5e1" strokeWidth={2} />
      
      {/* Data Points */}
      {points.map((p, i) => (
        <circle key={i} cx={xScale(p.x)} cy={yScale(p.y)} r={6} fill="#3b82f6" opacity={0.8} />
      ))}

      {/* Regression Line */}
      <line
        x1={xScale(0)}
        y1={yScale(getY(0))}
        x2={xScale(10)}
        y2={yScale(getY(10))}
        stroke="#f97316"
        strokeWidth={4}
        strokeDasharray={lineProgress < 1 ? "10, 10" : "0"}
        strokeDashoffset={lineProgress < 1 ? `${(1 - lineProgress) * 1000}` : "0"}
        style={{ transition: 'stroke-dashoffset 0.1s linear' }}
      />

      {/* Residuals */}
      {showResiduals && points.map((p, i) => {
        const predY = getY(p.x);
        const actualY = p.y;
        // Color based on error magnitude
        const error = Math.abs(predY - actualY);
        const color = error > 2 ? '#ef4444' : '#3b82f6'; // Red for large error, Blue for small
        
        return (
          <line
            key={`res-${i}`}
            x1={xScale(p.x)}
            y1={yScale(actualY)}
            x2={xScale(p.x)}
            y2={yScale(predY)}
            stroke={color}
            strokeWidth={2}
            opacity={residualOpacity}
          />
        );
      })}
    </svg>
  );
};

// 3. 3D Gradient Descent Visualization (Simulated with SVG for performance)
const GradientDescentViz: React.FC<{ frame: number }> = ({ frame }) => {
  const size = 400;
  const center = size / 2;
  const progress = Math.min(Math.max((frame - 20) / 60, 0), 1);
  
  // Ball position logic (spiral inwards)
  const maxRadius = 140;
  const currentRadius = maxRadius * (1 - progress);
  const angle = progress * Math.PI * 4; // 2 full rotations
  
  const ballX = center + Math.cos(angle) * currentRadius;
  const ballY = center + Math.sin(angle) * currentRadius * 0.4; // Flattened for 3D effect
  const ballZ = progress * 100; // Move "down" into the bowl

  // Generate grid lines for the bowl
  const gridLines = [];
  for(let i=0; i<=10; i++) {
    const x = (i / 10) * size;
    gridLines.push(<line key={`v-${i}`} x1={x} y1={0} x2={x} y2={size} stroke="#e2e8f0" strokeWidth={1} />);
    const y = (i / 10) * size;
    gridLines.push(<line key={`h-${i}`} x1={0} y1={y} x2={size} y2={y} stroke="#e2e8f0" strokeWidth={1} />);
  }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        {/* Bowl Grid */}
        {gridLines}
        
        {/* Contour circles */}
        {[1, 2, 3].map((i) => (
          <ellipse
            key={i}
            cx={center}
            cy={center}
            rx={i * 40}
            ry={i * 15}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="5,5"
          />
        ))}

        {/* Gradient Arrow */}
        {progress < 1 && (
          <line
            x1={ballX}
            y1={ballY}
            x2={ballX - (ballX - center) * 0.2}
            y2={ballY - (ballY - center) * 0.2}
            stroke="#ef4444"
            strokeWidth={3}
            markerEnd="url(#arrowhead)"
          />
        )}
        
        {/* The Ball */}
        <circle
          cx={ballX}
          cy={ballY}
          r={10 + (progress * 2)} // Gets slightly larger as it gets "closer/lower"
          fill="#10b981"
          opacity={1}
        />
      </svg>
      
      {/* Labels */}
      <div style={{ position: 'absolute', bottom: -40, width: '100%', textAlign: 'center', fontSize: '20px', color: '#64748b' }}>
        Loss Surface (Cost Function)
      </div>
    </div>
  );
};

// --- Scene Components ---

// Scene 1: Introduction
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const slideUp = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const yPos = interpolate(slideUp, [0, 1], [50, 0]);

  // Static data for house prices
  const data: DataPoint[] = [
    { x: 2, y: 3 }, { x: 4, y: 5 }, { x: 6, y: 5 }, { x: 8, y: 8 }
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <div style={{ opacity, transform: `translateY(${yPos}px)`, textAlign: 'center' }}>
        <h1 style={{ fontSize: '64px', color: '#1e293b', marginBottom: '20px' }}>Linear Regression</h1>
        <p style={{ fontSize: '32px', color: '#64748b' }}>Finding the best fit line through data</p>
      </div>
      
      <div style={{ marginTop: '40px', opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' }) }}>
        <ScatterPlot points={data} slope={0.8} intercept={1.5} frame={frame} />
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: The Loss Function
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const data: DataPoint[] = [
    { x: 2, y: 3 }, { x: 4, y: 5 }, { x: 6, y: 5 }, { x: 8, y: 8 }
  ];

  const titleOpacity = interpolate(frame, [0, 10], [0, 1]);
  const graphScale = spring({ frame: frame - 20, fps, config: { damping: 200 } });
  const formulaOpacity = interpolate(frame, [40, 60], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <h2 style={{ fontSize: '48px', color: '#1e293b', marginBottom: '30px', opacity: titleOpacity }}>The Loss Function</h2>
      
      <div style={{ transform: `scale(${graphScale})`, transformOrigin: 'center' }}>
        <ScatterPlot points={data} slope={0.8} intercept={1.5} showResiduals={true} frame={frame} />
      </div>

      <div style={{ marginTop: '40px', opacity: formulaOpacity }}>
        <Formula formula="Loss = Σ(y - ŷ)²" subtext="Sum of Squared Errors" />
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: Gradient Descent
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 10], [0, 1]);
  const vizOpacity = interpolate(frame, [10, 30], [0, 1]);
  const textOpacity = interpolate(frame, [60, 80], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <h2 style={{ fontSize: '48px', color: '#1e293b', marginBottom: '20px', opacity: titleOpacity }}>Gradient Descent</h2>
      
      <div style={{ opacity: vizOpacity, display: 'flex', gap: '40px', alignItems: 'center' }}>
        <GradientDescentViz frame={frame} />
        
        <div style={{ textAlign: 'left', maxWidth: '400px' }}>
          <p style={{ fontSize: '24px', color: '#475569', lineHeight: '1.5', opacity: textOpacity }}>
            Imagine a ball rolling down a hill. We adjust our line parameters to find the lowest point (minimum error).
          </p>
          <div style={{ marginTop: '20px', opacity: textOpacity }}>
            <Formula formula="m = m - α * gradient" subtext="Update Rule" />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: Real World Applications
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const card1Spring = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const card2Spring = spring({ frame: frame - 30, fps, config: { damping: 200 } });

  const cardStyle = (scale: number) => ({
    backgroundColor: '#ffffff',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    width: '300px',
    transform: `scale(${scale})`,
    transformOrigin: 'center',
    display: 'flex',
    flexDirection: 'column' as 'column',
    alignItems: 'center' as 'center',
    margin: '20px'
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' }}>
      <h2 style={{ fontSize: '48px', color: '#1e293b', marginBottom: '40px' }}>Real World Applications</h2>
      
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        <div style={cardStyle(card1Spring)}>
          <div style={{ fontSize: '60px', marginBottom: '10px' }}>🏠</div>
          <h3 style={{ fontSize: '24px', color: '#1e293b' }}>House Prices</h3>
          <p style={{ fontSize: '18px', color: '#64748b', textAlign: 'center' }}>Predict price based on size</p>
        </div>

        <div style={cardStyle(card2Spring)}>
          <div style={{ fontSize: '60px', marginBottom: '10px' }}>📈</div>
          <h3 style={{ fontSize: '24px', color: '#1e293b' }}>Sales Trends</h3>
          <p style={{ fontSize: '18px', color: '#64748b', textAlign: 'center' }}>Forecast revenue over time</p>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: Summary
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const listProgress = Math.min(Math.max((frame - 20) / 10, 0), 3);

  const items = [
    { text: "Model: y = mx + b", icon: "📐" },
    { text: "Loss: Measure error", icon: "📏" },
    { text: "Optimizer: Gradient Descent", icon: "🚀" }
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <h2 style={{ fontSize: '56px', color: '#1e293b', marginBottom: '50px', opacity }}>Summary</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {items.map((item, index) => {
          const itemOpacity = listProgress > index ? 1 : 0;
          const translateY = listProgress > index ? 0 : 20;
          
          return (
            <div 
              key={index} 
              style={{ 
                fontSize: '32px', 
                color: '#334155', 
                opacity: itemOpacity, 
                transform: `translateY(${translateY}px)`,
                transition: 'all 0.5s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
              }}
            >
              <span style={{ fontSize: '40px' }}>{item.icon}</span>
              {item.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// --- Main Composition Component ---
export const LinearRegressionVideo: React.FC = () => {
  const { durationInFrames } = useVideoConfig();

  // Calculate scene durations based on percentages
  const scene1End = Math.floor(durationInFrames * 0.15);
  const scene2End = scene1End + Math.floor(durationInFrames * 0.25);
  const scene3End = scene2End + Math.floor(durationInFrames * 0.35);
  const scene4End = scene3End + Math.floor(durationInFrames * 0.15);

  return (
    <AbsoluteFill>
      {/* Scene 1: Intro */}
      <Sequence from={0} durationInFrames={scene1End}>
        <Scene1 />
      </Sequence>

      {/* Scene 2: Loss Function */}
      <Sequence from={scene1End} durationInFrames={scene2End - scene1End}>
        <Scene2 />
      </Sequence>

      {/* Scene 3: Gradient Descent */}
      <Sequence from={scene2End} durationInFrames={scene3End - scene2End}>
        <Scene3 />
      </Sequence>

      {/* Scene 4: Applications */}
      <Sequence from={scene3End} durationInFrames={scene4End - scene3End}>
        <Scene4 />
      </Sequence>

      {/* Scene 5: Summary */}
      <Sequence from={scene4End} durationInFrames={durationInFrames - scene4End}>
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
        id="LinearRegression"
        component={LinearRegressionVideo}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

// --- Register Root ---
registerRoot(RemotionRoot);