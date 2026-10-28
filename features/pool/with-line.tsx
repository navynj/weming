'use client';

import type { PoolFace } from '@/lib/queries/pools';

import { Switch } from './switch';
import { WithFace } from './with-face';
import { toggleEveryone, toggleFace, type Together } from './pool-pick';

/**
 * With, for my record in one pool (0035): the word, Everyone with its
 * switch at the right (the primary colour when on), then that pool's other
 * members' faces, the only round items. Everyone shows every face picked;
 * deselecting one turns it off; picking every face by hand does not turn it
 * on. The same control as composing in a pool (SHARING-V2 §5).
 */
export function WithLine({
  faces,
  together,
  onChange,
  poolId,
}: {
  /** The pool's current members besides me. */
  faces: PoolFace[];
  together: Together;
  onChange: (together: Together) => void;
  poolId: string;
}) {
  const ids = faces.map((f) => f.id);
  const picked = together.everyone ? ids : together.picked;
  return (
    <div data-audience-with={poolId} className="flex flex-col gap-2">
      <span className="text-pool-500 flex items-center justify-between gap-3 text-xs">
        With
        <label data-audience-everyone className="flex items-center gap-2">
          <span className={together.everyone ? 'text-main-900 font-semibold' : ''}>@everyone</span>
          <Switch
            on={together.everyone}
            label="@everyone"
            size="sm"
            onChange={() => onChange(toggleEveryone(together, ids))}
          />
        </label>
      </span>
      {faces.length > 0 ? (
        <div className="no-scrollbar flex gap-3 overflow-x-auto">
          {faces.map((face) => {
            const on = picked.includes(face.id);
            return (
              <WithFace
                key={face.id}
                id={face.id}
                name={face.name}
                initials={face.initials}
                on={on}
                onToggle={() => onChange(toggleFace(together, face.id, ids))}
                data="audience"
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
