'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Cookie, ChevronDown, ChevronUp, Shield } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const COOKIE_CONSENT_KEY = 'franky_cookie_consent'
/** Evento que reabre el panel (lo usan el pie y /cookies). */
export const OPEN_COOKIE_SETTINGS_EVENT = 'franky:open-cookie-settings'

/**
 * Reabre el panel de cookies con las categorías desplegadas y las opciones
 * guardadas precargadas. El consentimiento debe poder retirarse tan fácil
 * como se dio (art. 7.3 RGPD, guía de cookies de la AEPD).
 */
export function openCookieSettings() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT))
}

type ConsentState = {
  essential: true
  analytics: boolean
  marketing: boolean
}

/**
 * CookieConsent
 * - Compact bottom bar: full-width on mobile, centered pill on desktop.
 * - Diseño v3: superficie blanca opaca con borde hairline y la sombra flotante
 *   del sistema (sin glass), botones del sistema y tokens de color. No tapa
 *   la burbuja de Franky AI.
 * - Publishes a CSS custom prop `--cookie-bar-offset` on <html> so other
 *   floating elements (e.g. the AI bot) can lift when the bar is visible.
 */
// Interruptor de una categoría: la misma silueta que ui/switch, en tokens.
// Vive fuera del componente para que no se remonte (y pierda el foco) en
// cada cambio de estado.
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-[var(--ease-out-quart)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/30',
        on ? 'bg-violet' : 'bg-bg-tertiary'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(18,16,25,0.2)] transition-transform duration-200 ease-[var(--ease-out-quart)]',
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

/** Caduca las cookies propias cuyo nombre encaja, en el host y en el dominio padre. */
function expireCookies(match: RegExp) {
  if (typeof document === 'undefined') return
  const host = window.location.hostname
  const parts = host.split('.')
  const domains = ['', host, parts.length > 1 ? '.' + parts.slice(-2).join('.') : '']
  for (const raw of document.cookie.split(';')) {
    const name = raw.split('=')[0]?.trim()
    if (!name || !match.test(name)) continue
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`
    }
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)
  // Drives the CSS enter transition (slide-up + fade) on the next frame
  // after the bar becomes visible.
  const [entered, setEntered] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [consent, setConsent] = useState<ConsentState>({
    essential: true,
    analytics: false,
    marketing: false,
  })

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY)
    if (!stored) {
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  // Listen for "open me again" events triggered from the Footer link or
  // anywhere else (e.g. account settings) so the user can revise consent.
  useEffect(() => {
    const handler = () => {
      // Pre-fill the toggles with what's currently saved so the user sees
      // their current choices instead of the defaults.
      try {
        const stored = localStorage.getItem(COOKIE_CONSENT_KEY)
        if (stored) {
          const parsed = JSON.parse(stored) as ConsentState
          setConsent({
            essential: true,
            analytics: !!parsed.analytics,
            marketing: !!parsed.marketing,
          })
        }
      } catch {
        // Ignore parse errors — fall back to defaults.
      }
      setShowDetails(true)
      setVisible(true)
    }
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, handler)
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, handler)
  }, [])

  // Trigger the slide-up + fade-in once the bar mounts (next frame).
  useEffect(() => {
    if (!visible) {
      setEntered(false)
      return
    }
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [visible])

  // Expose current bar offset so other fixed elements (e.g. FrankyAIChat)
  // can shift up and avoid overlap.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (visible) {
      // ~60px on mobile (full-width bar) / ~72px once expanded.
      root.style.setProperty('--cookie-bar-offset', showDetails ? '280px' : '72px')
    } else {
      root.style.removeProperty('--cookie-bar-offset')
    }
    return () => {
      root.style.removeProperty('--cookie-bar-offset')
    }
  }, [visible, showDetails])

  const save = (c: ConsentState) => {
    // Retirar el consentimiento también borra lo que ya se instaló: sin esto,
    // las cookies de Google Analytics (_ga, _ga_*) seguían en el navegador.
    if (!c.analytics) expireCookies(/^_ga($|_)/)
    if (!c.marketing) expireCookies(/^(__gads|__gpi|__eoi)$/)
    localStorage.setItem(
      COOKIE_CONSENT_KEY,
      JSON.stringify({ ...c, timestamp: new Date().toISOString() })
    )
    // Notify same-tab listeners (AnalyticsLoader, AdSlot) that consent changed.
    // `storage` events don't fire in the originating tab, so we dispatch a custom one.
    try {
      window.dispatchEvent(new Event("franky:cookie-consent-changed"))
    } catch {
      // Older browsers; storage event will cover cross-tab.
    }
    setVisible(false)
  }

  const acceptAll = () => save({ essential: true, analytics: true, marketing: true })
  const acceptEssential = () => save({ essential: true, analytics: false, marketing: false })
  const saveCustom = () => save(consent)

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-desc"
      className={`fixed bottom-0 inset-x-0 z-[9998] md:bottom-4 md:left-1/2 md:inset-x-auto md:w-auto md:max-w-3xl transition-[transform,opacity] duration-300 ease-[var(--ease-out-quart)] motion-reduce:transition-none ${
        entered
          ? 'translate-y-0 opacity-100 md:-translate-x-1/2'
          : 'translate-y-20 opacity-0 md:-translate-x-1/2'
      }`}
    >
        <div className="mx-2 mb-2 overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-float md:mx-0 md:mb-0 md:rounded-full">
          {/* Main row */}
          <div className="flex items-center gap-3 px-4 py-3 md:py-2.5">
            <Cookie className="hidden h-4 w-4 shrink-0 text-violet sm:block" aria-hidden="true" />

            <p
              id="cookie-desc"
              className="min-w-0 flex-1 text-[13px] leading-snug text-text-secondary md:text-sm"
            >
              <span id="cookie-title" className="font-semibold text-text-primary">
                Cookies.
              </span>{' '}
              Con tu permiso usamos cookies de analítica y publicidad.{' '}
              <Link
                href="/cookies"
                className="link-underline font-medium text-text-primary"
              >
                Más info
              </Link>
            </p>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden rounded-full sm:inline-flex')}
                aria-expanded={showDetails}
              >
                Personalizar
                {showDetails ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={acceptEssential}
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'rounded-full')}
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className={cn(buttonVariants({ variant: 'dark', size: 'sm' }), 'rounded-full px-4')}
              >
                Aceptar
              </button>
            </div>
          </div>

          {/* Expanded prefs */}
          {showDetails && (
            <div className="overflow-hidden border-t border-border-light animate-fade-in">
              <div className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-bg-secondary p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
                        <Shield className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                        Esenciales
                      </p>
                      <p className="text-xs text-text-muted">
                        Siempre activas. Necesarias para que la web funcione.
                      </p>
                    </div>
                    <div className="relative h-6 w-11 shrink-0 rounded-full bg-success/70" aria-hidden="true">
                      <span className="absolute top-0.5 h-5 w-5 translate-x-[22px] rounded-full bg-white shadow-[0_1px_2px_rgba(18,16,25,0.2)]" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl bg-bg-secondary p-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-text-primary">Analíticas</p>
                      <p className="text-xs text-text-muted">
                        Nos ayudan a entender cómo usas Franky.
                      </p>
                    </div>
                    <Toggle
                      on={consent.analytics}
                      label="Cookies analíticas"
                      onClick={() => setConsent((c) => ({ ...c, analytics: !c.analytics }))}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl bg-bg-secondary p-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-text-primary">Marketing</p>
                      <p className="text-xs text-text-muted">
                        Personalizan contenido y anuncios relevantes.
                      </p>
                    </div>
                    <Toggle
                      on={consent.marketing}
                      label="Cookies de marketing"
                      onClick={() => setConsent((c) => ({ ...c, marketing: !c.marketing }))}
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={saveCustom}
                      className={cn(buttonVariants({ variant: 'dark', size: 'sm' }), 'rounded-full px-4')}
                    >
                      Guardar preferencias
                    </button>
                  </div>
              </div>
            </div>
          )}
        </div>
      </div>
  )
}
