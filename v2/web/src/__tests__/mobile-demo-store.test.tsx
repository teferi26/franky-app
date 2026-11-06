import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeLoader } from './helpers/native-module';

afterEach(cleanup);
function fixture() {
 let owner = { userId: 'demo-a', generation: 1 };
 let context: any = { ready: true, enabled: true, demoEpoch: 1, workspaces: [{ id: 'org', demo_cohort_id: 'cohort-a', status: 'active' }] };
 const realBilling = { getNativeBilling: vi.fn(async () => ({ configured: false, salesEnabled: false, entitlements: [] })), getNativeOffers: vi.fn(), buyNativeOffer: vi.fn(), restoreNativePurchases: vi.fn() };
 const network = vi.fn(() => { throw new Error('demo must never contact a provider'); });
 const wrapper = ({children}:any) => <div>{children}</div>;
 const bindings: Record<string,unknown> = { react: {...React,default:React}, 'react/jsx-runtime': jsx,
  'react-native': {Text: ({children,accessibilityRole}:any)=><span role={accessibilityRole}>{children}</span>, View:wrapper},
  '@/components/Screen': {Screen:wrapper},
  '@/components/ui': {Card:wrapper,Pill:({label}:any)=><span>{label}</span>,EmptyState:({title}:any)=><span>{title}</span>,Btn:({label,onPress,disabled}:any)=><button disabled={disabled} onClick={onPress}>{label}</button>},
  '@/components/WorkspaceProvider': {useWorkspace:()=>context},
  '@/lib/useSessionOwner': {useSessionOwner:()=>owner,useOwnerGuard:(expected:any)=>()=>owner===expected},
  '@/lib/native-billing':realBilling,
  '@/theme':{F:{},S:{}},
  'lucide-react-native':{ShoppingBag:wrapper},
 };
 const loader = nativeLoader(bindings,{fetch:network});
 bindings['@/components/DemoStorePurchases'] = loader('../mobile/src/components/DemoStorePurchases.tsx');
 const { default: Page } = loader('../mobile/app/compras.tsx');
 return {Page,realBilling,network,resetDemo(){context={...context,demoEpoch:2};},switchAccount(){owner={userId:'demo-b',generation:2};context={...context,workspaces:[{id:'org-b',demo_cohort_id:'cohort-b',status:'active'}]};},relogin(){owner={userId:owner.userId,generation:owner.generation+1};},unknownEpoch(){context={...context,demoEpoch:null};},realAccount(){owner={userId:'real',generation:3};context={...context,workspaces:[],demoEpoch:null};}};
}
describe('native demo store practice',()=>{
 it('simulates every outcome and restoration without SDK, network or real billing calls',()=>{
  const f=fixture();render(<f.Page/>);
  fireEvent.click(screen.getByRole('button',{name:'Simular restauración'}));expect(screen.getByRole('alert').textContent).toContain('no hay compras anteriores');
  fireEvent.click(screen.getByRole('button',{name:'Simular compra pendiente'}));expect(screen.getByRole('alert').textContent).toContain('pendiente de confirmación');
  fireEvent.click(screen.getByRole('button',{name:'Simular restauración'}));expect(screen.getByRole('alert').textContent).toContain('no hay compras anteriores');
  fireEvent.click(screen.getByRole('button',{name:'Simular compra rechazada'}));expect(screen.getByRole('alert').textContent).toContain('rechazada');
  fireEvent.click(screen.getByRole('button',{name:'Simular compra completada'}));expect(screen.getByRole('alert').textContent).toContain('No se ha cobrado dinero');
  fireEvent.click(screen.getByRole('button',{name:'Simular restauración'}));expect(screen.getByRole('alert').textContent).toContain('anterior restaurada');
  expect(f.network).not.toHaveBeenCalled();for(const fn of Object.values(f.realBilling))expect(fn).not.toHaveBeenCalled();
 });
 it.each(['resetDemo','switchAccount','relogin'] as const)('discards simulated purchases after %s',change=>{
  const f=fixture(),page=render(<f.Page/>);fireEvent.click(screen.getByRole('button',{name:'Simular compra completada'}));f[change]();page.rerender(<f.Page/>);
  fireEvent.click(screen.getByRole('button',{name:'Simular restauración'}));expect(screen.getByRole('alert').textContent).toContain('no hay compras anteriores');
 });
 it('does not fall through to real store methods if a demo epoch is unavailable',()=>{const f=fixture();f.unknownEpoch();render(<f.Page/>);expect(screen.getByText(/No pudimos comprobar el estado de la demo/)).toBeTruthy();for(const fn of Object.values(f.realBilling))expect(fn).not.toHaveBeenCalled();});
 it('does not expose simulation controls to a real account',()=>{const f=fixture();f.realAccount();render(<f.Page/>);expect(screen.queryByRole('button',{name:'Simular compra completada'})).toBeNull();expect(f.realBilling.getNativeBilling).toHaveBeenCalled();});
 it('clears the local exercise when explicitly restarted',()=>{const f=fixture();render(<f.Page/>);fireEvent.click(screen.getByRole('button',{name:'Simular compra completada'}));fireEvent.click(screen.getByRole('button',{name:'Reiniciar simulación'}));fireEvent.click(screen.getByRole('button',{name:'Simular restauración'}));expect(screen.getByRole('alert').textContent).toContain('no hay compras anteriores');});
});
