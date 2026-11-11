import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';

/** Everything inside this group needs a signed-in buyer and shares the sidebar. */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
