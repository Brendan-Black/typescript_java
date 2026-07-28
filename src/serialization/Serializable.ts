export interface Serializable {
	/**
	 * in order to be serializable we must implement this method
	 * in order to properly take advantage of the `JSON.stringify` method
	 */
	toJSON(): unknown;
}