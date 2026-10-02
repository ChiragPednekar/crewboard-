import { CircleDashed, Lock, LockOpen, PencilLine } from 'lucide-react';

import { Chip } from '@/components/Chips';

import type { AssessmentState } from './api';

export function AssessmentStateChip({ state }: { state: AssessmentState }) {
  switch (state) {
    case 'none':
      return (
        <Chip icon={CircleDashed} className="bg-transparent">
          Not started
        </Chip>
      );
    case 'draft':
      return (
        <Chip icon={PencilLine} className="bg-warning/12 text-warning-text ring-warning/30">
          Draft
        </Chip>
      );
    case 'unlocked':
      return (
        <Chip icon={LockOpen} className="bg-info/12 text-info-text ring-info/25">
          Unlocked for edits
        </Chip>
      );
    default:
      return (
        <Chip icon={Lock} className="bg-success/12 text-success-text ring-success/25">
          Published
        </Chip>
      );
  }
}
