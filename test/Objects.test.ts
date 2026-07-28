import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { NullPointerException } from "../src/exceptions/NullPointerException.js";
import { isNull, nonNull, requireNonNull, requireNonNullElse, requireNonNullElseGet } from "../src/fundamentals/Objects.js";

describe("requireNonNull", () => {
  it("returns the value it was given", () => {
    // regression: this lived on Optional, took `any | null` (which collapses to `any`, erasing the caller's
    // type) and returned an Optional where Java returns the value
    const value: string | null = "hello";
    const checked: string = requireNonNull(value);
    assert.equal(checked, "hello");
  });

  it("keeps falsy values that are not null", () => {
    assert.equal(requireNonNull(0), 0);
    assert.equal(requireNonNull(""), "");
    assert.equal(requireNonNull(false), false);
    assert.ok(Number.isNaN(requireNonNull(NaN)));
  });

  it("throws NullPointerException for null and undefined", () => {
    assert.throws(() => requireNonNull(null), NullPointerException);
    assert.throws(() => requireNonNull(undefined), NullPointerException);
  });

  it("uses the supplied message", () => {
    assert.throws(() => requireNonNull(null, "name must be set"), { message: "name must be set" });
  });

  it("narrows the type rather than widening it to any", () => {
    // compile-time assertion: if the parameter were `any`, `checked` would be `any` and this would typecheck
    // for the wrong reason. It is `string`, so calling a string method is what proves the narrowing.
    const value = "abc" as string | null | undefined;
    const checked = requireNonNull(value);
    assert.equal(checked.toUpperCase(), "ABC");
  });
});

describe("requireNonNullElse", () => {
  it("returns the value when present, the fallback when not", () => {
    assert.equal(requireNonNullElse("a", "b"), "a");
    assert.equal(requireNonNullElse(null as string | null, "b"), "b");
    assert.equal(requireNonNullElse(undefined as string | undefined, "b"), "b");
  });

  it("keeps falsy values rather than falling back", () => {
    assert.equal(requireNonNullElse(0 as number | null, 99), 0);
  });
});

describe("requireNonNullElseGet", () => {
  it("does not call the supplier when the value is present", () => {
    let called = false;
    const value = requireNonNullElseGet("a" as string | null, () => {
      called = true;
      return "b";
    });
    assert.equal(value, "a");
    assert.equal(called, false);
  });

  it("calls the supplier when the value is absent", () => {
    assert.equal(requireNonNullElseGet(null as string | null, () => "b"), "b");
  });

  it("throws if the supplier itself produces nothing", () => {
    assert.throws(() => requireNonNullElseGet(null as string | null, () => null as unknown as string), NullPointerException);
  });
});

describe("isNull and nonNull", () => {
  it("treat null and undefined alike", () => {
    assert.equal(isNull(null), true);
    assert.equal(isNull(undefined), true);
    assert.equal(nonNull(null), false);
    assert.equal(nonNull(undefined), false);
  });

  it("treat falsy-but-present values as present", () => {
    for (const value of [0, "", false, NaN]) {
      assert.equal(isNull(value), false, `isNull was true for ${String(value)}`);
      assert.equal(nonNull(value), true, `nonNull was false for ${String(value)}`);
    }
  });

  it("narrow the type", () => {
    const value = "abc" as string | null;
    if (nonNull(value)) {
      // compile-time assertion: without the guard, `value` would still include null here
      assert.equal(value.toUpperCase(), "ABC");
    }
  });
});
