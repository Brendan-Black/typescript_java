import { _Object } from "./Object.js";

/**
 * Runtime detection of the two ways a key class quietly breaks a hash-based collection.
 *
 * Java has the same footguns, but Java also has an IDE that generates `equals` and `hashCode` together and a
 * compiler warning when you write one without the other. There is no such safety net here, and the failure is
 * silent — the key simply cannot be found again, with no error to trace back. So the collections say something.
 *
 * Every warning fires at most once per class, and {@link setHashContractChecks} turns the whole thing off.
 *
 * @module
 */

let enabled = true;

/** classes already examined, so the prototype walk happens once rather than on every insertion */
const CHECKED_CONTRACT = new WeakSet<object>();
/** classes already warned about for long collision chains */
const WARNED_CHAIN = new WeakSet<object>();

/**
 * A collision chain this long means the keys have genuinely identical hash codes — see
 * {@link checkCollisionChain} for why that is worth saying out loud. Java's `TREEIFY_THRESHOLD` is also 8,
 * which is a coincidence of taste rather than of design.
 */
const LONG_CHAIN_THRESHOLD = 8;

/**
 * Turns the contract warnings on or off, process-wide.
 *
 * They default to on. A library writing to the console is normally a bad citizen — and this one deliberately
 * stopped doing it elsewhere — but these fire only when a class is genuinely broken, and at most once each.
 * Silence is the wrong default for a bug that otherwise leaves no trace.
 *
 * @param value false to silence the warnings
 */
export function setHashContractChecks(value: boolean): void {
  enabled = value;
}

/** Whether the contract warnings are currently on. */
export function hashContractChecksEnabled(): boolean {
  return enabled;
}

/** the nearest prototype in the chain that actually declares `key`, or null if nothing does */
function ownerOf(start: object | null, key: string): object | null {
  for (let proto = start; proto !== null; proto = Object.getPrototypeOf(proto)) {
    if (Object.prototype.hasOwnProperty.call(proto, key)) {
      return proto;
    }
  }
  return null;
}

/**
 * Whether a value's class overrides `equals` but leaves `hashCode` as {@link _Object}'s identity-based
 * default — the combination that makes a key unfindable.
 *
 * Overriding both, or neither, is fine. Overriding only `hashCode` is odd but harmless: it can cost a lookup
 * some speed, never a result.
 */
export function overridesEqualsWithoutHashCode(value: unknown): boolean {
  if (!(value instanceof _Object)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return ownerOf(proto, "equals") !== _Object.prototype && ownerOf(proto, "hashCode") === _Object.prototype;
}

/**
 * Warns, once per class, if a key overrides `equals` without overriding `hashCode`.
 *
 * Called on insertion, which is the last moment the problem is still cheap to notice. The prototype walk runs
 * once per class and is then remembered, so the steady-state cost is a single WeakSet lookup.
 */
export function checkHashContract(key: unknown): void {
  if (!enabled || !(key instanceof _Object)) {
    return;
  }
  const proto = Object.getPrototypeOf(key);
  if (CHECKED_CONTRACT.has(proto)) {
    return;
  }
  CHECKED_CONTRACT.add(proto);
  if (!overridesEqualsWithoutHashCode(key)) {
    return;
  }
  console.warn(
    `[typescript-java] ${key.constructor.name} overrides equals() but not hashCode(), so its instances will be ` +
      `bucketed by identity and cannot be found again in a Java.Map or Java.Set. Override hashCode() from the same ` +
      `fields equals() compares — Java.Objects.hash(...) does this in one line. Silence with ` +
      `setHashContractChecks(false).`
  );
}

/**
 * Warns, once per class, when a hash bucket grows past {@link LONG_CHAIN_THRESHOLD}.
 *
 * Java answers a long chain by converting the bucket to a red-black tree. That optimisation does not apply
 * here, and not because it was skipped: Java's buckets are indexed by `hash & (table.length - 1)`, so one
 * bucket holds many *different* hash codes and a tree ordered by hash genuinely separates them. The buckets
 * here are keyed by the full 32-bit hash, so every entry in one already has an *identical* hash code and a tree
 * ordered by hash would be a linked list with extra steps.
 *
 * Which means a long chain here says something Java's does not: the key class is producing colliding hashes for
 * distinct values. That is a fixable problem in the key, not a structure to work around, so it gets a warning
 * rather than a workaround.
 */
export function checkCollisionChain(chainLength: number, key: unknown): void {
  if (!enabled || chainLength <= LONG_CHAIN_THRESHOLD || !(key instanceof _Object)) {
    return;
  }
  const proto = Object.getPrototypeOf(key);
  if (WARNED_CHAIN.has(proto)) {
    return;
  }
  WARNED_CHAIN.add(proto);
  console.warn(
    `[typescript-java] ${chainLength} distinct ${key.constructor.name} keys share one hash code, so every lookup ` +
      `among them is a linear scan. Its hashCode() is not spreading values apart — hashAll(...) over the same ` +
      `fields equals() compares usually fixes this. Silence with setHashContractChecks(false).`
  );
}
