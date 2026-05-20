import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { BRAND } from "../styles/theme";

interface LiquidProgressBarProps {
  startFrame: number;
  durationFrames: number;
  width?: number | string;
  height?: number;
}

/**
 * Quiz Blitz tarzı sıvı dolan kapsül progress bar.
 * 
 * YAPI (katmanlar):
 * 1. Beyaz/açık pembe arkaplan kapsül (boş hali)
 * 2. Yeşil→sarı gradient sıvı dolan kısım (sol → sağ doluyor)
 * 3. Sıvı içinde parıltı noktaları (animasyonlu)
 * 4. Sarı şimşek dolum kafası (sıvının sınırında, bouncing)
 * 5. Beyaz outer outline (kapsül çerçeve)
 * 
 * Mekanik: 5 saniyede 0%'tan 100%'e doluyor (linear).
 * Kafa pulse yapıyor + içeride parıltı kayıyor.
 */
export const LiquidProgressBar: React.FC<LiquidProgressBarProps> = ({
  startFrame,
  durationFrames,
  width = "100%",
  height = 60,
}) => {
  const frame = useCurrentFrame();
  
  const elapsed = Math.max(0, frame - startFrame);
  const progress = Math.min(1, elapsed / durationFrames); // 0 → 1
  
  // Sıvı yüksekliği (idle pulse + ana progress)
  const pulse = 1 + Math.sin(frame * 0.4) * 0.02;
  
  // Bolt'un (şimşek kafanın) sürekli bouncing yapması
  const boltBounce = Math.sin(frame * 0.5) * 4;
  const boltScale = 1 + Math.sin(frame * 0.6) * 0.12;
  
  // Parıltı noktalar - sıvının içinde kayar
  const sparkles = Array.from({ length: 6 }).map((_, i) => {
    const baseX = (i / 6) * 100;
    const driftX = (Math.sin(frame * 0.05 + i) * 5) + baseX;
    const driftY = 50 + Math.sin(frame * 0.1 + i * 1.3) * 30;
    return { x: driftX, y: driftY, opacity: 0.5 + Math.sin(frame * 0.15 + i) * 0.3 };
  });
  
  const capsuleHeight = height;
  const capsuleRadius = capsuleHeight / 2;
  
  return (
    <div
      style={{
        position: "relative",
        width,
        height: capsuleHeight,
        transform: `scaleY(${pulse})`,
      }}
    >
      <svg
        width="100%"
        height={capsuleHeight}
        viewBox={`0 0 1000 ${capsuleHeight}`}
        preserveAspectRatio="none"
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Boş kısım gradient (beyaz → açık pembe) */}
          <linearGradient id="empty-gradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#FFE4F1" />
            <stop offset="100%" stopColor="#FFFFFF" />
          </linearGradient>
          
          {/* Dolu kısım gradient (yeşil → sarı, sağa doğru parlayan) */}
          <linearGradient id="fill-gradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#22C55E" />
            <stop offset="50%" stopColor="#84CC16" />
            <stop offset="100%" stopColor="#FFD700" />
          </linearGradient>
          
          {/* Üst parlama (highlight) */}
          <linearGradient id="highlight" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          
          {/* Clip path for capsule shape */}
          <clipPath id="capsule-clip">
            <rect
              x="0"
              y="0"
              width="1000"
              height={capsuleHeight}
              rx={capsuleRadius}
              ry={capsuleRadius}
            />
          </clipPath>
        </defs>
        
        {/* KATMAN 1: Boş kapsül arkaplan */}
        <rect
          x="0"
          y="0"
          width="1000"
          height={capsuleHeight}
          rx={capsuleRadius}
          ry={capsuleRadius}
          fill="url(#empty-gradient)"
        />
        
        {/* KATMAN 2: Dolu kısım (yeşil→sarı sıvı) */}
        <g clipPath="url(#capsule-clip)">
          <rect
            x="0"
            y="0"
            width={1000 * progress}
            height={capsuleHeight}
            fill="url(#fill-gradient)"
          />
          
          {/* Sıvı üst parlama */}
          <rect
            x="0"
            y="2"
            width={1000 * progress}
            height={capsuleHeight * 0.35}
            fill="url(#highlight)"
            opacity="0.5"
          />
          
          {/* KATMAN 3: Parıltı noktaları (sıvının içinde) */}
          {sparkles.map((s, i) => {
            const xPos = s.x * 10; // 0-1000 arası map et
            // Sadece dolu kısımdaysa göster
            if (xPos > 1000 * progress) return null;
            return (
              <circle
                key={i}
                cx={xPos}
                cy={(s.y / 100) * capsuleHeight}
                r={3}
                fill="#FFFFFF"
                opacity={s.opacity}
              />
            );
          })}
        </g>
        
        {/* KATMAN 4: Jess kuyruğu dolum kafası (sıvının ucunda) - kullanıcı talebi: şimşek yerine kuyruk */}
        {progress < 1 && progress > 0.02 && (
          <g
            transform={`translate(${1000 * progress - 35}, ${capsuleHeight / 2 - 30 + boltBounce}) scale(${boltScale})`}
            style={{
              filter: "drop-shadow(0 0 12px #FFA500)",
            }}
          >
            {/* Jess kuyruğu - beyaz tüy + turuncu uç */}
            <defs>
              <linearGradient id={`tail-grad-${startFrame}`} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="50%" stopColor="#FFFFFF" />
                <stop offset="70%" stopColor="#FFB347" />
                <stop offset="100%" stopColor="#FF8C00" />
              </linearGradient>
            </defs>
            <path
              d="M 15 55 Q 8 40, 14 28 Q 20 18, 30 15 Q 42 12, 52 18 Q 60 25, 58 35 Q 53 42, 45 42 Q 38 42, 33 48 Q 30 55, 32 62 Q 28 65, 22 63 Q 16 60, 15 55 Z"
              fill={`url(#tail-grad-${startFrame})`}
              stroke={BRAND.black}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </g>
        )}
        
        {/* KATMAN 5: Outer outline (kapsül çerçevesi) */}
        <rect
          x="2"
          y="2"
          width="996"
          height={capsuleHeight - 4}
          rx={capsuleRadius - 2}
          ry={capsuleRadius - 2}
          fill="none"
          stroke={BRAND.white}
          strokeWidth="4"
        />
        <rect
          x="0"
          y="0"
          width="1000"
          height={capsuleHeight}
          rx={capsuleRadius}
          ry={capsuleRadius}
          fill="none"
          stroke={BRAND.black}
          strokeWidth="2"
          opacity="0.3"
        />
      </svg>
    </div>
  );
};
