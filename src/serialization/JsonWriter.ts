import type { MapEntry } from "../collections/AbstractMap.js";
import { JsonBindException } from "../exceptions/JsonBindException.js";
import type { Optional } from "../fundamentals/Optional.js";
import type { JsonReader } from "./JsonReader.js";
import type { Serializable } from "./Serializable.js";

/**
 * Everything `JSON.stringify` can write without losing anything: the four scalars, `null`, and arrays and
 * objects of the same.
 *
 * `undefined` is deliberately not among them. It is the value `JSON.stringify` silently drops a key for, and a
 * writer that could return one would be able to erase a field on the way out — which is the failure this whole
 * module exists to make impossible.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * The write direction of a wire contract: what {@link JsonReader} is for parsing, and the half that closes it.
 *
 * {@link Serializable} already writes this library's own types — `JSON.stringify(list)` gives `[1,2,3]` — but
 * `toJSON` belongs to the *value*, not to the contract, and there are three things it therefore cannot do. It
 * cannot write a type it was not built into: {@link mapping} reads `{x, y}` into a `Point`, and until there was
 * a writer nothing could send one back. It cannot spell a field differently from the property behind it. And it
 * cannot refuse anything, because by the time it runs the encoding is already decided.
 *
 * That last one matters most, because `JSON.stringify` fails quietly in exactly the two places a wire contract
 * is least able to afford it: `undefined` in a field drops the key, and `NaN` and the infinities become `null`.
 * Both produce a document that parses. A `JsonWriter<T>` refuses both and names the slot, the same way the
 * reader refuses a document that does not match.
 *
 * The contract mirrors the reading one line for line:
 *
 * ```ts
 * interface Order { id: string; total: number; note: Optional<string>; }
 *
 * const order: JsonWriter<Order> = objectFrom<Order>({
 *   id: stringAsJson,
 *   total: numberAsJson,
 *   note: optionalAsJson(stringAsJson),
 * });
 *
 * writeJson(value, arrayFrom(order));
 * ```
 *
 * Every writer here produces the shape the matching reader reads and the matching `toJSON` writes, so the three
 * agree: what this sends, `readJson` reads back as an equal value, and a document assembled by
 * `JSON.stringify` is one a contract could have written.
 */
export interface JsonWriter<T> {
  /**
   * @param value the value to write
   * @param path where this value sits in the document. Supplied by the composing writers; callers writing a
   *   whole document can leave it alone and get `$`.
   * @throws {@link JsonBindException} if the value has no JSON representation
   */
  write(value: T, path?: string): JsonValue;
}

/** A writer per property of `T`, which is what {@link objectFrom} needs to build one. */
export type JsonProperties<T> = {
  readonly [K in keyof T]: JsonWriter<T[K]>;
};

/** The same path notation the readers build up, so a failure reads the same whichever direction it came from. */
const ROOT = "$";

/**
 * A string as it stands.
 *
 * A union of string literals needs nothing more than this — a `"PENDING" | "SHIPPED"` *is* a `string`, and so
 * writes as one. That is why there is no counterpart to `enumOf`: the reader has to check because it is handed
 * `unknown`, and here the type has already done it.
 */
export const stringAsJson: JsonWriter<string> = {
  write(value: string): JsonValue {
    return value;
  },
};

/**
 * Java's numeric types, which JSON does not distinguish between.
 *
 * `NaN` and the infinities are refused rather than written. JSON has no way to spell them, and
 * `JSON.stringify` resolves that by writing `null` — so the document parses, the reader sees an absent value,
 * and a number that was wrong at the source arrives as a number that was never sent. The mirror of
 * {@link numberValue} refusing them on the way in.
 */
export const numberAsJson: JsonWriter<number> = {
  write(value: number, path: string = ROOT): JsonValue {
    if (!Number.isFinite(value)) {
      throw new JsonBindException(path, `${String(value)} cannot be written as a number`);
    }
    return value;
  },
};

/**
 * Java's `int` and `long`.
 *
 * Refuses anything JavaScript was not holding exactly, which is a shade stricter than {@link integerValue} is
 * on the way in. A reader has to take the number the document contains; a writer still has the original, and
 * `9007199254740993` written out becomes `9007199254740992` — a value the receiver would read back as an
 * integer, just not the one that was meant. Better to fail at the slot than to send a different number.
 */
export const integerAsJson: JsonWriter<number> = {
  write(value: number, path: string = ROOT): JsonValue {
    if (!Number.isSafeInteger(value)) {
      throw new JsonBindException(path, `${String(value)} is not an integer that can be written exactly`);
    }
    return value;
  },
};

export const booleanAsJson: JsonWriter<boolean> = {
  write(value: boolean): JsonValue {
    return value;
  },
};

/**
 * A value that is already JSON, written as it stands — the mirror of {@link unknownValue}, and the honest way
 * to say a slot is not part of the contract.
 *
 * The type is {@link JsonValue} rather than `unknown` because that is the difference between a passthrough and
 * a hole: whatever goes in has to be something JSON can carry, and saying so is a decision the caller makes
 * once rather than a check this postpones. It is still the one writer that inspects nothing, so a `NaN` buried
 * inside a tree handed to it reaches `JSON.stringify` and becomes `null` there.
 */
export const rawJson: JsonWriter<JsonValue> = {
  write(value: JsonValue): JsonValue {
    return value;
  },
};

/**
 * Takes a value apart and then writes it — the hinge between the type a caller holds and its wire shape, and
 * the inverse of {@link mapping}.
 *
 * This is how a DTO class is written, rather than {@link objectFrom} knowing about its fields:
 *
 * ```ts
 * const point = mappingAsJson(objectFrom({ x: numberAsJson, y: numberAsJson }), (p: Point) => ({ x: p.x, y: p.y }));
 * ```
 *
 * Paired with the `mapping` that reads it, a type of your own crosses the wire in both directions without ever
 * having to implement `toJSON`.
 */
export function mappingAsJson<T, R>(writer: JsonWriter<T>, transform: (value: R) => T): JsonWriter<R> {
  return {
    write(value: R, path: string = ROOT): JsonValue {
      return writer.write(transform(value), path);
    },
  };
}

/**
 * Writes `null` as `null`, and anything else with the wrapped writer.
 *
 * The mirror of {@link nullable}. For the absence that {@link Optional} models, see {@link optionalAsJson} —
 * the two produce the same `null` on the wire and differ in what the caller is holding.
 */
export function nullableAsJson<T>(writer: JsonWriter<T>): JsonWriter<T | null> {
  return {
    write(value: T | null, path: string = ROOT): JsonValue {
      return value === null ? null : writer.write(value, path);
    },
  };
}

/**
 * Java's `Optional`, in the shape `Optional.toJSON` writes: the value itself, or `null`.
 *
 * The key stays on the object when the `Optional` is empty. Jackson's `Jdk8Module` can be configured to drop
 * it instead, and this deliberately does not: `null` says "there is no nickname", a missing key says "nicknames
 * were never mentioned", and only one of those is what an empty `Optional` means. The reader folds both back to
 * empty, so dropping the key would still round-trip — it would just say less.
 */
export function optionalAsJson<T>(writer: JsonWriter<T>): JsonWriter<Optional<T>> {
  return {
    write(value: Optional<T>, path: string = ROOT): JsonValue {
      return value.isPresent() ? writer.write(value.get(), path) : null;
    },
  };
}

/**
 * A JSON array, from anything iterable.
 *
 * One writer where the reading side has four. `arrayOf`, `listOf`, `setOf` and `treeSetOf` differ in what they
 * build out of a JSON array, and nothing distinguishes them on the way back: a {@link List}, a `JavaSet`, a
 * `TreeSet` and a plain array all write as the array of their elements, which is what each of their `toJSON`
 * methods already produces. Each element gets its own path — `$.lines[2]` — so a failure names the one that
 * could not be written rather than the collection holding it.
 */
export function arrayFrom<T>(element: JsonWriter<T>): JsonWriter<Iterable<T>> {
  return {
    write(values: Iterable<T>, path: string = ROOT): JsonValue {
      const items: JsonValue[] = [];
      let index = 0;
      for (const value of values) {
        items.push(element.write(value, `${path}[${index}]`));
        index++;
      }
      return items;
    },
  };
}

/** A {@link MapEntry} as the `{ key, value }` object its `toJSON` writes, which is what {@link entryOf} reads. */
export function entryFrom<K, V>(key: JsonWriter<K>, value: JsonWriter<V>): JsonWriter<MapEntry<K, V>> {
  return {
    write(entry: MapEntry<K, V>, path: string = ROOT): JsonValue {
      return {
        key: key.write(entry.getKey(), `${path}.key`),
        value: value.write(entry.getValue(), `${path}.value`),
      };
    },
  };
}

/**
 * A map as the array of `[key, value]` pairs its `toJSON` writes, and {@link mapOf} reads.
 *
 * Pairs rather than a JSON object because a map here may be keyed on anything — numbers, nulls, whole
 * `JavaObject`s — and JSON object keys can only be strings. {@link mapAsObject} is the other shape, for a map
 * that is keyed on strings and is crossing to something expecting Jackson's.
 *
 * Any iterable of pairs will do, so this covers `JavaMap` and `TreeMap` both, along with a plain JavaScript
 * `Map` and the array of pairs a caller happened to have.
 */
export function mapFrom<K, V>(key: JsonWriter<K>, value: JsonWriter<V>): JsonWriter<Iterable<readonly [K, V]>> {
  return {
    write(entries: Iterable<readonly [K, V]>, path: string = ROOT): JsonValue {
      const pairs: JsonValue[] = [];
      let index = 0;
      for (const [held, mapped] of entries) {
        const at = `${path}[${index}]`;
        pairs.push([key.write(held, `${at}[0]`), value.write(mapped, `${at}[1]`)]);
        index++;
      }
      return pairs;
    },
  };
}

/**
 * A string-keyed map as a JSON object — what Jackson emits for a Java `Map<String, V>`, and therefore what a
 * Spring endpoint most often expects to be sent.
 *
 * The counterpart to {@link mapFrom}, and what {@link objectAsMap} reads. Only string keys are reachable this
 * way, which is the limitation that made the pair form the default.
 *
 * A key repeating — possible from a hand-rolled iterable, though not from a map — keeps the last of them,
 * because that is the entry a reader would end up with anyway.
 */
export function mapAsObject<V>(value: JsonWriter<V>): JsonWriter<Iterable<readonly [string, V]>> {
  return {
    write(entries: Iterable<readonly [string, V]>, path: string = ROOT): JsonValue {
      const written: [string, JsonValue][] = [];
      for (const [key, held] of entries) {
        written.push([key, value.write(held, `${path}.${key}`)]);
      }
      // `fromEntries` rather than assigning into a literal: these keys are data, and `result["__proto__"] = x`
      // sets the prototype instead of adding a property. Assembling from pairs defines every one of them.
      return Object.fromEntries(written);
    },
  };
}

/**
 * A DTO: one writer per property, assembled into a JSON object.
 *
 * ```ts
 * const user = objectFrom<User>({ id: integerAsJson, email: stringAsJson, nickname: optionalAsJson(stringAsJson) });
 * ```
 *
 * Every property is written, in the order the contract declares them. A property that is absent at runtime is
 * refused rather than passed to its writer — the mirror of a missing key being refused on the way in, and the
 * one case where a `T` can lie: a value cast from `JSON.parse`, or one that came from a version of the type
 * without the field. `JSON.stringify` would drop the key and produce a document the reader then rejects, at
 * the far end and against the wrong party. Optionality is stated with {@link optionalAsJson}, the same way it
 * is stated with `optionalValue` when reading.
 *
 * Pass the source type explicitly — `objectFrom<User>({...})` — so a property the contract forgets is a
 * compile error rather than a field quietly missing from everything this sends. A property declared optional —
 * `note?: string` — is the exception: {@link JsonProperties} keeps the `?`, so such a property may be left out
 * of the contract, and is then never written.
 */
export function objectFrom<T extends object>(properties: JsonProperties<T>): JsonWriter<T> {
  // The same widening objectOf does, for the same reason: JsonProperties<T> is a mapped type over an
  // unresolved T, which nothing built in describes as an ordinary record. Each writer is handed back exactly
  // the property it was declared against, so the cast is sound.
  const widened = properties as unknown as Readonly<Record<string, JsonWriter<unknown>>>;
  const writers: readonly (readonly [string, JsonWriter<unknown>])[] = Object.entries(widened);
  return {
    write(value: T, path: string = ROOT): JsonValue {
      const source = value as unknown as Readonly<Record<string, unknown>>;
      const written: [string, JsonValue][] = [];
      for (const [property, writer] of writers) {
        const at = `${path}.${property}`;
        const held = source[property];
        if (held === undefined) {
          throw new JsonBindException(at, "expected a value, got nothing");
        }
        written.push([property, writer.write(held, at)]);
      }
      return Object.fromEntries(written);
    },
  };
}

/**
 * Writes a value out as a JSON document.
 *
 * The mirror of `readJson`, and the same contract read backwards: whatever this produces, `JSON.parse` accepts
 * and the matching reader reads back as an equal value.
 *
 * ```ts
 * writeJson(value, order);          // {"id":"A-1","total":19.99,"note":null}
 * writeJson(value, order, "  ");    // the same document, indented
 * ```
 *
 * For the tree rather than the text of it — to nest it in a document being assembled by hand, or to look at
 * what a contract produces — call `order.write(value)` and keep the {@link JsonValue}.
 *
 * @param indent what to indent one level of nesting with, as `JSON.stringify` takes it: a string, or a number
 *   of spaces. Left out, the document is a single line.
 * @throws {@link JsonBindException} if some value has no JSON representation, naming the slot
 */
export function writeJson<T>(value: T, writer: JsonWriter<T>, indent?: string | number): string {
  return JSON.stringify(writer.write(value, ROOT), null, indent);
}
