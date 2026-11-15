import {Center} from '@astryxdesign/core/Center';
import type {CSSProperties} from 'react';
import {getHostBridge, type CoworkAvatar} from '../bridge';

export function PlushPortrait({
  avatar,
  name,
  size = 48,
}: {
  avatar?: CoworkAvatar;
  name: string;
  size?: 24 | 32 | 36 | 40 | 48 | 64 | 72;
}) {
  const host = getHostBridge();
  const src = host
    ? host.getAvatarImageUrl(avatar?.shape)
    : '/characters/orb.png?v=opendots1';
  const boxStyle: CSSProperties = {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    flexShrink: 0,
    overflow: 'hidden',
    padding: 'var(--spacing-1)',
    border: avatar?.color ? `2px solid ${avatar.color}` : undefined,
  };

  return (
    <Center width={size} height={size} style={boxStyle}>
      <img className="gitu-astryx-plush" src={src} alt={name} />
    </Center>
  );
}
