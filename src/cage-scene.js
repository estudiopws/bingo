import * as THREE from 'three';

const BALL_RADIUS = 0.18;
const CAGE_RADIUS = 2.5;
const MAX_BALLS = 40;
const RESTITUTION = 0.4;
const FIXED_TIMESTEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 3;

// Hoisted reusable objects (fix #4)
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();

export async function createCageScene(container) {
  // Abort flag for race condition on remount (fix #7)
  let aborted = false;

  // Lazy-load WASM (fix #2)
  let RAPIER;
  try {
    const module = await import('@dimforge/rapier3d-compat');
    RAPIER = module.default;
    await RAPIER.init();
  } catch (err) {
    console.error('Rapier WASM failed to load:', err);
    return null; // fix #3
  }

  if (aborted) return null; // fix #7

  // --- Three.js setup ---
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, container.clientWidth / container.clientHeight, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  scene.fog = new THREE.Fog(0xfbf9f1, 8, 14);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));

  const keyLight = new THREE.PointLight(0x86af99, 18, 30, 2);
  keyLight.position.set(3.5, 3.2, 5.5);
  scene.add(keyLight);

  const rimLight = new THREE.PointLight(0xffdcc5, 14, 24, 2);
  rimLight.position.set(-5, -2, 4);
  scene.add(rimLight);

  const cageGroup = new THREE.Group();
  scene.add(cageGroup);

  // Transparent shell
  cageGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(2.85, 24, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.3, metalness: 0.15,
      transmission: 0.3, transparent: true, opacity: 0.18, thickness: 0.5,
    }),
  ));

  // Wireframe cage
  cageGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(2.9, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xc1c8c2, wireframe: true, transparent: true, opacity: 0.4 }),
  ));

  // Axle ring
  const axle = new THREE.Mesh(
    new THREE.TorusGeometry(3.1, 0.05, 10, 64),
    new THREE.MeshStandardMaterial({ color: 0x755844, roughness: 0.5, metalness: 0.55 }),
  );
  axle.rotation.x = Math.PI / 2;
  cageGroup.add(axle);

  camera.position.set(0, 0.4, 8.2);

  // --- Rapier physics world ---
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // Cage body: kinematic
  const cageBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0);
  const cageBody = world.createRigidBody(cageBodyDesc);

  // Fix #1: Trimesh collider from low-poly icosphere (~80 triangles)
  const cageGeo = new THREE.IcosahedronGeometry(CAGE_RADIUS, 1); // 80 triangles
  const posAttr = cageGeo.getAttribute('position');
  const vertices = new Float32Array(posAttr.array);
  const indices = new Uint32Array(cageGeo.getIndex().array);
  cageGeo.dispose();

  const trimeshDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
    .setRestitution(RESTITUTION);
  world.createCollider(trimeshDesc, cageBody);

  // Ball meshes and bodies
  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 12, 12);
  const ballMeshes = [];
  const ballBodies = [];

  for (let i = 0; i < MAX_BALLS; i++) {
    const hue = 0.38 + (i % 15) / 15 * 0.04;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.28, 0.66),
      roughness: 0.35, metalness: 0.08,
    });
    const mesh = new THREE.Mesh(ballGeometry, mat);
    scene.add(mesh);
    ballMeshes.push(mesh);

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const d = Math.cbrt(Math.random()) * (CAGE_RADIUS - BALL_RADIUS * 2);
    const x = d * Math.sin(phi) * Math.cos(theta);
    const y = d * Math.sin(phi) * Math.sin(theta);
    const z = d * Math.cos(phi);

    // Fix #8: reduced damping
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setLinearDamping(0.05)
      .setAngularDamping(0.1)
      .setCcdEnabled(true);
    const body = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setRestitution(RESTITUTION)
      .setDensity(1.0);
    world.createCollider(colliderDesc, body);

    ballBodies.push(body);
  }

  // --- Animation state ---
  let disposed = false;
  let rafId = null;
  let lastTimestamp = 0;
  let accumulator = 0; // fix #5
  let cageAngleX = 0;
  let cageAngleY = 0;
  let cageAngVelX = 0.12; // rad/s idle
  let cageAngVelY = 0.15; // rad/s idle
  let rollingUntil = 0;

  // Fix #9: ~40 RPM = ~4.2 rad/s
  const ROLLING_VEL_X = 4.2;
  const ROLLING_VEL_Y = 4.2;
  const IDLE_VEL_X = 0.12;
  const IDLE_VEL_Y = 0.15;

  function roll(duration = 3000) {
    rollingUntil = performance.now() + duration;
  }

  function isRolling() {
    return performance.now() < rollingUntil;
  }

  // --- Animation loop ---
  function animate(timestamp) {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);

    // Fix #9: use real seconds
    const rawDt = lastTimestamp > 0 ? (timestamp - lastTimestamp) / 1000 : FIXED_TIMESTEP;
    const dt = Math.min(rawDt, 0.1);
    lastTimestamp = timestamp;

    const rolling = isRolling();

    // Cage rotation speed (lerp in seconds)
    const targetX = rolling ? ROLLING_VEL_X : IDLE_VEL_X;
    const targetY = rolling ? ROLLING_VEL_Y : IDLE_VEL_Y;
    const lerp = 1 - Math.exp(-2.5 * dt);
    cageAngVelX += (targetX - cageAngVelX) * lerp;
    cageAngVelY += (targetY - cageAngVelY) * lerp;

    cageAngleX += cageAngVelX * dt;
    cageAngleY += cageAngVelY * dt;

    // Update visual cage group
    cageGroup.rotation.x = cageAngleX;
    cageGroup.rotation.y = cageAngleY;
    cageGroup.rotation.z = Math.sin(timestamp * 0.00025) * 0.06;

    // Update kinematic cage body rotation (fix #4: reuse hoisted objects)
    _euler.set(cageAngleX, cageAngleY, Math.sin(timestamp * 0.00025) * 0.06);
    _quat.setFromEuler(_euler);
    cageBody.setNextKinematicRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w });

    // Fix #5: fixed timestep accumulator
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
      world.step();
      accumulator -= FIXED_TIMESTEP;
      steps++;
    }
    if (accumulator >= FIXED_TIMESTEP) accumulator = 0; // cap overflow

    // Sync meshes from physics bodies
    for (let i = 0; i < ballBodies.length; i++) {
      const pos = ballBodies[i].translation();
      const rot = ballBodies[i].rotation();
      ballMeshes[i].position.set(pos.x, pos.y, pos.z);
      ballMeshes[i].quaternion.set(rot.x, rot.y, rot.z, rot.w);
    }

    renderer.render(scene, camera);
  }

  // --- Visibility pause ---
  function startLoop() {
    if (rafId !== null || disposed) return;
    lastTimestamp = 0;
    accumulator = 0;
    rafId = requestAnimationFrame(animate);
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) stopLoop();
    else startLoop();
  }

  function resize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  rafId = requestAnimationFrame(animate);

  return {
    roll,
    dispose() {
      disposed = true;
      aborted = true; // fix #7
      stopLoop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Fix #6: dispose all Three.js resources
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();

      world.free();
    },
  };
}
