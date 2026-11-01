import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CmdTerminal } from './cmdTerminal';
import { SCREEN_HEIGHT, SCREEN_WIDTH, drawScreen } from './drawScreen';
import { ROOM_LIGHT, loadMacModel } from './macModel';

const TURN = -0.32;
const WHEEL_STEP = 60;

const MAC_HEIGHT = 3.4;
const WALL_Z = -3.2;
const BULB_HEIGHT = MAC_HEIGHT + 0.75;
const BULB_FORWARD = 2.4;
const BULB_COLOR = '#ffd6a0';
const FOV = 30;

// [seconds, light level] steps of the bulb coming on, then the screen powers up
const FLICKER: [number, number][] = [
  [0, 0], [0.25, 0.7], [0.31, 0], [0.5, 0.35], [0.56, 0.1], [0.62, 0.9], [0.68, 0],
  [1.05, 0.5], [1.12, 0.2], [1.2, 1],
];
const SCREEN_ON_AT = 1.65;

function bulbLevel(elapsed: number) {
  let level = 0;
  for (const [at, value] of FLICKER) if (elapsed >= at) level = value;
  return level;
}

function radialTexture(color: string, alpha: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, `rgba(${color}, ${alpha})`);
  gradient.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function buildBulb() {
  const bulb = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 32, 24),
    new THREE.MeshStandardMaterial({ color: BULB_COLOR, emissive: BULB_COLOR, emissiveIntensity: 8 }),
  );
  glass.scale.y = 1.25;
  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.1, 0.24, 24),
    new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.35, metalness: 0.7 }),
  );
  socket.position.y = 0.28;
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.013, 40, 8),
    new THREE.MeshStandardMaterial({ color: '#0e0e0e', roughness: 0.8 }),
  );
  cord.position.y = 20.3;
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture('255, 205, 140', 0.5),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  halo.scale.set(1.8, 1.8, 1);
  bulb.add(glass, socket, cord, halo);
  return { bulb, halo, glass };
}

// the whole page is a dark room: the mac stands on the floor under a bulb
// hanging from the top of the screen, lined up with the anchor element
export default function MacTerminal({ language }: { language: 'fr' | 'en' }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const room = roomRef.current;
    if (!anchor || !room) return;

    const terminal = new CmdTerminal(language);
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = SCREEN_WIDTH;
    screenCanvas.height = SCREEN_HEIGHT;
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.flipY = false;
    screenTexture.colorSpace = THREE.SRGBColorSpace;

    let blink = true;
    const repaint = () => {
      drawScreen(screenCanvas, terminal, blink);
      screenTexture.needsUpdate = true;
    };
    terminal.onChange = repaint;
    repaint();
    const blinkTimer = window.setInterval(() => {
      blink = !blink;
      repaint();
    }, 530);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor('#000000');
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    room.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const ambient = new THREE.HemisphereLight('#ffffff', '#000000', 0);
    scene.add(ambient);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#3b3732', roughness: 0.92 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 80),
      new THREE.MeshStandardMaterial({ color: '#34312d', roughness: 0.97 }),
    );
    wall.position.set(0, 40, WALL_Z);
    wall.receiveShadow = true;
    scene.add(floor, wall);

    const mac = new THREE.Group();
    mac.rotation.y = TURN;
    scene.add(mac);

    const { bulb, halo, glass } = buildBulb();
    scene.add(bulb);
    const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, color: '#000000' });
    const glassMaterial = glass.material as THREE.MeshStandardMaterial;
    const spot = new THREE.SpotLight(BULB_COLOR, 120, 30, 1.15, 1, 2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.radius = 8;
    const glow = new THREE.PointLight(BULB_COLOR, 28, 40, 2);
    const screenGlow = new THREE.PointLight('#b8ffc0', 0.8, 3.5, 2);
    scene.add(spot, spot.target, glow, screenGlow);

    // the room stays dark while the model loads, then the bulb flickers on
    let lightsOnAt = 0;
    let disposed = false;
    void loadMacModel().then(buffer => new GLTFLoader().parseAsync(buffer, '')).then(gltf => {
      if (disposed) return;
      const model = gltf.scene;
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object.name === 'Screen') {
          object.material = screenMaterial;
        } else {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = MAC_HEIGHT / size.y;
      model.scale.setScalar(scale);
      model.position.set(
        -((box.min.x + box.max.x) / 2) * scale,
        -box.min.y * scale,
        -((box.min.z + box.max.z) / 2) * scale,
      );
      mac.add(model);
      renderer.compile(scene, camera);
      lightsOnAt = performance.now();
    }).catch(() => {
      lightsOnAt = performance.now();
    });

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);

    const layout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      const box = anchor.getBoundingClientRect();
      const macPx = Math.min(box.height, height * 0.58);
      const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      const distance = (MAC_HEIGHT * height) / macPx / 2 / tan;
      const ndcX = ((box.left + box.width / 2) / width) * 2 - 1;
      const ndcY = 1 - ((box.top + box.height / 2 + height * 0.05) / height) * 2;
      const cameraY = MAC_HEIGHT / 2 - ndcY * distance * tan;
      camera.position.set(0, cameraY, distance);
      camera.lookAt(0, cameraY, 0);

      const macX = ndcX * distance * tan * camera.aspect;
      mac.position.set(macX, 0, 0);
      bulb.position.set(macX, BULB_HEIGHT, BULB_FORWARD);
      spot.position.copy(bulb.position);
      spot.target.position.set(macX, 0, 0.3);
      glow.position.copy(bulb.position);
      screenGlow.position.set(macX + Math.sin(TURN) * 2.2, MAC_HEIGHT * 0.62, Math.cos(TURN) * 2.2);
    };
    layout();
    window.addEventListener('resize', layout);
    const observer = new ResizeObserver(layout);
    observer.observe(anchor);

    let frame = 0;
    let pageLight = -1;
    const applyLights = () => {
      const elapsed = lightsOnAt ? (performance.now() - lightsOnAt) / 1000 : -1;
      const level = elapsed < 0 ? 0 : bulbLevel(elapsed);
      spot.intensity = 120 * level;
      glow.intensity = 28 * level;
      glassMaterial.emissiveIntensity = 8 * level;
      ambient.intensity = 0.03 * level;
      halo.material.opacity = level;
      const screen = elapsed < SCREEN_ON_AT ? 0 : Math.min(1, (elapsed - SCREEN_ON_AT) / 0.35);
      screenMaterial.color.setScalar(screen);
      screenGlow.intensity = 0.8 * screen;
      // the page text sits in the same room, so it follows the bulb
      if (level !== pageLight) {
        pageLight = level;
        document.documentElement.style.setProperty(ROOM_LIGHT, String(level));
      }
    };
    applyLights();

    const loop = () => {
      applyLights();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    loop();

    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Enter') terminal.enter();
      else if (event.key === 'Escape') terminal.back();
      else if (event.key === 'Backspace') terminal.erase();
      else if (event.key === 'ArrowDown') terminal.move(1);
      else if (event.key === 'ArrowUp') terminal.move(-1);
      else if (event.key.length === 1) terminal.type(event.key);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    let wheel = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      wheel += event.deltaY;
      while (Math.abs(wheel) >= WHEEL_STEP) {
        terminal.move(Math.sign(wheel));
        wheel -= Math.sign(wheel) * WHEEL_STEP;
      }
    };
    anchor.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearInterval(blinkTimer);
      terminal.dispose();
      observer.disconnect();
      window.removeEventListener('resize', layout);
      window.removeEventListener('keydown', onKey);
      anchor.removeEventListener('wheel', onWheel);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => {
            Object.values(material).forEach(value => { if (value instanceof THREE.Texture) value.dispose(); });
            material.dispose();
          });
        }
      });
      halo.material.map?.dispose();
      halo.material.dispose();
      spot.shadow.dispose();
      document.documentElement.style.removeProperty(ROOM_LIGHT);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [language]);

  return (
    <>
      <div ref={roomRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10" />
      <div ref={anchorRef} aria-hidden="true" className="h-[600px] w-full" />
    </>
  );
}
