import React from "react";

interface JessTailIconProps {
  size?: number;
  /**
   * Glow rengi (opsiyonel - tema rengiyle uyumlu)
   */
  glowColor?: string;
}

/**
 * Jess'in turuncu uçlu beyaz kabarık kuyruğu - şimşek (lightning bolt) yerine
 * brand ikon olarak kullanılır.
 * 
 * Quiz Blitz'in ⚡ şimşeği bizim için anlamlı değildi (rakibin markası).
 * Jess'in kuyruğu = bizim brand'imizin doğal bir parçası.
 */
export const JessTailIcon: React.FC<JessTailIconProps> = ({
  size = 100,
  glowColor = "#FFA500",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        filter: `drop-shadow(0 0 12px ${glowColor}) drop-shadow(0 4px 8px rgba(0,0,0,0.4))`,
      }}
    >
      {/* Gradient: beyaz gövde → turuncu uç */}
      <defs>
        <linearGradient id="tail-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#FFE4C4" />
          <stop offset="70%" stopColor="#FFB347" />
          <stop offset="100%" stopColor="#FF8C00" />
        </linearGradient>
        <linearGradient id="tail-shade" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.15)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>
      
      {/* Ana kuyruk şekli - kabarık, eğri, S-curve */}
      <path
        d="M 20 85 
           Q 12 70, 18 55 
           Q 22 45, 32 38 
           Q 42 30, 50 22 
           Q 58 14, 68 12 
           Q 80 12, 84 22 
           Q 86 32, 78 38 
           Q 68 44, 58 48 
           Q 48 53, 42 60 
           Q 38 68, 38 78 
           Q 35 88, 25 88 
           Z"
        fill="url(#tail-gradient)"
        stroke="#0A0A0A"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      
      {/* Tüy detayları (kabarık görünüm için iç çizgiler) */}
      <path
        d="M 30 75 Q 38 65, 48 55"
        fill="none"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M 38 60 Q 50 50, 62 40"
        fill="none"
        stroke="rgba(0,0,0,0.12)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M 50 45 Q 60 35, 72 28"
        fill="none"
        stroke="rgba(255,140,0,0.5)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      
      {/* Turuncu uçta highlight */}
      <ellipse
        cx="72"
        cy="20"
        rx="6"
        ry="3"
        fill="rgba(255,255,255,0.6)"
        transform="rotate(-30, 72, 20)"
      />
    </svg>
  );
};
