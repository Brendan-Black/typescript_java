/**
 * Java's Object class.
 * Mimics the behavior of Java's Object class in JavaScript.
 */
export abstract class JavaObject {
  #hash: number;
  /**
   * Constructor for JavaObject.
   * Initializes a unique hash code for the object.
   * This is a simple implementation and does not guarantee uniqueness across all instances.
   *
   * NOTE: this used to read `extends Object`, which did nothing. Every object in JavaScript already inherits
   * from `Object.prototype`; naming it only made the declaration look like it meant something.
   */
  constructor() {
    this.#hash = Math.floor(Math.random() * 0x7fffffff);
  }

  /**
   * Java's is `getClass().getName() + "@" + Integer.toHexString(hashCode())`. `hashCode()` is a virtual
   * call there, so subclasses that override it are reflected here too.
   */
  public toString(): string {
    return this.constructor.name + "@" + this.hashCode().toString(16);
  }

  /**
   * determines if this object is equal to another object.
   *
   * NOTE: if you see this, that means the object you are working with has not overridden the `equals` method,
   * and could very likely be a problem
   * @param other
   * @returns
   */
  public equals(other: unknown): boolean {
    return boilerplateEqualityCheck({ obj1: this, obj2: other });
  }

  /**
   * in Java, the hashcode is an identifier for the pointer of the object in memory,
   * we have no such thing in JavaScript, so we use a random number in the range of a signed 32-bit integer.
   *
   * in essence, this is completely useless outside of the context of this library, and even within it it is merely a quick
   * property to check for "equality" of two objects that may have been deep copied, or any other number of ways
   * that JavaScript tomfoolery can leak in.
   *
   * NOTE: this is identity-based, so two structurally equal objects get different hash codes. Never use it as a
   * precondition for equality — Java's contract only runs one way (equal objects must share a hash code, not the
   * reverse). A subclass with value semantics should override this to derive from its fields.
   * @returns
   */
  public hashCode(): number {
    return this.#hash;
  }

  /**
   * `instanceof JavaObject`, but proof against a forgery.
   *
   * `Object.create(SomeSubclass.prototype)` satisfies `instanceof` while never having run a constructor, so it
   * carries no private state and any method that reads a field throws a TypeError off it. Checking for `#hash`
   * asks the only question that cannot be faked: did this object actually go through the constructor?
   *
   * Use this before calling methods on an object you were handed — an `equals` implementation, in particular,
   * is required to answer rather than throw.
   */
  public static isInstance(value: unknown): value is JavaObject {
    return value instanceof JavaObject && #hash in value;
  }

}

/**
 * this is simply a helper method to define a "base" equals method for class overrides. It is difficult to navigate
 * the many problems with Javascript and keeping them in mind while in "Java mode" can be unduely arduous, so this is provided
 * as a boilerplate method in doing so.
 *
 * With no callback this reproduces Java's default `Object.equals`, which is reference equality. Pass a callback to
 * add the field-by-field comparison a value type needs; it runs only once the null/type/class checks have passed.
 * @param obj1 the first object to compare
 * @param obj2 the second object to compare
 * @param callback an optional callback that can be used to provide custom equality logic
 * @returns `true` if the objects are "equal", `false` otherwise
 */
export function boilerplateEqualityCheck<T extends JavaObject>({ obj1, obj2 }: { obj1: JavaObject; obj2: unknown }, callback?: (o1: T, o2: T) => boolean): boolean {
  if (obj1 === obj2) {
    return true;
  }
  if (obj2 === null || obj2 === undefined || typeof obj2 !== "object") {
    return false;
  }
  // this is pretty much as close as we can get to Java's `this.getClass() == obj2.getClass()` check.
  // Prototype identity rather than `constructor.name`: names collapse under minification, where two
  // unrelated classes can both become `t` and would then compare as the same type.
  // The result can still be faked because #JavaScriptIsAnAcidTrip
  // Example:
  /*
		  const Fake = Object.create(JavaObject.prototype);
		 */
  // so a callback that reads private state must brand-check first — see Optional#equals.
  if (!JavaObject.isInstance(obj2) || Object.getPrototypeOf(obj1) !== Object.getPrototypeOf(obj2)) {
    return false;
  }
  // NOTE: deliberately no `hashCode()` comparison. Hash codes here are identity-based, so gating on them
  // would make every callback unreachable and would invert Java's contract.
  // reaching here means obj1 !== obj2, so with no custom logic Java's answer is `false`.
  return callback ? callback(obj1 as T, obj2 as T) : false;
}
