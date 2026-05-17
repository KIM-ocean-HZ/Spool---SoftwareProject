import { useRef } from 'react';
import { useThreadDropTarget } from '@/hooks/useThreadDropTarget';
import BlockFeed from './BlockFeed';
import Composer from './Composer';

interface Props {
  threadId: string;
}

export default function LogView({ threadId }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Wires Finder file/folder drops to either an existing block (hit-tested via
  // data-block-id) or a fresh "anchor" block in empty space. See §9.6.
  useThreadDropTarget({ rootRef, threadId });

  return (
    <div ref={rootRef} className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <BlockFeed threadId={threadId} />
      </div>
      <Composer threadId={threadId} />
    </div>
  );
}
