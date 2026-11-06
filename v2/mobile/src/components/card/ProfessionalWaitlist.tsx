import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn } from '@/components/ui';
import { CardNotice } from './CardUi';
import { professionalMoney, type ProfessionalBooking } from '../../../../shared/professional-services';
import { F } from '@/theme';

export function ProfessionalWaitlist({ booking, operator = false, busy, onAction }: {
  booking: ProfessionalBooking; operator?: boolean; busy: boolean;
  onAction(action: string, data: Record<string, unknown>): void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (booking.waitlist_offer_status === 'expired') return <CardNotice text="La oferta de plaza caducó sin aceptación. No se ha confirmado una reserva ni un cargo." />;
  if (booking.waitlist_offer_status === 'declined') return <CardNotice text="La oferta de plaza se rechazó. Puedes consultar otra sesión disponible." />;
  if (booking.waitlist_offer_status !== 'offered') return null;
  const seconds = Math.max(0, Math.ceil((Date.parse(booking.waitlist_offer_expires_at ?? '') - now) / 1000));
  const valid = Number.isFinite(seconds) && seconds > 0;
  const canAccept = !operator || !booking.customer_user_id;
  return <View style={{ gap: 10 }}><CardNotice text={valid ? `Hay una plaza reservada provisionalmente durante ${Math.ceil(seconds / 60)} minutos. Todavía requiere aceptación.` : 'La oferta de plaza ha caducado. Actualiza el estado antes de intentar otra reserva.'} />
    {canAccept ? <><Text style={F.body}>Precio de la plaza: {professionalMoney(booking.total_cents)}</Text><Text style={F.small}>{booking.price_snapshot.terms}</Text>
      <Btn label={operator ? 'Cliente de mostrador acepta plaza y condiciones' : 'Aceptar plaza, precio y condiciones'} busy={busy} disabled={!valid} onPress={() => onAction('accept_waitlist', { offer_version: booking.waitlist_offer_version, expected_total_cents: booking.total_cents, expected_terms: booking.price_snapshot.terms })} />
      <Btn label="Rechazar esta plaza" variant="ghost" busy={busy} disabled={!valid} onPress={() => onAction('decline_waitlist', { offer_version: booking.waitlist_offer_version })} />
    </> : <Text style={F.small}>El titular de la cuenta debe aceptar la plaza y sus condiciones desde Mis reservas. Recepción no puede aceptar en su nombre.</Text>}
  </View>;
}
