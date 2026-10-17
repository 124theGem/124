import {afterEach,describe,it,expect,vi} from 'vitest';
import {Display} from '../src/platform/Display';

function environment(version='8.0',telegram=true){
  const values=new Map<string,string>(),handlers=new Map<string,()=>void>();
  const attributes=new Map<string,string>();
  const element={style:{setProperty:(k:string,v:string)=>values.set(k,v)},dataset:{} as Record<string,string>,requestFullscreen:vi.fn(async()=>{doc.fullscreenElement=element;})};
  const doc=Object.assign(new EventTarget(),{documentElement:element,fullscreenElement:null as unknown,
    querySelector:()=>({setAttribute:(k:string,v:string)=>attributes.set(k,v)}),exitFullscreen:vi.fn(async()=>{doc.fullscreenElement=null;})});
  const app={platform:'android',initData:'query_id=test-fixture',isFullscreen:false,
    safeAreaInset:{top:24,bottom:18,left:0,right:0},contentSafeAreaInset:{top:36,bottom:0,left:0,right:0},
    ready:vi.fn(),expand:vi.fn(),requestFullscreen:vi.fn(),disableVerticalSwipes:vi.fn(),
    setHeaderColor:vi.fn(),setBackgroundColor:vi.fn(),setBottomBarColor:vi.fn(),
    isVersionAtLeast:(target:string)=>{const a=version.split('.').map(Number),b=target.split('.').map(Number);return a[0]>b[0]||a[0]===b[0]&&a[1]>=b[1];},
    onEvent:vi.fn((e:string,fn:()=>void)=>handlers.set(e,fn)),offEvent:vi.fn((e:string)=>handlers.delete(e))};
  vi.stubGlobal('document',doc);
  vi.stubGlobal('window',Object.assign(new EventTarget(),{Telegram:telegram?{WebApp:app}:undefined,visualViewport:new EventTarget()}));
  return {app,doc,element,values,handlers,attributes};
}
afterEach(()=>vi.unstubAllGlobals());
describe('fullscreen and safe areas',()=>{
  it('readies Telegram, expands, disables swipes and requests native fullscreen at launch',()=>{
    const e=environment(),display=new Display();
    expect(e.app.ready).toHaveBeenCalledOnce();expect(e.app.expand).toHaveBeenCalledOnce();
    expect(e.app.disableVerticalSwipes).toHaveBeenCalledOnce();expect(e.app.requestFullscreen).toHaveBeenCalledOnce();
    expect(e.values.get('--tg-safe-top')).toBe('60px');expect(e.values.get('--tg-safe-bottom')).toBe('18px');display.dispose();
  });
  it('uses expanded mode on older Telegram clients without unsupported fullscreen calls',()=>{
    const e=environment('7.6'),display=new Display();expect(e.app.expand).toHaveBeenCalledOnce();
    expect(e.app.requestFullscreen).not.toHaveBeenCalled();expect(e.app.disableVerticalSwipes).not.toHaveBeenCalled();display.dispose();
  });
  it('updates insets and button state when Telegram reports native changes',()=>{
    const e=environment(),display=new Display();e.app.isFullscreen=true;e.app.contentSafeAreaInset.top=48;
    e.handlers.get('fullscreenChanged')!();e.handlers.get('contentSafeAreaChanged')!();
    expect(e.values.get('--tg-safe-top')).toBe('72px');expect(e.attributes.get('aria-pressed')).toBe('true');display.dispose();
  });
  it('can retry a denied native request from the fullscreen button',async()=>{
    const e=environment();e.app.requestFullscreen.mockImplementationOnce(()=>{throw new Error('gesture required');});
    const display=new Display();await display.request();expect(e.app.requestFullscreen).toHaveBeenCalledTimes(2);display.dispose();
  });
  it('toggles browser fullscreen from a user action without Telegram',async()=>{
    const e=environment('8.0',false),display=new Display();expect(e.element.requestFullscreen).not.toHaveBeenCalled();
    await display.request();expect(e.element.requestFullscreen).toHaveBeenCalledOnce();
    await display.request();expect(e.doc.exitFullscreen).toHaveBeenCalledOnce();display.dispose();
  });
  it('detaches native listeners when the game is disposed',()=>{
    const e=environment(),display=new Display();display.dispose();expect(e.handlers.size).toBe(0);expect(e.app.offEvent).toHaveBeenCalledTimes(5);
  });
});
