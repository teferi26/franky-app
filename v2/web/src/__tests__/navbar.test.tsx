import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// Estado de auth controlable por test: el Navbar solo muestra la navegación
// de secciones, FOMO y los iconos de acción cuando hay usuario.
const mockAuth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  role: null as string | null,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...props }: any) =>
    React.createElement('a', { href, ...props }, children),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) =>
    React.createElement('img', { src, alt, ...props }),
}));

// Mock next/navigation: el Navbar llama a usePathname() y con sesión hace
// pathname.startsWith(...), que reventaría con el null de fuera del router.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// Mock lucide-react: todos los iconos que importa el Navbar actual.
vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Icon = () =>
      React.createElement('svg', { 'data-testid': `${name}-icon` });
    Icon.displayName = `${name}-icon`;
    return Icon;
  };
  return {
    Menu: icon('menu'),
    X: icon('x'),
    Search: icon('search'),
    User: icon('user'),
    LogOut: icon('logout'),
    LogIn: icon('login'),
    Heart: icon('heart'),
    ChevronDown: icon('chevron'),
    GraduationCap: icon('grad'),
    Home: icon('home'),
    Beer: icon('beer'),
    Newspaper: icon('newspaper'),
    Bell: icon('bell'),
    Shield: icon('shield'),
    MessageCircle: icon('message'),
    Flame: icon('flame'),
    Ticket: icon('ticket'),
    CalendarDays: icon('calendar'),
    Building2: icon('building'),
    ArrowRight: icon('arrow'),
    ArrowUpRight: icon('arrow-up-right'),
    // Los del selector de tema, que el Navbar monta en el menú móvil.
    Sun: icon('sun'),
    Moon: icon('moon'),
    Monitor: icon('monitor'),
  };
});

// Mock Supabase client: auth según mockAuth, rol vía profiles y RPC de chats.
vi.mock('@/lib/supabase-client', () => ({
  createClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: mockAuth.user }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: mockAuth.role ? { role: mockAuth.role } : null,
              error: null,
            }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: 0, error: null }),
  }),
}));

// La sesión y el rol ya no los resuelve el Navbar: vienen del contexto
// compartido (SessionProvider), que sustituyó a los 3 getUser() por carga que
// hacían Navbar, LazyChrome y AuthGatePopup cada uno por su cuenta.
vi.mock('@/components/SessionProvider', () => ({
  useSession: () => ({
    user: mockAuth.user,
    role: mockAuth.role,
    loading: false,
    signOut: async () => {},
    refreshRole: async () => {},
  }),
}));

import Navbar from '@/components/Navbar';

// Renderiza y deja que se resuelvan getUser, el fetch de rol y el RPC de
// no leídos antes de aseverar, para no depender de timing.
async function renderNavbar() {
  render(<Navbar />);
  await act(async () => {});
  await act(async () => {});
}

describe('Navbar', () => {
  beforeEach(() => {
    mockAuth.user = null;
    mockAuth.role = null;
  });

  it('renders brand name', async () => {
    await renderNavbar();
    expect(screen.getByText('Franky')).toBeInTheDocument();
  });

  describe('visitante sin sesión', () => {
    it('renders login and signup CTAs', async () => {
      await renderNavbar();
      expect(screen.getAllByText('Iniciar sesión').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Empezar gratis').length).toBeGreaterThanOrEqual(1);
    });

    // El visitante anónimo SÍ ve navegación: antes el nav entero estaba tras
    // `user &&` y quien llegaba de Google a /carreras no tenía forma de ir a
    // /becas salvo bajando al footer.
    it('renders the public navigation sections', async () => {
      await renderNavbar();
      expect(screen.getByText('Universidad')).toBeInTheDocument();
      // "Alojamiento" se queda con una sola entrada pública tras filtrar lo
      // que exige cuenta, así que se pinta el enlace directo. "Vida social"
      // tiene dos (Zonas de ocio y Eventos, público desde sep-2026): desplegable.
      expect(screen.getAllByText('Buscar piso').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Vida social').length).toBeGreaterThanOrEqual(1);
      // FOMO es público (landing con vista previa), así que también se ofrece.
      expect(screen.getAllByText(/FOMO/).length).toBeGreaterThanOrEqual(1);
    });

    it('hides gated entries and account-only actions', async () => {
      await renderNavbar();
      // Enlaces que exigen cuenta: no se enseñan para que nadie choque contra
      // el muro de login por sorpresa.
      expect(screen.queryByText('RoomieMatch')).not.toBeInTheDocument();
      expect(screen.queryByText('Crush')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Cerrar sesión')).not.toBeInTheDocument();
    });
  });

  describe('usuario autenticado', () => {
    beforeEach(() => {
      mockAuth.user = { id: 'user-1' };
    });

    it('renders main navigation sections', async () => {
      await renderNavbar();
      expect(screen.getByText('Universidad')).toBeInTheDocument();
      expect(screen.getByText('Alojamiento')).toBeInTheDocument();
      expect(screen.getByText('Vida social')).toBeInTheDocument();
      expect(screen.getByText('Novedades')).toBeInTheDocument();
    });

    it('renders FOMO CTA linking to /fomo', async () => {
      await renderNavbar();
      for (const link of screen.getAllByRole('link', { name: 'FOMO' })) expect(link).toHaveAttribute('href', '/fomo');
    });

    it('renders Crush link in Vida Social dropdown', async () => {
      await renderNavbar();
      // El dropdown se abre al pasar el ratón por la sección
      fireEvent.click(screen.getByRole('button', { name: 'Vida social' }));
      const crushLink = screen.getByText('Crush').closest('a');
      expect(crushLink).toHaveAttribute('href', '/crush');
    });

    it('renders action icons with aria-labels', async () => {
      await renderNavbar();
      expect(screen.getByLabelText('Notificaciones')).toHaveAttribute('href', '/notificaciones');
      expect(screen.getByLabelText('Favoritos')).toHaveAttribute('href', '/favoritos');
      expect(screen.getByLabelText('Chats')).toHaveAttribute('href', '/chats');
      expect(screen.getByLabelText('Mi perfil')).toHaveAttribute('href', '/perfil');
      expect(screen.getByLabelText('Cerrar sesión').tagName).toBe('BUTTON');
    });
  });

  describe('menú hamburguesa', () => {
    it('toggles aria-expanded and label on open/close', async () => {
      await renderNavbar();
      const toggle = screen.getByRole('button', { name: 'Abrir menú' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveAttribute('aria-label', 'Cerrar menú');
      // Overlay móvil para visitantes: CTA de registro
      expect(screen.getByText('Crear cuenta gratis')).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAttribute('aria-label', 'Abrir menú');
    });
  });
});
