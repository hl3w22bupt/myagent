import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from 'remotion';

// --- Types & Interfaces ---
type PyramidLevel = {
  label: string;
  color: string;
  width: number;
};

type MealItem = {
  name: string;
  time: string;
};

// --- Helper Components ---

// Component: Pyramid Level
const PyramidLevel: React.FC<{ level: PyramidLevel; index: number; totalLevels: number }> = ({ level, index, totalLevels }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Staggered entrance animation
  const delay = index * 10;
  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  });
  
  const opacity = interpolate(scale, [0, 1], [0, 1]);
  const baseWidth = 600;
  const levelHeight = 60;
  const verticalSpacing = 10;
  
  // Calculate position to center pyramid
  const topOffset = (totalLevels * (levelHeight + verticalSpacing)) / 2;
  const yPos = index * (levelHeight + verticalSpacing) - topOffset;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: baseWidth * (level.width / 100),
        height: levelHeight,
        backgroundColor: level.color,
        transform: `translate(-50%, calc(-50% + ${yPos}px)) scale(${scale})`,
        opacity,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 24,
        borderRadius: 4,
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      }}
    >
      {level.label}
    </div>
  );
};

// Component: Heart Beat
const HeartIcon: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Pulsing animation
  const scale = 1 + Math.sin((frame / fps) * Math.PI * 4) * 0.1;
  
  return (
    <div
      style={{
        fontSize: 150,
        color: '#EF4444',
        transform: `scale(${scale})`,
        filter: 'drop-shadow(0 10px 15px rgba(239, 68, 68, 0.4))',
      }}
    >
      ❤️
    </div>
  );
};

// Component: Meal Card
const MealCard: React.FC<{ meal: MealItem; index: number }> = ({ meal, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const delay = index * 10;
  const slideIn = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
  });
  
  const xPos = interpolate(slideIn, [0, 1], [100, 0]);
  
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 20,
        transform: `translateX(${xPos}px)`,
        opacity: slideIn,
      }}
    >
      <div style={{ 
        width: 80, 
        height: 80, 
        backgroundColor: '#F59E0B', 
        borderRadius: '50%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        fontSize: 30,
        marginRight: 20,
        flexShrink: 0
      }}>
        🍽️
      </div>
      <div>
        <h2 style={{ fontSize: 32, margin: 0, color: '#065F46' }}>{meal.name}</h2>
        <p style={{ fontSize: 24, margin: 0, color: '#059669' }}>{meal.time}</p>
      </div>
    </div>
  );
};

// --- Scenes ---

// Scene 1: Introduction
const Scene1Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const titleOpacity = spring({
    frame,
    fps,
    config: { damping: 200 },
  });
  
  const scale = interpolate(titleOpacity, [0, 1], [0.8, 1]);

  return (
    <AbsoluteFill style={{ 
      backgroundColor: '#FEF3C7', 
      justifyContent: 'center', 
      alignItems: 'center',
      flexDirection: 'column'
    }}>
      <div style={{ 
        fontSize: 120, 
        fontWeight: 'bold', 
        color: '#065F46',
        textAlign: 'center',
        opacity: titleOpacity,
        transform: `scale(${scale})`,
        marginBottom: 20
      }}>
        Mediterranean Diet
      </div>
      <div style={{ 
        fontSize: 40, 
        color: '#059669',
        opacity: titleOpacity 
      }}>
        Eat Well, Live Longer
      </div>
      {/* Decorative Elements */}
      <div style={{ position: 'absolute', top: 100, left: 100, fontSize: 60, opacity: 0.5 }}>🫒</div>
      <div style={{ position: 'absolute', bottom: 100, right: 100, fontSize: 60, opacity: 0.5 }}>🐟</div>
      <div style={{ position: 'absolute', top: 200, right: 200, fontSize: 60, opacity: 0.5 }}>🍅</div>
    </AbsoluteFill>
  );
};

// Scene 2: The Pyramid
const Scene2Pyramid: React.FC = () => {
  const levels: PyramidLevel[] = [
    { label: 'Sweets / Red Meat (Rarely)', color: '#EF4444', width: 30 },
    { label: 'Poultry / Eggs / Dairy (Moderate)', color: '#F59E0B', width: 50 },
    { label: 'Fish / Seafood (Often)', color: '#3B82F6', width: 70 },
    { label: 'Fruits, Veg, Beans, Grains, Nuts (Base)', color: '#10B981', width: 90 },
  ];

  return (
    <AbsoluteFill style={{ 
      backgroundColor: '#FEF3C7', 
      justifyContent: 'center', 
      alignItems: 'center' 
    }}>
      <h1 style={{ 
        position: 'absolute', 
        top: 100, 
        fontSize: 60, 
        color: '#065F46',
        textAlign: 'center',
        width: '100%'
      }}>
        The Food Pyramid
      </h1>
      <div style={{ position: 'relative', width: 800, height: 400 }}>
        {levels.map((level, i) => (
          <PyramidLevel key={i} level={level} index={i} totalLevels={levels.length} />
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 100, fontSize: 30, color: '#064E3B', maxWidth: 1000, textAlign: 'center' }}>
        Focus on plant-based foods and healthy fats.
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: Health Benefits
const Scene3Benefits: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const textOpacity = interpolate(frame, [0, 1 * fps], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ 
      backgroundColor: '#ECFDF5', 
      justifyContent: 'center', 
      alignItems: 'center',
      flexDirection: 'row' 
    }}>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <HeartIcon />
      </div>
      <div style={{ flex: 1, paddingRight: 100, opacity: textOpacity }}>
        <h1 style={{ fontSize: 60, color: '#065F46', marginBottom: 30 }}>Health Benefits</h1>
        <ul style={{ fontSize: 32, color: '#047857', lineHeight: 1.5, listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: 20 }}>✅ Reduced Heart Disease Risk</li>
          <li style={{ marginBottom: 20 }}>✅ Increased Longevity</li>
          <li style={{ marginBottom: 20 }}>✅ Improved Brain Function</li>
        </ul>
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: A Day of Eating
const Scene4Meals: React.FC = () => {
  const meals: MealItem[] = [
    { name: 'Greek Yogurt with Berries', time: 'Breakfast' },
    { name: 'Quinoa Salad with Veggies', time: 'Lunch' },
    { name: 'Grilled Fish with Greens', time: 'Dinner' },
  ];

  return (
    <AbsoluteFill style={{ 
      backgroundColor: '#FFFBEB', 
      justifyContent: 'center', 
      alignItems: 'center' 
    }}>
      <h1 style={{ 
        position: 'absolute', 
        top: 80, 
        fontSize: 60, 
        color: '#92400E',
        textDecoration: 'underline'
      }}>
        A Day of Eating
      </h1>
      <div style={{ marginTop: 100 }}>
        {meals.map((meal, i) => (
          <MealCard key={i} meal={meal} index={i} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: Summary
const Scene5Summary: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const opacity = interpolate(frame, [0, 0.5 * fps], [0, 1]);

  return (
    <AbsoluteFill style={{ 
      backgroundColor: '#065F46', 
      justifyContent: 'center', 
      alignItems: 'center' 
    }}>
      <div style={{ opacity, textAlign: 'center' }}>
        <h1 style={{ fontSize: 70, color: '#D1FAE5', marginBottom: 40 }}>Key Takeaways</h1>
        <div style={{ fontSize: 35, color: '#fff', lineHeight: 1.8, textAlign: 'left', display: 'inline-block' }}>
          <p>🌿 Plants are the foundation</p>
          <p>🫒 Olive oil over butter</p>
          <p>🧂 Herbs over salt</p>
          <p>❤️ Food is enjoyment</p>
        </div>
        <div style={{ marginTop: 50, fontSize: 40, color: '#F59E0B', fontWeight: 'bold' }}>
          Start Today!
        </div>
      </div>
    </AbsoluteFill>
  );
};

// --- Main Composition ---

export const MediterraneanDietVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Scene 1: Intro (0 - 45 frames) */}
      <Sequence from={0} durationInFrames={45}>
        <Scene1Intro />
      </Sequence>
      
      {/* Scene 2: Pyramid (45 - 135 frames) */}
      <Sequence from={45} durationInFrames={90}>
        <Scene2Pyramid />
      </Sequence>
      
      {/* Scene 3: Benefits (135 - 210 frames) */}
      <Sequence from={135} durationInFrames={75}>
        <Scene3Benefits />
      </Sequence>
      
      {/* Scene 4: Meals (210 - 270 frames) */}
      <Sequence from={210} durationInFrames={60}>
        <Scene4Meals />
      </Sequence>
      
      {/* Scene 5: Summary (270 - 300 frames) */}
      <Sequence from={270} durationInFrames={30}>
        <Scene5Summary />
      </Sequence>
    </AbsoluteFill>
  );
};

// --- Root Registration ---

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MediterraneanDietGuide"
        component={MediterraneanDietVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};

registerRoot(RemotionRoot);