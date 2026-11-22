import React, { useState, type ReactNode } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { DateInput } from '@astryxdesign/core/DateInput';
import { DateTimeInput } from '@astryxdesign/core/DateTimeInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading, type HeadingLevel } from '@astryxdesign/core/Heading';
import { Icon, type IconName } from '@astryxdesign/core/Icon';
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Markdown } from '@astryxdesign/core/Markdown';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Selector } from '@astryxdesign/core/Selector';
import { Slider } from '@astryxdesign/core/Slider';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import { TimeInput } from '@astryxdesign/core/TimeInput';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Token } from '@astryxdesign/core/Token';
import { isSafeAssetUrl } from './urlValidation';
export { isSafeAssetUrl } from './urlValidation';
import {
  createComponentImplementation,
  type ReactCatalogComponent,
} from '@a2ui/react/v0_9';
import { Catalog } from '@a2ui/web_core/v0_9';
import {
  basicCatalog as v1BasicCatalog,
  BASIC_FUNCTIONS as V1_BASIC_FUNCTIONS,
  AudioPlayerApi as V1AudioPlayerApi,
  ButtonApi as V1ButtonApi,
  CardApi as V1CardApi,
  CheckBoxApi as V1CheckBoxApi,
  ChoicePickerApi as V1ChoicePickerApi,
  ColumnApi as V1ColumnApi,
  DateTimeInputApi as V1DateTimeInputApi,
  DividerApi as V1DividerApi,
  IconApi as V1IconApi,
  ImageApi as V1ImageApi,
  ListApi as V1ListApi,
  ModalApi as V1ModalApi,
  RowApi as V1RowApi,
  SliderApi as V1SliderApi,
  TabsApi as V1TabsApi,
  TextApi as V1TextApi,
  TextFieldApi as V1TextFieldApi,
  VideoApi as V1VideoApi,
} from '@a2ui/web_core/catalogs/basic/v1';
import {
  basicCatalog as v09BasicCatalog,
  BASIC_FUNCTIONS as V09_BASIC_FUNCTIONS,
  AudioPlayerApi as V09AudioPlayerApi,
  ButtonApi as V09ButtonApi,
  CardApi as V09CardApi,
  CheckBoxApi as V09CheckBoxApi,
  ChoicePickerApi as V09ChoicePickerApi,
  ColumnApi as V09ColumnApi,
  DateTimeInputApi as V09DateTimeInputApi,
  DividerApi as V09DividerApi,
  IconApi as V09IconApi,
  ImageApi as V09ImageApi,
  ListApi as V09ListApi,
  ModalApi as V09ModalApi,
  RowApi as V09RowApi,
  SliderApi as V09SliderApi,
  TabsApi as V09TabsApi,
  TextApi as V09TextApi,
  TextFieldApi as V09TextFieldApi,
  VideoApi as V09VideoApi,
} from '@a2ui/web_core/v0_9/basic_catalog';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME_REGEX = /^\d{2}:\d{2}(?::\d{2})?$/;
const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?/;

type BuildChildFn = (id: string, basePath?: string) => ReactNode;
type StackMainAlign = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
type StackCrossAlign = 'start' | 'center' | 'end' | 'stretch';

function mapJustify(justify?: string): StackMainAlign | undefined {
  switch (justify) {
    case 'center':
    case 'end':
    case 'start':
      return justify;
    case 'spaceBetween':
      return 'between';
    case 'spaceAround':
      return 'around';
    case 'spaceEvenly':
      return 'evenly';
    default:
      return undefined;
  }
}

function mapAlign(align?: string): StackCrossAlign | undefined {
  switch (align) {
    case 'start':
    case 'center':
    case 'end':
    case 'stretch':
      return align;
    default:
      return undefined;
  }
}

function renderChildList(children: unknown, buildChild: BuildChildFn): ReactNode {
  if (!Array.isArray(children)) {
    return null;
  }
  return children.map((entry, idx) => {
    if (typeof entry === 'string' && entry) {
      return (
        <React.Fragment key={`${entry}:${idx}`}>
          {buildChild(entry)}
        </React.Fragment>
      );
    }
    if (entry && typeof entry === 'object') {
      const ref = entry as { id?: unknown; basePath?: unknown };
      if (typeof ref.id === 'string' && ref.id) {
        const basePath =
          typeof ref.basePath === 'string' ? ref.basePath : undefined;
        return (
          <React.Fragment key={`${ref.id}:${basePath ?? String(idx)}`}>
            {buildChild(ref.id, basePath)}
          </React.Fragment>
        );
      }
    }
    return null;
  });
}

function SafeMarkdownLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const safe = isSafeAssetUrl(href);
  if (!safe) {
    return <Text>{children}</Text>;
  }
  return (
    <Link href={safe} isExternalLink>
      {children}
    </Link>
  );
}

const HEADING_VARIANT_LEVEL: Record<string, HeadingLevel> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
};

const ICON_NAME_MAP: Record<string, IconName> = {
  check: 'check',
  done: 'check',
  checkCircle: 'success',
  close: 'close',
  cancel: 'close',
  clear: 'close',
  error: 'error',
  errorOutline: 'error',
  warning: 'warning',
  warningAmber: 'warning',
  info: 'info',
  infoOutline: 'info',
  help: 'info',
  helpOutline: 'info',
  calendarToday: 'calendar',
  event: 'calendar',
  dateRange: 'calendar',
  schedule: 'clock',
  accessTime: 'clock',
  timer: 'clock',
  search: 'search',
  upload: 'upload',
  fileUpload: 'upload',
  cloudUpload: 'upload',
  menu: 'menu',
  moreHoriz: 'moreHorizontal',
  moreVert: 'moreHorizontal',
  arrowUpward: 'arrowUp',
  arrowDownward: 'arrowDown',
  arrowBack: 'chevronLeft',
  chevronLeft: 'chevronLeft',
  arrowForward: 'chevronRight',
  chevronRight: 'chevronRight',
  expandMore: 'chevronDown',
  keyboardArrowDown: 'chevronDown',
  openInNew: 'externalLink',
  launch: 'externalLink',
  contentCopy: 'copy',
  copy: 'copy',
  build: 'wrench',
  settings: 'wrench',
  mic: 'microphone',
  microphone: 'microphone',
  stop: 'stop',
  stopCircle: 'stop',
  filterList: 'funnel',
  tune: 'funnel',
  visibilityOff: 'eyeSlash',
};

function resolveFirstError(
  isValid?: boolean,
  validationErrors?: string[],
): string | undefined {
  if (isValid === false && Array.isArray(validationErrors)) {
    const first = validationErrors.find((msg) => typeof msg === 'string' && msg.trim());
    return first?.trim() || 'Invalid value';
  }
  return undefined;
}

function AstryxTextView({
  text,
  variant,
}: {
  text?: unknown;
  variant?: unknown;
}) {
  const content = String(text ?? '');
  const variantKey = typeof variant === 'string' ? variant : 'body';
  const headingLevel = HEADING_VARIANT_LEVEL[variantKey];
  if (headingLevel) {
    return <Heading level={headingLevel}>{content}</Heading>;
  }
  if (variantKey === 'caption') {
    return (
      <Text type="supporting" color="secondary" display="block">
        {content}
      </Text>
    );
  }
  return (
    <Markdown
      density="compact"
      headingLevelStart={3}
      components={{ link: SafeMarkdownLink }}
    >
      {content}
    </Markdown>
  );
}

function AstryxImageView({
  url,
  description,
  accessibilityLabel,
}: {
  url?: unknown;
  description?: unknown;
  accessibilityLabel?: unknown;
}) {
  const safeUrl = isSafeAssetUrl(url, { allowDataImage: true });
  const altText = String(description ?? accessibilityLabel ?? '').trim();
  if (!safeUrl) {
    return (
      <Banner
        status="warning"
        title="Image unavailable"
        description="Blocked or invalid image URL."
      />
    );
  }
  return <Thumbnail src={safeUrl} alt={altText || undefined} label={altText || 'Image'} />;
}

function AstryxIconView({ name }: { name?: unknown }) {
  const rawName =
    typeof name === 'string'
      ? name.trim()
      : name && typeof name === 'object' && 'svgPath' in name
        ? 'icon'
        : 'icon';
  const mapped = ICON_NAME_MAP[rawName];
  if (mapped) {
    return <Icon icon={mapped} size="md" />;
  }
  return <Token size="sm" label={rawName || 'icon'} />;
}

function AstryxMediaView({
  url,
  description,
  kindLabel,
}: {
  url?: unknown;
  description?: unknown;
  kindLabel: string;
}) {
  const safeUrl = isSafeAssetUrl(url);
  const label = String(description ?? '').trim() || kindLabel;
  return (
    <Card variant="muted" padding={2}>
      <HStack justify="between" align="center" wrap="wrap" gap={2} width="100%">
        <Text>{label}</Text>
        {safeUrl ? (
          <Link href={safeUrl} isExternalLink>
            Open media
          </Link>
        ) : (
          <Text type="supporting" color="secondary">
            Invalid media URL
          </Text>
        )}
      </HStack>
    </Card>
  );
}

function AstryxRowView({
  childrenProp,
  justify,
  align,
  buildChild,
}: {
  childrenProp: unknown;
  justify?: string;
  align?: string;
  buildChild: BuildChildFn;
}) {
  return (
    <HStack
      gap={2}
      wrap="wrap"
      width="100%"
      justify={mapJustify(justify)}
      align={mapAlign(align)}
    >
      {renderChildList(childrenProp, buildChild)}
    </HStack>
  );
}

function AstryxColumnView({
  childrenProp,
  justify,
  align,
  buildChild,
}: {
  childrenProp: unknown;
  justify?: string;
  align?: string;
  buildChild: BuildChildFn;
}) {
  return (
    <VStack
      gap={2}
      width="100%"
      justify={mapJustify(justify)}
      align={mapAlign(align)}
    >
      {renderChildList(childrenProp, buildChild)}
    </VStack>
  );
}

function AstryxListView({
  childrenProp,
  direction,
  align,
  buildChild,
}: {
  childrenProp: unknown;
  direction?: string;
  align?: string;
  buildChild: BuildChildFn;
}) {
  if (direction === 'horizontal') {
    return (
      <HStack gap={2} wrap="wrap" width="100%" align={mapAlign(align)}>
        {renderChildList(childrenProp, buildChild)}
      </HStack>
    );
  }
  return (
    <VStack gap={2} width="100%" align={mapAlign(align)}>
      {renderChildList(childrenProp, buildChild)}
    </VStack>
  );
}

function AstryxCardView({
  childId,
  buildChild,
}: {
  childId?: unknown;
  buildChild: BuildChildFn;
}) {
  return (
    <Card width="100%">
      {typeof childId === 'string' && childId ? buildChild(childId) : null}
    </Card>
  );
}

function AstryxTabsView({
  tabs,
  buildChild,
}: {
  tabs?: Array<{ title?: unknown; child?: unknown }>;
  buildChild: BuildChildFn;
}) {
  const safeTabs = Array.isArray(tabs) ? tabs : [];
  const [selected, setSelected] = useState('0');
  if (safeTabs.length === 0) {
    return null;
  }
  const parsedIdx = Number(selected);
  const activeIdx =
    Number.isInteger(parsedIdx) && parsedIdx >= 0 && parsedIdx < safeTabs.length
      ? parsedIdx
      : 0;
  const activeTab = safeTabs[activeIdx];
  return (
    <VStack gap={2} width="100%">
      <TabList
        value={String(activeIdx)}
        onChange={setSelected}
        role="tablist"
        hasDivider
      >
        {safeTabs.map((tab, i) => (
          <Tab
            key={i}
            value={String(i)}
            label={String(tab?.title ?? `Tab ${i + 1}`)}
          />
        ))}
      </TabList>
      {activeTab && typeof activeTab.child === 'string' && activeTab.child
        ? buildChild(activeTab.child)
        : null}
    </VStack>
  );
}

function AstryxModalView({
  triggerId,
  contentId,
  buildChild,
}: {
  triggerId?: unknown;
  contentId?: unknown;
  buildChild: BuildChildFn;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <VStack onClick={() => setIsOpen(true)}>
        {typeof triggerId === 'string' && triggerId ? (
          buildChild(triggerId)
        ) : (
          <Button label="Open details" onClick={() => setIsOpen(true)} />
        )}
      </VStack>
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} width={520}>
        <Layout
          height="auto"
          header={<DialogHeader title="Details" onOpenChange={setIsOpen} />}
          content={
            <LayoutContent>
              <VStack gap={2} width="100%">
                {typeof contentId === 'string' && contentId
                  ? buildChild(contentId)
                  : null}
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

function AstryxButtonView({
  childId,
  variant,
  action,
  isValid,
  validationErrors,
  accessibilityLabel,
  buildChild,
}: {
  childId?: unknown;
  variant?: unknown;
  action?: () => Promise<void>;
  isValid?: boolean;
  validationErrors?: string[];
  accessibilityLabel?: unknown;
  buildChild: BuildChildFn;
}) {
  const mappedVariant =
    variant === 'primary'
      ? 'primary'
      : variant === 'borderless'
        ? 'ghost'
        : 'secondary';
  const label = String(accessibilityLabel ?? '').trim() || 'Action';
  const errorText = resolveFirstError(isValid, validationErrors);

  return (
    <VStack gap={1}>
      <Button
        label={label}
        variant={mappedVariant}
        isDisabled={isValid === false}
        onClick={() => {
          if (action) {
            void action();
          }
        }}
      >
        {typeof childId === 'string' && childId ? buildChild(childId) : undefined}
      </Button>
      {errorText ? (
        <Text type="supporting" color="secondary" display="block">
          {errorText}
        </Text>
      ) : null}
    </VStack>
  );
}

function AstryxTextFieldView({
  label,
  value,
  placeholder,
  variant,
  isValid,
  validationErrors,
  setValue,
}: {
  label?: unknown;
  value?: unknown;
  placeholder?: unknown;
  variant?: unknown;
  isValid?: boolean;
  validationErrors?: string[];
  setValue?: (next: string) => void;
}) {
  const fieldLabel = String(label ?? '').trim() || 'Input';
  const placeholderText =
    typeof placeholder === 'string' ? placeholder : undefined;
  const errorMessage = resolveFirstError(isValid, validationErrors);
  const status = errorMessage
    ? { type: 'error' as const, message: errorMessage }
    : undefined;
  const strValue = String(value ?? '');

  if (variant === 'longText') {
    return (
      <TextArea
        label={fieldLabel}
        value={strValue}
        placeholder={placeholderText}
        onChange={(next) => setValue?.(next)}
        width="100%"
        status={status}
      />
    );
  }
  if (variant === 'number') {
    const trimmed = strValue.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    const numValue = parsed !== null && Number.isFinite(parsed) ? parsed : null;
    return (
      <NumberInput
        label={fieldLabel}
        value={numValue}
        placeholder={placeholderText}
        hasClear
        onChange={(next) => setValue?.(next == null ? '' : String(next))}
        width="100%"
        status={status}
      />
    );
  }
  return (
    <TextInput
      label={fieldLabel}
      type={variant === 'obscured' ? 'password' : 'text'}
      value={strValue}
      placeholder={placeholderText}
      onChange={(next) => setValue?.(next)}
      width="100%"
      status={status}
    />
  );
}

function AstryxCheckBoxView({
  label,
  value,
  isValid,
  validationErrors,
  setValue,
}: {
  label?: unknown;
  value?: unknown;
  isValid?: boolean;
  validationErrors?: string[];
  setValue?: (next: boolean) => void;
}) {
  const boxLabel = String(label ?? '').trim() || 'Option';
  const errorMessage = resolveFirstError(isValid, validationErrors);
  return (
    <CheckboxInput
      label={boxLabel}
      value={Boolean(value)}
      onChange={(checked) => setValue?.(checked)}
      status={errorMessage ? { type: 'error', message: errorMessage } : undefined}
    />
  );
}

function AstryxChoicePickerView({
  label,
  options,
  value,
  variant,
  displayStyle,
  filterable,
  isValid,
  validationErrors,
  setValue,
}: {
  label?: unknown;
  options?: Array<{ label?: unknown; value?: unknown }>;
  value?: unknown;
  variant?: unknown;
  displayStyle?: unknown;
  filterable?: boolean;
  isValid?: boolean;
  validationErrors?: string[];
  setValue?: (next: string[]) => void;
}) {
  const safeOptions = (Array.isArray(options) ? options : []).map((opt) => {
    const val = String(opt?.value ?? '');
    return {
      value: val,
      label: String(opt?.label ?? val),
    };
  });
  const selected = Array.isArray(value) ? value.map(String) : [];
  const isMulti = variant === 'multipleSelection';
  const groupLabel = String(label ?? '').trim();
  const errorMessage = resolveFirstError(isValid, validationErrors);
  const status = errorMessage
    ? { type: 'error' as const, message: errorMessage }
    : undefined;

  if (displayStyle === 'chips') {
    return (
      <VStack gap={1} width="100%">
        {groupLabel ? (
          <Text type="supporting" color="secondary" display="block">
            {groupLabel}
          </Text>
        ) : null}
        <HStack wrap="wrap" gap={1} width="100%">
          {safeOptions.map((opt) => {
            const active = selected.includes(opt.value);
            return (
              <ToggleButton
                key={opt.value}
                label={opt.label}
                size="sm"
                isPressed={active}
                onPressedChange={(pressed) => {
                  if (!isMulti) {
                    setValue?.(pressed ? [opt.value] : []);
                    return;
                  }
                  const next = pressed
                    ? active
                      ? selected
                      : [...selected, opt.value]
                    : selected.filter((v) => v !== opt.value);
                  setValue?.(next);
                }}
              />
            );
          })}
        </HStack>
        {errorMessage ? (
          <Text type="supporting" color="secondary" display="block">
            {errorMessage}
          </Text>
        ) : null}
      </VStack>
    );
  }

  if (!isMulti && (filterable || safeOptions.length > 6)) {
    return (
      <Selector
        label={groupLabel || 'Choose an option'}
        options={safeOptions}
        value={selected[0]}
        onChange={(val) => setValue?.([val])}
        hasSearch={Boolean(filterable)}
        presentation="adaptive"
        width="100%"
        status={status}
      />
    );
  }

  if (!isMulti) {
    return (
      <RadioList
        label={groupLabel || 'Choose an option'}
        value={selected[0] ?? ''}
        onChange={(val) => setValue?.([val])}
        width="100%"
        status={status}
      >
        {safeOptions.map((opt) => (
          <RadioListItem key={opt.value} value={opt.value} label={opt.label} />
        ))}
      </RadioList>
    );
  }

  return (
    <CheckboxList
      label={groupLabel || 'Select options'}
      value={selected}
      onChange={(vals) => setValue?.(vals)}
      width="100%"
      status={status}
    >
      {safeOptions.map((opt) => (
        <CheckboxListItem key={opt.value} value={opt.value} label={opt.label} />
      ))}
    </CheckboxList>
  );
}

function AstryxSliderView({
  label,
  min,
  max,
  steps,
  value,
  isValid,
  validationErrors,
  setValue,
}: {
  label?: unknown;
  min?: unknown;
  max?: unknown;
  steps?: unknown;
  value?: unknown;
  isValid?: boolean;
  validationErrors?: string[];
  setValue?: (next: number) => void;
}) {
  const minVal = typeof min === 'number' && Number.isFinite(min) ? min : 0;
  const rawMax = typeof max === 'number' && Number.isFinite(max) ? max : 100;
  const maxVal = rawMax > minVal ? rawMax : minVal + 1;
  const step =
    typeof steps === 'number' && Number.isFinite(steps) && steps > 0
      ? (maxVal - minVal) / steps
      : 1;
  const rawNum = typeof value === 'number' && Number.isFinite(value) ? value : minVal;
  const clamped = Math.min(maxVal, Math.max(minVal, rawNum));
  const errorMessage = resolveFirstError(isValid, validationErrors);

  return (
    <Slider
      label={String(label ?? '').trim() || 'Value'}
      min={minVal}
      max={maxVal}
      step={step}
      value={clamped}
      onChange={(next: number) => setValue?.(next)}
      valueDisplay="text"
      width="100%"
      status={errorMessage ? { type: 'error', message: errorMessage } : undefined}
    />
  );
}

type DateFieldVal = Parameters<typeof DateInput>[0]['value'];
type TimeFieldVal = Parameters<typeof TimeInput>[0]['value'];
type DateTimeFieldVal = Parameters<typeof DateTimeInput>[0]['value'];

function AstryxDateTimeInputView({
  label,
  value,
  min,
  max,
  enableDate,
  enableTime,
  isValid,
  validationErrors,
  setValue,
}: {
  label?: unknown;
  value?: unknown;
  min?: unknown;
  max?: unknown;
  enableDate?: boolean;
  enableTime?: boolean;
  isValid?: boolean;
  validationErrors?: string[];
  setValue?: (next: string) => void;
}) {
  const fieldLabel = String(label ?? '').trim() || 'Date & Time';
  const raw = String(value ?? '').trim();
  const minStr = String(min ?? '').trim();
  const maxStr = String(max ?? '').trim();
  const errorMessage = resolveFirstError(isValid, validationErrors);
  const status = errorMessage
    ? { type: 'error' as const, message: errorMessage }
    : undefined;

  if (enableDate && enableTime) {
    const dtVal = (ISO_DATETIME_REGEX.test(raw) ? raw : undefined) as DateTimeFieldVal;
    const dtMin = (ISO_DATETIME_REGEX.test(minStr) ? minStr : undefined) as DateTimeFieldVal;
    const dtMax = (ISO_DATETIME_REGEX.test(maxStr) ? maxStr : undefined) as DateTimeFieldVal;
    return (
      <DateTimeInput
        label={fieldLabel}
        value={dtVal}
        min={dtMin}
        max={dtMax}
        onChange={(next) => setValue?.(next ?? '')}
        width="100%"
        status={status}
      />
    );
  }

  if (enableTime && !enableDate) {
    const timeVal = (ISO_TIME_REGEX.test(raw) ? raw : undefined) as TimeFieldVal;
    const timeMin = (ISO_TIME_REGEX.test(minStr) ? minStr : undefined) as TimeFieldVal;
    const timeMax = (ISO_TIME_REGEX.test(maxStr) ? maxStr : undefined) as TimeFieldVal;
    return (
      <TimeInput
        label={fieldLabel}
        value={timeVal}
        min={timeMin}
        max={timeMax}
        onChange={(next) => setValue?.(next ?? '')}
        width="100%"
        status={status}
      />
    );
  }

  const dateVal = (ISO_DATE_REGEX.test(raw) ? raw : undefined) as DateFieldVal;
  const dateMin = (ISO_DATE_REGEX.test(minStr) ? minStr : undefined) as DateFieldVal;
  const dateMax = (ISO_DATE_REGEX.test(maxStr) ? maxStr : undefined) as DateFieldVal;
  return (
    <DateInput
      label={fieldLabel}
      value={dateVal}
      min={dateMin}
      max={dateMax}
      onChange={(next) => setValue?.(next ?? '')}
      width="100%"
      status={status}
    />
  );
}

const v1Components: ReactCatalogComponent[] = [
  createComponentImplementation(V1TextApi, ({ props }) => (
    <AstryxTextView text={props.text} variant={props.variant} />
  )),
  createComponentImplementation(V1ImageApi, ({ props }) => (
    <AstryxImageView
      url={props.url}
      description={props.description}
      accessibilityLabel={props.accessibility?.label}
    />
  )),
  createComponentImplementation(V1IconApi, ({ props }) => (
    <AstryxIconView name={props.name} />
  )),
  createComponentImplementation(V1VideoApi, ({ props }) => (
    <AstryxMediaView url={props.url} kindLabel="Video" />
  )),
  createComponentImplementation(V1AudioPlayerApi, ({ props }) => (
    <AstryxMediaView
      url={props.url}
      description={props.description}
      kindLabel="Audio"
    />
  )),
  createComponentImplementation(V1RowApi, ({ props, buildChild }) => (
    <AstryxRowView
      childrenProp={props.children}
      justify={props.justify}
      align={props.align}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V1ColumnApi, ({ props, buildChild }) => (
    <AstryxColumnView
      childrenProp={props.children}
      justify={props.justify}
      align={props.align}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V1ListApi, ({ props, buildChild }) => (
    <AstryxListView
      childrenProp={props.children}
      direction={props.direction}
      align={props.align}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V1CardApi, ({ props, buildChild }) => (
    <AstryxCardView childId={props.child} buildChild={buildChild} />
  )),
  createComponentImplementation(V1TabsApi, ({ props, buildChild }) => (
    <AstryxTabsView tabs={props.tabs} buildChild={buildChild} />
  )),
  createComponentImplementation(V1ModalApi, ({ props, buildChild }) => (
    <AstryxModalView
      triggerId={props.trigger}
      contentId={props.content}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V1DividerApi, ({ props }) => (
    <Divider orientation={props.axis === 'vertical' ? 'vertical' : 'horizontal'} />
  )),
  createComponentImplementation(V1ButtonApi, ({ props, buildChild }) => (
    <AstryxButtonView
      childId={props.child}
      variant={props.variant}
      action={props.action}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      accessibilityLabel={props.accessibility?.label}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V1TextFieldApi, ({ props }) => (
    <AstryxTextFieldView
      label={props.label}
      value={props.value}
      placeholder={props.placeholder}
      variant={props.variant}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
  createComponentImplementation(V1CheckBoxApi, ({ props }) => (
    <AstryxCheckBoxView
      label={props.label}
      value={props.value}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
  createComponentImplementation(V1ChoicePickerApi, ({ props }) => (
    <AstryxChoicePickerView
      label={props.label}
      options={props.options}
      value={props.value}
      variant={props.variant}
      displayStyle={props.displayStyle}
      filterable={props.filterable}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
  createComponentImplementation(V1SliderApi, ({ props }) => (
    <AstryxSliderView
      label={props.label}
      min={props.min}
      max={props.max}
      steps={props.steps}
      value={props.value}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
  createComponentImplementation(V1DateTimeInputApi, ({ props }) => (
    <AstryxDateTimeInputView
      label={props.label}
      value={props.value}
      min={props.min}
      max={props.max}
      enableDate={props.enableDate}
      enableTime={props.enableTime}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
];

const v09Components: ReactCatalogComponent[] = [
  createComponentImplementation(V09TextApi, ({ props }) => (
    <AstryxTextView text={props.text} variant={props.variant} />
  )),
  createComponentImplementation(V09ImageApi, ({ props }) => (
    <AstryxImageView
      url={props.url}
      description={props.description}
      accessibilityLabel={props.accessibility?.label}
    />
  )),
  createComponentImplementation(V09IconApi, ({ props }) => (
    <AstryxIconView name={props.name} />
  )),
  createComponentImplementation(V09VideoApi, ({ props }) => (
    <AstryxMediaView url={props.url} kindLabel="Video" />
  )),
  createComponentImplementation(V09AudioPlayerApi, ({ props }) => (
    <AstryxMediaView
      url={props.url}
      description={props.description}
      kindLabel="Audio"
    />
  )),
  createComponentImplementation(V09RowApi, ({ props, buildChild }) => (
    <AstryxRowView
      childrenProp={props.children}
      justify={props.justify}
      align={props.align}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V09ColumnApi, ({ props, buildChild }) => (
    <AstryxColumnView
      childrenProp={props.children}
      justify={props.justify}
      align={props.align}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V09ListApi, ({ props, buildChild }) => (
    <AstryxListView
      childrenProp={props.children}
      direction={props.direction}
      align={props.align}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V09CardApi, ({ props, buildChild }) => (
    <AstryxCardView childId={props.child} buildChild={buildChild} />
  )),
  createComponentImplementation(V09TabsApi, ({ props, buildChild }) => (
    <AstryxTabsView tabs={props.tabs} buildChild={buildChild} />
  )),
  createComponentImplementation(V09ModalApi, ({ props, buildChild }) => (
    <AstryxModalView
      triggerId={props.trigger}
      contentId={props.content}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V09DividerApi, ({ props }) => (
    <Divider orientation={props.axis === 'vertical' ? 'vertical' : 'horizontal'} />
  )),
  createComponentImplementation(V09ButtonApi, ({ props, buildChild }) => (
    <AstryxButtonView
      childId={props.child}
      variant={props.variant}
      action={props.action}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      accessibilityLabel={props.accessibility?.label}
      buildChild={buildChild}
    />
  )),
  createComponentImplementation(V09TextFieldApi, ({ props }) => (
    <AstryxTextFieldView
      label={props.label}
      value={props.value}
      variant={props.variant}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
  createComponentImplementation(V09CheckBoxApi, ({ props }) => (
    <AstryxCheckBoxView
      label={props.label}
      value={props.value}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
  createComponentImplementation(V09ChoicePickerApi, ({ props }) => (
    <AstryxChoicePickerView
      label={props.label}
      options={props.options}
      value={props.value}
      variant={props.variant}
      displayStyle={props.displayStyle}
      filterable={props.filterable}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
  createComponentImplementation(V09SliderApi, ({ props }) => (
    <AstryxSliderView
      label={props.label}
      min={props.min}
      max={props.max}
      value={props.value}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
  createComponentImplementation(V09DateTimeInputApi, ({ props }) => (
    <AstryxDateTimeInputView
      label={props.label}
      value={props.value}
      min={props.min}
      max={props.max}
      enableDate={props.enableDate}
      enableTime={props.enableTime}
      isValid={props.isValid}
      validationErrors={props.validationErrors}
      setValue={props.setValue}
    />
  )),
];

export const v1AstryxCatalog = new Catalog<ReactCatalogComponent>(
  v1BasicCatalog.id,
  v1BasicCatalog.protocolVersion,
  v1Components,
  V1_BASIC_FUNCTIONS,
  {
    themeSchema: v1BasicCatalog.themeSchema,
    defs: v1BasicCatalog.defs ? { ...v1BasicCatalog.defs } : undefined,
    defModels: v1BasicCatalog.defModels,
    declaredProtocolVersion: v1BasicCatalog.declaredProtocolVersion,
    declaresCatalogId: v1BasicCatalog.declaresCatalogId,
    declaresComponents: v1BasicCatalog.declaresComponents,
    unions: v1BasicCatalog.unions,
    commonTypesUri: v1BasicCatalog.commonTypesUri,
    functionsLayout: v1BasicCatalog.functionsLayout,
    themeLocation: v1BasicCatalog.themeLocation,
  },
);

export const v09AstryxCatalog = new Catalog<ReactCatalogComponent>(
  v09BasicCatalog.id,
  v09BasicCatalog.protocolVersion,
  v09Components,
  V09_BASIC_FUNCTIONS,
  {
    themeSchema: v09BasicCatalog.themeSchema,
    defs: v09BasicCatalog.defs ? { ...v09BasicCatalog.defs } : undefined,
    defModels: v09BasicCatalog.defModels,
    declaredProtocolVersion: v09BasicCatalog.declaredProtocolVersion,
    declaresCatalogId: v09BasicCatalog.declaresCatalogId,
    declaresComponents: v09BasicCatalog.declaresComponents,
    unions: v09BasicCatalog.unions,
    commonTypesUri: v09BasicCatalog.commonTypesUri,
    functionsLayout: v09BasicCatalog.functionsLayout,
    themeLocation: v09BasicCatalog.themeLocation,
  },
);

export const astryxCatalogs = [v1AstryxCatalog, v09AstryxCatalog];
