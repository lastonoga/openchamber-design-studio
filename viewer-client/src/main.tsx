import { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Toolbar } from './Toolbar';
import type { ToolbarBridge } from './toolbar-types';
import './index.css';

function MountedToolbar({ bridge }: { bridge: ToolbarBridge }) {
  const notified = useRef(false);
  useLayoutEffect(() => {
    if (!notified.current) {
      notified.current = true;
      window.__dsToolbarMounted?.();
    }
  }, [bridge]);
  return <Toolbar bridge={bridge} />;
}

const bridge = window.__dsToolbarBridge;
const target = document.getElementById('toolbar-root');
if (!bridge || !target) throw new Error('The toolbar controller and toolbar-root must exist before mounting.');
createRoot(target).render(<MountedToolbar bridge={bridge} />);
