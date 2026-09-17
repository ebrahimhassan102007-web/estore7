import * as THREE from 'three';
const M=c=>new THREE.MeshStandardMaterial({color:c,roughness:.85});
export class Animals{constructor(scene){this.group=new THREE.Group();scene.add(this.group);this.animals=[];this.build()}
 part(g,geo,mat,p){const m=new THREE.Mesh(geo,mat);m.position.set(...p);m.castShadow=true;g.add(m);return m}
 animal(type,x,z,s=1){const g=new THREE.Group(),white=M(0xf5eee0),dark=M(0x201c19),pink=M(0xf09e91),brown=M(0x9c4823);g.position.set(x,0,z);g.scale.setScalar(s);let body,head;
 if(type==='cow'){body=this.part(g,new THREE.BoxGeometry(1.8,1.15,.85),white,[0,1,0]);head=this.part(g,new THREE.BoxGeometry(.7,.8,.65),white,[0,1.15,.82]);for(const p of[[-.55,.35,-.25],[.55,.35,-.25],[-.55,.35,.25],[.55,.35,.25]])this.part(g,new THREE.CylinderGeometry(.09,.11,.7,6),dark,p);for(const p of[[-.45,1.2,.44],[.35,.85,-.44]])this.part(g,new THREE.SphereGeometry(.3,7,6),dark,p)}
 else if(type==='pig'){body=this.part(g,new THREE.SphereGeometry(.75,9,7),pink,[0,.75,0]);body.scale.set(1.35,.8,.85);head=this.part(g,new THREE.SphereGeometry(.43,8,6),pink,[0,.85,.7]);this.part(g,new THREE.CylinderGeometry(.2,.24,.16,8),pink,[0,.78,1.08]).rotation.x=Math.PI/2}
 else if(type==='sheep'){body=this.part(g,new THREE.DodecahedronGeometry(.72,1),white,[0,.8,0]);head=this.part(g,new THREE.BoxGeometry(.42,.55,.45),dark,[0,.78,.68])}
 else {body=this.part(g,new THREE.SphereGeometry(.35,8,6),type==='rooster'?brown:white,[0,.42,0]);head=this.part(g,new THREE.SphereGeometry(.2,7,5),brown,[0,.72,.18]);this.part(g,new THREE.ConeGeometry(.08,.25,5),M(0xe9a020),[0,.7,.42]).rotation.x=Math.PI/2}
 g.userData={baseX:x,baseZ:z,phase:Math.random()*6.2};this.animals.push(g);this.group.add(g)}
 build(){this.animal('pig',-15,7,1.05);this.animal('pig',-18,9,.9);this.animal('sheep',-8,-1,1);this.animal('sheep',-11,1,.85);this.animal('cow',14,4,1.1);this.animal('cow',18,6,.9);this.animal('chicken',2,3,.8);this.animal('rooster',-2,1,.95)}
 update(t){this.animals.forEach(a=>{a.position.x=a.userData.baseX+Math.sin(t*.35+a.userData.phase)*.55;a.position.z=a.userData.baseZ+Math.cos(t*.3+a.userData.phase)*.35;a.rotation.y=Math.sin(t*.25+a.userData.phase)})}}
