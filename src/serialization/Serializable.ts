export interface Serializable {
	/**
	 * in order to be serializable we must implement this method
	 * in order to properly take advantage of the `JSON.stringify` method
	 *
	 * IMPORTANT: return the *value* to be serialised — an array, a plain object, a primitive — and not a string
	 * you have already run through `JSON.stringify`. This is a hook rather than an ordinary method: the engine
	 * calls it and then serialises whatever comes back, so handing it a string gets that string encoded a second
	 * time. `JSON.stringify(list)` would yield `"[1,2,3]"` instead of `[1,2,3]`, and nesting the object inside
	 * another would embed it as text. `unknown` is the return type for exactly that reason — the shape is the
	 * implementer's business, but it must be a value, not a rendering of one.
	 */
	toJSON(): unknown;
}