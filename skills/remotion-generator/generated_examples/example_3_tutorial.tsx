import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from 'remotion';

// --- Types & Interfaces ---
type CodeBlockProps = {
  code: string;
  title?: string;
  delay: number;
};

type PillProps = {
  label: string;
  color: string;
  delay: number;
};

type ChecklistItemProps = {
  text: string;
  delay: number;
};

// --- Helper Components ---

// Syntax highlighted code block
const CodeBlock: React.FC<CodeBlockProps> = ({ code, title, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const opacity = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  });
  
  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 80, mass: 2 },
  });

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        backgroundColor: '#1e1e1e',
        padding: '20px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        color: '#d4d4d4',
        fontSize: '24px',
        width: '800px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        borderLeft: `5px solid #61DAFB`,
      }}
    >
      {title && (
        <div style={{ color: '#9cdcfe', marginBottom: '10px', fontSize: '18px' }}>
          {title}
        </div>
      )}
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        <span style={{ color: '#c586c0' }}>const</span> [state, setState] = <span style={{ color: '#dcdcaa' }}>useState</span>(<span style={{ color: '#ce9178' }>{code}</span>);
      </pre>
    </div>
  );
};

// Animated Pill/Tag
const Pill: React.FC<PillProps> = ({ label, color, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 200 },
  });

  const translateY = interpolate(enter, [0, 1], [50, 0]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        backgroundColor: color,
        color: '#fff',
        padding: '10px 20px',
        borderRadius: '20px',
        fontWeight: 'bold',
        fontSize: '20px',
        margin: '10px',
        display: 'inline-block',
      }}
    >
      {label}
    </div>
  );
};

// Checklist Item
const ChecklistItem: React.FC<ChecklistItemProps> = ({ text, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateRight: 'clamp',
  });
  
  const translateX = interpolate(frame, [delay, delay + 15], [-20, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${translateX}px)`,
        display: 'flex',
        alignItems: 'center',
        marginBottom: '15px',
        fontSize: '28px',
        color: '#333',
      }}
    >
      <div
        style={{
          width: '24px',
          height: '24px',
          backgroundColor: '#61DAFB',
          borderRadius: '50%',
          marginRight: '15px',
          flexShrink: 0,
        }}
      />
      {text}
    </div>
  );
};

// --- Scenes ---

// Scene 1: Title
const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = spring({
    frame: frame - 5,
    fps,
    config: { damping: 200 },
  });

  const scale = spring({
    frame: frame - 10,
    fps,
    config: { damping: 15, stiffness: 80, mass: 2 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#20232A', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: '120px',
            fontWeight: 'bold',
            color: '#61DAFB',
            marginBottom: '20px',
            opacity: titleOpacity,
            transform: `scale(${scale})`,
          }}
        >
          Modern React
        </div>
        <div
          style={{
            fontSize: '48px',
            color: '#fff',
            opacity: interpolate(frame, [10, 30], [0, 1], { extrapolateRight: 'clamp' }),
          }}
        >
          Core Concepts
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: useState
const Scene2State: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Local frame logic
  const progress = spring({
    frame: frame - 10,
    fps,
    config: { damping: 200 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#282C34', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '48px', color: '#61DAFB', marginBottom: '40px' }}>Managing State</h2>
        <CodeBlock code="initialValue" title="useState Hook" delay={0} />
        
        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
           <Pill label="Local Memory" color="#FF6B6B" delay={20} />
           <Pill label="Triggers Re-render" color="#4ECDC4" delay={30} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: useEffect
const Scene3Effect: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#282C34', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '48px', color: '#61DAFB', marginBottom: '40px' }}>Side Effects</h2>
        
        <div style={{ 
          backgroundColor: '#1e1e1e', 
          padding: '30px', 
          borderRadius: '8px', 
          fontFamily: 'monospace', 
          color: '#d4d4d4', 
          fontSize: '24px',
          width: '900px',
          textAlign: 'left',
          borderLeft: '5px solid #61DAFB'
        }}>
          <div style={{ color: '#6a9955' }}>// Lifecycle, Subscriptions, DOM</div>
          <span style={{ color: '#c586c0' }}>useEffect</span>(() => {'{'}
          <br />
          <span style={{ marginLeft: '20px' }}>/* ... */</span>
          <br />
          {'}'}, [<span style={{ color: '#9cdcfe' }}>deps</span>]);
        </div>

        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
           <Pill label="Mount" color="#FFE66D" delay={20} />
           <Pill label="Update" color="#FF6B6B" delay={30} />
           <Pill label="Cleanup" color="#4ECDC4" delay={40} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: useContext
const Scene4Context: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#282C34', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '48px', color: '#61DAFB', marginBottom: '40px' }}>Sharing State</h2>
        
        <div style={{ 
          backgroundColor: '#1e1e1e', 
          padding: '30px', 
          borderRadius: '8px', 
          fontFamily: 'monospace', 
          color: '#d4d4d4', 
          fontSize: '24px',
          width: '900px',
          textAlign: 'left',
          borderLeft: '5px solid #61DAFB'
        }}>
          <span style={{ color: '#c586c0' }}>const</span> value = <span style={{ color: '#dcdcaa' }}>useContext</span>(MyContext);
        </div>

        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
           <Pill label="No Prop Drilling" color="#C7F464" delay={20} />
           <Pill label="Global State" color="#FF6B6B" delay={30} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: Custom Hooks
const Scene5Custom: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#282C34', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '48px', color: '#61DAFB', marginBottom: '40px' }}>Custom Hooks</h2>
        
        <div style={{ 
          backgroundColor: '#1e1e1e', 
          padding: '30px', 
          borderRadius: '8px', 
          fontFamily: 'monospace', 
          color: '#d4d4d4', 
          fontSize: '24px',
          width: '900px',
          textAlign: 'left',
          borderLeft: '5px solid #61DAFB'
        }}>
          <span style={{ color: '#c586c0' }}>const</span> useCustom = () => {'{'}
          <br />
          <span style={{ marginLeft: '20px', color: '#6a9955' }}>// Reusable Logic</span>
          <br />
          {'}'};
        </div>

        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
           <Pill label="Extract Logic" color="#C44D58" delay={20} />
           <Pill label="Composition" color="#FF6B6B" delay={30} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 6: Summary
const Scene6Summary: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#20232A', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'left', paddingLeft: '200px' }}>
        <h2 style={{ fontSize: '48px', color: '#61DAFB', marginBottom: '40px', textAlign: 'center' }}>Best Practices</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <ChecklistItem text="useState for local component memory" delay={0} />
          <ChecklistItem text="useEffect for synchronization" delay={15} />
          <ChecklistItem text="useContext to avoid prop drilling" delay={30} />
          <ChecklistItem text="Custom Hooks for reusable logic" delay={45} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// --- Main Composition ---

export const ReactConceptsVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Scene 1: Intro (0-36 frames) */}
      <Sequence from={0} durationInFrames={36}>
        <Scene1Intro />
      </Sequence>

      {/* Scene 2: State (36-126 frames) */}
      <Sequence from={36} durationInFrames={90}>
        <Scene2State />
      </Sequence>

      {/* Scene 3: Effect (126-216 frames) */}
      <Sequence from={126} durationInFrames={90}>
        <Scene3Effect />
      </Sequence>

      {/* Scene 4: Context (216-288 frames) */}
      <Sequence from={216} durationInFrames={72}>
        <Scene4Context />
      </Sequence>

      {/* Scene 5: Custom Hooks (288-324 frames) */}
      <Sequence from={288} durationInFrames={36}>
        <Scene5Custom />
      </Sequence>

      {/* Scene 6: Summary (324-360 frames) */}
      <Sequence from={324} durationInFrames={36}>
        <Scene6Summary />
      </Sequence>
    </AbsoluteFill>
  );
};

// --- Root Registration ---

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ReactConcepts"
        component={ReactConceptsVideo}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

registerRoot(RemotionRoot);