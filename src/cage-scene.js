import * as THREE from 'three';

// ── Physics constants ──────────────────────────────────────────────────────
const BALL_RADIUS = 0.19;
const CAGE_INNER_RADIUS = 2.58;      // max ball-centre distance from cage origin
const CONTACT_DIST = BALL_RADIUS * 2; // centre-to-centre threshold for ball collision
const GRAVITY = 0.0015;              // downward accel per normalised frame (16.67 ms)
const WALL_RESTITUTION = 0.72;       // energy fraction kept on cage-wall bounce
const BALL_RESTITUTION = 0.55;       // energy fraction kept on ball-to-ball bounce

function randomPointInSphere(radius) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const distance = Math.cbrt(Math.random()) * radius;

  return new THREE.Vector3(
    distance * Math.sin(phi) * Math.cos(theta),
    distance * Math.sin(phi) * Math.sin(theta),
    distance * Math.cos(phi),
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

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  const keyLight = new THREE.PointLight(0x86af99, 18, 30, 2);
  keyLight.position.set(3.5, 3.2, 5.5);
  scene.add(keyLight);

  const rimLight = new THREE.PointLight(0xffdcc5, 14, 24, 2);
  rimLight.position.set(-5, -2, 4);
  scene.add(rimLight);

  const cageGroup = new THREE.Group();
  scene.add(cageGroup);

  const shellGeometry = new THREE.SphereGeometry(2.95, 28, 28);
  const shellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.15,
    transmission: 0.3,
    transparent: true,
    opacity: 0.18,
    thickness: 0.5,
  });
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  cageGroup.add(shell);

  const cageGeometry = new THREE.SphereGeometry(3, 18, 18);
  const cageMaterial = new THREE.MeshBasicMaterial({
    color: 0xc1c8c2,
    wireframe: true,
    transparent: true,
    opacity: 0.4,
  });
  const cage = new THREE.Mesh(cageGeometry, cageMaterial);
  cageGroup.add(cage);

  const axleGeometry = new THREE.TorusGeometry(3.3, 0.05, 12, 80);
  const axleMaterial = new THREE.MeshStandardMaterial({
    color: 0x755844,
    roughness: 0.5,
    metalness: 0.55,
  });
  const axle = new THREE.Mesh(axleGeometry, axleMaterial);
  axle.rotation.x = Math.PI / 2;
  cageGroup.add(axle);

  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 18, 18);
  const balls = [];

  for (let index = 0; index < 75; index += 1) {
    const hueOffset = (index % 15) / 15;
    const ballMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.38 + hueOffset * 0.04, 0.28, 0.66),
      roughness: 0.35,
      metalness: 0.08,
    });

    const ball = new THREE.Mesh(ballGeometry, ballMaterial);
    // Start within a tighter radius so balls settle to the bottom quickly
    ball.position.copy(randomPointInSphere(2.1));
    // Slight downward bias so they pool at the bottom in idle state
    ball.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.012,
      -Math.random() * 0.018,
      (Math.random() - 0.5) * 0.012,
    );
    scene.add(ball);
    balls.push(ball);
  }

  camera.position.set(0, 0.4, 8.2);

  // \u2500\u2500 Animation state \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  let cageAngVelX = 0.0028;   // current cage angular velocity (rad / normalised frame)
  let cageAngVelY = 0.0032;
  let rollingUntil = 0;
  let disposed = false;
  let lastTimestamp = 0;

  // Pre-allocated scratch vectors — avoids per-frame GC pressure
  const _tmpDelta  = new THREE.Vector3();
  const _tmpNormal = new THREE.Vector3();
  const _tmpTangent = new THREE.Vector3();

  // \u2500\u2500 Public API \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function roll(duration = 3000) {
    rollingUntil = performance.now() + duration;
  }

  function isRolling() {
    return performance.now() < rollingUntil;
  }

  // \u2500\u2500 Per-ball physics \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function updateBallMotion(ball, dt, cageSpinRate, rolling) {
    const vel = ball.userData.velocity;
    const pos = ball.position;

    // Gravity — world-space downward pull
    vel.y -= GRAVITY * dt;

    // Damping — very light during roll so energy can build, lossy at idle
    const damp = rolling ? Math.pow(0.997, dt) : Math.pow(0.965, dt);
    vel.multiplyScalar(damp);

    // Cage-driven vortex: spinning walls drag balls tangentially and lift them.
    // Force scales with cage angular velocity; must be large enough to overcome
    // gravity and produce visible tumbling at the target rolling speed (~0.026 rad/frame).
    if (cageSpinRate > 0.002) {
      // Tangent around Y-axis at ball's XZ position
      _tmpTangent.set(-pos.z, 0, pos.x).normalize();
      vel.addScaledVector(_tmpTangent, cageSpinRate * 0.12 * dt);
      vel.y += cageSpinRate * 0.06 * dt; // upward stir — partially cancels gravity
    }

    // Integrate position
    pos.addScaledVector(vel, dt);

    // Cage wall collision
    const r = pos.length();
    if (r > CAGE_INNER_RADIUS) {
      _tmpNormal.copy(pos).normalize();
      const normalSpeed = vel.dot(_tmpNormal);
      if (normalSpeed > 0) {
        vel.addScaledVector(_tmpNormal, -normalSpeed * (1 + WALL_RESTITUTION));
      }
      pos.copy(_tmpNormal).multiplyScalar(CAGE_INNER_RADIUS);
    }
  }

  // O(n\u00b2) sphere-sphere collision — ~2775 pairs for 75 balls, well within 60 fps budget
  function resolveBallCollisions() {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        _tmpDelta.subVectors(balls[j].position, balls[i].position);
        const dist = _tmpDelta.length();

        if (dist > 0.0001 && dist < CONTACT_DIST) {
          const overlap = CONTACT_DIST - dist;
          _tmpNormal.copy(_tmpDelta).divideScalar(dist);

          // Push ball centres apart equally
          balls[i].position.addScaledVector(_tmpNormal, -overlap * 0.5);
          balls[j].position.addScaledVector(_tmpNormal,  overlap * 0.5);

          // Exchange velocity along the collision axis
          const velI = balls[i].userData.velocity.dot(_tmpNormal);
          const velJ = balls[j].userData.velocity.dot(_tmpNormal);
          const relVel = velI - velJ;
          if (relVel > 0) {
            const impulse = relVel * (1 + BALL_RESTITUTION) * 0.5;
            balls[i].userData.velocity.addScaledVector(_tmpNormal, -impulse);
            balls[j].userData.velocity.addScaledVector(_tmpNormal,  impulse);
          }
        }
      }
    }
  }

  // \u2500\u2500 Resize handler \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function resize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  // \u2500\u2500 Render loop \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function animate(timestamp) {
    if (disposed) {
      return;
    }

    requestAnimationFrame(animate);

    // Normalised delta-time (1.0 = 60 fps frame). Cap at 3\u00d7 to prevent tunnelling on tab resume.
    const rawDt = lastTimestamp > 0 ? timestamp - lastTimestamp : 16.67;
    const dt = Math.min(rawDt / 16.67, 3);
    lastTimestamp = timestamp;

    const rolling = isRolling();

    // Smooth cage rotation — accelerate into roll, ease back to idle drift
    const targetAngVelX = rolling ? 0.022 : 0.0028;
    const targetAngVelY = rolling ? 0.026 : 0.0032;
    const lerpRate = 0.04;
    cageAngVelX += (targetAngVelX - cageAngVelX) * lerpRate * dt;
    cageAngVelY += (targetAngVelY - cageAngVelY) * lerpRate * dt;

    cageGroup.rotation.x += cageAngVelX * dt;
    cageGroup.rotation.y += cageAngVelY * dt;
    cageGroup.rotation.z = Math.sin(timestamp * 0.00025) * 0.08;

    // Ball physics — run after cage rotation so cageAngVelY is up-to-date
    for (const ball of balls) {
      updateBallMotion(ball, dt, cageAngVelY, rolling);
    }
    resolveBallCollisions();

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