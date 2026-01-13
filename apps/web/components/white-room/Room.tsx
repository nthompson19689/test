'use client';

import { useMemo } from 'react';

interface RoomProps {
  assets: string[];
  doorProgress: number;
  creatureForm: number;
}

// The room is a single SVG that evolves through layers
// Design: ambiguous, at the edge of recognition
// Assets don't pop in - they exist or they don't
export function Room({ assets, doorProgress, creatureForm }: RoomProps) {
  const hasAsset = (asset: string) => assets.includes(asset);

  // Door visual state
  const doorState = useMemo(() => {
    if (doorProgress >= 100) return 'open';
    if (doorProgress >= 80) return 'visible';
    if (doorProgress >= 60) return 'handle';
    if (doorProgress >= 40) return 'shadow';
    if (doorProgress >= 20) return 'seam';
    return 'none';
  }, [doorProgress]);

  return (
    <div className="relative w-64 h-64 sm:w-80 sm:h-80">
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full"
        style={{ filter: hasAsset('atmosphere') ? 'url(#grain)' : undefined }}
      >
        {/* Definitions for filters and gradients */}
        <defs>
          {/* Subtle grain filter for atmosphere */}
          <filter id="grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="4"
              result="noise"
            />
            <feComposite in="SourceGraphic" in2="noise" operator="in" />
          </filter>

          {/* Soft shadow gradient */}
          <radialGradient id="shadowGradient" cx="50%" cy="100%" r="80%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.08)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Deep shadow gradient */}
          <linearGradient id="deepShadow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.12)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>

          {/* Room depth gradient */}
          <linearGradient id="depthGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fafafa" />
            <stop offset="100%" stopColor="#f5f5f5" />
          </linearGradient>
        </defs>

        {/* Layer 0: Background - always present */}
        <rect width="200" height="200" fill="#fafafa" />

        {/* Layer 1: Floor plane - establishes space */}
        {hasAsset('floor-plane') && (
          <g className="transition-opacity duration-[3000ms]">
            {/* Simple perspective floor */}
            <path
              d="M 40 140 L 160 140 L 180 180 L 20 180 Z"
              fill="#f0f0f0"
              opacity="0.6"
            />
            {/* Floor line */}
            <line
              x1="30"
              y1="140"
              x2="170"
              y2="140"
              stroke="#e0e0e0"
              strokeWidth="0.5"
            />
          </g>
        )}

        {/* Layer 2: First shadow - sourceless, soft */}
        {hasAsset('first-shadow') && (
          <ellipse
            cx="100"
            cy="160"
            rx="40"
            ry="8"
            fill="url(#shadowGradient)"
            className="transition-opacity duration-[3000ms]"
          />
        )}

        {/* Layer 2b: Room depth - recesses and corners */}
        {hasAsset('room-depth') && (
          <g className="transition-opacity duration-[3000ms]">
            {/* Corner shadow left */}
            <path
              d="M 20 20 L 20 180 L 40 160 L 40 40 Z"
              fill="url(#depthGradient)"
              opacity="0.3"
            />
            {/* Corner shadow right */}
            <path
              d="M 180 20 L 180 180 L 160 160 L 160 40 Z"
              fill="url(#depthGradient)"
              opacity="0.3"
            />
          </g>
        )}

        {/* Layer 2c: Deep shadows */}
        {hasAsset('deep-shadow') && (
          <g className="transition-opacity duration-[3000ms]">
            <rect
              x="25"
              y="80"
              width="20"
              height="60"
              fill="url(#deepShadow)"
              opacity="0.4"
            />
            <rect
              x="155"
              y="90"
              width="20"
              height="50"
              fill="url(#deepShadow)"
              opacity="0.3"
            />
          </g>
        )}

        {/* Layer 3: First object - ambiguous shape */}
        {hasAsset('first-object') && (
          <g className="transition-opacity duration-[3000ms]">
            {/* Something that might be a bench or stone */}
            <rect
              x="60"
              y="150"
              width="30"
              height="12"
              rx="1"
              fill="#e8e8e8"
            />
            {/* Its shadow */}
            <ellipse
              cx="75"
              cy="165"
              rx="18"
              ry="3"
              fill="rgba(0,0,0,0.05)"
            />
          </g>
        )}

        {/* Layer 3b: Second object */}
        {hasAsset('second-object') && (
          <g className="transition-opacity duration-[3000ms]">
            {/* Another shape, perhaps furniture */}
            <rect
              x="125"
              y="145"
              width="15"
              height="20"
              rx="1"
              fill="#e5e5e5"
            />
            <ellipse
              cx="132"
              cy="168"
              rx="10"
              ry="2"
              fill="rgba(0,0,0,0.04)"
            />
          </g>
        )}

        {/* Layer 3c: Room texture */}
        {hasAsset('room-texture') && (
          <g className="transition-opacity duration-[3000ms]" opacity="0.15">
            {/* Subtle vertical lines suggesting texture */}
            {[40, 60, 80, 100, 120, 140, 160].map((x) => (
              <line
                key={x}
                x1={x}
                y1="30"
                x2={x}
                y2="135"
                stroke="#d0d0d0"
                strokeWidth="0.3"
              />
            ))}
          </g>
        )}

        {/* Layer 4: The Door - central mystery */}
        {doorState !== 'none' && (
          <g className="transition-all duration-[3000ms]">
            {/* Seam - first appearance */}
            {doorState === 'seam' && (
              <line
                x1="100"
                y1="50"
                x2="100"
                y2="130"
                stroke="#e0e0e0"
                strokeWidth="0.5"
                opacity="0.6"
              />
            )}

            {/* Shadow - the seam deepens */}
            {doorState === 'shadow' && (
              <g>
                <line
                  x1="100"
                  y1="50"
                  x2="100"
                  y2="130"
                  stroke="#d8d8d8"
                  strokeWidth="1"
                />
                <rect
                  x="100"
                  y="50"
                  width="3"
                  height="80"
                  fill="rgba(0,0,0,0.04)"
                />
              </g>
            )}

            {/* Handle - a handle-shaped shadow */}
            {doorState === 'handle' && (
              <g>
                <rect
                  x="85"
                  y="50"
                  width="30"
                  height="80"
                  fill="none"
                  stroke="#d5d5d5"
                  strokeWidth="0.5"
                  rx="1"
                />
                <rect
                  x="85"
                  y="50"
                  width="30"
                  height="80"
                  fill="rgba(0,0,0,0.02)"
                />
                {/* Handle shadow */}
                <circle
                  cx="108"
                  cy="90"
                  r="3"
                  fill="rgba(0,0,0,0.08)"
                />
              </g>
            )}

            {/* Visible - unmistakably a door */}
            {doorState === 'visible' && (
              <g>
                <rect
                  x="82"
                  y="45"
                  width="36"
                  height="90"
                  fill="#f8f8f8"
                  stroke="#d0d0d0"
                  strokeWidth="1"
                  rx="1"
                />
                {/* Door frame shadow */}
                <rect
                  x="82"
                  y="45"
                  width="36"
                  height="90"
                  fill="url(#deepShadow)"
                  opacity="0.3"
                />
                {/* Handle */}
                <circle
                  cx="110"
                  cy="90"
                  r="3"
                  fill="#d5d5d5"
                />
              </g>
            )}

            {/* Open - another room waits */}
            {doorState === 'open' && (
              <g>
                {/* Door frame */}
                <rect
                  x="82"
                  y="45"
                  width="36"
                  height="90"
                  fill="none"
                  stroke="#d0d0d0"
                  strokeWidth="1"
                />
                {/* The opening - darkness beyond */}
                <rect
                  x="84"
                  y="47"
                  width="32"
                  height="86"
                  fill="#1a1a1a"
                />
                {/* Light from beyond */}
                <rect
                  x="90"
                  y="55"
                  width="20"
                  height="70"
                  fill="#2a2a2a"
                />
                {/* Door swung open (partial view) */}
                <path
                  d="M 82 45 L 70 50 L 70 130 L 82 135 Z"
                  fill="#f0f0f0"
                  stroke="#d0d0d0"
                  strokeWidth="0.5"
                />
              </g>
            )}
          </g>
        )}

        {/* Layer 5: Creature - minimal, evolving form */}
        <Creature form={creatureForm} />

        {/* Layer 6: Atmosphere overlay */}
        {hasAsset('atmosphere') && (
          <rect
            width="200"
            height="200"
            fill="rgba(255,255,255,0.02)"
            className="transition-opacity duration-[5000ms]"
          />
        )}
      </svg>
    </div>
  );
}

// The creature - a presence that evolves from point to form
function Creature({ form }: { form: number }) {
  // Form 0: A point
  // Form 1: A line
  // Form 2: A shape beginning
  // Form 3: A recognizable presence
  // Form 4: Something with depth
  // Form 5: Almost a figure

  const baseOpacity = 0.4 + form * 0.1;

  return (
    <g className="transition-all duration-[2000ms]">
      {/* Form 0: Just a point */}
      {form === 0 && (
        <circle
          cx="100"
          cy="100"
          r="2"
          fill="#404040"
          opacity={baseOpacity}
        />
      )}

      {/* Form 1: Point becomes a vertical line */}
      {form === 1 && (
        <line
          x1="100"
          y1="90"
          x2="100"
          y2="110"
          stroke="#404040"
          strokeWidth="1.5"
          opacity={baseOpacity}
          strokeLinecap="round"
        />
      )}

      {/* Form 2: Line gains slight form */}
      {form === 2 && (
        <g opacity={baseOpacity}>
          <line
            x1="100"
            y1="85"
            x2="100"
            y2="115"
            stroke="#404040"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Suggestion of presence */}
          <circle cx="100" cy="82" r="3" fill="#404040" />
        </g>
      )}

      {/* Form 3: A recognizable presence */}
      {form === 3 && (
        <g opacity={baseOpacity}>
          <ellipse cx="100" cy="80" rx="6" ry="7" fill="#404040" />
          <line
            x1="100"
            y1="87"
            x2="100"
            y2="120"
            stroke="#404040"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Arms suggestion */}
          <line
            x1="94"
            y1="95"
            x2="106"
            y2="95"
            stroke="#404040"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Form 4: Something with depth */}
      {form === 4 && (
        <g opacity={baseOpacity}>
          <ellipse cx="100" cy="78" rx="7" ry="8" fill="#353535" />
          {/* Body with slight shape */}
          <path
            d="M 93 86 Q 93 110 96 120 L 104 120 Q 107 110 107 86 Z"
            fill="#353535"
          />
          {/* Arms */}
          <line
            x1="93"
            y1="92"
            x2="85"
            y2="105"
            stroke="#353535"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="107"
            y1="92"
            x2="115"
            y2="105"
            stroke="#353535"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Form 5: Almost a figure */}
      {form === 5 && (
        <g opacity={baseOpacity}>
          {/* Head */}
          <ellipse cx="100" cy="76" rx="8" ry="9" fill="#303030" />
          {/* Body */}
          <path
            d="M 92 85 Q 90 105 94 125 L 106 125 Q 110 105 108 85 Z"
            fill="#303030"
          />
          {/* Arms */}
          <path
            d="M 92 90 Q 82 100 80 112"
            stroke="#303030"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 108 90 Q 118 100 120 112"
            stroke="#303030"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* Shadow beneath */}
          <ellipse
            cx="100"
            cy="128"
            rx="15"
            ry="3"
            fill="rgba(0,0,0,0.1)"
          />
        </g>
      )}
    </g>
  );
}

export default Room;
