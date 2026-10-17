import * as T from 'three';
import type { CarPhysics } from '../physics/CarPhysics';
export class FollowCamera {
  readonly camera=new T.OrthographicCamera(-30,30,30,-30,0.1,700);
  private target=new T.Vector3();
  private size=32;
  private initialized=false;
  mode=0;
  resize() { this.updateFrustum(); }
  private updateFrustum() {
    const aspect=innerWidth/innerHeight;
    const vertical=this.size*(aspect<1?1.25:1);
    this.camera.left=-vertical*aspect;this.camera.right=vertical*aspect;
    this.camera.top=vertical;this.camera.bottom=-vertical;this.camera.updateProjectionMatrix();
  }
  update(car:CarPhysics,dt:number,snap=false) {
    const v=car.worldVelocity;
    const target=new T.Vector3(car.x+v.x*0.48,0,car.z+v.z*0.48);
    if(!this.initialized||snap){this.target.copy(target);this.initialized=true;}else this.target.lerp(target,1-Math.exp(-4*dt));
    const desired=(this.mode?45:29)+Math.min(12,car.speed*0.26);
    this.size+=(desired-this.size)*(1-Math.exp(-2*dt));this.updateFrustum();
    // Fixed world orientation: drift never swings the camera around the car.
    const offset=this.mode?new T.Vector3(0,85,42):new T.Vector3(27,72,44);
    this.camera.position.copy(this.target).add(offset);this.camera.lookAt(this.target);
  }
}
