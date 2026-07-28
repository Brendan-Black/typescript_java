/**
 * The static side of a class that can be rebuilt from JSON — the counterpart to `Serializable`, which describes
 * the instance side.
 *
 * `fromJSON` is a static method, and TypeScript cannot put a static member in an interface a class `implements`.
 * So this types the *constructor object* instead, and a class opts in with `satisfies` at the point of
 * declaration:
 *
 * ```ts
 * class User extends JavaObject implements Serializable {
 *   constructor(public readonly name: string) { super(); }
 *   public toJSON(): unknown { return { name: this.name }; }
 *   public static fromJSON(json: string): User { return new User(JSON.parse(json).name); }
 * }
 *
 * // checked here, at the class, rather than trusted
 * const _check = User satisfies Deserializable<User>;
 * ```
 *
 * NOTE: this interface previously had its only member commented out. An interface with no members is
 * structurally satisfied by every value in the language, including `42`, so it read as a constraint while
 * enforcing nothing — worse than a doc comment, which at least does not lie.
 *
 * @typeParam T the type `fromJSON` produces
 */
export interface Deserializable<T> {
  fromJSON(json: string, ops?: object): T;
}
