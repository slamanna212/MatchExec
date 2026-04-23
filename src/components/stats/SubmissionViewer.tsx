'use client'

import { useState } from 'react';
import { Modal, Image, ActionIcon, Tooltip } from '@mantine/core';
import { IconZoomIn } from '@tabler/icons-react';

interface SubmissionViewerProps {
  screenshotUrl: string;
}

export function SubmissionViewer({ screenshotUrl }: SubmissionViewerProps) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Image
        src={screenshotUrl}
        alt="Scorecard screenshot"
        style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, cursor: 'pointer' }}
        onClick={() => setZoomed(true)}
      />
      <Tooltip label="Zoom">
        <ActionIcon
          style={{ position: 'absolute', top: 8, right: 8 }}
          variant="filled"
          onClick={() => setZoomed(true)}
        >
          <IconZoomIn size={16} />
        </ActionIcon>
      </Tooltip>

      <Modal
        opened={zoomed}
        onClose={() => setZoomed(false)}
        size="xl"
        title="Scorecard Screenshot"
      >
        <Image src={screenshotUrl} alt="Scorecard screenshot" style={{ width: '100%' }} />
      </Modal>
    </div>
  );
}
