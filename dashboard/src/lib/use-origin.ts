'use client';
import { useEffect, useState } from 'react';

/** The address this dashboard is served from. Empty during the static build, filled in the browser. */
export function useOrigin() {
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(location.origin), []);
  return origin;
}
