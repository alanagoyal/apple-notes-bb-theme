import type { BbPluginApi } from '@get-bb/plugin-sdk';
import {ARCHIVED_CHANNEL} from './archive-navigation';

export default function appleNotes(bb: BbPluginApi) {
  bb.events.on('thread.archived', ({thread}) => {
    bb.realtime.publish(ARCHIVED_CHANNEL, {threadId: thread.id});
  });
}
