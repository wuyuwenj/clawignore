"use client";

import { useEffect, useRef } from "react";

interface IconProps {
  icon: string;
  width?: number | string;
  className?: string;
}

export function Icon({ icon, width = 24, className = "" }: IconProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Dynamically create the iconify-icon element
    if (ref.current) {
      ref.current.innerHTML = `<iconify-icon icon="${icon}" width="${width}"></iconify-icon>`;
    }
  }, [icon, width]);

  return <span ref={ref} className={className} />;
}
