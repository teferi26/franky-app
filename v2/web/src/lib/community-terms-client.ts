"use client";
import { createClient } from './supabase-client';

type Confirm = (options: { title: string; description: string; confirmText: string; termsLink?: boolean }) => Promise<boolean>;
export async function ensureCommunityTerms(owner: string, isCurrent: () => boolean, confirm: Confirm) {
 const client=createClient();
 const controller=new AbortController();
 const {data: listener}=client.auth.onAuthStateChange((event,session)=>{ if(event==='SIGNED_OUT'||session?.user.id!==owner)controller.abort(); });
 const check=()=>{if(!isCurrent()||controller.signal.aborted)throw new Error('La sesión ha cambiado.');};
 try {
  check();
  const {data:{session},error}=await client.auth.getSession();
  check(); if(error||session?.user.id!==owner)throw new Error('Inicia sesión para continuar.');
  const authorization=`Bearer ${session.access_token}`;
  const current=await client.rpc('community_terms_accepted').setHeader('Authorization',authorization).abortSignal(controller.signal);
  check(); if(current.error)throw new Error('No se pudieron consultar las normas. Inténtalo de nuevo.');
  if(current.data===true)return true;
  const accepted=await confirm({title:'Normas de la comunidad',description:'Tolerancia cero con el acoso, las amenazas, el odio, la explotación sexual, el contenido sexual explícito y la difusión de datos privados. Al aceptar autorizas enviar el texto, las encuestas y las imágenes de tus publicaciones a Google Gemini para detectar abusos; no enviamos tu identificador interno de cuenta. Los audios y vídeos los revisa nuestro equipo. Revisamos antes de publicar. Puedes denunciar y bloquear; las infracciones pueden suponer retirada de contenido y suspensión. Aceptas las normas y los términos de uso.',confirmText:'He leído y acepto',termsLink:true});
  check(); if(!accepted)return false;
  const saved=await client.rpc('accept_community_terms',{p_version:'2026-09-10'}).setHeader('Authorization',authorization).abortSignal(controller.signal);
  check(); if(saved.error)throw new Error('No se ha guardado la aceptación. Inténtalo de nuevo.');
  return true;
 } finally {controller.abort();listener.subscription.unsubscribe();}
}
