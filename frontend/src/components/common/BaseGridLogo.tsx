import React from "react";

interface BaseGridLogoProps {
  className?: string;
  iconOnly?: boolean;
  textClassName?: string;
}

export function BaseGridLogo({
  className = "h-5 w-5",
  iconOnly = false,
  textClassName = "text-base font-bold text-white tracking-tight",
}: BaseGridLogoProps) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 border border-blue-500/30 shadow-[0_0_20px_rgba(37,99,235,0.35)] overflow-hidden shrink-0">
        <svg
          className={className}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="gridGradTop"
              x1="50"
              y1="10"
              x2="50"
              y2="50"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
            <linearGradient
              id="gridGradLeft"
              x1="20"
              y1="40"
              x2="60"
              y2="85"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#1D4ED8" />
            </linearGradient>
            <linearGradient
              id="gridGradRight"
              x1="80"
              y1="40"
              x2="40"
              y2="85"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor="#1E40AF" />
            </linearGradient>
          </defs>

          {/* Top 3D Arrow / Diamond Apex */}
          <path
            d="M50 12 L72 38 L50 48 L28 38 Z"
            fill="url(#gridGradTop)"
            stroke="#7DD3FC"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Interlocking Left Grid Loop */}
          <path
            d="M28 38 L50 48 L50 68 L28 58 Z"
            fill="url(#gridGradLeft)"
            stroke="#3B82F6"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Interlocking Right Grid Loop */}
          <path
            d="M72 38 L50 48 L50 68 L72 58 Z"
            fill="url(#gridGradRight)"
            stroke="#60A5FA"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Bottom Interlocking Diamond Link */}
          <path
            d="M50 68 L72 58 L50 88 L28 58 Z"
            fill="#1E3A8A"
            fillOpacity="0.8"
            stroke="#38BDF8"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {!iconOnly && <span className={textClassName}>BaseGrid</span>}
    </div>
  );
}
