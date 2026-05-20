import * as THREE from 'three';

const BALL_RADIUS = 0.18;
const CAGE_INNER_RADIUS = 2.5;
const CONTACT_DIST = BALL_RADIUS * 2;
const GRAVITY = 9.8 * 0.001;          // scaled gravity per ms
const WALL_RESTITUTION = 0.45;
const BALL_RESTITUTION = 0.35;
const LINEAR_DAMPING = 0.992;
const MAX_BALLS = 50;                  // cap for performance

function randomPointInSphere(radius) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const d = Math.cbrt(Math.random()) * radius;
  return new THREE.Vector3(
    d * Math.sin(phi) * Math.cos(theta),
    d * Math.sin(phi) * Math.sin(theta),
    d * Math.cos(phi),
  );
}

export function createCageScene(container) {
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
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(2.85, 24, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.3, metalness: 0.15,
      transmission: 0.3, transparent: true, opacity: 0.18, thickness: 0.5,
    }),
  );
  cageGroup.add(shell);

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

  // Balls — use lower-poly geometry for performance
  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 12, 12);
  const balls = [];

  for (let i = 0; i < MAX_BALLS; i++) {
    const hue = 0.38 + (i % 15) / 15 * 0.04;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, 0.28, 0.66),
      roughness: 0.35, metalness: 0.08,
    });
    const ball = new THREE.Mesh(ballGeometry, mat);
    ball.position.copy(randomPointInSphere(2.0));
    ball.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.005,
      -Math.random() * 0.01,
      (Math.random() - 0.5) * 0.005,
    );
    scene.add(ball);
    balls.push(ball);
  }

  camera.position.set(0, 0.4, 8.2);

  // Animation state
  let cageAngVelX = 0.002;
  let cageAngVelY = 0.0025;
  let rollingUntil = 0;
  let disposed = false;
  let lastTimestamp = 0;

  const _delta = new THREE.Vector3();
  const _normal = new THREE.Vector3();
  const _tangent = new THREE.Vector3();

  function roll(duration = 3000) {
    rollingUntil = performance.now() + duration;
  }

  function isRolling() {
    return performance.now() < rollingUntil;
  }

  function updateBall(ball, dtMs, cageSpinRate, rolling) {
    const vel = ball.userData.velocity;
    const pos = ball.position;

    // Gravity in world-space Y
    vel.y -= GRAVITY * dtMs;

    // Linear damping
    const damp = Math.pow(LINEAR_DAMPING, dtMs);
    vel.multiplyScalar(damp);

    // Cage-driven tangential force when spinning
    if (cageSpinRate > 0.002) {
      _tangent.set(-pos.z, 0, pos.x).normalize();
      const force = cageSpinRate * 0.35 * dtMs;
      vel.addScaledVector(_tangent, force);
      // Lift to counteract gravity partially during roll
      if (rolling) vel.y += cageSpinRate * 0.15 * dtMs;
    }

    // Integrate
    pos.x += vel.x * dtMs;
    pos.y += vel.y * dtMs;
    pos.z += vel.z * dtMs;

    // Cage wall constraint
    const r = pos.length();
    if (r > CAGE_INNER_RADIUS) {
      _normal.copy(pos).divideScalar(r);
      const vn = vel.dot(_normal);
      if (vn > 0) {
        vel.addScaledVector(_normal, -vn * (1 + WALL_RESTITUTION));
      }
      pos.copy(_normal).multiplyScalar(CAGE_INNER_RADIUS);
    }
  }

  function resolveCollisions() {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        _delta.subVectors(balls[j].position, balls[i].position);
        const dist = _delta.length();
        if (dist < 0.0001 || dist >= CONTACT_DIST) continue;

        const overlap = CONTACT_DIST - dist;
        _normal.copy(_delta).divideScalar(dist);

        // Separate
        balls[i].position.addScaledVector(_normal, -overlap * 0.5);
        balls[j].position.addScaledVector(_normal, overlap * 0.5);

        // Impulse
        const vi = balls[i].userData.velocity.dot(_normal);
        const vj = balls[j].userData.velocity.dot(_normal);
        if (vi - vj > 0) {
          const impulse = (vi - vj) * (1 + BALL_RESTITUTION) * 0.5;
          balls[i].userData.velocity.addScaledVector(_normal, -impulse);
          balls[j].userData.velocity.addScaledVector(_normal, impulse);
        }
      }
    }
  }

  function resize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  function animate(timestamp) {
    if (disposed) return;
    requestAnimationFrame(animate);

    const rawDt = lastTimestamp > 0 ? timestamp - lastTimestamp : 16.67;
    const dtMs = Math.min(rawDt, 50); // cap to avoid tunnelling
    const dt = dtMs / 16.67; // normalised for cage rotation lerp
    lastTimestamp = timestamp;

    const rolling = isRolling();

    // Cage rotation — smooth acceleration/deceleration
    const targetX = rolling ? 0.02 : 0.002;
    const targetY = rolling ? 0.025 : 0.0025;
    const lerp = 0.04;
    cageAngVelX += (targetX - cageAngVelX) * lerp * dt;
    cageAngVelY += (targetY - cageAngVelY) * lerp * dt;

    cageGroup.rotation.x += cageAngVelX * dt;
    cageGroup.rotation.y += cageAngVelY * dt;
    cageGroup.rotation.z = Math.sin(timestamp * 0.00025) * 0.06;

    // Physics substep — use dtMs for real-time physics
    const substeps = dtMs > 30 ? 2 : 1;
    const subDt = dtMs / substeps;
    for (let s = 0; s < substeps; s++) {
      for (const ball of balls) {
        updateBall(ball, subDt, cageAngVelY, rolling);
      }
      resolveCollisions();
    }

    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  requestAnimationFrame(animate);

  return {
    roll,
    dispose() {
      disposed = true;
      window.removeEventListener('resize', resize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
