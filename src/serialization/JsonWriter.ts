import type { MapEntry } from "../collections/AbstractMap.js";
import { JsonBindException } from "../exceptions/JsonBindException.js";
import type { Optional } from "../fundamentals/Optional.js";
import { describe, withoutCycles } from "./Binding.js";
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
 * `JSON.stringify` is one a contract could have written. That includes the shapes where a key is simply not
 * there, which {@link omitWhenEmpty} writes and `optionalValue` has always read.
 *
 * The `in` says what a writer is: something that consumes a `T`, so a writer accepting *more* stands in for one
 * accepting less and never the other way round. Without it TypeScript compares two writers using the bivariance
 * it grants every method, and `JsonWriter<string>` would satisfy `JsonWriter<string | undefined>` — which is how
 * a contract for `note?: string` could be built out of `stringAsJson` and then refuse the absence the `?`
 * promised. {@link JsonProperties} is where that happens, and the annotation is what turns it into the compile
 * error it should always have been.
 */
export interface JsonWriter<in T> {
  /**
   * @param value the value to write
   * @param path where this value sits in the document. Supplied by the composing writers; callers writing a
   *   whole document can leave it alone and get `$`.
   * @throws {@link JsonBindException} if the value has no JSON representation
   */
  write(value: T, path?: string): JsonValue;
}

/**
 * A property that may write no key at all, rather than a value for one — what {@link omitWhenEmpty} builds, and
 * the only thing in this module that can leave a key off.
 *
 * Deliberately not a {@link JsonWriter}. A writer always produces a value, and absence is not one: there is no
 * `JsonValue` meaning "nothing", which is why omission needs a second kind of property rather than a fourteenth
 * writer. Keeping the two apart is also what makes `arrayFrom(omitWhenEmpty(stringAsJson))` a compile error —
 * an array element that writes nothing would shift every index after it, and there is nowhere else in a
 * document that a value can simply not be.
 *
 * Contravariant in `T` for the reason {@link JsonWriter} is: this consumes a value too.
 */
export interface OmittedWhenEmpty<in T> {
  /**
   * @param value the value to write
   * @param path where this value sits in the document, supplied by {@link objectFrom}
   * @returns the value's JSON form, or `undefined` for "leave the key off entirely". The one place in this
   *   module where `undefined` means something, and it never reaches a {@link JsonValue}.
   * @throws {@link JsonBindException} if the value is there and has no JSON representation
   */
  writeOrOmit(value: T, path: string): JsonValue | undefined;
}

/**
 * A property writer per property of `T`, which is what {@link objectFrom} needs to build one.
 *
 * Either kind will do: an ordinary {@link JsonWriter}, which always writes its key, or an
 * {@link OmittedWhenEmpty}, which may leave it off.
 */
export type JsonProperties<T> = {
  readonly [K in keyof T]: JsonWriter<T[K]> | OmittedWhenEmpty<T[K]>;
};

/** The same path notation the readers build up, so a failure reads the same whichever direction it came from. */
const ROOT = "$";

/** The failure a value that contains itself produces, at the slot where the loop closes. */
function cycle(path: string): never {
  throw new JsonBindException(path, "a value contains itself, and a JSON document is a tree");
}

/**
 * The scalars check the type they were promised before writing it, the same way the readers check the one a
 * document turned out to hold.
 *
 * The type system has already said this is a `string`, so at first glance the check is redundant — but a `T`
 * arriving here can lie, which is the premise {@link objectFrom} already refuses an absent property on. The
 * same cast from `JSON.parse` that loses a field puts a number where a string was promised, and this layer is
 * the last thing that runs before the value leaves the process. Left unchecked, `stringAsJson` would write the
 * number, producing a document its own reader rejects at the far end and against the wrong party.
 */
function requireType(value: unknown, expected: "string" | "number" | "boolean", path: string): void {
  if (typeof value !== expected) {
    throw new JsonBindException(path, `expected a ${expected}, got ${describe(value)}`);
  }
}

/**
 * A string as it stands.
 *
 * A union of string literals needs nothing more than this — a `"PENDING" | "SHIPPED"` *is* a `string`, and so
 * writes as one. That is why there is no counterpart to `enumOf`: the reader has to check the set of values
 * because it is handed `unknown`, and here the type has already narrowed it to one of them.
 */
export const stringAsJson: JsonWriter<string> = {
  write(value: string, path: string = ROOT): JsonValue {
    requireType(value, "string", path);
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
    requireType(value, "number", path);
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
    requireType(value, "number", path);
    if (!Number.isSafeInteger(value)) {
      throw new JsonBindException(path, `${String(value)} is not an integer that can be written exactly`);
    }
    return value;
  },
};

export const booleanAsJson: JsonWriter<boolean> = {
  write(value: boolean, path: string = ROOT): JsonValue {
    requireType(value, "boolean", path);
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
 * The other choice {@link optionalAsJson} makes: an empty `Optional` leaves the key off the object entirely,
 * rather than writing `null` for it. Only {@link objectFrom} accepts one — a key is the only thing a document
 * has that can be absent.
 *
 * `null` and a missing key say different things, which is why both are worth being able to write. The case that
 * makes it more than a matter of taste is JSON Merge Patch, where they say *opposite* things: a `null` in a
 * PATCH body means delete this field, and a missing key means leave it as it is. Wrapping
 * {@link optionalAsJson} gives all three states without anything further:
 *
 * ```ts
 * interface Patch { note: Optional<Optional<string>>; }
 *
 * const patch = objectFrom<Patch>({ note: omitWhenEmpty(optionalAsJson(stringAsJson)) });
 *
 * Optional.of(Optional.of("gift wrap"))   // {"note":"gift wrap"}   set it
 * Optional.of(Optional.empty<string>())   // {"note":null}          delete it
 * Optional.empty()                        // {}                     leave it alone
 * ```
 *
 * The nesting is the point rather than an accident of the types: a merge patch asks two questions in order, and
 * each `Optional` answers one of them. `Optional<string | null>` cannot stand in for it — `Optional.of(null)`
 * throws and `Optional.ofNullable(null)` is empty, so a present null is a value this `Optional` will not hold,
 * exactly as Java's will not.
 *
 * The reader needs no counterpart: `optionalValue` already folds a missing key back to an empty `Optional`, so
 * whichever of the two a contract writes, it reads back the same.
 */
export function omitWhenEmpty<T>(writer: JsonWriter<T>): OmittedWhenEmpty<Optional<T>> {
  return {
    writeOrOmit(value: Optional<T>, path: string): JsonValue | undefined {
      return value.isPresent() ? writer.write(value.get(), path) : undefined;
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
      return withoutCycles(values, () => cycle(path), () => {
        const items: JsonValue[] = [];
        let index = 0;
        for (const value of values) {
          items.push(element.write(value, `${path}[${index}]`));
          index++;
        }
        return items;
      });
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
      return withoutCycles(entries, () => cycle(path), () => {
        const pairs: JsonValue[] = [];
        let index = 0;
        for (const [held, mapped] of entries) {
          const at = `${path}[${index}]`;
          pairs.push([key.write(held, `${at}[0]`), value.write(mapped, `${at}[1]`)]);
          index++;
        }
        return pairs;
      });
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
 *
 * The keys are checked to be strings, for the reason the scalar writers check the type they were promised: a
 * `JavaMap<number, V>` cast to this one is the ordinary way a key of another type arrives, and JavaScript would
 * otherwise turn it into a property name without comment — sending `{"7":…}`, which the reader gives back as
 * the string `"7"`.
 */
export function mapAsObject<V>(value: JsonWriter<V>): JsonWriter<Iterable<readonly [string, V]>> {
  return {
    write(entries: Iterable<readonly [string, V]>, path: string = ROOT): JsonValue {
      return withoutCycles(entries, () => cycle(path), () => {
        const written: [string, JsonValue][] = [];
        for (const [key, held] of entries) {
          if (typeof key !== "string") {
            // Before the path is built rather than after: a symbol in a template literal throws a bare
            // TypeError, which would leave this the one slot that fails as something other than a bind failure.
            throw new JsonBindException(path, `expected a string key, got ${describe(key)}`);
          }
          written.push([key, value.write(held, `${path}.${key}`)]);
        }
        // `fromEntries` rather than assigning into a literal: these keys are data, and `result["__proto__"] = x`
        // sets the prototype instead of adding a property. Assembling from pairs defines every one of them.
        return Object.fromEntries(written);
      });
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
 * Every property is written, in the order the contract declares them, unless its own writer is an
 * {@link omitWhenEmpty} — the one way a key is left off, and the mirror of `optionalValue` accepting a missing
 * key on the way in.
 *
 * A property *absent at runtime* is a different thing, and is refused rather than passed to its writer. That is
 * the one case where a `T` can lie: a value cast from `JSON.parse`, or one that came from a version of the type
 * without the field. `JSON.stringify` would drop the key and produce a document the reader then rejects, at the
 * far end and against the wrong party. Absence that is meant is said with {@link optionalAsJson} or
 * {@link omitWhenEmpty}, the same way it is said with `optionalValue` when reading.
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
  type Property = JsonWriter<unknown> | OmittedWhenEmpty<unknown>;
  const widened = properties as unknown as Readonly<Record<string, Property>>;
  const writers: readonly (readonly [string, Property])[] = Object.entries(widened);
  return {
    write(value: T, path: string = ROOT): JsonValue {
      return withoutCycles(value, () => cycle(path), () => {
        const source = value as unknown as Readonly<Record<string, unknown>>;
        const written: [string, JsonValue][] = [];
        for (const [property, writer] of writers) {
          const at = `${path}.${property}`;
          const held = source[property];
          if (held === undefined) {
            throw new JsonBindException(at, "expected a value, got nothing");
          }
          // The two kinds of property tell themselves apart by the method they carry. An omittable one is the
          // only thing that may answer with nothing, and nothing here means the key is left off rather than
          // written as `undefined` — which is not a JsonValue and could not be written anyway.
          if ("writeOrOmit" in writer) {
            const maybe = writer.writeOrOmit(held, at);
            if (maybe !== undefined) {
              written.push([property, maybe]);
            }
          } else {
            written.push([property, writer.write(held, at)]);
          }
        }
        return Object.fromEntries(written);
      });
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
 * The contract names the type, not the value: `T` is read off `writer` alone, so `value` is checked against what
 * the contract says it writes rather than the two meeting somewhere in the middle. Handing this a value the
 * contract does not describe is the mistake, and this is where it should be caught.
 *
 * @param indent what to indent one level of nesting with, as `JSON.stringify` takes it: a string, or a number
 *   of spaces. Left out, the document is a single line.
 * @throws {@link JsonBindException} if some value has no JSON representation, naming the slot
 */
export function writeJson<T>(value: NoInfer<T>, writer: JsonWriter<T>, indent?: string | number): string {
  const document: string | undefined = JSON.stringify(writer.write(value, ROOT), null, indent);
  if (document === undefined) {
    // `JSON.stringify` answers with `undefined` rather than a string for a value it will not write, which no
    // JsonWriter can hand it — the return type says so, and {@link rawJson} is the only writer that does not
    // check. So this is reachable only through a cast, and it is the difference between a caller seeing a
    // failure at the slot and a caller sending the four letters `undefined` over a socket typed `string`.
    throw new JsonBindException(ROOT, "expected a value, got nothing");
  }
  return document;
}
