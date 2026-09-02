async function initPhysiqueHologram() {
  const stage = document.querySelector('#physique3dStage');
  const canvas = document.querySelector('#physique3dCanvas');
  const status = document.querySelector('#physique3dStatus');
  const viewButtons = [...document.querySelectorAll('[data-physique-view]')];
  const demoStage = document.querySelector('.pro-demo-hologram');
  const demoCanvas = document.querySelector('#proDemo3dCanvas');
  if (!stage || !canvas || !status) return;

  try {
    const THREE = await import('./assets/three.module.js');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 60);
    camera.position.set(0, 0.25, 10.35);
    camera.lookAt(0, 0.2, 0);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    const demoRenderer = demoCanvas ? new THREE.WebGLRenderer({ canvas: demoCanvas, alpha: true, antialias: true }) : null;
    if (demoRenderer) {
      demoRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      demoRenderer.outputColorSpace = THREE.SRGBColorSpace;
      demoRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      demoRenderer.toneMappingExposure = 1.25;
    }
    scene.add(new THREE.HemisphereLight(0xf2f5f7, 0x0a0d11, 1.2));
    const keyLight = new THREE.PointLight(0xe6edf3, 14, 18);
    keyLight.position.set(3.4, 3.8, 4.8);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0xcfd7df, 12, 16);
    rimLight.position.set(-3.8, 1.2, -3.5);
    scene.add(rimLight);
    const lowerLight = new THREE.PointLight(0xe8edf2, 10, 12);
    lowerLight.position.set(1.8, -2.2, 2.2);
    scene.add(lowerLight);

    const body = new THREE.Group();
    const bodyBaseScales = new Map();
    body.scale.setScalar(0.94);
    body.position.y = -0.04;
    scene.add(body);
    const shellUniforms = {
      time: { value: 0 },
      color: { value: new THREE.Color(0xdfe3e8) }
    };
    const shellMaterial = new THREE.ShaderMaterial({
      uniforms: shellUniforms,
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDirection;
        varying float vWorldY;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDirection = normalize(-viewPosition.xyz);
          vWorldY = worldPosition.y;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color;
        varying vec3 vNormal;
        varying vec3 vViewDirection;
        varying float vWorldY;
        void main() {
          vec3 normal = normalize(vNormal);
          float facing = clamp(dot(normal, normalize(vViewDirection)), 0.0, 1.0);
          float edge = pow(1.0 - facing, 2.2);
          float softLight = 0.5 + 0.5 * dot(normal, normalize(vec3(-0.35, 0.7, 0.62)));
          float movingBand = smoothstep(0.88, 1.0, sin((vWorldY * 22.0) - (time * 3.1)) * 0.5 + 0.5);
          vec3 base = mix(vec3(0.22, 0.24, 0.26), color, 0.80);
          vec3 hologram = base * (0.34 + softLight * 0.30);
          hologram += color * edge * 0.12;
          hologram += vec3(0.0, 0.0, 0.0) * movingBand * 0.005;
          float alpha = clamp(0.12 + edge * 0.16 + movingBand * 0.01, 0.0, 0.42);
          gl_FragColor = vec4(hologram, alpha);
        }
      `
    });
    const shellWireMaterial = new THREE.MeshBasicMaterial({
      color: 0xc3c9d1,
      transparent: true,
      opacity: 0.10,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const addPart = (geometry, position, scale, rotation = [0, 0, 0], material = shellMaterial) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.rotation.set(...rotation);
      bodyBaseScales.set(mesh, mesh.scale.clone());
      if (material === shellMaterial) {
        const wireframe = new THREE.Mesh(geometry, shellWireMaterial);
        wireframe.renderOrder = 2;
        mesh.add(wireframe);
      }
      body.add(mesh);
      return mesh;
    };
    const profileGeometry = (points, curvePoints = 34, radialSegments = 28) => {
      const curve = new THREE.SplineCurve(points.map(([radius, height]) => new THREE.Vector2(radius, height)));
      return new THREE.LatheGeometry(curve.getPoints(curvePoints), radialSegments);
    };
    const headGeometry = profileGeometry([
      [0.09, -0.48], [0.23, -0.41], [0.32, -0.27], [0.37, -0.05],
      [0.38, 0.17], [0.33, 0.34], [0.22, 0.46], [0.01, 0.51]
    ], 42);
    addPart(headGeometry, [0, 2.18, 0], [1, 1, 0.86]);
      addPart(new THREE.SphereGeometry(0.5, 32, 22), [0, 2.02, 0.01], [0.63, 0.42, 0.58]);
    addPart(new THREE.SphereGeometry(0.1, 24, 16), [0, 2.19, 0.34], [0.58, 0.92, 1.05]);
      [-1, 1].forEach((side) => addPart(new THREE.SphereGeometry(0.5, 20, 14), [side * 0.37, 2.17, 0], [0.1, 0.18, 0.1]));
      addPart(new THREE.CapsuleGeometry(0.16, 0.24, 10, 22), [0, 1.78, 0], [1.08, 1, 0.94]);

    const torsoGeometry = profileGeometry([
      [0.16, -0.82], [0.22, -0.72], [0.3, -0.58], [0.38, -0.18],
      [0.58, 0.1], [0.75, 0.28], [0.9, 0.48], [0.82, 0.62],
      [0.54, 0.8], [0.2, 0.86]
    ], 46);
      addPart(torsoGeometry, [0, 0.82, 0], [0.98, 1, 0.58]);
    const chestBoxGeometry = new THREE.BoxGeometry(0.92, 0.8, 0.48);
    const chestBox = new THREE.Mesh(chestBoxGeometry, shellMaterial);
    chestBox.position.set(0, 1.26, 0.2);
    chestBox.scale.set(1.14, 1.02, 0.8);
    chestBox.rotation.y = 0.06;
    body.add(chestBox);
    const chestBoxWire = new THREE.Mesh(chestBoxGeometry, shellWireMaterial);
    chestBoxWire.position.copy(chestBox.position);
    chestBoxWire.scale.copy(chestBox.scale);
    chestBoxWire.rotation.copy(chestBox.rotation);
    body.add(chestBoxWire);
    const sternum = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.32, 8, 18), shellMaterial);
    sternum.position.set(0, 1.28, 0.4);
    sternum.scale.set(1.1, 1, 0.7);
    sternum.rotation.z = 0.12;
    body.add(sternum);
    [-1, 1].forEach((side) => {
      const clavicle = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.24, 8, 14), shellMaterial);
      clavicle.position.set(side * 0.32, 1.7, 0.06);
      clavicle.scale.set(1.2, 0.8, 0.7);
      clavicle.rotation.z = side * -0.9;
      clavicle.rotation.x = side * 0.15;
      body.add(clavicle);
    });
    const pelvisGeometry = profileGeometry([
      [0.12, -0.52], [0.22, -0.4], [0.34, -0.18], [0.42, 0.06],
      [0.36, 0.3], [0.22, 0.38]
    ], 34);
      addPart(pelvisGeometry, [0, 0.03, 0], [0.72, 1, 0.56]);

      [-1, 1].forEach((side) => {
        addPart(new THREE.SphereGeometry(0.5, 28, 18), [side * 0.34, 1.62, -0.01], [0.42, 0.18, 0.26], [0, 0, side * 0.2]);
        addPart(new THREE.SphereGeometry(0.5, 30, 20), [side * 0.25, 1.36, 0.36], [0.4, 0.24, 0.14], [0, side * 0.05, side * -0.04]);
      });
      [-1, 1].forEach((side) => {
        addPart(new THREE.CapsuleGeometry(0.15, 0.24, 10, 18), [side * 0.94, 1.6, 0.2], [1.18, 0.88, 0.6], [0.14, 0, side * 0.18]);
        addPart(new THREE.CapsuleGeometry(0.12, 0.2, 10, 18), [side * 0.7, 1.42, -0.22], [1.04, 0.68, 0.6], [0.22, 0, side * -0.06]);
        addPart(new THREE.CapsuleGeometry(0.09, 0.16, 8, 16), [side * 0.38, 1.78, -0.1], [0.8, 0.74, 0.68], [0.14, 0, side * 0.14]);
        addPart(new THREE.CapsuleGeometry(0.09, 0.16, 8, 16), [side * 1.08, 0.96, 0.08], [0.92, 0.82, 0.68], [0, 0, side * 0.1]);
        addPart(new THREE.CapsuleGeometry(0.08, 0.14, 8, 16), [side * 1.08, 0.92, -0.18], [0.76, 0.68, 0.5], [0, 0, side * -0.08]);
        addPart(new THREE.CapsuleGeometry(0.08, 0.12, 8, 16), [side * 0.98, 1.2, -0.18], [0.56, 0.74, 0.48], [0.12, 0, side * -0.18]);
        addPart(new THREE.CapsuleGeometry(0.07, 0.18, 8, 14), [side * 0.66, 1.72, -0.22], [0.62, 0.66, 0.46], [0.18, 0, side * -0.2]);
      });
      [1.02, 0.75, 0.49].forEach((height, row) => {
        [-1, 1].forEach((side) => addPart(
          new THREE.SphereGeometry(0.5, 22, 16),
          [side * 0.13, height, 0.34 - row * 0.018],
          [0.22 - row * 0.015, 0.18, 0.1]
        ));
      });

    const upperArmGeometry = profileGeometry([
      [0.095, -0.51], [0.15, -0.41], [0.165, -0.18], [0.18, 0.13],
      [0.205, 0.38], [0.14, 0.51]
    ], 30, 26);
    const forearmGeometry = profileGeometry([
      [0.065, -0.5], [0.095, -0.38], [0.125, -0.12], [0.16, 0.22],
      [0.145, 0.42], [0.09, 0.5]
    ], 30, 26);
    const handGeometry = profileGeometry([
      [0.02, -0.26], [0.09, -0.21], [0.12, -0.05], [0.11, 0.17],
      [0.07, 0.25]
    ], 24, 22);
    [-1, 1].forEach((side) => {
      addPart(new THREE.CapsuleGeometry(0.14, 0.2, 10, 16), [side * 0.88, 1.49, 0.02], [1.2, 0.8, 0.72], [0.08, 0, side * 0.12]);
      addPart(upperArmGeometry, [side * 0.99, 1, 0.04], [1.18, 1, 1.06], [0, 0, side * 0.16]);
      addPart(new THREE.CapsuleGeometry(0.1, 0.16, 8, 14), [side * 1.03, 0.51, 0.03], [1.0, 0.82, 0.7], [0, 0, side * 0.05]);
      addPart(forearmGeometry, [side * 1.01, 0.1, 0.05], [1.1, 1, 0.96], [0, 0, side * -0.06]);
      addPart(handGeometry, [side * 0.98, -0.48, 0.025], [0.92, 1, 0.62], [0, 0, side * -0.03]);
      addPart(new THREE.CapsuleGeometry(0.08, 0.14, 8, 14), [side * 1.14, 0.94, -0.18], [0.8, 0.7, 0.48], [0.08, 0, side * -0.06]);
    });

    const thighGeometry = profileGeometry([
      [0.11, -0.68], [0.17, -0.55], [0.21, -0.25], [0.27, 0.12],
      [0.3, 0.42], [0.22, 0.62], [0.13, 0.69]
    ], 38, 32);
    const lowerLegGeometry = profileGeometry([
      [0.075, -0.59], [0.105, -0.47], [0.14, -0.22], [0.19, 0.05],
      [0.18, 0.26], [0.14, 0.48], [0.1, 0.59]
    ], 38, 32);
    [-1, 1].forEach((side) => {
      addPart(thighGeometry, [side * 0.32, -0.78, 0], [1.12, 1, 1], [0, 0, side * 0.15]);
      addPart(new THREE.SphereGeometry(0.5, 28, 18), [side * 0.41, -1.33, 0.015], [0.26, 0.24, 0.25]);
      addPart(lowerLegGeometry, [side * 0.5, -1.72, 0.015], [1.06, 1, 0.94], [0, 0, side * 0.17]);
      addPart(new THREE.SphereGeometry(0.5, 30, 18), [side * 0.61, -2.25, 0.2], [0.34, 0.16, 0.66], [0, 0, side * 0.05]);
    });

    const muscleMaterials = new Map();
    const addMuscle = (region, parts) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0x69e5ff,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false
      });
      parts.forEach(({ position, scale, rotation = [0, 0, 0] }) => {
        const muscle = addPart(new THREE.SphereGeometry(0.5, 26, 18), position, scale, rotation, material);
        muscle.renderOrder = 8;
      });
      muscleMaterials.set(region, material);
    };
    addMuscle('chest', [
      { position: [-0.26, 1.41, 0.46], scale: [0.42, 0.3, 0.18], rotation: [0.12, 0, -0.2] },
      { position: [0.26, 1.41, 0.46], scale: [0.42, 0.3, 0.18], rotation: [0.12, 0, 0.2] },
      { position: [-0.12, 1.18, 0.5], scale: [0.2, 0.24, 0.16], rotation: [0.18, 0, -0.05] },
      { position: [0.12, 1.18, 0.5], scale: [0.2, 0.24, 0.16], rotation: [0.18, 0, 0.05] }
    ]);
    addMuscle('shoulders', [
      { position: [-0.92, 1.5, 0.18], scale: [0.34, 0.3, 0.3], rotation: [0.14, 0, -0.22] },
      { position: [0.92, 1.5, 0.18], scale: [0.34, 0.3, 0.3], rotation: [0.14, 0, 0.22] },
      { position: [-0.68, 1.58, -0.18], scale: [0.28, 0.26, 0.18], rotation: [0.18, 0, -0.4] },
      { position: [0.68, 1.58, -0.18], scale: [0.28, 0.26, 0.18], rotation: [0.18, 0, 0.4] },
      { position: [-0.44, 1.92, -0.1], scale: [0.24, 0.28, 0.16], rotation: [0.24, 0, -0.18] },
      { position: [0.44, 1.92, -0.1], scale: [0.24, 0.28, 0.16], rotation: [0.24, 0, 0.18] },
      { position: [-0.56, 1.32, 0.08], scale: [0.22, 0.24, 0.16], rotation: [0.12, 0, -0.28] },
      { position: [0.56, 1.32, 0.08], scale: [0.22, 0.24, 0.16], rotation: [0.12, 0, 0.28] }
    ]);
    addMuscle('back', [
      { position: [-0.3, 1.14, -0.44], scale: [0.38, 0.66, 0.16], rotation: [0.08, 0, -0.12] },
      { position: [0.3, 1.14, -0.44], scale: [0.38, 0.66, 0.16], rotation: [0.08, 0, 0.12] },
      { position: [-0.18, 1.4, -0.38], scale: [0.3, 0.36, 0.18], rotation: [0.15, 0, -0.12] },
      { position: [0.18, 1.4, -0.38], scale: [0.3, 0.36, 0.18], rotation: [0.15, 0, 0.12] },
      { position: [-0.42, 1.7, -0.28], scale: [0.23, 0.26, 0.15], rotation: [0.18, 0, -0.2] },
      { position: [0.42, 1.7, -0.28], scale: [0.23, 0.26, 0.15], rotation: [0.18, 0, 0.2] }
    ]);
    addMuscle('arms', [
      { position: [-1.02, 1.02, 0.18], scale: [0.19, 0.72, 0.2], rotation: [0, 0, -0.08] },
      { position: [1.02, 1.02, 0.18], scale: [0.19, 0.72, 0.2], rotation: [0, 0, 0.08] },
      { position: [-1.08, 0.9, -0.12], scale: [0.18, 0.42, 0.18], rotation: [0, 0, -0.08] },
      { position: [1.08, 0.9, -0.12], scale: [0.18, 0.42, 0.18], rotation: [0, 0, 0.08] },
      { position: [-1.01, 0.12, 0.14], scale: [0.17, 0.66, 0.16], rotation: [0, 0, 0.04] },
      { position: [1.01, 0.12, 0.14], scale: [0.17, 0.66, 0.16], rotation: [0, 0, -0.04] }
    ]);
    addMuscle('core', [
      ...[1.02, 0.76, 0.5].flatMap((height, row) => [-1, 1].map((side) => ({
        position: [side * 0.14, height, 0.43 - row * 0.015],
        scale: [0.2 - row * 0.012, 0.18, 0.11]
      })))
    ]);
    addMuscle('glutes', [
      { position: [-0.21, -0.05, -0.36], scale: [0.39, 0.36, 0.18] },
      { position: [0.21, -0.05, -0.36], scale: [0.39, 0.36, 0.18] }
    ]);
    addMuscle('legs', [
      { position: [-0.32, -0.78, 0.22], scale: [0.27, 0.9, 0.21], rotation: [0, 0, -0.15] },
      { position: [0.32, -0.78, 0.22], scale: [0.27, 0.9, 0.21], rotation: [0, 0, 0.15] },
      { position: [-0.5, -1.72, 0.18], scale: [0.18, 0.62, 0.16], rotation: [0, 0, -0.17] },
      { position: [0.5, -1.72, 0.18], scale: [0.18, 0.62, 0.16], rotation: [0, 0, 0.17] }
    ]);

    let particleSeed = 87421;
    const seededRandom = () => {
      particleSeed = (particleSeed * 16807) % 2147483647;
      return (particleSeed - 1) / 2147483646;
    };
    const particlePositions = [];
    for (let index = 0; index < 520; index += 1) {
      const height = -2.25 + seededRandom() * 4.85;
      let horizontal;
      if (height > 1.72) horizontal = (seededRandom() - 0.5) * 0.86;
      else if (height > 0.2) horizontal = (seededRandom() - 0.5) * (1.25 + (height - 0.2) * 0.25);
      else {
        const side = seededRandom() < 0.5 ? -1 : 1;
        const stance = Math.min(1, Math.max(0, (-height - 0.2) / 2.05));
        horizontal = side * (0.14 + stance * 0.38 + seededRandom() * 0.2);
      }
      particlePositions.push(horizontal, height, (seededRandom() - 0.5) * 0.82);
    }
    [-1, 1].forEach((side) => {
      for (let index = 0; index < 150; index += 1) {
        const progress = seededRandom();
        const elbowMix = Math.min(1, progress * 2);
        const wristMix = Math.max(0, progress * 2 - 1);
        const shoulderX = side * 0.88;
        const elbowX = side * 1.03;
        const wristX = side * 0.98;
        const baseX = progress < 0.5
          ? shoulderX + ((elbowX - shoulderX) * elbowMix)
          : elbowX + ((wristX - elbowX) * wristMix);
        const baseY = progress < 0.5
          ? 1.49 + ((0.51 - 1.49) * elbowMix)
          : 0.51 + ((-0.55 - 0.51) * wristMix);
        particlePositions.push(baseX + (seededRandom() - 0.5) * 0.22, baseY + (seededRandom() - 0.5) * 0.22, (seededRandom() - 0.5) * 0.48);
      }
    });
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
    const particleCloud = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0x62ecff, size: 0.026, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    particleCloud.renderOrder = 3;
    body.add(particleCloud);

    const networkNodes = {
      head: [0, 2.18, 0.1], neck: [0, 1.86, 0.06],
      shoulderL: [-0.88, 1.49, 0.05], shoulderR: [0.88, 1.49, 0.05],
      elbowL: [-1.03, 0.51, 0.02], elbowR: [1.03, 0.51, 0.02],
      wristL: [-0.98, -0.48, 0.03], wristR: [0.98, -0.48, 0.03],
      chestL: [-0.25, 1.4, 0.5], chestR: [0.25, 1.4, 0.5],
      sternum: [0, 1.24, 0.52],
      abTop: [0, 1.02, 0.45], abMid: [0, 0.76, 0.44], abLow: [0, 0.5, 0.42],
      hipL: [-0.34, 0.05, 0.3], hipR: [0.34, 0.05, 0.3],
      kneeL: [-0.41, -1.33, 0.16], kneeR: [0.41, -1.33, 0.16],
      ankleL: [-0.5, -2.2, 0.16], ankleR: [0.5, -2.2, 0.16]
    };
    const networkLinks = [
      ['head', 'neck'], ['neck', 'shoulderL'], ['neck', 'shoulderR'], ['neck', 'sternum'],
      ['shoulderL', 'elbowL'], ['elbowL', 'wristL'], ['shoulderR', 'elbowR'], ['elbowR', 'wristR'],
      ['shoulderL', 'chestL'], ['shoulderR', 'chestR'], ['chestL', 'sternum'], ['chestR', 'sternum'],
      ['sternum', 'abTop'], ['abTop', 'abMid'], ['abMid', 'abLow'], ['abLow', 'hipL'], ['abLow', 'hipR'],
      ['hipL', 'hipR'], ['hipL', 'kneeL'], ['hipR', 'kneeR'], ['kneeL', 'ankleL'], ['kneeR', 'ankleR'],
      ['chestL', 'abTop'], ['chestR', 'abTop'], ['hipL', 'abLow'], ['hipR', 'abLow']
    ];
    const networkLinePositions = networkLinks.flatMap(([from, to]) => [...networkNodes[from], ...networkNodes[to]]);
    const networkLineGeometry = new THREE.BufferGeometry();
    networkLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(networkLinePositions, 3));
    const networkLines = new THREE.LineSegments(
      networkLineGeometry,
      new THREE.LineBasicMaterial({ color: 0x9af4ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    networkLines.renderOrder = 5;
    body.add(networkLines);
    const networkNodePositions = Object.values(networkNodes).flat();
    const networkNodeGeometry = new THREE.BufferGeometry();
    networkNodeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(networkNodePositions, 3));
    const networkNodeMaterial = new THREE.PointsMaterial({ color: 0xd8fbff, size: 0.05, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const networkNodePoints = new THREE.Points(networkNodeGeometry, networkNodeMaterial);
    networkNodePoints.renderOrder = 6;
    body.add(networkNodePoints);

    const anatomyMaterial = new THREE.MeshBasicMaterial({
      color: 0xb9ff52,
      transparent: true,
      opacity: 0.28,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    [0, 1, 2, 3, 4].forEach((index) => {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.52 - index * 0.035, 0.009, 6, 64), anatomyMaterial);
      rib.position.set(0, 1.42 - index * 0.12, 0.08);
      rib.scale.y = 0.42;
      rib.renderOrder = 4;
      body.add(rib);
    });
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), anatomyMaterial);
    heart.position.set(0.08, 1.12, 0.2);
    heart.scale.set(0.14, 0.18, 0.12);
    heart.renderOrder = 4;
    body.add(heart);
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), anatomyMaterial);
    abdomen.position.set(0.1, 0.52, 0.18);
    abdomen.scale.set(0.35, 0.28, 0.16);
    abdomen.renderOrder = 4;
    body.add(abdomen);
    const pelvisRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 6, 64), anatomyMaterial);
    pelvisRing.position.set(0, 0.06, 0.04);
    pelvisRing.scale.y = 0.44;
    pelvisRing.renderOrder = 4;
    body.add(pelvisRing);

    const coreRingMaterial = new THREE.MeshBasicMaterial({ color: 0xbfc7d0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 10, 64), coreRingMaterial);
    coreRing.position.set(0, 1.08, 0.5);
    body.add(coreRing);
    const coreLightMaterial = new THREE.MeshBasicMaterial({ color: 0xbfc7d0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreLight = new THREE.Mesh(new THREE.CircleGeometry(0.115, 40), coreLightMaterial);
    coreLight.position.set(0, 1.08, 0.505);
    body.add(coreLight);
    const spine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 1.72, 0.03),
        new THREE.Vector3(0, 1.25, 0.06),
        new THREE.Vector3(0, 0.75, 0.05),
        new THREE.Vector3(0, 0.2, 0.02)
      ]),
      new THREE.LineBasicMaterial({ color: 0xb9ff52, transparent: true, opacity: 0.55, depthTest: false, blending: THREE.AdditiveBlending })
    );
    spine.renderOrder = 4;
    body.add(spine);

    const rings = [0xbfc7d0, 0xc9ced5, 0xd3d7de].map((color, index) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05 + index * 0.16, 0.009, 8, 96), material);
      ring.position.y = 1.35 - index * 0.92;
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      return ring;
    });
    const scanLine = new THREE.Mesh(new THREE.PlaneGeometry(3.65, 0.035), new THREE.MeshBasicMaterial({ color: 0x9af4ff, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false }));
    scanLine.position.z = 0.9;
    scene.add(scanLine);
    const scanFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3.75, 5.05, 2.1)),
      new THREE.LineBasicMaterial({ color: 0x24d8ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending })
    );
    scanFrame.position.y = 0.24;
    scene.add(scanFrame);
    const platform = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, 0.025, 10, 128),
      new THREE.MeshBasicMaterial({ color: 0x24d8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })
    );
    platform.position.y = -2.34;
    platform.rotation.x = Math.PI / 2;
    scene.add(platform);
    const floorGrid = new THREE.GridHelper(8, 32, 0x1d829e, 0x092d3c);
    floorGrid.position.y = -2.35;
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.26;
    scene.add(floorGrid);

    const viewRotations = { front: 0, right: -Math.PI / 2, left: Math.PI / 2 };
    const target = { x: 0, y: 0 };
    const focusRegions = new Set();
    const improvedRegions = new Set();
    let readyCount = 0;
    let dragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let selectedView = 'front';
    let renderedStageWidth = 0;
    let renderedStageHeight = 0;
    let renderedDemoWidth = 0;
    let renderedDemoHeight = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setView = (view) => {
      if (!(view in viewRotations)) return;
      selectedView = view;
      target.x = 0;
      target.y = viewRotations[view];
      viewButtons.forEach((button) => {
        const active = button.dataset.physiqueView === view;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    };
    viewButtons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.physiqueView)));
    const resize = () => {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      renderedStageWidth = width;
      renderedStageHeight = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeDemo = () => {
      if (!demoRenderer || !demoStage) return;
      renderedDemoWidth = Math.max(1, demoStage.clientWidth);
      renderedDemoHeight = Math.max(1, demoStage.clientHeight);
      demoRenderer.setSize(renderedDemoWidth, renderedDemoHeight, false);
    };
    const render = (time) => {
      if (stage.clientWidth !== renderedStageWidth || stage.clientHeight !== renderedStageHeight) resize();
      shellUniforms.time.value = time * 0.001;
      const scale = Math.min(1, body.scale.x + 0.035);
      body.scale.setScalar(scale);
      const demoVisible = demoRenderer && demoStage?.offsetParent !== null && !demoStage.closest('[data-demo-panel]')?.hidden;
      if (demoVisible && (demoStage.clientWidth !== renderedDemoWidth || demoStage.clientHeight !== renderedDemoHeight)) resizeDemo();
      const idleTurn = !dragging && !reducedMotion ? Math.sin(time * 0.00055) * (demoVisible ? 0.2 : 0.035) : 0;
      body.rotation.y += ((target.y + idleTurn) - body.rotation.y) * 0.065;
      body.rotation.x += (target.x - body.rotation.x) * 0.045;
      body.position.y = -0.04 + (reducedMotion ? 0 : Math.sin(time * 0.0012) * 0.018);
      const corePulse = reducedMotion ? 1 : 1 + (Math.sin(time * 0.0045) * 0.09);
      coreRing.scale.setScalar(corePulse);
      coreRing.rotation.z = time * 0.00045;
      coreLight.material.opacity = reducedMotion ? 0.42 : 0.34 + (Math.sin(time * 0.005) * 0.12);
      networkLines.material.opacity = reducedMotion ? 0.4 : 0.32 + (Math.sin(time * 0.0032) * 0.14);
      networkNodeMaterial.opacity = reducedMotion ? 0.85 : 0.72 + (Math.sin(time * 0.004 + 1.2) * 0.18);
      scanLine.position.y = -2.18 + ((time * 0.00034) % 1) * 4.82;
      rings.forEach((ring, index) => {
        ring.rotation.z = time * (0.00008 + index * 0.000025);
        ring.material.opacity += ((index < readyCount ? 0.78 : 0.15) - ring.material.opacity) * 0.06;
      });
      muscleMaterials.forEach((material, region) => {
        const active = focusRegions.has(region) || improvedRegions.has(region);
        const pulse = 0.82 + Math.sin(time * 0.006) * 0.1;
        material.opacity += ((active ? pulse : 0.15) - material.opacity) * 0.14;
      });
      renderer.render(scene, camera);
      if (demoVisible) {
        const mainAspect = camera.aspect;
        camera.aspect = Math.max(1, demoStage.clientWidth) / Math.max(1, demoStage.clientHeight);
        camera.updateProjectionMatrix();
        demoRenderer.render(scene, camera);
        camera.aspect = mainAspect;
        camera.updateProjectionMatrix();
      }
      window.requestAnimationFrame(render);
    };
    stage.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.physique-3d-angles')) return;
      dragging = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      target.y += (event.clientX - lastPointerX) * 0.01;
      target.x = Math.max(-0.2, Math.min(0.2, target.x + ((event.clientY - lastPointerY) * 0.004)));
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      selectedView = 'custom';
      viewButtons.forEach((button) => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
      });
    });
    const stopDragging = () => {
      dragging = false;
      stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', stopDragging);
    stage.addEventListener('pointercancel', stopDragging);
    new ResizeObserver(resize).observe(stage);
    if (demoStage) new ResizeObserver(resizeDemo).observe(demoStage);
    stage.classList.add('is-user-figure');
    canvas.style.display = 'none';
    window.updatePhysique3DScan = (count) => {
      readyCount = count;
      status.textContent = count === 3 ? 'SCAN MATRIX READY' : `${count}/3 ANGLES LINKED`;
      stage.dataset.ready = String(count);
    };
    window.updatePhysique3DMuscles = (names = [], improvedNames = []) => {
      focusRegions.clear();
      improvedRegions.clear();
      const collectRegions = (muscleNames, regions) => muscleNames.forEach((name) => {
        const value = String(name || '').toLowerCase();
        if (/bryst|chest|pec/.test(value)) regions.add('chest');
        if (/skuld(?:er|re)|delt|shoulder|trapez|trap/.test(value)) regions.add('shoulders');
        if (/ryg|lat|back/.test(value)) regions.add('back');
        if (/arm|biceps|triceps|underarm/.test(value)) regions.add('arms');
        if (/core|mave|abs|talje|oblique/.test(value)) regions.add('core');
        if (/ball|glute/.test(value)) regions.add('glutes');
        if (/ben|lår|quad|hamstring|baglår|læg|calf/.test(value)) regions.add('legs');
      });
      collectRegions(names, focusRegions);
      collectRegions(improvedNames, improvedRegions);
      focusRegions.forEach((region) => improvedRegions.delete(region));
      muscleMaterials.forEach((material, region) => {
        const priority = focusRegions.has(region);
        const improved = improvedRegions.has(region);
        material.color.set(priority ? 0xff183f : improved ? 0x24f58a : 0xf0f4f7);
        material.opacity = priority || improved ? 0.94 : 0.0;
      });
      if (focusRegions.size || improvedRegions.size) {
        status.textContent = improvedRegions.size ? 'AI PROGRESS MAP ACTIVE' : 'AI MUSCLE MAP ACTIVE';
        stage.dataset.analysis = 'ready';
        stage.dataset.progress = improvedRegions.size ? 'improved' : 'priority';
      } else {
        status.textContent = readyCount === 3 ? 'SCAN MATRIX READY' : `${readyCount}/3 ANGLES LINKED`;
        delete stage.dataset.analysis;
        delete stage.dataset.progress;
      }
      renderer.render(scene, camera);
    };
    window.updatePhysique3DProfile = (profile = {}) => {
      const height = Number(profile.height) || 178;
      const weight = Number(profile.weight) || 75;
      const waist = Number(profile.waist) || 82;
      const shoulders = Number(profile.shoulders) || 48;
      const chest = Number(profile.chest) || 95;
      const arm = Number(profile.arm) || 36;
      const heightFactor = Math.min(1.28, Math.max(0.82, height / 178));
      const shoulderFactor = Math.min(1.34, Math.max(0.8, shoulders / 48));
      const chestFactor = Math.min(1.38, Math.max(0.72, chest / 95));
      const waistFactor = Math.min(1.24, Math.max(0.7, waist / 82));
      const armFactor = Math.min(1.35, Math.max(0.8, arm / 36));
      const weightFactor = Math.min(1.35, Math.max(0.72, weight / 75));

      const torsoStretch = 0.84 + (shoulderFactor - 1) * 0.6;
      const armStretch = 0.88 + (armFactor - 1) * 0.7;
      const waistLift = Math.max(0, 1.18 - waistFactor) * 0.38;

      body.scale.setScalar(0.9);
      body.position.y = -0.06 + (1 - heightFactor) * 0.22;
      body.rotation.z = (waistFactor - 1) * 0.2;

      bodyBaseScales.forEach((baseScale, mesh) => {
        const position = mesh.position;
        const xBias = Math.abs(position.x) > 0.8 ? armStretch : 1;
        const yBias = position.y > 0.15 && position.y < 2.2 ? heightFactor : 1;
        const zBias = position.y > 0.15 && position.y < 2.2 ? 1 / Math.max(0.68, waistFactor * 0.9) : 1;
        const torsoBias = Math.abs(position.x) < 0.4 && position.y > 0.15 && position.y < 2.2 ? torsoStretch : 1;
        const legBias = position.y < -0.6 ? heightFactor * 0.96 : 1;

        mesh.scale.set(
          baseScale.x * xBias * torsoBias * (position.x === 0 ? (0.84 + chestFactor * 0.24) : 1),
          baseScale.y * yBias * torsoBias * legBias,
          baseScale.z * zBias * (position.x === 0 ? (0.88 + chestFactor * 0.12) : 1)
        );
      });

      coreRing.position.y = 1.08 + waistLift;
      coreLight.position.y = 1.08 + waistLift;
    };
    const photoKeys = ['formlyPhysiquePhoto', 'formlyPhysiquePhotoRight', 'formlyPhysiquePhotoLeft'];
    const count = photoKeys.filter((key) => localStorage.getItem(key)).length;
    window.updatePhysique3DScan(count);
    window.updatePhysique3DMuscles?.([]);
    setView('front');
    resize();
    resizeDemo();
    window.requestAnimationFrame(render);
    window.__physique3d = { renderer, demoRenderer, scene, camera, body, focusRegions, improvedRegions, muscleMaterials, setView, get currentView() { return selectedView; } };
  } catch {
    stage.classList.add('is-unavailable');
    status.textContent = '3D PREVIEW OFFLINE';
  }
}

initPhysiqueHologram();