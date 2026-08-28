async function initPhysiqueHologram() {
  const stage = document.querySelector('#physique3dStage');
  const canvas = document.querySelector('#physique3dCanvas');
  const status = document.querySelector('#physique3dStatus');
  if (!stage || !canvas || !status) return;

  try {
    const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, 0.7, 6.1);
    camera.lookAt(0, 0.65, 0);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene.add(new THREE.AmbientLight(0x73e8ff, 1.7));
    const accentLight = new THREE.PointLight(0x00f58a, 16, 10);
    accentLight.position.set(2.4, 3, 3);
    scene.add(accentLight);

    const body = new THREE.Group();
    body.scale.setScalar(0.01);
    scene.add(body);
    const frameMaterial = new THREE.MeshPhysicalMaterial({ color: 0x24d8ff, emissive: 0x052d3d, roughness: 0.3, metalness: 0.25, transparent: true, opacity: 0.72, wireframe: true });
    const addPart = (geometry, position, scale, rotation = [0, 0, 0], material = frameMaterial) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.rotation.set(...rotation);
      body.add(mesh);
    };
    addPart(new THREE.SphereGeometry(0.5, 18, 12), [0, 2.45, 0], [0.55, 0.64, 0.55]);
    addPart(new THREE.CapsuleGeometry(0.46, 0.95, 7, 14), [0, 1.3, 0], [1.08, 1, 0.72]);
    addPart(new THREE.SphereGeometry(0.5, 16, 10), [0, 0.35, 0], [0.82, 0.58, 0.58]);
    addPart(new THREE.CapsuleGeometry(0.13, 1.15, 6, 10), [-0.63, 1.22, 0], [1, 1, 1], [0, 0, -0.18]);
    addPart(new THREE.CapsuleGeometry(0.13, 1.15, 6, 10), [0.63, 1.22, 0], [1, 1, 1], [0, 0, 0.18]);
    addPart(new THREE.CapsuleGeometry(0.17, 1.36, 6, 10), [-0.25, -0.68, 0], [1, 1, 1], [0, 0, 0.04]);
    addPart(new THREE.CapsuleGeometry(0.17, 1.36, 6, 10), [0.25, -0.68, 0], [1, 1, 1], [0, 0, -0.04]);

    const muscleMaterials = new Map();
    const addMuscle = (region, positions, scale) => {
      const material = new THREE.MeshStandardMaterial({ color: 0x24d8ff, emissive: 0x062d3c, transparent: true, opacity: 0.08, depthWrite: false });
      positions.forEach((position) => addPart(new THREE.SphereGeometry(0.5, 16, 10), position, scale, [0, 0, 0], material));
      muscleMaterials.set(region, material);
    };
    addMuscle('chest', [[-0.22, 1.55, 0.3], [0.22, 1.55, 0.3]], [0.62, 0.38, 0.22]);
    addMuscle('shoulders', [[-0.55, 1.72, 0], [0.55, 1.72, 0]], [0.42, 0.42, 0.42]);
    addMuscle('back', [[-0.3, 1.25, -0.3], [0.3, 1.25, -0.3]], [0.5, 0.7, 0.22]);
    addMuscle('arms', [[-0.66, 1.25, 0], [0.66, 1.25, 0]], [0.25, 0.8, 0.25]);
    addMuscle('core', [[0, 0.82, 0.25]], [0.56, 0.7, 0.22]);
    addMuscle('glutes', [[-0.2, 0.3, -0.3], [0.2, 0.3, -0.3]], [0.45, 0.4, 0.25]);
    addMuscle('legs', [[-0.25, -0.55, 0.12], [0.25, -0.55, 0.12]], [0.34, 1.15, 0.34]);

    const rings = [0x24d8ff, 0x00f58a, 0xff5f7a].map((color, index) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15 + index * 0.18, 0.012, 8, 72), material);
      ring.position.y = 1.05 - index * 0.34;
      ring.rotation.x = Math.PI / 2;
      scene.add(ring);
      return ring;
    });
    const scanLine = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.018), new THREE.MeshBasicMaterial({ color: 0x69e5ff, transparent: true, opacity: 0.85 }));
    scanLine.position.z = 0.75;
    scene.add(scanLine);
    const floorGrid = new THREE.GridHelper(7, 24, 0x14657e, 0x0a3142);
    floorGrid.position.y = -1.55;
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.3;
    scene.add(floorGrid);

    const target = { x: 0, y: -0.2 };
    const focusRegions = new Set();
    let readyCount = 0;
    let dragging = false;
    let lastPointerX = 0;
    const resize = () => {
      const width = Math.max(1, stage.clientWidth);
      const height = Math.max(1, stage.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const render = (time) => {
      const scale = Math.min(1, body.scale.x + 0.035);
      body.scale.setScalar(scale);
      body.rotation.y += (target.y - body.rotation.y) * 0.045;
      body.rotation.x += (target.x - body.rotation.x) * 0.045;
      target.y += 0.001;
      scanLine.position.y = -1.35 + ((time * 0.00042) % 1) * 4.05;
      rings.forEach((ring, index) => {
        ring.rotation.z = time * (0.00008 + index * 0.000025);
        ring.material.opacity += ((index < readyCount ? 0.78 : 0.15) - ring.material.opacity) * 0.06;
      });
      muscleMaterials.forEach((material, region) => {
        const active = focusRegions.has(region);
        const pulse = 0.82 + Math.sin(time * 0.006) * 0.13;
        material.opacity += ((active ? pulse : 0.08) - material.opacity) * 0.08;
        material.color.lerp(new THREE.Color(active ? 0xff385c : 0x24d8ff), 0.08);
        material.emissive.lerp(new THREE.Color(active ? 0xa60928 : 0x062d3c), 0.08);
      });
      renderer.render(scene, camera);
      window.requestAnimationFrame(render);
    };
    stage.addEventListener('pointerdown', (event) => {
      dragging = true;
      lastPointerX = event.clientX;
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      target.y += (event.clientX - lastPointerX) * 0.012;
      lastPointerX = event.clientX;
    });
    const stopDragging = () => {
      dragging = false;
      stage.classList.remove('is-dragging');
    };
    stage.addEventListener('pointerup', stopDragging);
    stage.addEventListener('pointercancel', stopDragging);
    new ResizeObserver(resize).observe(stage);
    window.updatePhysique3DScan = (count) => {
      readyCount = count;
      status.textContent = count === 3 ? 'SCAN MATRIX READY' : `${count}/3 ANGLES LINKED`;
      stage.dataset.ready = String(count);
    };
    window.updatePhysique3DMuscles = (names = []) => {
      focusRegions.clear();
      names.forEach((name) => {
        const value = String(name || '').toLowerCase();
        if (/bryst|chest|pec/.test(value)) focusRegions.add('chest');
        if (/skulder|delt|shoulder/.test(value)) focusRegions.add('shoulders');
        if (/ryg|lat|back/.test(value)) focusRegions.add('back');
        if (/arm|biceps|triceps/.test(value)) focusRegions.add('arms');
        if (/core|mave|abs|talje/.test(value)) focusRegions.add('core');
        if (/ball|glute/.test(value)) focusRegions.add('glutes');
        if (/ben|lår|quad|hamstring|baglår|læg|calf/.test(value)) focusRegions.add('legs');
      });
      if (focusRegions.size) {
        status.textContent = 'AI MUSCLE MAP ACTIVE';
        stage.dataset.analysis = 'ready';
      }
    };
    const photoKeys = ['formlyPhysiquePhoto', 'formlyPhysiquePhotoRight', 'formlyPhysiquePhotoLeft'];
    window.updatePhysique3DScan(photoKeys.filter((key) => localStorage.getItem(key)).length);
    const savedAnalysis = JSON.parse(localStorage.getItem('formlyPhysiqueMuscleAnalysis') || 'null');
    if (savedAnalysis?.priorities) window.updatePhysique3DMuscles(savedAnalysis.priorities.map((item) => item.muscle));
    resize();
    window.requestAnimationFrame(render);
    window.__physique3d = { renderer, scene, camera, body, focusRegions };
  } catch {
    stage.classList.add('is-unavailable');
    status.textContent = '3D PREVIEW OFFLINE';
  }
}

initPhysiqueHologram();