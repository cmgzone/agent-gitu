import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {HStack} from '@astryxdesign/core/Layout';
import type {DesktopCloudBridge, DesktopCloudState} from '../bridge';
import {AppIcon, Cloud, Monitor} from '../components/AppIcons';

export function DesktopAgentBar({
  cloudBridge,
  cloudStatus,
  switchingMode,
  onSwitchLocal,
  onOpenCloudDialog,
}: {
  cloudBridge: DesktopCloudBridge | null;
  cloudStatus: DesktopCloudState | null;
  switchingMode: boolean;
  onSwitchLocal: () => void;
  onOpenCloudDialog: () => void;
}) {
  if (!cloudBridge) return null;

  const mode = cloudStatus?.mode === 'cloud' ? 'cloud' : 'local';
  const activeCloudName = cloudStatus?.activeCloud?.name || '';
  const cloudLabel =
    mode === 'cloud' && activeCloudName ? `Cloud · ${activeCloudName}` : 'Cloud';

  return (
    <Card
      className="gitu-desktop-agent-bar"
      padding={1}
      variant="default"
      aria-label="Workspace agent switcher">
      <HStack gap={1} vAlign="center">
        <Button
          label="Local"
          size="sm"
          variant={mode === 'local' ? 'primary' : 'ghost'}
          icon={<AppIcon icon={Monitor} size="sm" />}
          isDisabled={switchingMode}
          isLoading={switchingMode && mode === 'cloud'}
          onClick={() => {
            if (mode === 'cloud') onSwitchLocal();
          }}
        />
        <Button
          label={cloudLabel}
          size="sm"
          variant={mode === 'cloud' ? 'primary' : 'ghost'}
          icon={<AppIcon icon={Cloud} size="sm" />}
          isDisabled={switchingMode}
          onClick={onOpenCloudDialog}
        />
      </HStack>
    </Card>
  );
}
