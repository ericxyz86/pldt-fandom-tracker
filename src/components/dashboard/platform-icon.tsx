import type { Platform } from "@/types/fandom";
import type { ReactNode } from "react";

const platformIcons: Record<Platform, { svg: ReactNode; color: string; label: string }> = {
  instagram: {
    label: "Instagram",
    color: "text-pink-600",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    ),
  },
  tiktok: {
    label: "TikTok",
    color: "text-black",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1 0-5.78 2.92 2.92 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.57 6.33 6.33 0 0 0 9.37 22a6.33 6.33 0 0 0 6.37-6.23V9.34a8.16 8.16 0 0 0 3.85.96V6.69" />
      </svg>
    ),
  },
  facebook: {
    label: "Facebook",
    color: "text-blue-600",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  youtube: {
    label: "YouTube",
    color: "text-red-600",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
        <path d="m10 15 5-3-5-3z" />
      </svg>
    ),
  },
  twitter: {
    label: "X / Twitter",
    color: "text-gray-800",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  reddit: {
    label: "Reddit",
    color: "text-orange-500",
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 4.373 0 10.5c0 3.21 1.553 6.06 3.997 7.938.121.093.248.178.378.258A11.21 11.21 0 0 0 12 21c2.867 0 5.48-1.072 7.457-2.835.18-.11.354-.228.52-.354C22.445 15.918 24 13.306 24 10.5 24 4.373 18.627 0 12 0zm6.59 12.308a1.514 1.514 0 0 1-.498 2.089c.015.148.015.297 0 .445 0 2.278-2.648 4.126-5.92 4.126s-5.92-1.848-5.92-4.126a2.95 2.95 0 0 1 0-.445 1.514 1.514 0 1 1 1.073-2.539 7.414 7.414 0 0 1 4.024-1.27l.756-3.564a.371.371 0 0 1 .446-.278l2.531.531a1.069 1.069 0 1 1-.117.532l-2.26-.476-.678 3.183a7.414 7.414 0 0 1 3.97 1.271 1.514 1.514 0 0 1 2.593.521zM9.682 13.454a1.069 1.069 0 1 0 0 2.138 1.069 1.069 0 0 0 0-2.138zm4.636 0a1.069 1.069 0 1 0 0 2.138 1.069 1.069 0 0 0 0-2.138zm-4.18 3.372a.379.379 0 0 0 .516.13c.62.368 1.33.557 2.05.546a3.76 3.76 0 0 0 2.05-.546.379.379 0 1 0-.386-.652 3.005 3.005 0 0 1-3.345 0 .379.379 0 0 0-.515.13.379.379 0 0 0-.37.392z" />
      </svg>
    ),
  },
};

export function PlatformIcon({ platform }: { platform: Platform }) {
  const config = platformIcons[platform];
  if (!config) return null;

  return (
    <span className={`inline-flex items-center ${config.color}`} title={config.label}>
      {config.svg}
    </span>
  );
}

export function PlatformIcons({ platforms }: { platforms: Platform[] }) {
  const unique = [...new Set(platforms)];
  return (
    <span className="inline-flex items-center gap-1.5">
      {unique.map((p) => (
        <PlatformIcon key={p} platform={p} />
      ))}
    </span>
  );
}
