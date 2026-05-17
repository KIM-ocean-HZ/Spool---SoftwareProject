import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useBlocksStore } from '@/stores/blocksStore';

interface Props {
  threadId: string;
}

export default function Composer({ threadId }: Props) {
  const [value, setValue] = useState('');
  const append = useBlocksStore((s) => s.append);

  const submit = async () => {
    const content = value.trim();
    if (!content) return;
    setValue('');
    await append({ threadId, kind: 'text', content });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="flex-none border-t border-line bg-paper-2/30 px-6 py-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="写一条草稿…（Enter 发送，Shift+Enter 换行）"
        rows={2}
        className="w-full resize-none rounded-md border border-line bg-paper px-3 py-2 text-[15px] leading-[1.6] text-ink outline-none focus:border-line-strong"
        spellCheck={false}
      />
    </div>
  );
}
