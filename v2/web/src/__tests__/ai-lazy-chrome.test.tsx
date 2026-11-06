import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ role: null as string | null, pathname: '/becas' }));
vi.mock('@/components/SessionProvider', () => ({ useSession: () => ({ user: null, role: f.role }) }));
vi.mock('next/navigation', () => ({ usePathname: () => f.pathname }));
vi.mock('next/dynamic', () => ({ default: (loader: () => unknown) => String(loader).includes('FrankyAIChat') ? () => <div>Assistant mounted</div> : () => null }));
import LazyChrome from '@/components/LazyChrome';
beforeEach(() => { f.role = null; f.pathname = '/becas'; });
it('mounts the basic navigator for anonymous visitors in the real page wrapper', () => {
  render(<LazyChrome />); expect(screen.getByText('Assistant mounted')).toBeInTheDocument();
});
it('lets a professional ask about public scholarships while keeping its dashboard uncluttered', () => {
  f.role = 'propietario'; const view = render(<LazyChrome />); expect(screen.getByText('Assistant mounted')).toBeInTheDocument();
  f.pathname = '/propietario/dashboard'; view.rerender(<LazyChrome />); expect(screen.queryByText('Assistant mounted')).toBeNull();
});
