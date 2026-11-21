import type { CSSProperties } from "react";

import {
  WEATHER_SCENE_LABELS,
  weatherScene,
  type Weather,
  type WeatherScene,
} from "@/lib/weather";

/**
 * A strip of sky across the top of the Today card showing what it's like outside the
 * restaurant: sun, overcast, rain, or the moon after dark. Picture only — no
 * words on it; screen readers get the condition from the label.
 *
 * Drops and stars take their place from their index rather than `Math.random`,
 * so the server and the phone draw the same picture.
 */

const SKIES: Record<WeatherScene, string> = {
  sunny: "bg-linear-to-br from-sky-400 via-sky-300 to-amber-200",
  overcast: "bg-linear-to-br from-slate-400 via-slate-300 to-slate-200",
  rain: "bg-linear-to-br from-slate-600 via-slate-500 to-sky-700",
  moon: "bg-linear-to-br from-indigo-950 via-indigo-900 to-slate-800",
};

const CLOUD_PATH = "M16 36H50A11 11 0 0 0 50 14A15 15 0 0 0 22 11A12.5 12.5 0 0 0 16 36Z";

/** A stable 0–1 number for the nth drop or star, so every render agrees. */
function spread(index: number, salt: number): number {
  return ((Math.imul(index + 1, 2654435761) ^ Math.imul(salt + 7, 40503)) >>> 0) % 1000 / 1000;
}

function vars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

function Cloud({ className, fill, style }: { className: string; fill: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 40" className={className} style={style}>
      <path d={CLOUD_PATH} fill={fill} />
    </svg>
  );
}

const drift = (seconds: number, distance: number) =>
  vars({ "--wx-duration": `${seconds}s`, "--wx-distance": `${distance}px` });

function Sun() {
  return (
    <div className="absolute top-1/2 right-8 size-24 -translate-y-1/2 sm:right-14 sm:size-28">
      <div className="wx-glow absolute inset-[-30%] rounded-full bg-amber-200/70 blur-xl" />
      <svg viewBox="0 0 100 100" className="wx-spin absolute inset-0 size-full">
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x="48"
            y="2"
            width="4"
            height="14"
            rx="2"
            fill="#fbbf24"
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
      </svg>
      <div className="absolute inset-[22%] rounded-full bg-linear-to-br from-yellow-200 via-amber-300 to-orange-400 shadow-[0_0_24px_rgba(251,191,36,0.8)]" />
    </div>
  );
}

function Moon() {
  return (
    <>
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="wx-twinkle absolute size-0.5 rounded-full bg-white sm:size-1"
          style={vars({
            left: `${4 + spread(i, 1) * 92}%`,
            top: `${8 + spread(i, 2) * 80}%`,
            "--wx-duration": `${2 + spread(i, 3) * 3}s`,
            "--wx-delay": `${-spread(i, 4) * 4}s`,
          })}
        />
      ))}
      <div className="absolute top-1/2 right-10 size-16 -translate-y-1/2 sm:right-16 sm:size-20">
        <div className="wx-glow absolute inset-[-25%] rounded-full bg-indigo-200/25 blur-xl" />
        {/* A crescent from an inset shadow alone: the middle stays clear, so the
            night sky shows through the dark part of the moon. */}
        <div className="absolute inset-0 rotate-[-20deg] rounded-full shadow-[inset_16px_-7px_0_0_#f1f5f9] drop-shadow-[0_0_10px_rgba(224,231,255,0.7)]" />
      </div>
    </>
  );
}

function Overcast() {
  return (
    <>
      <Cloud fill="#e2e8f0" className="wx-drift absolute top-2 left-[12%] w-32 opacity-90" style={drift(26, 20)} />
      <Cloud fill="#cbd5e1" className="wx-drift absolute top-7 right-6 w-40 drop-shadow" style={drift(20, 16)} />
      <Cloud fill="#f1f5f9" className="wx-drift absolute right-[30%] -bottom-2 w-36 drop-shadow" style={drift(17, 12)} />
    </>
  );
}

function Rain() {
  return (
    <>
      {Array.from({ length: 40 }, (_, i) => (
        <span
          key={i}
          className="wx-fall absolute h-4 w-0.5 rotate-12 rounded-full bg-sky-100/70"
          style={vars({
            left: `${spread(i, 5) * 100}%`,
            top: `${spread(i, 6) * 100}%`,
            "--wx-duration": `${0.7 + spread(i, 7) * 0.5}s`,
            "--wx-delay": `${-spread(i, 8) * 6}s`,
          })}
        />
      ))}
      <Cloud fill="#475569" className="wx-drift absolute -top-4 left-[10%] w-36 drop-shadow-lg" style={drift(22, 14)} />
      <Cloud fill="#64748b" className="wx-drift absolute -top-3 right-[12%] w-40 drop-shadow-lg" style={drift(18, 10)} />
    </>
  );
}

const SCENES: Record<WeatherScene, () => React.ReactNode> = {
  sunny: Sun,
  overcast: Overcast,
  rain: Rain,
  moon: Moon,
};

export function WeatherCard({ weather }: { weather: Weather }) {
  const scene = weatherScene(weather);
  const Scene = SCENES[scene];
  return (
    <div
      role="img"
      aria-label={`Weather: ${WEATHER_SCENE_LABELS[scene]}`}
      data-scene={scene}
      className={`relative h-28 overflow-hidden sm:h-32 ${SKIES[scene]}`}
    >
      <Scene />
    </div>
  );
}
