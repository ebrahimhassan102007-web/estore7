import * as THREE from 'three';

export class FoliageManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'foliage';
    scene.add(this.group);
    this.grass = null;
    this.build();
  }
  build() {
    const bladeGeo = new THREE.ConeGeometry(.045, .42, 3);
    bladeGeo.translate(0,.21,0);
    const bladeMat = new THREE.MeshStandardMaterial({color:0x4d9a2c,roughness:1,flatShading:true});
    const points=[];
    for(let i=0;i<1250;i++){
      const x=(Math.random()-.5)*68,z=(Math.random()-.5)*68;
      if(Math.abs(x)<2.5 || (Math.abs(x)<7&&z>-18&&z<14)) continue;
      points.push([x,z]);
    }
    this.grass=new THREE.InstancedMesh(bladeGeo,bladeMat,points.length);
    const m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3();
    points.forEach(([x,z],i)=>{q.setFromEuler(new THREE.Euler(0,Math.random()*6.28,(Math.random()-.5)*.12));s.setScalar(.7+Math.random()*.8);m.compose(p.set(x,.02,z),q,s);this.grass.setMatrixAt(i,m)});
    this.grass.instanceMatrix.setUsage(THREE.StaticDrawUsage); this.grass.receiveShadow=true; this.group.add(this.grass);
    const flowerGeo=new THREE.SphereGeometry(.09,5,4), colors=[0xfff3a0,0xffffff,0xe96d9b,0x8dc8ff];
    for(let c=0;c<4;c++){
      const mesh=new THREE.InstancedMesh(flowerGeo,new THREE.MeshStandardMaterial({color:colors[c]}),30);
      for(let i=0;i<30;i++){const x=(Math.random()-.5)*55,z=(Math.random()-.5)*55;m.makeTranslation(x,.28,z);mesh.setMatrixAt(i,m)} this.group.add(mesh);
    }
    const trunkMat=new THREE.MeshStandardMaterial({color:0x68401f,roughness:1});
    const leafMats=[0x2f792e,0x438f32,0x65a83a].map(color=>new THREE.MeshStandardMaterial({color,roughness:.9,flatShading:true}));
    [[-23,-12],[-25,2],[-22,17],[22,-16],[25,4],[22,20],[-12,-27],[13,-27]].forEach(([x,z],n)=>{
      const t=new THREE.Group();t.position.set(x,0,z);const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.3,.55,3.4,8),trunkMat);trunk.position.y=1.7;trunk.castShadow=true;t.add(trunk);
      [[0,4,0,1.7],[-1,3.7,0,1.25],[1,3.8,.2,1.35],[0,4.7,0,1.2]].forEach((a,j)=>{const l=new THREE.Mesh(new THREE.IcosahedronGeometry(a[3],1),leafMats[(j+n)%3]);l.position.set(a[0],a[1],a[2]);l.castShadow=true;t.add(l)});this.group.add(t);
    });
  }
  update(t){this.group.rotation.z=Math.sin(t*.7)*.0015}
}
