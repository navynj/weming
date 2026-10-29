/**
 * `pnpm id <id>`: a short id to its uuid, a uuid to its short id (H62). The
 * form is told from the input. Node runs it as it is: no `@/` imports.
 */
import { fromShortId, isUuid, toShortId } from '../lib/short-id.ts';

const input = process.argv[2]?.trim() ?? '';
if (isUuid(input)) {
  console.log(toShortId(input));
} else {
  const uuid = fromShortId(input);
  if (!uuid) {
    console.error(`not a uuid or a short id: ${input || '(nothing)'}`);
    process.exit(1);
  }
  console.log(uuid);
}
