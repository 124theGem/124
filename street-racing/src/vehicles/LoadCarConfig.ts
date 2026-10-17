import { CAR, DEFAULT_CAR, type CarSettings } from './CarConfig';

type Tunable = Exclude<keyof CarSettings, 'fixedStep'>;
const bounds: Record<Tunable, readonly [number, number]> = {
  mass:[500,4000], inertia:[400,12000], wheelbase:[1.7,4], frontAxle:[.6,2.5], rearAxle:[.6,2.5],
  cgHeight:[.1,1.2], length:[3,7], width:[1.3,3], wheelRadius:[.2,.7],
  engineForce:[500,22000], power:[20000,600000], reverseForce:[500,10000], reverseMaxSpeed:[1,15],
  brakeForce:[1000,35000], handbrakeForce:[0,15000], airDrag:[0,3], rolling:[0,700],
  maxSpeed:[30/3.6,360/3.6], maxSteer:[10*Math.PI/180,55*Math.PI/180], steeringRate:[.5,15],
  frontStiffness:[10000,200000], rearStiffness:[10000,200000],
  asphaltGrip:[.8,4], grassGrip:[.2,2], shoulderGrip:[.3,3], handbrakeGrip:[.2,.95],
  gripRecovery:[.2,10], restitution:[0,.6], corneringMargin:[.4,1.25], driftSteeringMultiplier:[1,3],
  minimumSteer:[.005,.1], stabilityAssist:[0,25], driftStabilityAssist:[0,25],
  maxAssistAcceleration:[1,35], maxDriftYawRate:[.3,3], recoveryAlignment:[0,12],
};
const aliases: Record<string, { field:Tunable; scale:number }> = {
  maxSpeedKmh:{field:'maxSpeed',scale:1/3.6}, reverseMaxSpeedKmh:{field:'reverseMaxSpeed',scale:1/3.6},
  maxSteerDegrees:{field:'maxSteer',scale:Math.PI/180}, powerKw:{field:'power',scale:1000},
};
const owns = (object:object,key:string) => Object.prototype.hasOwnProperty.call(object,key);

/** Pure validation: one bad setting rejects the whole override rather than a partial tune. */
export function parseCarConfig(data:unknown):CarSettings {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('ожидается JSON-объект');
  const result:CarSettings={...DEFAULT_CAR};
  const seen=new Set<Tunable>();
  for (const [key,value] of Object.entries(data)) {
    if (key.startsWith('_')) continue; // Russian hints and descriptions are metadata.
    const alias=owns(aliases,key)?aliases[key]:undefined;
    const field=alias?.field??key as Tunable;
    if (!owns(bounds,field)) throw new Error(`неизвестный параметр «${key}»`);
    if (seen.has(field)) throw new Error(`параметр «${field}» указан дважды в разных единицах`);
    seen.add(field);
    const scale=alias?.scale??1,[min,max]=bounds[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value*scale<min-1e-9 || value*scale>max+1e-9)
      throw new Error(`«${key}»: нужно число от ${Number((min/scale).toFixed(3))} до ${Number((max/scale).toFixed(3))}`);
    result[field]=value*scale;
  }
  if (Math.abs(result.wheelbase-result.frontAxle-result.rearAxle)>.001)
    throw new Error('wheelbase должна равняться frontAxle + rearAxle');
  if (result.length<result.wheelbase+.3) throw new Error('length должна быть больше wheelbase минимум на 0.3 м');
  return result;
}

export async function loadCarConfig(url=new URL('./car-config.json',window.location.href).href) {
  Object.assign(CAR,DEFAULT_CAR);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),4000);
  try {
    const response=await fetch(url,{cache:'no-store',signal:controller.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const settings=parseCarConfig(await response.json());
    Object.assign(CAR,settings);
    return {loaded:true,warning:undefined};
  } catch (error) {
    const detail=error instanceof Error?error.message:'ошибка чтения';
    const warning=`Настройки car-config.json: ${detail}. Использованы базовые значения.`;
    console.warn(warning);
    return {loaded:false,warning};
  } finally {clearTimeout(timeout);}
}
