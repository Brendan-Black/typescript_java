import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { JavaMap } from "../src/collections/JavaMap.js";
import { IllegalArgumentException } from "../src/exceptions/IllegalArgumentException.js";
import { NoSuchElementException } from "../src/exceptions/NoSuchElementException.js";
import { NotImplementedException } from "../src/exceptions/NotImplementedException.js";
import { NullPointerException } from "../src/exceptions/NullPointerException.js";
import { Optional } from "../src/fundamentals/Optional.js";

/** Java's `Optional.empty()` has no equivalent factory yet; this is the stand-in the tests use. */
const empty = <T>() => Optional.ofNullable<T>(null);

describe("Optional factories", () => {
  it("of() holds the value", () => {
    assert.equal(Optional.of(5).get(), 5);
  });

  it("of(null) throws NullPointerException, as Java's does", () => {
    // regression: this threw IllegalArgumentException. Java's `Optional.of` wraps `Objects.requireNonNull`,
    // so a null there is an NPE.
    assert.throws(() => Optional.of(null), NullPointerException);
  });

  it("of() accepts falsy values that are not null", () => {
    assert.equal(Optional.of(0).isPresent(), true);
    assert.equal(Optional.of("").isPresent(), true);
    assert.equal(Optional.of(false).isPresent(), true);
    assert.equal(Optional.of(NaN).isPresent(), true);
  });

  it("ofNullable(null) is empty", () => {
    assert.equal(empty().isPresent(), false);
  });

  it("treats undefined as null", () => {
    assert.equal(Optional.ofNullable(undefined as unknown as null).isPresent(), false);
  });
});

describe("Optional.map", () => {
  it("applies the mapper when a value is present", () => {
    assert.equal(Optional.of(5).map((x) => x * 2).get(), 10);
  });

  it("returns empty when the mapper returns null", () => {
    // regression: this threw IllegalArgumentException, because map used `of` instead of `ofNullable`
    assert.equal(Optional.of(5).map(() => null).isPresent(), false);
  });

  it("returns empty when the mapper returns undefined", () => {
    assert.equal(Optional.of(5).map(() => undefined).isPresent(), false);
  });

  it("returns empty and skips the mapper when already empty", () => {
    let called = false;
    const result = empty<number>().map((x) => {
      called = true;
      return x * 2;
    });
    assert.equal(called, false);
    assert.equal(result.isPresent(), false);
  });

  it("keeps null out of the resulting type parameter", () => {
    // compile-time assertion: if map returned Optional<U | null>, `n` would not typecheck as number
    const n: number = Optional.of(5).map((x) => x * 2).orElse(0);
    assert.equal(n, 10);
  });

  it("chains", () => {
    assert.equal(Optional.of(2).map((x) => x + 1).map((x) => `#${x}`).get(), "#3");
  });
});

describe("Optional.flatMap", () => {
  it("returns the mapper's Optional unwrapped one level", () => {
    assert.equal(Optional.of(5).flatMap(() => Optional.of(9)).get(), 9);
  });

  it("returns empty when the mapper returns an empty Optional", () => {
    // regression: this threw IllegalStateException, because flatMap called .get() on the result to probe it
    const result = Optional.of(5).flatMap(() => empty<number>());
    assert.equal(result.isPresent(), false);
  });

  it("returns empty and skips the mapper when already empty", () => {
    let called = false;
    const result = empty<number>().flatMap((x) => {
      called = true;
      return Optional.of(x);
    });
    assert.equal(called, false);
    assert.equal(result.isPresent(), false);
  });

  it("does not silently flatten a nested Optional", () => {
    // an Optional<Optional<U>> means the caller's mapper is wrong; surface it rather than unwrap twice
    const nested = Optional.of(5).flatMap(() => Optional.of(Optional.of(9)) as any);
    assert.ok(nested.get() instanceof Optional);
  });

  it("throws IllegalArgumentException if the mapper does not return an Optional", () => {
    assert.throws(() => Optional.of(5).flatMap(() => 9 as any), IllegalArgumentException);
  });
});

describe("Optional.filter", () => {
  it("keeps a value that matches", () => {
    assert.equal(Optional.of(5).filter((x) => x > 1).get(), 5);
  });

  it("drops a value that does not match", () => {
    assert.equal(Optional.of(5).filter((x) => x > 10).isPresent(), false);
  });

  it("stays empty and skips the predicate when already empty", () => {
    let called = false;
    const result = empty<number>().filter(() => {
      called = true;
      return true;
    });
    assert.equal(called, false);
    assert.equal(result.isPresent(), false);
  });
});

describe("Optional unwrapping", () => {
  it("get() throws NoSuchElementException when empty, as Java's does", () => {
    // regression: this threw IllegalStateException. The message was already Java's; only the class was wrong.
    assert.throws(() => empty().get(), NoSuchElementException);
    assert.throws(() => empty().get(), { message: "No value present" });
  });

  it("orElse returns the fallback only when empty", () => {
    assert.equal(Optional.of(5).orElse(0), 5);
    assert.equal(empty<number>().orElse(0), 0);
  });

  it("orElseGet is lazy", () => {
    let called = false;
    const value = Optional.of(5).orElseGet(() => {
      called = true;
      return 0;
    });
    assert.equal(value, 5);
    assert.equal(called, false);
    assert.equal(empty<number>().orElseGet(() => 7), 7);
  });

  it("orElseThrow returns the value when present", () => {
    assert.equal(Optional.of(5).orElseThrow(), 5);
  });

  it("orElseThrow throws the supplied exception when empty", () => {
    assert.throws(() => empty().orElseThrow(() => new NotImplementedException("nope")), NotImplementedException);
  });

  it("orElseThrow accepts any Error, not just this library's hierarchy", () => {
    // regression: the supplier was constrained to TSJavaException, so an application could not throw its own
    // domain error without reparenting it onto this library. Java's bound is Throwable.
    class UserNotFound extends Error {
      constructor(public readonly id: string) {
        super(`no user ${id}`);
        this.name = "UserNotFound";
      }
    }
    assert.throws(() => empty().orElseThrow(() => new UserNotFound("ada")), UserNotFound);
    assert.throws(() => empty().orElseThrow(() => new UserNotFound("ada")), { message: "no user ada" });

    // built-ins too, which the old bound also refused
    assert.throws(() => empty().orElseThrow(() => new TypeError("nope")), TypeError);
  });

  it("orElseThrow defaults to NoSuchElementException when empty, matching get()", () => {
    assert.throws(() => empty().orElseThrow(), NoSuchElementException);
    assert.throws(() => empty().orElseThrow(), { message: "No value present" });
  });
});

describe("Optional consumers", () => {
  it("ifPresent runs only when present", () => {
    const seen: number[] = [];
    Optional.of(5).ifPresent((x) => seen.push(x));
    empty<number>().ifPresent((x) => seen.push(x));
    assert.deepEqual(seen, [5]);
  });

  it("ifPresentOrElse takes the correct branch", () => {
    const seen: string[] = [];
    Optional.of(5).ifPresentOrElse((x) => seen.push(`value:${x}`), () => seen.push("empty"));
    empty<number>().ifPresentOrElse((x) => seen.push(`value:${x}`), () => seen.push("empty"));
    assert.deepEqual(seen, ["value:5", "empty"]);
  });
});

describe("Optional.equals", () => {
  it("two Optionals over the same value are equal", () => {
    // regression: always false, because the equality helper gated on identity-based hash codes
    assert.equal(Optional.of(5).equals(Optional.of(5)), true);
  });

  it("two Optionals over different values are unequal", () => {
    assert.equal(Optional.of(5).equals(Optional.of(6)), false);
  });

  it("two empty Optionals are equal", () => {
    assert.equal(empty().equals(empty()), true);
  });

  it("an empty and a present Optional are unequal, both ways", () => {
    assert.equal(Optional.of(5).equals(empty()), false);
    assert.equal(empty().equals(Optional.of(5)), false);
  });

  it("returns exactly `true` for the same reference", () => {
    const a = Optional.of(5);
    const result = a.equals(a);
    assert.equal(typeof result, "boolean");
    assert.equal(result, true);
  });

  it("is symmetric", () => {
    const a = Optional.of("x");
    const b = Optional.of("x");
    assert.equal(a.equals(b), b.equals(a));
  });

  it("compares contained values by reference, as Java's Optional does", () => {
    const shared = { id: 1 };
    assert.equal(Optional.of(shared).equals(Optional.of(shared)), true);
    assert.equal(Optional.of({ id: 1 }).equals(Optional.of({ id: 1 })), false);
  });

  it("returns false, and does not throw, for non-Optional arguments", () => {
    const a = Optional.of(5);
    for (const other of [null, undefined, 5, "5", true, {}, [], () => {}]) {
      assert.equal(a.equals(other), false, `expected false for ${String(other)}`);
    }
  });

  it("returns false, and does not throw, for a forged Optional carrying no private state", () => {
    // regression: reading `#value` off a prototype-only forgery threw a TypeError out of equals
    const forged = Object.create(Optional.prototype);
    let result: boolean | undefined;
    assert.doesNotThrow(() => {
      result = Optional.of(5).equals(forged);
    });
    assert.equal(result, false);
  });
});

describe("Optional.toString", () => {
  it("is stable across calls", () => {
    const a = Optional.of(5);
    assert.equal(a.toString(), a.toString());
  });

  it("reports the value and the empty case", () => {
    assert.match(Optional.of(5).toString(), /^Optional\[5, typeof=number, hashcode=\d+\]$/);
    assert.match(empty().toString(), /^Optional\[null, typeof=object, hashcode=\d+\]$/);
  });
});

describe("Optional.empty", () => {
  it("is empty", () => {
    assert.equal(Optional.empty<number>().isPresent(), false);
    assert.equal(Optional.empty<number>().isEmpty(), true);
    assert.throws(() => Optional.empty<number>().get(), NoSuchElementException);
  });

  it("is a singleton, as Java's is", () => {
    assert.equal(Optional.empty<number>(), Optional.empty<string>());
  });

  it("is what ofNullable returns for an absent value", () => {
    assert.equal(Optional.ofNullable<number>(null), Optional.empty<number>());
    assert.equal(Optional.ofNullable<number>(undefined), Optional.empty<number>());
  });

  it("equals the stand-in the rest of these tests use", () => {
    assert.equal(Optional.empty<number>().equals(empty<number>()), true);
  });

  it("is unequal to a present Optional, both ways", () => {
    assert.equal(Optional.empty<number>().equals(Optional.of(5)), false);
    assert.equal(Optional.of(5).equals(Optional.empty<number>()), false);
  });

  it("hashes to 0", () => {
    assert.equal(Optional.empty<number>().hashCode(), 0);
  });
});

describe("Optional.isEmpty", () => {
  it("is the inverse of isPresent", () => {
    assert.equal(Optional.of(5).isEmpty(), false);
    assert.equal(Optional.of(5).isPresent(), true);
    assert.equal(empty().isEmpty(), true);
    assert.equal(empty().isPresent(), false);
  });

  it("treats falsy-but-present values as present", () => {
    assert.equal(Optional.of(0).isEmpty(), false);
    assert.equal(Optional.of("").isEmpty(), false);
    assert.equal(Optional.of(false).isEmpty(), false);
  });
});

describe("Optional.or", () => {
  it("keeps the value when present, and skips the supplier", () => {
    let called = false;
    const result = Optional.of(5).or(() => {
      called = true;
      return Optional.of(9);
    });
    assert.equal(result.get(), 5);
    assert.equal(called, false);
  });

  it("falls through to the supplier when empty", () => {
    assert.equal(empty<number>().or(() => Optional.of(9)).get(), 9);
  });

  it("stays empty if the supplier is empty too, unlike orElseGet", () => {
    const result = empty<number>().or(() => empty<number>());
    assert.equal(result.isEmpty(), true);
  });

  it("chains through several fallbacks", () => {
    const result = empty<string>()
      .or(() => empty<string>())
      .or(() => Optional.of("third"));
    assert.equal(result.get(), "third");
  });

  it("throws IllegalArgumentException if the supplier does not return an Optional", () => {
    assert.throws(() => empty<number>().or(() => 9 as any), IllegalArgumentException);
  });
});

describe("Optional.stream", () => {
  it("yields one element when present and none when empty", () => {
    assert.deepEqual([...Optional.of(5).stream()], [5]);
    assert.deepEqual([...empty<number>().stream()], []);
  });

  it("makes an Optional spreadable and for-of-able", () => {
    assert.deepEqual([...Optional.of(5)], [5]);
    assert.deepEqual([...empty<number>()], []);
    const seen: number[] = [];
    for (const value of Optional.of(7)) {
      seen.push(value);
    }
    assert.deepEqual(seen, [7]);
  });

  it("flattens a pile of Optionals down to the values that were there", () => {
    const maybes = [Optional.of(1), empty<number>(), Optional.of(3)];
    assert.deepEqual(maybes.flatMap((o) => [...o]), [1, 3]);
  });
});

describe("Optional serialization", () => {
  it("serialises a present Optional as the bare value", () => {
    assert.equal(JSON.stringify(Optional.of("ada")), '"ada"');
    assert.equal(JSON.stringify(Optional.of(5)), "5");
    assert.equal(JSON.stringify(Optional.of({ id: 1 })), '{"id":1}');
  });

  it("serialises an empty Optional as null", () => {
    assert.equal(JSON.stringify(empty<string>()), "null");
  });

  it("leaves no trace of the wrapper on a DTO", () => {
    const dto = { name: "ada", nickname: Optional.of("addie"), pronouns: empty<string>() };
    assert.equal(JSON.stringify(dto), '{"name":"ada","nickname":"addie","pronouns":null}');
  });

  it("keeps the key for an empty Optional rather than dropping it", () => {
    // the distinction that matters: "there is no nickname" must not read as "nicknames were never mentioned"
    assert.deepEqual(Object.keys(JSON.parse(JSON.stringify({ nickname: empty<string>() }))), ["nickname"]);
  });

  it("survives being nested in an array", () => {
    assert.equal(JSON.stringify([Optional.of(1), empty<number>(), Optional.of(3)]), "[1,null,3]");
  });

  it("returns a value rather than a rendering of one", () => {
    // the Serializable contract: hand JSON.stringify the value, or it gets encoded a second time
    assert.equal(typeof Optional.of({ id: 1 }).toJSON(), "object");
    assert.equal(JSON.stringify({ outer: Optional.of({ id: 1 }) }), '{"outer":{"id":1}}');
  });

  it("composes with a value that is itself serialisable", () => {
    const map = new JavaMap<string, number>([["a", 1]]);
    assert.equal(JSON.stringify(Optional.of(map)), '[["a",1]]');
  });

  it("round trips through ofNullable, both present and empty", () => {
    for (const original of [Optional.of("ada"), Optional.of(5), empty<string>()]) {
      const restored = Optional.ofNullable(JSON.parse(JSON.stringify(original)) as unknown);
      assert.ok(restored.equals(original), `${original.toString()} did not survive the round trip`);
    }
  });

  it("cannot confuse an empty Optional with a present null, because there is no present null", () => {
    assert.equal(JSON.stringify(Optional.ofNullable(null)), "null");
    assert.throws(() => Optional.of(null), NullPointerException);
  });
});

describe("Optional constructor noise", () => {
  it("says nothing on the console for ordinary usage", () => {
    // regression: the constructor console.warn'd on every undefined and console.error'd about "not using the
    // constructor directly" on a path a caller cannot even reach, since the constructor is private
    const captured: string[] = [];
    const warn = console.warn;
    const error = console.error;
    console.warn = (...args: unknown[]) => captured.push(args.map(String).join(" "));
    console.error = (...args: unknown[]) => captured.push(args.map(String).join(" "));
    try {
      Optional.of(5);
      Optional.ofNullable<number>(null);
      Optional.ofNullable(undefined as unknown as null);
      Optional.empty<number>();
    } finally {
      console.warn = warn;
      console.error = error;
    }
    assert.deepEqual(captured, []);
  });
});
