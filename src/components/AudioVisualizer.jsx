import React, { useEffect, useRef } from 'react';
import './AudioVisualizer.css';

const AudioVisualizer = ({ audioLevel, isRecording }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const barsRef = useRef([]);

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const barCount = 32;
    const barWidth = (width / barCount) * 0.6;
    const gap = (width / barCount) * 0.4;

    // Initialize bars with random heights for visual effect
    if (barsRef.current.length === 0) {
      barsRef.current = Array(barCount).fill(0).map(() => Math.random() * 0.3);
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Update bars based on audio level
      const baseHeight = audioLevel / 100;
      const targetHeights = barsRef.current.map(() => 
        baseHeight * 0.8 + (Math.random() * 0.2)
      );

      // Smooth transition
      barsRef.current = barsRef.current.map((current, i) => {
        const target = targetHeights[i];
        return current + (target - current) * 0.3;
      });

      // Draw bars
      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap) + gap / 2;
        const barHeight = barsRef.current[i] * height * 0.9;
        const y = height - barHeight;

        // Gradient bar
        const gradient = ctx.createLinearGradient(0, y, 0, height);
        const intensity = barsRef.current[i];
        
        if (isRecording) {
          gradient.addColorStop(0, `rgba(0, 212, 255, ${intensity + 0.3})`);
          gradient.addColorStop(0.5, `rgba(0, 212, 255, ${intensity * 0.6 + 0.2})`);
          gradient.addColorStop(1, `rgba(123, 47, 252, ${intensity * 0.3 + 0.1})`);
        } else {
          gradient.addColorStop(0, 'rgba(100, 100, 100, 0.2)');
          gradient.addColorStop(1, 'rgba(100, 100, 100, 0.05)');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);

        // Glow effect on top
        if (isRecording && barHeight > 10) {
          ctx.shadowColor = 'rgba(0, 212, 255, 0.2)';
          ctx.shadowBlur = 10;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.fillRect(x, y, barWidth, 2);
          ctx.shadowBlur = 0;
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [audioLevel, isRecording]);

  return (
    <div className="audio-visualizer-container">
      <canvas
        ref={canvasRef}
        className="audio-visualizer"
        width={600}
        height={80}
      />
      {isRecording && (
        <div className="visualizer-label">
          <span className="visualizer-dot">●</span>
          Live Audio
        </div>
      )}
    </div>
  );
};

export default AudioVisualizer;