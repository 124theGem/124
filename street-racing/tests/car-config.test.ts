import { afterEach, describe, expect, it, vi } from 'vitest';
import shippedJson from '../public/car-config.json?raw';
import { CAR, DEFAULT_CAR } from '../src/vehicles/CarConfig';
import { loadCarConfig, parseCarConfig } from '../src/vehicles/LoadCarConfig';

afterEach(()=>{Object.assign(CAR,DEFAULT_CAR);vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('external car configuration',()=>{
  it('ships all tunable defaults with human-readable speed, power and steering units',()=>{
    const json=JSON.parse(shippedJson);
    const result=parseCarConfig(json);
    for(const key of Object.keys(DEFAULT_CAR) as (keyof typeof DEFAULT_CAR)[])
      expect(result[key],key).toBeCloseTo(DEFAULT_CAR[key],10);
    expect(Object.keys(json).filter(key=>!key.startsWith('_'))).toHaveLength(Object.keys(DEFAULT_CAR).length-1);
  });
  it('converts convenient units, preserves defaults and ignores descriptions',()=>{
    const settings=parseCarConfig({maxSpeedKmh:144,maxSteerDegrees:44,powerKw:180,_help:{mass:'kg'}});
    expect(settings.maxSpeed).toBe(40);expect(settings.maxSteer).toBeCloseTo(44*Math.PI/180);
    expect(settings.power).toBe(180000);expect(settings.mass).toBe(DEFAULT_CAR.mass);
  });
  it.each([
    null,[],{mass:'1400'},{mass:NaN},{maxSteerDegrees:90},{asphaltGrip:-1},
    {unknown:2},{fixedStep:1/30},{maxSpeed:40,maxSpeedKmh:144},{wheelbase:3},{length:3,wheelbase:3,frontAxle:1.5,rearAxle:1.5},
    JSON.parse('{"__proto__":3,"constructor":4}'),
  ])('rejects malformed or inconsistent settings: %j',data=>{
    expect(()=>parseCarConfig(data)).toThrow();expect(CAR).toEqual(DEFAULT_CAR);
  });
  it('fetches fresh settings before applying them to the shared car configuration',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({mass:1400,maxSpeedKmh:144})));
    vi.stubGlobal('fetch',fetcher);
    expect((await loadCarConfig('https://example.test/racing/car-config.json')).loaded).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('https://example.test/racing/car-config.json',expect.objectContaining({cache:'no-store'}));
    expect(CAR.mass).toBe(1400);expect(CAR.maxSpeed).toBe(40);
  });
  it.each([
    new Response('missing',{status:404}),new Response('{broken'),new Response('{"mass":1400,"asphaltGrip":-1}'),
  ])('falls back as a whole when loading fails',async response=>{
    CAR.mass=1500;vi.spyOn(console,'warn').mockImplementation(()=>{});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
    const result=await loadCarConfig('https://example.test/racing/car-config.json');
    expect(result.loaded).toBe(false);expect(result.warning).toContain('Использованы базовые значения');
    expect(CAR).toEqual(DEFAULT_CAR);
  });
});
