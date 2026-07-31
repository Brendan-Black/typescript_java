import { RuntimeException } from "../exceptions/RuntimeException.js";

/**
 * Internal support for reading an array slot that has already been bounds-checked.
 *
 * `noUncheckedIndexedAccess` widens every `array[i]` to `T | undefined`, which is the right default and the
 * wrong answer inside a collection that has just verified the index itself. Nothing here is exported from the
 * package entry point — this is plumbing, not a Java API.
 *
 * @module
 */

/**
 * Reads an element whose index the caller has already validated.
 *
 * The obvious alternatives are both wrong in a way that matters for a general-purpose collection. A non-null
 * assertion (`items[i]!`) lies to the compiler and stays silent when the index really is out of range, handing
 * an `undefined` up a `T`-typed hole to fail somewhere unrelated. A falsiness guard (`items[i] || throw`) fires
 * on `0`, `""`, `false` and `null`, all of which are perfectly legal elements.
 *
 * So this checks the *index* rather than the value: a `List<number | undefined>` holding a genuine
 * `undefined` reads back correctly, and a read that is actually out of range fails immediately, at the line
 * that got it wrong.
 *
 * @param array the array to read
 * @param index the index, expected to already be in range
 * @param context named in the exception message — the caller that got the bounds wrong
 * @throws {@link RuntimeException} if the index is out of range, which means a bug in this library
 */
export function elementAt<T>(array: readonly T[], index: number, context: string): T {
  if (index < 0 || index >= array.length) {
    throw new RuntimeException(
      `${context}: index ${index} is out of range for length ${array.length}. This is a bug in typescript-java.`
    );
  }
  return array[index] as T;
}
