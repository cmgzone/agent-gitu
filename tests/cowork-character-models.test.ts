import { createContext, Script } from 'node:vm';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COWORK_CHARACTER_MODELS_JS } from '../src/server/ui-character-models.js';

describe('geometric blob models', () => {
  it('builds distinct 3D bodies with faces on their surfaces', () => {
    const context = createContext({ THREE, window: { dispatchEvent() {} }, CustomEvent: class {} });
    new Script(COWORK_CHARACTER_MODELS_JS).runInContext(context);
    const geometries: string[] = [];
    for (const shape of ['orb', 'cube', 'diamond', 'pyramid']) {
      const group = context.buildCharacter({ shape, color: '#8f80ff' }) as THREE.Group;
      const body = group.children[0] as THREE.Mesh;
      geometries.push(body.geometry.type);
      expect(group.children).toHaveLength(9); // body, two eyes/highlights/cheeks, smile, tongue
      const bounds = new THREE.Box3().setFromObject(group);
      expect(bounds.isEmpty()).toBe(false);
      expect(bounds.getSize(new THREE.Vector3()).length()).toBeLessThan(20);
      for (const child of group.children.slice(1)) {
        const mesh = child as THREE.Mesh;
        const positions = mesh.geometry.attributes.position;
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      }
      // Every smile vertex must sit just outside the actual body's front face.
      const smile = group.children[7] as THREE.Mesh;
      const points = smile.geometry.attributes.position;
      const ray = new THREE.Raycaster();
      for (let i = 0; i < points.count; i++) {
        ray.set(new THREE.Vector3(points.getX(i), points.getY(i), 20), new THREE.Vector3(0, 0, -1));
        const hit = ray.intersectObject(body)[0];
        expect(hit).toBeDefined();
        expect(points.getZ(i) - hit!.point.z).toBeCloseTo(.16, 4);
      }
      group.traverse(child => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material && !Array.isArray(mesh.material)) mesh.material.dispose();
      });
    }
    expect(new Set(geometries).size).toBe(4);
  });
});
