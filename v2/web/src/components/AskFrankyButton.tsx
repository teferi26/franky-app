'use client';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AskFrankyButton({ detail = false }: { detail?: boolean }) {
  return <Button variant="outline" onClick={() => {
    document.documentElement.dataset.frankyAssistantOpen = 'true';
    window.dispatchEvent(new Event('franky:open-assistant'));
  }}>
    <MessageCircle className="h-4 w-4" aria-hidden="true" />
    {detail ? 'Preguntar sobre esta beca' : 'Preguntar a BecarIA'}
  </Button>;
}
