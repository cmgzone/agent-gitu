// Executed inside the Three.js module. All choices share one offscreen renderer.
export const COWORK_CHARACTER_MODELS_JS = String.raw`
  function buildCharacter(config) {
    var color = /^#[0-9a-f]{6}$/i.test(config.color) ? config.color : '#8f80ff';
    var group = new THREE.Group();
    var geometry;
    if (config.shape === 'cube') {
      var outline = new THREE.Shape();
      outline.moveTo(-3, -3); outline.lineTo(3, -3); outline.lineTo(3, 3); outline.lineTo(-3, 3); outline.closePath();
      geometry = new THREE.ExtrudeGeometry(outline, { depth: 5, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: .65, bevelThickness: .65 });
      geometry.translate(0, 0, -2.5);
    } else if (config.shape === 'diamond') {
      geometry = new THREE.OctahedronGeometry(5.4, 0);
      geometry.rotateY(Math.PI / 4);
    } else if (config.shape === 'pyramid') {
      geometry = new THREE.ConeGeometry(5.5, 8, 4);
      geometry.rotateY(Math.PI / 4);
    } else {
      geometry = new THREE.SphereGeometry(4, 40, 32);
      geometry.scale(1.08, 1, .9);
    }
    var body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: color, roughness: .36, metalness: .03 }));
    group.add(body);
    body.updateMatrixWorld(true);
    var ray = new THREE.Raycaster();
    function surface(x, y) {
      ray.set(new THREE.Vector3(x, y, 20), new THREE.Vector3(0, 0, -1));
      var hit = ray.intersectObject(body)[0];
      return hit ? hit.point.z : 0;
    }
    function facePart(x, y, w, h, d, c, lift) {
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: c, roughness: .45 }));
      mesh.scale.set(w, h, d); mesh.position.set(x, y, surface(x, y) + (lift || .1));
      group.add(mesh); return mesh;
    }
    [-1, 1].forEach(function (side) {
      var eyeX = side * (config.shape === 'cube' ? 1.35 : 1.25), eyeY = config.shape === 'pyramid' ? .2 : .45;
      var winking = config.shape === 'diamond' && side === 1;
      var eye = facePart(eyeX, eyeY, config.shape === 'cube' ? .52 : .43, winking ? .15 : config.shape === 'pyramid' ? .55 : .75, .3, 0x262144, .18);
      var shine = facePart(eyeX + .12, eyeY + .24, .13, .16, .08, 0xffffff, .5);
      shine.position.z = eye.position.z + .29;
      shine.visible = !winking;
      facePart(side * 2, -.9, .6, .25, .14, 0xf4a4d2, .13);
    });
    // A happy mouth and pink tongue echo the homepage blob's expression.
    var smile = new THREE.Shape();
    var smileWidth = config.shape === 'cube' ? 1.05 : config.shape === 'pyramid' ? .72 : .85;
    smile.moveTo(-smileWidth, -.95); smile.quadraticCurveTo(0, config.shape === 'pyramid' ? -2.25 : -2.55, smileWidth, -.95); smile.quadraticCurveTo(0, -1.3, -smileWidth, -.95);
    var mouth = new THREE.Mesh(new THREE.ShapeGeometry(smile, 20), new THREE.MeshBasicMaterial({ color: 0x36234e, side: THREE.DoubleSide }));
    var positions = mouth.geometry.attributes.position;
    for (var i = 0; i < positions.count; i++) positions.setZ(i, surface(positions.getX(i), positions.getY(i)) + .16);
    mouth.geometry.computeVertexNormals(); group.add(mouth);
    facePart(.18, -1.8, .32, .45, .12, 0xff91bd, .3);
    return group;
  }
  var avatarRenderer;
  function renderScene(group, size) {
    try {
      if (!avatarRenderer) {
        avatarRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
        avatarRenderer.setClearColor(0x000000, 0);
      }
      avatarRenderer.setSize(size, size, false);
      var scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.45));
      var key = new THREE.DirectionalLight(0xffffff, 1.35);
      key.position.set(6, 10, 12); scene.add(key);
      var rim = new THREE.DirectionalLight(0xffffff, .5);
      rim.position.set(-8, 4, -6); scene.add(rim);
      group.rotation.y = -.16;
      scene.add(group);
      // Fit all silhouettes, including the diamond and pyramid tips, inside the same frame.
      var bounds = new THREE.Box3().setFromObject(group);
      var center = bounds.getCenter(new THREE.Vector3());
      var span = bounds.getSize(new THREE.Vector3());
      var radius = Math.max(span.x, span.y, span.z) * .64;
      var cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, .1, 200);
      cam.position.copy(center).add(new THREE.Vector3(4, 3, 32));
      cam.lookAt(center);
      avatarRenderer.render(scene, cam);
      return avatarRenderer.domElement.toDataURL('image/png');
    } finally {
      group.traverse(function (mesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      });
    }
  }
  window.__coworkAvatar = {
    render: function (config, size) {
      try { return renderScene(buildCharacter(config || {}), size || 128); }
      catch (e) { return null; }
    },
    shapes: ['orb', 'cube', 'diamond', 'pyramid'],
  };
  window.dispatchEvent(new CustomEvent('coworkavatarsready'));
`;
