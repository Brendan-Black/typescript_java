import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ConcurrentModificationException } from "../src/exceptions/ConcurrentModificationException.js";
import { IllegalArgumentException } from "../src/exceptions/IllegalArgumentException.js";
import { IllegalStateException } from "../src/exceptions/IllegalStateException.js";
import { IndexOutOfBoundsException } from "../src/exceptions/IndexOutOfBoundsException.js";
import { NoSuchElementException } from "../src/exceptions/NoSuchElementException.js";
import { NotImplementedException } from "../src/exceptions/NotImplementedException.js";
import { NullPointerException } from "../src/exceptions/NullPointerException.js";
import { RuntimeException } from "../src/exceptions/RuntimeException.js";
import { TSJavaException } from "../src/exceptions/TSJavaException.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";

const CONCRETE = [
  RuntimeException,
  ConcurrentModificationException,
  IllegalArgumentException,
  IllegalStateException,
  IndexOutOfBoundsException,
  NoSuchElementException,
  NotImplementedException,
  NullPointerException,
  UnsupportedOperationException,
] as const;

describe("exception hierarchy", () => {
  it("puts everything under RuntimeException, TSJavaException and Error", () => {
    for (const Exception of CONCRETE) {
      const error = new Exception("boom");
      assert.ok(error instanceof RuntimeException, `${Exception.name} is not a RuntimeException`);
      assert.ok(error instanceof TSJavaException, `${Exception.name} is not a TSJavaException`);
      assert.ok(error instanceof Error, `${Exception.name} is not an Error`);
    }
  });

  it("reparents IllegalArgument and IllegalState under RuntimeException, as Java does", () => {
    // regression: both extended TSJavaException directly, skipping the layer Java puts them under
    assert.ok(new IllegalArgumentException() instanceof RuntimeException);
    assert.ok(new IllegalStateException() instanceof RuntimeException);
  });

  it("names each exception after its own class", () => {
    for (const Exception of CONCRETE) {
      assert.equal(new Exception("boom").name, Exception.name);
    }
  });

  it("no longer reports the third spelling", () => {
    // regression: the base set this.name = "TypeScriptJavaException", a name matching neither the class nor
    // the package, and every subclass that forgot to overwrite it inherited the mismatch
    for (const Exception of CONCRETE) {
      assert.notEqual(new Exception("boom").name, "TypeScriptJavaException");
    }
  });

  it("carries the message and the cause", () => {
    const cause = new Error("underlying");
    const error = new IllegalArgumentException("outer", { cause });
    assert.equal(error.message, "outer");
    assert.equal(error.cause, cause);
  });

  it("can be caught by its base class", () => {
    assert.throws(
      () => {
        throw new IndexOutOfBoundsException("nope");
      },
      RuntimeException
    );
  });

  it("distinguishes library failures from unrelated ones", () => {
    assert.equal(new TypeError("unrelated") instanceof TSJavaException, false);
  });

  it("keeps a usable stack and string form", () => {
    const error = new NullPointerException("missing");
    assert.equal(String(error), "NullPointerException: missing");
    assert.ok(typeof error.stack === "string" && error.stack.length > 0);
  });
});
