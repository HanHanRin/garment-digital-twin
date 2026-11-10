import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STATUS } from './replay.js';

const geom = new Map();
const boxGeo = (w, h, d) => {
  const key = `${w},${h},${d}`;
  if (!geom.has(key)) geom.set(key, new THREE.BoxGeometry(w, h, d));
  return geom.get(key);
};
const cylinders = new Map();
const cylinderGeo = (r, h) => {
  const key = `${r},${h}`;
  if (!cylinders.has(key)) cylinders.set(key, new THREE.CylinderGeometry(r, r, h, 12));
  return cylinders.get(key);
};

function labelSprite(text, color = '#415e55', size = 2.6, pill = true) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '600 48px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 64;
  canvas.height = 100;
  if (pill) {
    ctx.fillStyle = '#ffffffed';
    ctx.beginPath(); ctx.roundRect(3, 3, canvas.width - 6, 94, 16); ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.userData.labelAspect = canvas.width / canvas.height;
  sprite.userData.pixelHeight = pill ? 24 : 18;
  sprite.scale.set(size * sprite.userData.labelAspect, size, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export class FactoryScene {
  constructor(host, layout, catalogs, onSelect) {
    this.host = host;
    this.layout = layout;
    this.assets = new Map();
    this.showLabels = false;
    this.flowDots = [];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9eeeb');
    this.scene.fog = new THREE.Fog('#e9eeeb', 95, 200);
    this.camera = new THREE.PerspectiveCamera(40, 1, .1, 250);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.domElement.setAttribute('aria-label', '可旋转、缩放并点击设备的服装车间三维场景');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.tabIndex = 0;
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI / 2.08;
    this.controls.minPolarAngle = .01;
    this.controls.addEventListener('start', () => { this.tween = null; this.viewMode = 'custom'; });
    this.scene.add(new THREE.HemisphereLight('#f4fbff', '#758479', 1.65));
    const sun = new THREE.DirectionalLight('#fff5df', 2.7);
    sun.position.set(-22, 45, 24); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 110 });
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .035;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#cbe4df', 1.3); fill.position.set(25, 16, -20); this.scene.add(fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: '#e9eeeb', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.57; ground.receiveShadow = true; this.scene.add(ground);
    const grid = new THREE.GridHelper(180, 90, '#d1dbd5', '#dce4df'); grid.position.y = -.56; this.scene.add(grid);
    this.world = new THREE.Group(); this.world.position.set(-18, 0, -12); this.scene.add(this.world);
    this.buildBuilding();
    for (const asset of layout.assets) this.buildAsset(asset, catalogs.get(asset.catalog_id));
    this.buildFlows();
    this.labelSprites = [];
    this.world.traverse(obj => { if (obj.isSprite) this.labelSprites.push(obj); });
    this.labelPosition = new THREE.Vector3();
    this.pickTargets = [...this.assets.values()].map(a => a.group);
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let start = null;
    this.renderer.domElement.addEventListener('pointerdown', e => { start = [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return;
      const id = this.pick(e);
      if (id) onSelect(id, false);
    });
    this.renderer.domElement.addEventListener('pointermove', e => {
      this.renderer.domElement.style.cursor = this.pick(e) ? 'pointer' : 'grab';
    });
    this.renderer.domElement.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      host.dispatchEvent(new CustomEvent('scene-error', { detail: '3D 图形上下文已丢失，请刷新页面。设备列表仍可使用。' }));
    });
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.resize(); this.setView('overview', true);
  }

  buildBuilding() {
    const mat = color => new THREE.MeshStandardMaterial({ color, roughness: .8 });
    const add = (w, h, d, x, y, z, material) => {
      const mesh = new THREE.Mesh(boxGeo(w, h, d), material);
      mesh.position.set(x, y, z); mesh.receiveShadow = true; mesh.castShadow = true; this.world.add(mesh); return mesh;
    };
    add(36, .5, 24, 18, -.25, 12, mat('#c8d3cb'));
    const floor = mat('#e5e9df'); add(35.7, .03, 23.7, 18, .015, 12, floor);
    const tile = mat('#9db8a8');
    for (const zone of this.layout.zones) {
      const [x, z, w, d] = zone.bounds_xz_m;
      add(w - .5, .025, d - .5, x + w / 2, .045, z + d / 2, tile);
      const text = labelSprite(zone.name.replace(' / A·B 两线', ''), '#3a6152', .52);
      text.position.set(x + w / 2, .8, z + .8); this.world.add(text);
    }
    const lane = mat('#f7d780');
    for (let x = 1; x < 36; x += 1.6) add(.7, .02, .065, x, .07, 8.4, lane);
    for (let z = 1; z < 24; z += 1.6) add(.065, .02, .7, 22.35, .07, z, lane);
    const wall = mat('#d6ded8');
    add(36, 1.0, .22, 18, .5, 0, wall);
    add(.22, 1.0, 24, 0, .5, 12, wall);
    const column = mat('#b8c8bd');
    for (const x of [.25, 12, 24, 35.75]) {
      add(.38, 3.2, .38, x, 1.6, .25, column);
      if (x === .25 || x === 35.75) add(.38, 3.2, .38, x, 1.6, 23.75, column);
    }
    for (const x of [5, 17, 29]) add(6, .02, 1, x, .03, 23.5, mat('#f3efe3'));
    const title = labelSprite('FABRIC TWIN  /  36 × 24 m', '#547063', .75, false);
    title.position.set(18, .3, 26); this.world.add(title);
  }

  buildAsset(asset, catalog) {
    const group = new THREE.Group();
    group.position.fromArray(asset.position_m);
    group.rotation.y = THREE.MathUtils.degToRad(asset.rotation_y_deg);
    group.userData.assetId = asset.asset_id;
    const materials = new Map();
    const mat = color => {
      if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: .08 }));
      return materials.get(color);
    };
    const box = (w, h, d, x, y, z, color) => {
      const mesh = new THREE.Mesh(boxGeo(w, h, d), mat(color));
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    const cyl = (r, h, x, y, z, color, rz = 0) => {
      const mesh = new THREE.Mesh(cylinderGeo(r, h), mat(color));
      mesh.position.set(x, y, z); mesh.rotation.z = rz; mesh.castShadow = true; group.add(mesh); return mesh;
    };
    const legs = (w, d, height = .78) => {
      for (const x of [-w / 2 + .1, w / 2 - .1]) for (const z of [-d / 2 + .1, d / 2 - .1]) box(.065, height, .065, x, height / 2, z, '#6d8077');
    };
    const cloth = '#6d9d98', table = '#efebdc', steel = '#5a7368', machine = '#f7f7ed';
    const kind = asset.catalog_id;
    let moving = null;
    if (['lockstitch', 'overlock', 'coverstitch'].includes(kind)) {
      const [w, , d] = catalog.proxy_size_m;
      legs(w, d * .75);
      box(w, .10, d * .82, 0, .82, 0, table);
      box(.60, .08, .29, .04, .91, -.04, machine);
      if (kind === 'lockstitch') {
        box(.15, .36, .22, .25, 1.08, -.04, machine);
        box(.59, .14, .24, .02, 1.30, -.04, machine);
        box(.12, .19, .17, -.23, 1.19, -.04, machine);
        cyl(.105, .07, .36, 1.28, -.04, '#4c756c', Math.PI / 2);
      } else {
        box(.44, .35, .31, .12, 1.09, -.04, machine);
        box(.19, .12, .35, -.14, 1.04, -.06, machine);
        for (let i = 0; i < 3; i++) cyl(.037, .055, -.02 + i * .1, 1.26, .16, '#77a9a4', Math.PI / 2);
      }
      box(.19, .13, .04, .43, 1.04, .22, '#2e6056');
      box(.14, .07, .01, .43, 1.05, .245, '#a7d3b7');
      moving = cyl(.012, .16, -.23, 1.06, -.04, '#64776f');
      box(.35, .012, .28, -.20, .885, .17, cloth);
      cyl(.012, .53, .52, 1.14, -.29, steel);
      box(.38, .025, .08, .43, 1.41, -.29, steel);
      for (let i = 0; i < (kind === 'lockstitch' ? 1 : 3); i++) cyl(.045, .13, .31 + i * .10, 1.31, -.29, i % 2 ? '#dbba8e' : '#eee3c8');
      box(.24, .04, .17, 0, .16, .05, steel);
      // A compact stool is decorative; it does not represent personnel telemetry.
      cyl(.16, .065, -.03, .5, .64, '#5a8b7e'); cyl(.035, .46, -.03, .24, .64, steel);
      box(.37, .04, .34, -.03, .04, .64, steel);
    } else if (kind === 'rack') {
      for (const x of [-.83, .83]) for (const z of [-.28, .28]) box(.07, 2.15, .07, x, 1.08, z, steel);
      for (const y of [.15, .86, 1.57]) {
        box(1.8, .07, .7, 0, y, 0, '#7b9990');
        for (let i = 0; i < 4; i++) cyl(.14, .5, -.6 + i * .4, y + .2, 0, ['#b5cfbf', '#d3c6a9', '#8cacaa', '#ddd7c5'][i], Math.PI / 2);
      }
    } else if (kind === 'cutting') {
      legs(7.8, 2.0, .9); box(8, .12, 2.2, 0, .96, 0, table);
      box(6.5, .035, 1.8, -.2, 1.04, 0, cloth);
      for (let i = 0; i < 4; i++) {
        box(.65, .015, .75, -2.3 + i * 1.35, 1.065, -.15, '#f5f0d9');
        box(.32, .015, .32, -2.3 + i * 1.35, 1.066, .31, '#f5f0d9');
      }
      cyl(.21, 1.8, 3.2, 1.27, 0, '#c4b293', Math.PI / 2);
      box(.3, .32, .35, 1.7, 1.20, .5, '#e0a45f');
    } else if (kind === 'pressing') {
      legs(1.8, 1); box(2, .12, 1.2, 0, .84, 0, '#b2c3ba');
      box(1.5, .035, .75, -.1, .92, 0, '#e6dfcb');
      box(.29, .09, .17, .35, 1, .1, '#f4f4ed');
      box(.15, .08, .06, .35, 1.08, .1, '#477a6b');
      cyl(.025, 1.3, .8, .65, -.4, steel);
      box(.4, .1, .08, .6, 1.3, -.4, steel);
    } else if (kind === 'inspection') {
      legs(1.8, 1); box(2, .10, 1.2, 0, .85, 0, table);
      box(.85, .025, .75, -.1, .92, .02, cloth);
      box(.12, 1.0, .10, .78, 1.12, -.4, steel);
      box(1.6, .07, .14, 0, 1.63, -.4, machine);
      box(.3, .3, .08, .6, 1.07, .3, '#47736b');
      box(.23, .18, .01, .6, 1.09, .35, '#bedcc7');
    } else if (kind === 'packing') {
      legs(2.8, 1.3); box(3, .12, 1.5, 0, .84, 0, table);
      for (const [x, z] of [[-.8, 0], [0, -.15], [.8, .18]]) {
        box(.5, .35, .5, x, 1.07, z, '#c8a67a');
        box(.075, .008, .5, x, 1.25, z, '#ead8b3');
      }
      box(.9, .65, .5, -.8, .33, .35, '#b39268');
    }
    const lampMat = new THREE.MeshBasicMaterial({ color: STATUS.running.color });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 8), lampMat);
    lamp.position.set(catalog.proxy_size_m[0] / 2, Math.max(catalog.proxy_size_m[1], 1.4) + .18, 0);
    if (kind !== 'rack') group.add(lamp);
    const [w, d] = asset.footprint_m;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo(w + .28, .04, d + .28)), new THREE.LineBasicMaterial({ color: '#13725b' }));
    outline.position.y = .1; outline.visible = false; group.add(outline);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(w, d) * .62, .045, 6, 40), new THREE.MeshBasicMaterial({ color: '#e87146', transparent: true, opacity: .75 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = .12; ring.visible = false; group.add(ring);
    const name = labelSprite(asset.asset_id, '#255d4b', .24);
    name.position.set(0, Math.max(catalog.proxy_size_m[1], 1.4) + .6, 0); name.visible = false; group.add(name);
    this.world.add(group);
    this.assets.set(asset.asset_id, { group, materials, lamp, outline, ring, name, moving, movingY: moving?.position.y, state: 'idle', matches: true });
  }

  buildFlows() {
    this.flowGroup = new THREE.Group(); this.world.add(this.flowGroup);
    const dotMat = new THREE.MeshBasicMaterial({ color: '#cb9948' });
    for (const flow of this.layout.material_flow) {
      const points = flow.points_xz_m.map(([x, z]) => new THREE.Vector3(x, .12, z));
      const path = new THREE.CurvePath();
      for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: '#c09e5e', dashSize: .3, gapSize: .25, transparent: true, opacity: .6 }));
      line.computeLineDistances(); this.flowGroup.add(line);
      for (let j = 0; j < 3; j++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), dotMat);
        this.flowGroup.add(dot); this.flowDots.push({ dot, path, offset: j / 3 });
      }
    }
  }

  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.pickTargets, true);
    for (const hit of hits) {
      if (hit.object.type !== 'Mesh') continue;
      let obj = hit.object;
      while (obj && !obj.userData.assetId) obj = obj.parent;
      if (obj && this.assets.get(obj.userData.assetId).matches) return obj.userData.assetId;
    }
    return null;
  }

  updateStates(frame, matchingIds, selected) {
    this.selected = selected;
    for (const [id, a] of this.assets) {
      const state = frame.get(id).status;
      a.state = state; a.matches = matchingIds.has(id);
      a.lamp.material.color.set(STATUS[state].color);
      a.outline.visible = id === selected;
      a.name.visible = id === selected || this.showLabels;
      a.ring.visible = ['fault', 'offline'].includes(state);
      a.ring.material.color.set(STATUS[state].color);
      for (const material of a.materials.values()) {
        material.transparent = !a.matches;
        material.opacity = a.matches ? 1 : .16;
        material.depthWrite = a.matches;
      }
      a.lamp.visible = a.matches && !id.startsWith('RACK');
      a.ring.visible &&= a.matches;
    }
  }

  setView(mode, instant = false) {
    this.viewMode = mode;
    const fit = Math.max(1, 1.35 / this.camera.aspect);
    const pos = mode === 'top' ? new THREE.Vector3(0, 59 * fit, .03) : new THREE.Vector3(30, 28, 34).multiplyScalar(fit);
    this.moveCamera(pos, new THREE.Vector3(0, 0, 0), instant);
  }
  focus(id) {
    const a = this.assets.get(id); if (!a) return;
    this.viewMode = 'focus';
    const target = a.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .6, 0));
    this.moveCamera(target.clone().add(new THREE.Vector3(6.8, 7, 9)), target);
  }
  moveCamera(position, target, instant = false) {
    if (instant) { this.camera.position.copy(position); this.controls.target.copy(target); this.controls.update(); return; }
    this.tween = { from: this.camera.position.clone(), to: position, targetFrom: this.controls.target.clone(), targetTo: target, elapsed: 0 };
  }
  setLabels(on) {
    this.showLabels = on;
    for (const [id, a] of this.assets) a.name.visible = on || id === this.selected;
  }
  setFlows(on) { this.flowGroup.visible = on; }
  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
    if (this.viewMode === 'overview' || this.viewMode === 'top') this.setView(this.viewMode, true);
  }
  dispose() {
    this.observer.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
  render(dt, simTime) {
    if (this.tween) {
      const tw = this.tween; tw.elapsed += dt;
      const p = Math.min(1, tw.elapsed / .8), eased = 1 - Math.pow(1 - p, 3);
      this.camera.position.lerpVectors(tw.from, tw.to, eased);
      this.controls.target.lerpVectors(tw.targetFrom, tw.targetTo, eased);
      if (p === 1) this.tween = null;
    }
    for (const a of this.assets.values()) {
      if (a.moving) a.moving.position.y = a.movingY + (a.state === 'running' ? Math.sin(simTime * 30) * .04 : 0);
      if (a.ring.visible) { a.ring.scale.setScalar(1 + Math.sin(simTime * 4) * .06); }
    }
    for (const f of this.flowDots) f.dot.position.copy(f.path.getPoint((simTime * .025 + f.offset) % 1));
    const pixelWorldScale = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / this.host.clientHeight;
    for (const label of this.labelSprites) {
      if (!label.visible) continue;
      label.getWorldPosition(this.labelPosition);
      const height = this.camera.position.distanceTo(this.labelPosition) * pixelWorldScale * label.userData.pixelHeight;
      label.scale.set(height * label.userData.labelAspect, height, 1);
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
}
