import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { unmodifiableList } from "../src/collections/Collections.js";
import { JavaList } from "../src/collections/JavaList.js";
import { ConcurrentModificationException } from "../src/exceptions/ConcurrentModificationException.js";
import { IllegalStateException } from "../src/exceptions/IllegalStateException.js";
import { IndexOutOfBoundsException } from "../src/exceptions/IndexOutOfBoundsException.js";
import { NoSuchElementException } from "../src/exceptions/NoSuchElementException.js";
import { UnsupportedOperationException } from "../src/exceptions/UnsupportedOperationException.js";

const letters = (): JavaList<string> => new JavaList<string>(["a", "b", "c"]);

describe("JavaListIterator positions", () => {
  it("starts at the front, between nothing and the first element", () => {
    const it = letters().listIterator();
    assert.equal(it.nextIndex(), 0);
    assert.equal(it.previousIndex(), -1);
    assert.equal(it.hasPrevious(), false);
    assert.equal(it.hasNext(), true);
  });

  it("reports both halves of the position as it moves", () => {
    const it = letters().listIterator();
    it.next();
    assert.equal(it.nextIndex(), 1);
    assert.equal(it.previousIndex(), 0);
    it.next();
    it.next();
    assert.equal(it.nextIndex(), 3);
    assert.equal(it.previousIndex(), 2);
    assert.equal(it.hasNext(), false);
  });

  it("starts wherever it is asked to", () => {
    const it = letters().listIterator(1);
    assert.equal(it.previous(), "a");
    assert.equal(it.next(), "a");
    assert.equal(it.next(), "b");
  });

  it("starting at the size walks the list backwards", () => {
    const list = letters();
    const it = list.listIterator(list.size());
    assert.equal(it.hasNext(), false);
    const seen: string[] = [];
    while (it.hasPrevious()) {
      seen.push(it.previous());
    }
    assert.deepEqual(seen, ["c", "b", "a"]);
  });

  it("refuses a start index outside the list", () => {
    assert.throws(() => letters().listIterator(-1), IndexOutOfBoundsException);
    assert.throws(() => letters().listIterator(4), IndexOutOfBoundsException);
    assert.throws(() => letters().listIterator(1.5), IndexOutOfBoundsException);
    // at the end is a legal place for a cursor to be, unlike for a read
    assert.doesNotThrow(() => letters().listIterator(3));
  });

  it("throws at either end rather than answering undefined", () => {
    const it = letters().listIterator();
    assert.throws(() => it.previous(), NoSuchElementException);
    while (it.hasNext()) {
      it.next();
    }
    assert.throws(() => it.next(), NoSuchElementException);
  });

  it("hands back the same element from next and then previous, the cursor having moved over it twice", () => {
    const it = letters().listIterator();
    assert.equal(it.next(), "a");
    assert.equal(it.previous(), "a");
    assert.equal(it.nextIndex(), 0);
  });
});

describe("JavaListIterator.set", () => {
  it("replaces the element last returned by next", () => {
    const list = letters();
    const it = list.listIterator();
    it.next();
    it.set("A");
    assert.deepEqual(list.toArray(), ["A", "b", "c"]);
  });

  it("replaces the element last returned by previous", () => {
    const list = letters();
    const it = list.listIterator(list.size());
    it.previous();
    it.set("C");
    assert.deepEqual(list.toArray(), ["a", "b", "C"]);
  });

  it("may be called more than once for the same element", () => {
    const list = letters();
    const it = list.listIterator();
    it.next();
    it.set("A");
    it.set("AA");
    assert.deepEqual(list.toArray(), ["AA", "b", "c"]);
  });

  it("leaves the walk undisturbed, being no structural change", () => {
    const list = letters();
    const it = list.listIterator();
    it.next();
    it.set("A");
    assert.equal(it.next(), "b");
    // and another iterator over the same list is not tripped either
    const other = list.listIterator();
    it.next();
    it.set("C");
    assert.deepEqual([...other], ["A", "b", "C"]);
  });

  it("insists on following a next or a previous", () => {
    const it = letters().listIterator();
    assert.throws(() => it.set("x"), IllegalStateException);
  });

  it("is refused after a remove or an add, which leave nothing to write over", () => {
    const afterRemove = letters().listIterator();
    afterRemove.next();
    afterRemove.remove();
    assert.throws(() => afterRemove.set("x"), IllegalStateException);

    const afterAdd = letters().listIterator();
    afterAdd.next();
    afterAdd.add("x");
    assert.throws(() => afterAdd.set("y"), IllegalStateException);
  });
});

describe("JavaListIterator.add", () => {
  it("inserts at the cursor and steps over what it inserted", () => {
    const list = letters();
    const it = list.listIterator();
    it.add("start");
    assert.deepEqual(list.toArray(), ["start", "a", "b", "c"]);
    assert.equal(it.nextIndex(), 1);
  });

  it("leaves a following next unaffected, and gives a following previous the new element", () => {
    const list = letters();
    const forwards = list.listIterator();
    forwards.add("x");
    assert.equal(forwards.next(), "a");

    const backwards = letters().listIterator();
    backwards.add("x");
    assert.equal(backwards.previous(), "x");
  });

  it("appends when the cursor is at the end", () => {
    const list = letters();
    const it = list.listIterator(list.size());
    it.add("d");
    assert.deepEqual(list.toArray(), ["a", "b", "c", "d"]);
    assert.equal(it.hasNext(), false);
  });

  it("can insert mid-walk without upsetting it, which a for...of loop cannot", () => {
    const list = new JavaList<string>(["a", "c"]);
    const it = list.listIterator();
    while (it.hasNext()) {
      if (it.next() === "a") {
        it.add("b");
      }
    }
    assert.deepEqual(list.toArray(), ["a", "b", "c"]);
  });

  it("needs no preceding next, unlike set and remove", () => {
    const list = new JavaList<string>();
    const it = list.listIterator();
    it.add("only");
    assert.deepEqual(list.toArray(), ["only"]);
  });

  it("is refused after a remove, which leaves nothing to write over", () => {
    const it = letters().listIterator();
    it.next();
    it.remove();
    assert.throws(() => it.set("x"), IllegalStateException);
    // add itself is always allowed, since it does not depend on a returned element
    assert.doesNotThrow(() => it.add("x"));
  });
});

describe("JavaListIterator.remove", () => {
  it("removes what next returned, and keeps the walk in step", () => {
    const list = letters();
    const it = list.listIterator();
    it.next();
    it.remove();
    assert.equal(it.nextIndex(), 0);
    assert.equal(it.next(), "b");
  });

  it("removes what previous returned, and keeps the walk in step", () => {
    const list = letters();
    const it = list.listIterator(list.size());
    it.previous();
    it.remove();
    assert.equal(it.nextIndex(), 2);
    assert.equal(it.previous(), "b");
    assert.deepEqual(list.toArray(), ["a", "b"]);
  });

  it("strips a list walked backwards", () => {
    const list = new JavaList<number>([1, 2, 3, 4]);
    const it = list.listIterator(list.size());
    while (it.hasPrevious()) {
      if (it.previous() % 2 === 0) {
        it.remove();
      }
    }
    assert.deepEqual(list.toArray(), [1, 3]);
  });

  it("insists on following a next or a previous, once each", () => {
    const it = letters().listIterator();
    assert.throws(() => it.remove(), IllegalStateException);
    it.next();
    it.remove();
    assert.throws(() => it.remove(), IllegalStateException);
  });
});

describe("JavaListIterator fail-fast", () => {
  it("does not trip on its own writes", () => {
    const list = letters();
    const it = list.listIterator();
    it.next();
    it.remove();
    it.add("x");
    it.next();
    it.set("B");
    assert.doesNotThrow(() => it.next());
    assert.deepEqual(list.toArray(), ["x", "B", "c"]);
  });

  it("throws when the list is modified behind its back", () => {
    const list = letters();
    const it = list.listIterator();
    it.next();
    list.add("d");
    assert.throws(() => it.next(), ConcurrentModificationException);
    assert.throws(() => it.previous(), ConcurrentModificationException);
  });

  it("throws from the writers too", () => {
    const forRemove = letters();
    const removing = forRemove.listIterator();
    removing.next();
    forRemove.addAt(0, "z");
    assert.throws(() => removing.remove(), ConcurrentModificationException);

    const forSet = letters();
    const setting = forSet.listIterator();
    setting.next();
    forSet.addAt(0, "z");
    assert.throws(() => setting.set("x"), ConcurrentModificationException);

    const forAdd = letters();
    const adding = forAdd.listIterator();
    adding.next();
    forAdd.addAt(0, "z");
    assert.throws(() => adding.add("x"), ConcurrentModificationException);
  });

  it("is not tripped by another iterator's set, which is not structural", () => {
    const list = letters();
    const walking = list.listIterator();
    const writing = list.listIterator();
    writing.next();
    writing.set("A");
    assert.equal(walking.next(), "A");
  });
});

describe("JavaListIterator on an unmodifiable list", () => {
  it("still walks in both directions", () => {
    const view = unmodifiableList(letters());
    const it = view.listIterator(view.size());
    assert.deepEqual([it.previous(), it.previous(), it.previous()], ["c", "b", "a"]);
  });

  it("refuses every writer", () => {
    const it = unmodifiableList(letters()).listIterator();
    it.next();
    assert.throws(() => it.set("A"), UnsupportedOperationException);
    assert.throws(() => it.add("x"), UnsupportedOperationException);
    assert.throws(() => it.remove(), UnsupportedOperationException);
  });

  it("refuses before it complains about call order", () => {
    const view = unmodifiableList(letters()).listIterator();
    assert.throws(() => view.set("A"), UnsupportedOperationException);
    assert.throws(() => view.remove(), UnsupportedOperationException);
    // the same calls on a modifiable list get the state complaint instead
    const list = letters().listIterator();
    assert.throws(() => list.set("A"), IllegalStateException);
    assert.throws(() => list.remove(), IllegalStateException);
  });

  it("names the operation it refused", () => {
    const it = unmodifiableList(letters()).listIterator();
    assert.throws(() => it.add("x"), /add is not supported/);
    assert.throws(() => it.set("x"), /set is not supported/);
    assert.throws(() => it.remove(), /remove is not supported/);
  });
});

describe("JavaList.iterator is the forward half of the same cursor", () => {
  it("walks and removes as before", () => {
    const list = letters();
    const it = list.iterator();
    assert.equal(it.next(), "a");
    it.remove();
    assert.deepEqual([...it], ["b", "c"]);
    assert.deepEqual(list.toArray(), ["b", "c"]);
  });
});
