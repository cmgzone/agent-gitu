import {Center} from '@astryxdesign/core/Center';
import type {CSSProperties} from 'react';
import {getHostBridge, type CoworkAvatar} from '../bridge';

const FALLBACK_SHAPE_IMAGES: Record<string, string> = {
  'dot-orb': '/characters/orb.png?v=opendots1',
  'dot-block': '/characters/block.png?v=opendots1',
  'dot-blue': '/characters/block.png?v=opendots1',
  'dot-tip': '/characters/tip.png?v=opendots1',
  'dot-hexa': '/characters/hexa.png?v=opendots1',
  'dot-mint': '/characters/hexa.png?v=opendots1',
  'dot-nova': '/characters/nova.png?v=opendots1',
  'dot-purple': '/characters/nova.png?v=opendots1',
  'dot-dia': '/characters/dia.png?v=opendots1',
  'dot-penta': '/characters/penta.png?v=opendots1',
  'dot-orange': '/characters/penta.png?v=opendots1',
  'dot-luna': '/characters/luna.png?v=opendots1',
  'dot-plus': '/characters/plus.png?v=opendots1',
  'dot-pill': '/characters/pill.png?v=opendots1',
};

function isSafeCustomAvatarUrl(url?: string): boolean {
  if (!url) return false;
  return (
    /^\/api\/(?:cowork|inbox)\/agents\/[\w-]+\/avatar(?:\?v=\d+)?$/.test(url) ||
    /^data:image\/(?:png|jpeg|webp);base64,/i.test(url)
  );
}

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
  const hasCustom = isSafeCustomAvatarUrl(avatar?.imageUrl);
  const src = hasCustom
    ? avatar!.imageUrl!
    : host
      ? host.getAvatarImageUrl(avatar?.shape)
      : (avatar?.shape && FALLBACK_SHAPE_IMAGES[avatar.shape]) ||
        '/characters/orb.png?v=opendots1';
  const filter = !hasCustom && host?.getCharacterFilter
    ? host.getCharacterFilter(avatar)
    : undefined;
  const boxStyle: CSSProperties = {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-muted)',
    flexShrink: 0,
    overflow: 'hidden',
    padding: hasCustom ? 0 : 'var(--spacing-1)',
    border: avatar?.color ? `2px solid ${avatar.color}` : undefined,
  };
  const imgStyle: CSSProperties = hasCustom
    ? {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
      }
    : filter
      ? {filter}
      : {};

  return (
    <Center width={size} height={size} style={boxStyle}>
      <img
        className="gitu-astryx-plush"
        src={src}
        alt={name}
        style={imgStyle}
      />
    </Center>
  );
}
