import React, { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { A2uiSurface, type ReactCatalogComponent } from '@a2ui/react/v0_9';
import {
  MessageProcessor,
  type ActionPayload,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';
import { getHostBridge } from '../bridge';
import { formatA2uiActionMessage } from './actionFormat';
import { astryxCatalogs } from './astryxCatalog';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  errorMessage: string | null;
}

class A2uiErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      errorMessage:
        error instanceof Error ? error.message : 'Unexpected rendering error',
    };
  }

  override render() {
    if (this.state.errorMessage) {
      return (
        <Banner
          status="error"
          title="Interactive view failed to render"
          description={this.state.errorMessage}
        />
      );
    }
    return this.props.children;
  }
}

export interface A2uiSurfaceCardProps {
  payload: string;
  hostEl: HTMLElement;
}

/**
 * Mounts an isolated A2UI MessageProcessor and renders its Astryx surfaces
 * inside a chat card or overlay host element.
 */
export function A2uiSurfaceCard({ payload, hostEl }: A2uiSurfaceCardProps) {
  const [surfaces, setSurfaces] = useState<SurfaceModel<ReactCatalogComponent>[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [actionFeedback, setActionFeedback] = useState<{
    status: 'idle' | 'sent' | 'error';
    message?: string;
  }>({ status: 'idle' });

  const hostElRef = useRef(hostEl);
  hostElRef.current = hostEl;
  const sendingRef = useRef(false);

  useEffect(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setSurfaces([]);
      setErrors(['Invalid A2UI JSON payload.']);
      return;
    }

    const collectedErrors: string[] = [];
    const processor = new MessageProcessor<ReactCatalogComponent>(
      astryxCatalogs,
      (action: ActionPayload) => {
        if (sendingRef.current) {
          return;
        }
        sendingRef.current = true;
        setTimeout(() => {
          sendingRef.current = false;
        }, 400);

        const message = formatA2uiActionMessage(action);
        const sent =
          getHostBridge()?.sendChatAction?.(message, hostElRef.current) ?? false;
        if (sent) {
          setActionFeedback({
            status: 'sent',
            message: `Sent response (${action.name})`,
          });
        } else {
          setActionFeedback({
            status: 'error',
            message: 'Open the original active chat to send this action.',
          });
        }
      },
      {
        reportErrorsOnly: true,
        errorHandler: (err) => {
          const msg = err?.error?.message;
          if (msg && !collectedErrors.includes(msg)) {
            collectedErrors.push(msg);
          }
        },
      },
    );

    const syncSurfaces = () => {
      setSurfaces(Array.from(processor.getSurfaces().values()));
    };

    const subCreate = processor.onSurfaceCreated(() => {
      syncSurfaces();
    });
    const subDelete = processor.onSurfaceDeleted(() => {
      syncSurfaces();
    });

    const returnedErrors = processor.processMessagesWithErrors(parsed);
    for (const err of returnedErrors) {
      const msg = err?.error?.message;
      if (msg && !collectedErrors.includes(msg)) {
        collectedErrors.push(msg);
      }
    }

    syncSurfaces();
    setErrors(collectedErrors);
    setActionFeedback({ status: 'idle' });

    return () => {
      subCreate.unsubscribe();
      subDelete.unsubscribe();
      processor.dispose();
    };
  }, [payload]);

  return (
    <A2uiErrorBoundary>
      <VStack gap={2} width="100%">
        {surfaces.map((surface) => (
          <A2uiSurface key={surface.id} surface={surface} />
        ))}
        {surfaces.length === 0 && errors.length > 0 ? (
          <Banner
            status="warning"
            title="Interactive view could not be displayed"
            description={errors[0]}
          />
        ) : null}
        {actionFeedback.status === 'sent' && actionFeedback.message ? (
          <Text type="supporting" color="secondary" display="block">
            {actionFeedback.message}
          </Text>
        ) : null}
        {actionFeedback.status === 'error' && actionFeedback.message ? (
          <Banner
            status="warning"
            title="Could not send action"
            description={actionFeedback.message}
          />
        ) : null}
      </VStack>
    </A2uiErrorBoundary>
  );
}
