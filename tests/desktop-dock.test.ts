import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const dock = require('../desktop/dock-manager.cjs');

describe('desktop floating agent dock manager', () => {
  it('normalizes and persists dock preferences safely', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-dock-'));
    const prefsFile = path.join(dir, 'desktop-dock.json');

    const defaults = dock.loadDockPrefs(prefsFile);
    expect(defaults).toEqual({
      enabled: true,
      edge: 'right',
      collapsed: false,
      includeCodingShortcut: true,
      pinnedAgentIds: null,
      alwaysOnTopChat: true,
    });

    const saved = dock.saveDockPrefs(prefsFile, {
      enabled: true,
      edge: 'bottom',
      collapsed: false,
      includeCodingShortcut: false,
      pinnedAgentIds: ['ag-1', 'ag-2', 'ag-1', '  '],
      alwaysOnTopChat: false,
    });
    expect(saved.edge).toBe('bottom');
    expect(saved.includeCodingShortcut).toBe(false);
    expect(saved.pinnedAgentIds).toEqual(['ag-1', 'ag-2']);
    expect(saved.alwaysOnTopChat).toBe(false);

    const reloaded = dock.loadDockPrefs(prefsFile);
    expect(reloaded).toEqual(saved);
    expect(JSON.parse(readFileSync(prefsFile, 'utf8')).edge).toBe('bottom');
  });

  it('computes screen-clamped dock and quick-chat bounds for right, left, and bottom edges', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

    const rightDock = dock.computeDockBounds(workArea, 'right', 5, false);
    expect(rightDock.x + rightDock.width).toBeLessThanOrEqual(workArea.width);
    const rightChat = dock.computeChatBounds(workArea, rightDock, 'right');
    expect(rightChat.x + rightChat.width).toBeLessThan(rightDock.x);
    expect(rightChat.y).toBeGreaterThanOrEqual(10);

    const leftDock = dock.computeDockBounds(workArea, 'left', 4, false);
    expect(leftDock.x).toBeGreaterThanOrEqual(0);
    const leftChat = dock.computeChatBounds(workArea, leftDock, 'left');
    expect(leftChat.x).toBeGreaterThan(leftDock.x + leftDock.width);

    const bottomDock = dock.computeDockBounds(workArea, 'bottom', 6, false);
    expect(bottomDock.width).toBeGreaterThan(bottomDock.height);
    const bottomChat = dock.computeChatBounds(workArea, bottomDock, 'bottom');
    expect(bottomChat.y + bottomChat.height).toBeLessThan(bottomDock.y);

    const collapsedDock = dock.computeDockBounds(workArea, 'right', 5, true);
    expect(collapsedDock.width).toBeLessThan(30);
  });

  it('maps character shapes to canonical plush sprite names', () => {
    expect(dock.spriteNameFromShape('dot-orb')).toBe('orb');
    expect(dock.spriteNameFromShape('dot-hexa')).toBe('hexa');
    expect(dock.spriteNameFromShape('star')).toBe('nova');
    expect(dock.spriteNameFromShape('cube')).toBe('block');
    expect(dock.spriteNameFromShape('unknown')).toBe('orb');
  });
});
