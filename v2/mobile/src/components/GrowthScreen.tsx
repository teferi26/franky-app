import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Gift, Share2, Sparkles } from 'lucide-react-native';
import { Screen } from './Screen';
import { Btn, SkeletonList } from './ui';
import { growthRequest, type GrowthSnapshot } from '@/lib/growth';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { referralUrl } from '../../../shared/growth';
import { newTapKey as newRequestKey } from '@/lib/tap';
import { C, F, R, S } from '@/theme';

const status: Record<string,string> = {pending:'En revisión',approved:'Aprobado',rejected:'No aprobado',paused:'Pausado',submitted:'Enviado',available:'Disponible',paid:'Pagado',reverted:'Revertido',referral_valid:'Invitación validada',referral_activated:'Invitación activada',reward_redeemed:'Recompensa canjeada',fraud_reversal:'Corrección de invitación',profile_completed:'Perfil completo y correo verificado',attendance_validated:'Asistencia validada'};
export function GrowthScreen(props: { creators?: boolean; invitation?: boolean }) {
  const owner=useSessionOwner();
  if(!owner)return <Screen title="Franky" back><Text style={F.body}>Inicia sesión para abrir este espacio.</Text></Screen>;
  return <GrowthContent key={`${owner.userId}:${owner.generation}`} {...props}/>;
}
function GrowthContent({ creators=false, invitation=false }: { creators?: boolean; invitation?: boolean }) {
  const router=useRouter();const [data,setData]=useState<GrowthSnapshot|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [channels,setChannels]=useState('');const [proposal,setProposal]=useState('');const [mode,setMode]=useState('both');const [title,setTitle]=useState('');const [url,setUrl]=useState('');const [rights,setRights]=useState('');const [palette,setPalette]=useState('violet');
  const epoch=useRef(0);const mutation=useRef(false);
  const load=useCallback(async()=>{const n=++epoch.current;try{const result=await growthRequest();if(n===epoch.current){setData(result);setError('');}}catch(e){if(n===epoch.current)setError(e instanceof Error?e.message:'Comprueba tu conexión.');}},[]);
  useEffect(()=>{void load();return()=>{epoch.current++;};},[load]);
  async function action(body:Record<string,unknown>){if(mutation.current)return;mutation.current=true;setBusy(true);const n=epoch.current;try{await growthRequest(body);if(n===epoch.current)await load();}catch(e){if(n===epoch.current)setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{mutation.current=false;setBusy(false);}}
  async function shareInvite(){if(!data?.code)return;try{await Share.share({message:`Nos vemos en Franky: tu campus, tus planes y tu gente. ${referralUrl('https://franky.es',data.code)}`});}catch{ /* User canceled. */ }}
  async function download(id:string){
    if(mutation.current)return;mutation.current=true;setBusy(true);const owner=captureSessionIdentity();let file:File|null=null;
    try{const document=await growthRequest<{html:string;filename:string}>(undefined,`/api/growth/rewards/${id}?format=json&palette=${palette}`);
      if(!owner||!isCurrentSessionIdentity(owner))return;
      if(!await Sharing.isAvailableAsync())throw new Error('Abre Franky en la web para descargar esta recompensa.');
      if(!isCurrentSessionIdentity(owner))return;
      file=new File(Paths.cache,`franky-${owner.userId}-${Date.now()}.html`);file.create();file.write(document.html);
      if(!isCurrentSessionIdentity(owner))return;
      await Sharing.shareAsync(file.uri,{mimeType:'text/html',dialogTitle:'Guardar mi recompensa Franky',UTI:'public.html'});
    }catch(e){if(owner&&isCurrentSessionIdentity(owner))setError(e instanceof Error?e.message:'No se pudo descargar.');}finally{if(file?.exists)file.delete();mutation.current=false;setBusy(false);}
  }
  const box={padding:S.lg,borderRadius:R.lg,borderWidth:1,borderColor:C.border,gap:12} as const;
  const input={...F.body,color:C.text,borderWidth:1,borderColor:C.border,borderRadius:R.md,padding:12,minHeight:48} as const;
  return <Screen title={creators?'Franky Creators':invitation?'Invita a tu gente':'Franky Points'} back><View style={{padding:S.lg,gap:24}}>
    <View style={{gap:10}}><Sparkles size={23} color={C.blue}/><Text style={[F.display,{fontSize:32,lineHeight:36}]}>{creators?'Tu creatividad tiene sitio.':'Más gente. Más posibilidades.'}</Text><Text style={[F.body,{color:C.muted}]}>{creators?'Tus ideas, tus piezas y cada colaboración en un mismo lugar.':'Invita a tu gente y descubre ventajas para tu vida universitaria.'}</Text></View>
    {!!error&&<View accessibilityLiveRegion="polite" style={box}><Text style={[F.body,{color:C.error}]}>{error}</Text><Btn label="Volver a intentar" variant="ghost" onPress={()=>void load()}/></View>}
    {!data?(!error&&<SkeletonList count={3} height={110}/>):!data.enabled?<View style={box}><Text style={F.h2}>Estamos preparando las recompensas</Text><Text style={F.body}>El programa se activará cuando sus ventajas y condiciones estén disponibles. Tus funciones habituales siguen como siempre.</Text></View>:<>
      {data.demo&&<Text style={[F.body,{color:C.muted}]}>Demostración · Sin pagos ni resultados comerciales reales.</Text>}
      {!creators?<>
        <View style={[box,{backgroundColor:C.blue}]}><Text style={[F.label,{color:'#fff'}]}>Tu saldo disponible</Text><Text style={[F.display,{fontSize:54,color:'#fff'}]}>{data.balance} pts</Text><Text style={[F.tiny,{color:'#fff'}]}>Personales, gratuitos, sin caducidad ni valor monetario.</Text></View>
        <View style={box}><Text style={F.h2}>Tu enlace de invitación</Text><Text selectable style={[F.body,{color:C.blue}]}>{data.code?referralUrl('https://franky.es',data.code):'Enlace aún no disponible'}</Text><Btn icon={Share2} label="Compartir invitación" disabled={!data.code} onPress={()=>void shareInvite()} full/><View style={{flexDirection:'row',flexWrap:'wrap',gap:20}}>{[['En revisión',data.referrals.pending],['Validadas',data.referrals.approved],['Activadas',data.referrals.activated]].map(([label,value])=><View key={label}><Text style={F.h2}>{value}</Text><Text style={F.tiny}>{label}</Text></View>)}</View></View>
        <View style={{gap:14}}><Text style={F.h2}>Elige tu próxima ventaja</Text>{data.rewards.map(reward=>{const redemption=data.redemptions.find(r=>r.reward_key===reward.key);return <View key={reward.key} style={box}><Gift size={23} color={C.blue}/><Text style={F.h2}>{reward.title}</Text><Text style={[F.body,{color:C.muted}]}>{reward.description}</Text><Text style={F.label}>{reward.points} puntos</Text>{redemption?<>{reward.key==='profile_palette'&&<View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{[['violet','Violeta'],['blue','Azul'],['green','Verde']].map(([key,label])=><Btn key={key} small variant={palette===key?'secondary':'ghost'} label={label} onPress={()=>setPalette(key)}/>)}</View>}<Btn label="Guardar o compartir" busy={busy} onPress={()=>void download(redemption.id)} variant="secondary" full/></>:<Btn label="Canjear" disabled={busy||data.balance<reward.points} onPress={()=>void action({action:'redeem',reward:reward.key,request:newRequestKey()})} full/>}</View>;})}</View>
        <View style={box}><Text style={F.h2}>Así se validan los puntos</Text><Text style={[F.body,{color:C.muted}]}>100 puntos por una cuenta nueva con correo verificado y alta completa; 150 más por su primera carrera o universidad guardada, actividad o comunidad. Revisión mínima de 7 días. Las primeras 20 invitaciones al mes se revisan automáticamente; el resto pasa a revisión manual.</Text></View>
        <View style={{gap:12}}><Text style={F.h2}>Últimos movimientos</Text>{data.ledger.length?data.ledger.map(row=><View key={row.id} style={{flexDirection:'row',justifyContent:'space-between',gap:12,borderBottomWidth:1,borderColor:C.border,paddingVertical:10}}><View style={{flex:1}}><Text style={F.body}>{status[row.reason]??row.reason}</Text><Text style={F.tiny}>{new Date(row.created_at).toLocaleDateString('es-ES')}</Text></View><Text style={F.label}>{row.points>0?'+':''}{row.points} pts</Text></View>):<Text style={F.body}>Aquí verás tus recompensas cuando se validen.</Text>}</View>
        <Btn label="Conocer Franky Creators" variant="ghost" onPress={()=>router.push('/creadores')}/>
      </>:<>
        <View style={box}><Text style={F.h2}>{data.creator?`Tu solicitud: ${status[data.creator.status]}`:'Cuéntanos tu idea'}</Text><Text style={[F.body,{color:C.muted}]}>Cada colaboración necesita aprobación y condiciones acordadas. Los clics no generan pagos.{!data.cash_enabled?' Las liquidaciones monetarias aún no están activadas.':''}</Text></View>
        {data.tariffs.map(t=><View key={`${t.stage}:${t.version}`} style={box}><Text style={F.label}>{t.stage==='qualified'?'Alta verificada':'Activación'} · {(t.amount_cents/100).toLocaleString('es-ES',{style:'currency',currency:'EUR'})}</Text><Text style={F.tiny}>Versión {t.version} · Nuevas adquisiciones desde {new Date(t.starts_at).toLocaleDateString('es-ES')}</Text><Text style={F.body}>{t.terms}</Text></View>)}
        {(!data.creator||['pending','rejected'].includes(data.creator.status))&&<View style={box}><Text style={F.label}>Qué te gustaría hacer</Text><View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{[['both','Ambos'],['ugc','Contenido'],['affiliate','Invitaciones']].map(([key,label])=><Btn key={key} label={label} small variant={mode===key?'secondary':'ghost'} onPress={()=>setMode(key)}/>)}</View><Text style={F.label}>Tus perfiles o canales</Text><TextInput accessibilityLabel="Tus perfiles o canales" style={input} value={channels} onChangeText={setChannels} maxLength={1000} autoCapitalize="none" placeholder="Enlaces a tus perfiles o portfolio" placeholderTextColor={C.muted}/><Text style={F.label}>Tu propuesta</Text><TextInput accessibilityLabel="Tu propuesta" style={[input,{minHeight:140,textAlignVertical:'top'}]} value={proposal} onChangeText={setProposal} maxLength={3000} multiline placeholder="Qué quieres contar, a quién y cómo encaja con Franky" placeholderTextColor={C.muted}/><Btn label="Enviar propuesta" busy={busy} disabled={channels.trim().length<3||proposal.trim().length<20} onPress={()=>void action({action:'apply',mode,channels,proposal})} full/></View>}
        {data.creator?.status==='approved'&&<View style={box}><Text style={F.h2}>Enviar una pieza</Text><TextInput accessibilityLabel="Título de la pieza" style={input} value={title} onChangeText={setTitle} maxLength={140} placeholder="Título" placeholderTextColor={C.muted}/><TextInput accessibilityLabel="Enlace HTTPS al contenido" style={input} value={url} onChangeText={setUrl} autoCapitalize="none" maxLength={2000} placeholder="https://…" placeholderTextColor={C.muted}/><TextInput accessibilityLabel="Derechos de uso propuestos" style={[input,{minHeight:100}]} value={rights} onChangeText={setRights} multiline maxLength={3000} placeholder="Derechos de uso: plataformas, duración, publicidad, edición y autoría" placeholderTextColor={C.muted}/><Btn label="Enviar contenido" busy={busy} disabled={title.trim().length<3||!url.startsWith('https://')||rights.trim().length<20} onPress={()=>void action({action:'content',title,url,rights})}/></View>}
        <View style={{gap:12}}><Text style={F.h2}>Tus piezas</Text>{data.content.length?data.content.map(c=><View key={c.id} style={box}><Text style={F.label}>{c.title}</Text><Text style={F.body}>{status[c.status]??c.status}</Text></View>):<Text style={F.body}>Aún no has enviado contenido.</Text>}</View><View style={{gap:12}}><Text style={F.h2}>Colaboraciones remuneradas</Text>{data.commissions.length?data.commissions.map(c=><View key={c.id} style={box}><Text style={F.h2}>{(c.amount_cents/100).toLocaleString('es-ES',{style:'currency',currency:c.currency})}</Text><Text style={F.body}>{status[c.status]}</Text></View>):<Text style={F.body}>Aquí aparecerán los importes expresamente acordados y aprobados.</Text>}</View>
      </>}
    </>}
  </View></Screen>;
}


