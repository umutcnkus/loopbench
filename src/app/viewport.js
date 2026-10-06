// three.js viewport: studio environment, floor grid, lights, camera, picking and
// drag interaction, plant view mounting.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { canvasTexture, makeSegment, disposeTree, materials } from './kit.js';

const tmpV = new THREE.Vector3();

export class Viewport {
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = opts;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.classList.add('gl');
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envTex;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 400);
    this.camera.position.set(2, 1.5, 3);
    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.addEventListener('start', () => { this.userMovedCamera = true; });
    this.controls = controls;

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a939c, 0.9);
    scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    scene.add(key, key.target);
    this.key = key;
    const rim = new THREE.DirectionalLight(0xdfe8ff, 0.7);
    rim.position.set(-4, 3, -5);
    scene.add(rim);
    this.rim = rim;

    // floor
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0 });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(80, 96), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    scene.add(this.floor);

    // plant root: physics z-up -> three y-up
    this.root = new THREE.Group();
    this.root.rotation.x = -Math.PI / 2;
    scene.add(this.root);

    // drag helper line
    this.dragLine = makeSegment(0xe8590c, 0.9, true);
    this.dragLine.object.visible = false;
    this.root.add(this.dragLine.object);
    this.dragDot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8590c, depthTest: false, transparent: true, opacity: 0.9 }));
    this.dragDot.renderOrder = 10;
    this.dragDot.visible = false;
    this.root.add(this.dragDot);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.view = null;
    this.gridSize = 0.1;
    this.theme = 'light';
    this.follow = false;
    this._camTween = null;
    this._bindPointer();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }

  // ---------------------------------------------------------------- theme
  setTheme(t) {
    this.theme = t;
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue('--scene-bg').trim() || (t === 'dark' ? '#0e1419' : '#e6eaee');
    const floor = css.getPropertyValue('--scene-floor').trim() || bg;
    const minor = css.getPropertyValue('--scene-grid').trim() || '#c9d0d7';
    const major = css.getPropertyValue('--scene-grid-major').trim() || '#aeb7c0';
    this.bgColor = new THREE.Color(bg);
    this.scene.background = this.bgColor;
    this.scene.fog = new THREE.Fog(this.bgColor, 6, 30);
    this._gridColors = { floor, minor, major };
    this._buildFloorTexture();
    this._lightDefaults = { hemi: t === 'dark' ? 0.55 : 0.9, key: t === 'dark' ? 2.6 : 2.3, env: t === 'dark' ? 0.45 : 0.55 };
    this.hemi.groundColor.set(t === 'dark' ? 0x20262c : 0x8a939c);
    this._applyLighting();
    this._updateFog();
    if (this.view?.space) this.scene.background = new THREE.Color(0x02040a);
  }
  _applyLighting() {
    const d = this._lightDefaults || { hemi: 0.9, key: 2.3, env: 0.55 };
    const o = this.view?.lighting || {};
    this.hemi.intensity = o.hemi ?? d.hemi;
    this.key.intensity = o.key ?? d.key;
    this.scene.environmentIntensity = o.env ?? d.env;
  }
  _buildFloorTexture() {
    const { floor, minor, major } = this._gridColors;
    if (this.floorMat.map) this.floorMat.map.dispose();
    const tex = canvasTexture(1024, 1024, (g, w, h) => {
      g.fillStyle = floor;
      g.fillRect(0, 0, w, h);
      const n = 10;
      const step = w / n;
      g.strokeStyle = minor;
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 1; i < n; i++) {
        g.moveTo(i * step, 0); g.lineTo(i * step, h);
        g.moveTo(0, i * step); g.lineTo(w, i * step);
      }
      g.stroke();
      g.strokeStyle = major;
      g.lineWidth = 4;
      g.strokeRect(0, 0, w, h);
    }, { repeat: [1, 1] });
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.floorMat.map = tex;
    this.floorMat.needsUpdate = true;
    this._applyGridScale();
  }
  _applyGridScale() {
    const tex = this.floorMat.map;
    if (!tex) return;
    // one texture tile = 10 minor cells
    const tile = this.gridSize * 10;
    const R = 80;
    tex.repeat.set((2 * R) / tile, (2 * R) / tile);
    tex.offset.set(0.5 - (R / tile) % 1, 0.5 - (R / tile) % 1);
  }
  _updateFog() {
    if (!this.scene.fog) return;
    const s = this.sceneScale || 1;
    this.scene.fog.near = 6 * s;
    this.scene.fog.far = 26 * s;
  }

  // ---------------------------------------------------------------- views
  mount(view) {
    if (this.view) {
      this.root.remove(this.view.group);
      this.view.dispose?.();
      disposeTree(this.view.group);
    }
    this.view = view;
    this.root.add(view.group);
    this.gridSize = view.grid || 0.1;
    this.sceneScale = view.scale || 1;
    this.floor.visible = view.floor !== false;
    this.scene.fog = view.space ? null : this.scene.fog || new THREE.Fog(this.bgColor, 6, 30);
    if (view.space) {
      this.scene.background = new THREE.Color(0x02040a);
      this.scene.fog = null;
    } else if (this.bgColor) {
      this.scene.background = this.bgColor;
      this.scene.fog = new THREE.Fog(this.bgColor, 6, 30);
    }
    this._applyGridScale();
    this._updateFog();
    this._applyLighting();
    this.controls.maxPolarAngle = view.space ? Math.PI : Math.PI * 0.495;
    this.camera.near = (view.scale || 1) * 0.01;
    this.camera.far = view.space ? 5000 : 400 * (view.scale || 1);
    this.camera.updateProjectionMatrix();
    this.userMovedCamera = false;
    this.resetCamera(false);
  }
  // physics coords -> three world coords
  p2w(p) {
    return new THREE.Vector3(p[0], p[2], -p[1]);
  }
  w2p(v) {
    return [v.x, -v.z, v.y];
  }
  resetCamera(animate = true) {
    const cam = this.view?.camera;
    if (!cam) return;
    const pos = this.p2w(cam.pos), tgt = this.p2w(cam.target);
    if (cam.fov) { this.camera.fov = cam.fov; this.camera.updateProjectionMatrix(); }
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(tgt);
      this.controls.update();
      return;
    }
    this._camTween = { t: 0, p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt };
  }
  _shadowFit(center, extent) {
    const key = this.key;
    const e = extent || 2;
    const c = center ? this.p2w(center) : new THREE.Vector3();
    key.position.set(c.x + e * 1.2, c.y + e * 2.4, c.z + e * 1.0);
    key.target.position.copy(c);
    const cam = key.shadow.camera;
    cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e;
    cam.near = 0.01; cam.far = e * 8;
    cam.updateProjectionMatrix();
  }

  update(frame, dtReal) {
    const v = this.view;
    if (!v || !frame) return;
    v.update(frame, dtReal);
    const focus = v.focus ? v.focus(frame) : null;
    this._shadowFit(focus || v.shadow?.center || [0, 0, 0], v.shadow?.extent);
    if (this.follow && focus) {
      const f = this.p2w(focus);
      const d = f.clone().sub(this.controls.target);
      this.controls.target.add(d);
      this.camera.position.add(d);
    }
    // drag visuals
    if (frame.drag && this.dragging) {
      const a = frame.drag.pos;
      const b = this.dragTarget;
      this.dragLine.set(a, b);
      this.dragLine.object.visible = true;
      this.dragDot.visible = true;
      this.dragDot.position.set(b[0], b[1], b[2]);
      const s = (this.sceneScale || 1) * 0.012;
      this.dragDot.scale.setScalar(s);
    } else {
      this.dragLine.object.visible = false;
      this.dragDot.visible = false;
    }
  }

  render(dt) {
    if (this._camTween) {
      const tw = this._camTween;
      tw.t = Math.min(1, tw.t + dt / 0.7);
      const e = 1 - Math.pow(1 - tw.t, 3);
      this.camera.position.lerpVectors(tw.p0, tw.p1, e);
      this.controls.target.lerpVectors(tw.t0, tw.t1, e);
      if (tw.t >= 1) this._camTween = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- picking
  _setPointer(ev) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }
  _pick() {
    const v = this.view;
    if (!v?.pickables?.length) return null;
    const objs = v.pickables.map((p) => p.object);
    const hits = this.raycaster.intersectObjects(objs, true);
    if (!hits.length) return null;
    const hit = hits[0];
    let o = hit.object;
    let entry = null;
    while (o && !entry) {
      entry = v.pickables.find((p) => p.object === o);
      o = o.parent;
    }
    return entry ? { hit, entry } : null;
  }
  _bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      this._setPointer(ev);
      const pk = this._pick();
      if (!pk) return;
      const { hit, entry } = pk;
      if (entry.kind === 'target') {
        this.dragging = { kind: 'target', entry };
      } else {
        // grab point in the body's local (physics) frame
        const bodyObj = entry.bodyObject || entry.object;
        const local = bodyObj.worldToLocal(hit.point.clone());
        this.dragging = { kind: 'body', entry, local: [local.x, local.y, local.z] };
      }
      // drag plane: through hit point, facing the camera (or plant-specified)
      const n = new THREE.Vector3();
      if (entry.plane === 'horizontal') n.set(0, 1, 0);
      else if (entry.plane === 'xz') n.set(0, 0, 1); // physics xz plane -> three normal +z
      else this.camera.getWorldDirection(n).negate();
      this.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.point);
      this.controls.enabled = false;
      el.setPointerCapture(ev.pointerId);
      this._dragMove(ev);
      ev.preventDefault();
    });
    el.addEventListener('pointermove', (ev) => {
      if (this.dragging) this._dragMove(ev);
      else if (ev.buttons === 0) this._hover(ev);
    });
    const end = (ev) => {
      if (!this.dragging) return;
      const d = this.dragging;
      this.dragging = null;
      this.controls.enabled = true;
      try { el.releasePointerCapture(ev.pointerId); } catch {}
      if (d.kind === 'body') this.opts.onDrag?.({ active: false });
      else this.opts.onTargetDrag?.(null, d.entry, true);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  _hover(ev) {
    this._setPointer(ev);
    const pk = this._pick();
    this.renderer.domElement.style.cursor = pk ? (pk.entry.kind === 'target' ? 'move' : 'grab') : '';
  }
  _dragMove(ev) {
    this._setPointer(ev);
    const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, pt)) return;
    const pPhys = this.root.worldToLocal(pt.clone());
    const target = [pPhys.x, pPhys.y, pPhys.z];
    this.dragTarget = target;
    const d = this.dragging;
    this.renderer.domElement.style.cursor = 'grabbing';
    if (d.kind === 'target') {
      this.opts.onTargetDrag?.(target, d.entry, false);
    } else {
      this.opts.onDrag?.({ active: true, body: d.entry.body, local: d.local, target });
    }
  }

  dispose() {
    this.ro.disconnect();
    this.renderer.dispose();
  }
}
