qibl
====
[![Build Status](https://github.com/andrasq/node-qibl/actions/workflows/nodejs.yml/badge.svg)](https://github.com/andrasq/node-qibl/actions/workflows/nodejs.yml)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-qibl/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-qibl?branch=master)

Quick Itty-Bitty Library.

A miscellaneous collection of small functions and polyfills I wrote that that looked useful or
interesting.  Most are pretty efficient, often faster than alternatives.  Tested to work with node
v0.6 through v18.

Use this package directly as a dependency, or as a library of cut-and-paste functions, or as a
source of ideas and implementation approaches.  This package has no external dependencies nor a
dependency on any particular javascript version.  All functions should work with nodejs 0.6 and
above.  If found useful, would appreciate a comment by the function giving qibl credit.

Use as a dependency:

    var qibl = require('qibl');
    qibl.difftree(node1, node2);

Use as a cut-and-paste library:

    // adapted from qibl@1.12.1
    function difftree(node1, node2) { ... }

To run the tests, check out the repo.

Topics:
- [Objects](#objects)
- [Strings](#strings)
- [Arrays and Buffers](#buffers-and-arrays)
- [Functions](#functions)
- [Classes](#classes)


API
---

Objects
-------

### qibl.isHash( object )

Test whether the object is a generic hash `{}` ie `new Object()` and return `true`, else `false`
if is an instance of some class.  Tests the object constructor.

### qibl.isMethodContext( _this )

Test whether the given `_this` is from a global (function call) context or a method call context.
Method calls have a `this` object that is not `null`, not `global` and not `qibl`.

### qibl.assignTo( target, src1, ... )

Assign all enumerable own properties of the sources `src` onto `target`, and return
`target`.  Also available as `copyObject` and `assign`.  Equivalent to `Object.assign`.

    // qibl.assignTo({ a: 1 }, { b: 2 }, { c: 3 });
    // => { a: 1, b: 2, c: 3 }

### qibl.mergeTo( target, src1, ... )

Recursively copy all properties of the source objects, including inherited properties, onto
the `target` object.  All nested hashes are copied onto a new hash `{}` so the target
will not share any sub-object with any of the sources.  Arrays and non-hash objects (ie
instances of classes other than `Object`) are assigned by value.  Returns the `target`.

### qibl.getProperty( [target,] dottedName [,defaultValue] )

Retrieve the value of the named property of the target object.  Dots `.` in the property name
are interpreted as referring to nested sub-objects or sub-sub-objects etc.
Returns the named value, else either `defaultValue` if provided or `undefined` if not.

    var obj = { a: { b: 1 } }

    qibl.getProperty(obj, 'a')          // => { b: 1 }
    qibl.getProperty(obj, 'a.b')        // => 1
    qibl.getProperty(obj, 'a.c')        // => undefined

    qibl.getProperty(obj, 'a.b', 3)     // => 1
    qibl.getProperty(obj, 'a.c', 3)     // => 3

As a special case, if `target` is omitted and getProperty is invoked as a method off
an object other than `qibl`, it will look up values on that instance.

    var obj = { a: { b: 1 } }
    obj.get = qibl.getProperty;

    obj.get('a')                        // { b: 1 }
    obj.get('a.b')                      // 1

### qibl.compileGetProperty( dottedName )

Build a dedicated function to retrieve the named property of the objects passed to it,
or `undefined` if the property or any of its ancestors are not set.
The property name must be a valid javascript dotted property path.

    var obj1 = { a: { b: 1 } }
    var obj2 = { a: { b: { c: 2 } } }

    var get = qibl.compileGetProperty('a.b');
    get(obj1)                           // 1
    get(obj2)                           // { c: 2 }

### qibl.getProp( target, dottedName [,defaultValue] )

A 5 times faster compiled version of `getProperty`.  The first call compiles a dedicated
property getter to look up dottedName, subsequent calls reuse the getter.

Properties:
- `getProp.maxCount` - capacity limit on the built-in getter function cache.  Default is 10,000.
        Looping over more than 10k different dotted names might bust the cache.
- `getProp.clearCache()` - empty the getter cache, discard all getter functions.

### qibl.setProperty( [target,] dottedName, value )

Set a nested property by dotted name.  Dots `.` in the name imply nested objects,
which will be traversed or created until the actual target is reached.
Returns the target object.

    var obj = {}

    qibl.setProperty(obj, 'a', 1)       // { a: 1 }
    qibl.setProprety(obj, 'a.b', 2)     // { a: { b: 2 } }
    qibl.setProperty(obj, 'c')          // { a: { b: 2 }, c: undefined }

As a special case, if `target` is omitted and setProperty is invoked as a method off
an object other than `qibl`, it will set properties on that instance.

    var obj = { a: 1 }
    obj.set = qibl.setProperty

    obj.set('a.b', 1)                   // { a: { b: 1 } }
    obj.set('b', 2)                     // { a: { b: 1 }, b: 2 }
    obj                                 // { a: { b: 1 }, b: 2 }

### qibl.getLastDefined( val1, val2, ... )

Return the last defined argument.  An argument is defined if it is not `null` or `undefined`.
Useful counterpart to a value-OR chain `a || b || c` that return the first set value (works
only for non-falsy values, but often that's enough).

    const defaultValue = 'default';
    const previousValue = undefined;
    const newValue = 'new';

    qibl.getLastDefined(defaultValue, previousValue);
    // => 'default'

    const value = qibl.getLastDefined(defaultValue, previousValue, newValue);
    // => 'new'

### qibl.inherits( Derived, Base )

Arrange for the Derived class to inherit class and instance methods and properties
from the Base class, including inherited properties.  Equivalent to `util.inherits`.

Note that static class methods and constructor properties are not inherited with
`util.inherits`, but are with `class ... extends` and with `qibl.inherits`.

### qibl.derive( className, parent, [,prototype] [,constructor] )

Create a derived class from the parent.  Returns the constructor.
The new class constructor's name will be className, the default constructor will call
the `parent` on `this` with the received constructor arguments.

If an optional prototype object is provided, its properties will be added to
the inheritable properties of the derived class.

If an optional constructor function is provided, the default constructor will call `constructor`
instead of `parent` to initialize the new instance.  `constructor` must call `parent.call(this,
...args)` to initialize the superclass as needed.  Constructors need to be `function` functions, not `()
=> ` arrow functions.

    function Foo() {}
    Foo.prototype.a = 1;

    const Bar = qibl.derive('Bar', Foo, { b: 2 });

    let b = new Bar();
    console.log(b)      // => "Bar {}"
    b instanceof Foo    // => true
    Object.keys(b)      // => []
    b.a                 // => 1
    b.b                 // => 2

### qibl.reparent( object, Constructor [,prototype] )

Force `object` to be instanceof `Constructor` and inherit from `prototype` or from
`Constructor.prototype` if no prototype object provided.  This is just a type and inheritance
adjustment, `object` will not have the internal contents of a true Constructor instance.
Returns `object`.

Similar to `inherits()`, but `reparent()` adjusts objects while `inherits()` adjusts constructors.

### qibl.toStruct( hash )

Convert the object from hashed accesses to an optimized mapped accesses analogous to `C`
`struct`s.  This exposes a hidden internal language detail:  V8 optimizes objects with a static
layout for more efficient access.

Accessing an object can over time result in it being optimized for mapped lookups or
optimized for hashed lookups, but making an object into a prototype forces an immediate
conversion to mapped lookups.  To retain the speedup, do not add or delete properties.

### qibl.selectField( arrayOfObjects, propertyName )

Return an array with the values of the named property from each object in the input
array.  The value is `undefined` if the property is not set.

    function selectField( array, name ) {
        return array.map((item) => item[name]);
    }

### qibl.mapById( objects, idName [,target] )

Map the `objects` by a property value.  The property can be any property, not just `id`.
Returns a hash mapping each value to the first object whose `idName` is set to that value.  Null
and undefined objects are skipped.  Objects that do not have that property are skipped.  Id
values should be strings or numbers.  Returns the target object, which is `{}` by default.

    var items = [{ id: 'a', v: 1 }, { id: 'b' }, { id: 'a', v: 2 }, { v: 3 }];
    qibl.mapById(items, 'id')
    // => { a: {id: 'a'}, b: {id: 'b'} }

### qibl.groupById( objects, idName [,target] )

Similar to `mapById`, but group the `objects` by property value into arrays.  The property can
be any property, not just `id`.  Objects that do not have the `idName` property set are omitted.
Returns a mapping of ids to lists of objects set on the `target` object, `{}` by default.

    var items = [{ id: 'a', v: 1 }, { id: 'b' }, { id: 'a', v: 2 }, { v: 3 }];
    qibl.mapById(items, 'id')
    // => { a: [{id: 'a', v: 1}, {id: 'a', v: 2}], b: [{id: 'b'}] }

### qibl.groupBy( items, getKey(item) [,target = {}] )

Group the items by their `getKey` value.  Returns the `target` hash with arrays of items
attached, each array indexed by its key value.

### qibl.makeIterator( step(state, object, result) [,makeState(object)] )

Construct an iterator that uses the `step` next-element function to traverse the `object`.  `Step`
is passed the current state, the item being iterated, and the `result` to hold the `value` and
`done` return values.  Note that `step` is invoked as a method on `result`, ie inside the `step`
function `result === this`.

`makeState` is an optional function that builds and initializes the iterator state.
It is passed the `object` being iterated.  The default state is an empty object `{}`.

Note that the returned iterator must be invoked as a method call on the iterated object
to bind the object to the iterator state.

    var arr = [1, 2, 3];
    var iterator = qibl.makeIterator(
        function(state, arr, result) {
            result.done = state.ix >= state.len;
            result.value = arr[state.ix++];
        },
        function(arr) {
            return { len: arr.length, ix: 0 };
        }
    ))
    qibl.setIterator(arr, iterator);

    assert.equal(iterator, arr[Symbol.iterator]);
    assert.notEqual([...arr], arr);
    assert.deepEqual([...arr], arr);

### qibl.setIterator( obj, iterator )

Node-version safe way to attach an iterator to an object / prototype.  Assigns the
`obj[Symbol.iterator]` property if the nodejs version defines `Symbol`, else sets `obj._iterator`.

### qibl.getIterator( obj )

Node-version safe way to retrieve the iterator of an object.  Returns `obj[Symbol.iterator]` if
the nodejs version defines `Symbol`, else returns `obj._iterator`.

Note that the returned function is no longer bound to its object instance.  To invoke it
must be bound again, as when applied to the object e.g. `qibl.getIterator(obj).call(obj)`.

### qibl.keys( object)

Return an array with the names of the own properties of the object.  Same as `Object.keys`,
present for symmetry with `values()`.

### qibl.values( object )

Return an array with the own properties of the object.  Equivalent to `Object.values`.

### qibl.entries( object )

Return an array of key-value pairs of the own properties of the object.  Equivalent to `Object.entries`.

### qibl.fromEntries( target, keyvals )

Return target annotated with the properties specified by the entries.  The entries is an array of key-value
properties as returned by `Object.entries()`.  Equivalent to `Object.fromEntries`.

### qibl.pairTo( target, keys, values )

Set all `keys` in turn as properties on `target` having the corresponding values from `values`.
If a key does not have a maching value, it is set to `undefined`.  If there are more values than
keys, the excess are ignored.  Returns `target`.

### qibl.flipTo( target, hash )

Flip the `hash`, changing all values to keys and the keys to values.  Works for values that are strings
and numbers, not for objects or arrays.  Merges the flipped value-key pairs onto `target`, and
returns `target`.

    var flipped = qibl.flipTo({ a: 1 }, { b: 2, c: 'three' });
    // => { a: 1, '2': 'b', three: 'c' }

### qibl.extractTo( target, source, mask )

Assign to `target` properties of `source` that are set in `mask`.
A mask property set to `undefined` is treated as unset.  Assigns `undefined` if the
property is not set on `source`.  The assignment is recursive, nested properties are assigned
under the control of the same-named nested properties in the `mask`.  Returns the `target`.

    qibl.extractTo({ a:1 }, { a:111, b:222, c:333 }, { b: undefined, c: null, d: 4 });
    // => { a: 1, c: 333, d: undefined }

    qibl.extractTo({ a: { b:2, c:3 } }, { a: { c:333, d:444 } }, { a: { c: 'yes' } });
    // => { a: { b:2, c:333 } }

### qibl.extractNotTo( target, source, mask )

Assign to `target` all properties of `source` except those that are set in `mask`.  A `mask`
property of `undefined` is treated as unset, and causes the corresponding source property to
be transferred.  Assigns properties recursively, controlled by nested properties in the `mask`.
Returns the `target`.

    qibl.extractNotTo({ a:1, b:2 }, { a:111, b:222 }, { a: true });
    // => { a:1, b:222 }

    // populate dst with defaults like lodash.defaults:
    function defaults(dst, src, mask) {
        return qibl.extractNotTo(dst, src, dst);
    }
    defaults({ a:1 }, {a:1, b:2, c:3});
    // => { a:1, b:2, c:3 }
    defaults({ a:1, b:{c:3}}, {a:111, b:{c:333, d:444}});
    // => { a:1, b:{ c:3, d:444 } }

### qibl.populate( target, val [,options ] )

Similar to `fill()`, but can can fill with computed values and can also populate objects.
If `val` is a function the target will be filled with the return values of `val(i)` when
called with the property names or offsets being set. Returns the target being populated.

Options:
- `base`: if filling an array, the starting address to fill from.  Default `0`.
- `bound`: if filling an array, the limiting address to fill up to.  Default `target.length`.
- `keys`: if filling an object, which propreties to set.  Default `Object.keys(target)`, all own properties.

Examples:

    // generate 10 random numbers
    var rands = qibl.populate(new Array(10), Math.random);

    // function to generate the range [0..limit]
    var range = (limit) => qibl.populate(new Array(limit), (i) => i);

    // initialize properties a and c to 'a' and 'c', respectively
    var obj = { a: 1, b: 2 }
    qibl.populate(obj, (k) => k, { keys: ['a', 'c'] });
    // => { a: 'a', b: 2, c: 'c' }

### qibl.omitUndefined( objectOrArray )

Copy the object or array but omit properties that are `undefined`.
`null` and other falsy properties are preserved in the output.
Returns a new object or array with undefined elements removed.
Copies all enumerable properties, both own and inherited.

This can be a handy way of garbage collecting objects `{}` that are used to cache values
that on expiration are set to `undefined` instead of being deleted.  (It can be much faster
to set to undefined than to delete.)

### forEachProperty( hash, visitor(value, key, hash) )

Visit all enumerable properties of the hash, passing the property value, property name and
the hash itself to the visitor function.  Iterates arrays and Buffers, but not strings.
For arrays and Buffers, annotated properties included in `Object.keys` are visited in
addition to the numeric indexes.

### hashToMap( hash [,map] )

Convert the iterable `hash` into a `qibl.Hashmap` (which is a Map if supported, else a minimal polyfill).
If `map` is provided the converted properties are set on the existing `map`.  Returns the updated `map`.
All iterables are converted, including strings, arrays and Buffers; caller beware.

    qibl.hashToMap({ a: 1, b: 2 });
    // => Map(2) { 'a' => 1, 'b' => 2 }

### mapToHash( map [,hash] )

Convert the Map or qibl.Hashmap `map` to a `hash`.  All keys should be strings.  If `hash` is provided
the converted properties are added to the existing `hash`.  Returns the updated `hash`.

    qibl.mapToHash(new Map([['a', 1], ['b', 2]]);
    // => { a: 1, b: 2 }


Strings
-------

### qibl.str_repeat( str, n )

Repeat the string value `str` `n` times.  N should be non-negative, else node will run out
of memory.  Uses an efficient O(log n) string doubling approach.  Returns the repeated string.
Equivalent to `String.prototype.repeat`.

### qibl.str_truncate( str, limit [,options] )

Shorten the string to not exceed `limit` characters by removing characters from the end.
The truncated portion is replaced with `...` or the provided `options.ellipsis`.

Options:
- `delta` - allow the string to exceed limit by a few characters. Default 0.
- `ellipsis` - replacement for the truncated part of the string. Default `...`.

### qibl.str_random( n )

Generate a random text exactly n characters long.  Uses the characters a-z and space ' '
with a frequency distribution similar to that of the qibl.js source file.

    qibl.str_random(20)         // => 'etnq ss q t ae kmunl'

### qibl.str_locate( str, substr, handler(arg, offset), arg )

Locate all substrings `substr` in the string `str`, and call `handler(arg) with their offsets.

### qibl.str_count( str, substr [,limit] )

Return the count of occurrences of the substring within the string `str`.  If `limit` is
provided and greater than zero, stop counting once `limit` occurrences have been found.
A zero-length substring will never be found and returns `0` zero.

### qibl.str_reverse( str )

Construct a new string composed of the the characters of `str` in reverse order.

    qibl.str_reverse("hello")
    // => "olleh"

### qibl.startsWith( str, substr )

Return true if `substr` is a prefix of the string `str`.  Equivalent to String.prototype.startsWith.

### qibl.endsWith( str, substr )

Return true if `substr` is a suffix of the string `str`.  Equivalent to String.prototype.endsWith.

### qibl.stringBound( str, boundStr, offset [,escapeChar] )

Locate the end of the substring of `str` between `offset` the first occurrence of `strBound`.
Similar to `indexOf`, except returns the end of string if the bound is not found, and supports
escaping characters (including valid surrage pairs) to not have them be considered part of the bound.

Find the end of the substring in `str` starting at `offset` and delimited by the closing
`boundStr`.  Similar to `indexOf` but if an escape character `esc` is specified, then characters preceded by `esc` are
skipped (including valid surrogate pairs).  If the `boundStr` is not present, returns the end of
the string.  The bound may be any substring, but the escape character must be a single character.

    qibl.stringBound('{"age":123}', '}', 1);   // => 10
    qibl.stringBound('{"age":123}', '"', 2);   // => 5
    qibl.stringBound('{"age":123}', '"', 1);   // => 1
    qibl.stringBound('{"age":123}', 'XX', 0);  // => 11

### qibl.isSurrogatePair( str, offset )

Test whether the string `str` contains a UTF-8 surrogate pair at the `offset`.  A surrogate pair
is two utf8 characters where the first, the high surrogate, is in the range [\uD800-\uDBFF] and
the second, the low surrogate, is in the range [\uDC00-\uDFFF].

    qibl.isSurrogatePair("abc\uD800\uDC00", 3);  // => true

### qibl.ansiColor( name )

Return a string with the ANSI escape sequence that, when written to the console or sent to an
ANSI-compatible terminal, will switch the foreground color to the `name`d color.  The special name
`off` turns off color mode back to the default.

The color names are the standard ANSI names for the three primary and three secondary additive
colors, all-lowercase no spaces:  the dark shades `black` (true black), `red`, `green`, `yellow`,
`blue`, `magenta`, `cyan`, `white` (a light gray), and `brightblack` (a dark gray), `brightred`,
`brightgreen`, `brightyellow`, `brightblue`, `brightmagenta`, `brightbrightcyan`, `brightwhite`
(true white).

Two aliases, `gray` and `brightgray`, and some additional colors are provided, `orange`, `brown`
and `teal`.  The non-ANSI colors are encoded as 24-bit color sequences which may not be supported
by all ANSI terminals.

Caution: the ANSI `white` is actually a light gray; true white is `brightwhite`.  The actual
colors rendered depend on the terminal, since the color values associated with the names vary.
The below are the VGA colors, composed out of the additive primaries at 0 and 2/3 (light), and 1/3
and full (bright) intensity levels:

|0|1|2|3|4|5|6|7|
|<font color="#000000">black</font>|<font color="#AA0000">red</font>|<font color="#00AA00">green</font>|<font color="#AAAA00">yellow</font>|<font color="#0000AA">blue</font>|<font color="#AA00AA">magenta</font>|<font color="#00AAAA">cyan</font>|<font color="#AAAAAA">white</font>|
|<font color="#555555">brightblack</font>|<font color="#FF5555">brightred</font>|<font color="#55FF55">brightgreen</font>|<font color="#FFFF55">brightyellow</font>|<font color="#5555FF">brightblue</font>|<font color="#FF55FF">brightmagenta</font>|<font color="#55FFFF">brightcyan</font>|<font color="#FFFFFF">brightwhite</font>|

|<font color="#555555">gray (= brightblack)</font>|<font color="#AAAAAA">brightgray (= white)</font>|<font color="#FFAA00">orange #FFAA00</font>|<font color="#AA5500">brown #AA5500</font>|<font color="#005555">teal #005555</font>|

### qibl.strtok( str, sep )

Separate the string `str` into parts delimited by the separator `sep`.  When called with a
non-null string, it returns the first delimited token contained in the string.  When called
with a `null` string it returns the second, third, etc tokens.  The separator must be
provided each time, and may change between calls.

NOTE: this function is not reentrant, a second call with a non-null string will overwrite
the previous state.  It behaves like the `C` `strtok()` library function.

    var str = "http://example.com/path/name";
    qibl.strtok(str, '://');
    // => 'http'
    qibl.strtok(null, '/');
    // => 'example.com'
    qibl.strtok(null, null);
    // => 'path/name'
    qibl.strtok(null, null);
    // => null

### qibl.escapeRegex( str )

Backslash-escape all characters in str that would act as metacharacters inside a regular
expression.  Returns the string with escapes added.

### qibl.globRegex( template )

Convert the glob template to a regular expression pattern.  Returns a string suitable for
passing to `new RegExp(patt)` to construct a regular expression that identifies strings that
match the glob template.

The glob syntax is the csh-like `? * ** [abc] [^abc] {a,b,c}`, with some notes:

- `?` matches a single character in the string
- `*` matches zero or more characters, not including `/` pathname separators
  *Note:* currently a `*` as the start of a pathname component also matches dot-files,
  but in the future this may be changed.  Dot files are normally explicitly matched with `.*`
- `**` matches zero or more characters, including pathname separators
- `[...]` matches the characters listed inside the brackets.  Character ranges `a-z` are ok.
  *Note:* character lists are passed to the regex verbatim, without any escaping.  Escaped `\]` and `\\`
  are recognized, but the list contents must obey regexp syntax, not command shell.
- `[^...]` matches all characters not listed inside the brackets
- `{,,,}` matches exactly one of the comma-separated alternates.  The alternates must not contain
  comma `,` or close-brace `}` characters.
  *Note:* unlike in the command shell, the alternates must not contain nested meta-patterns.
  Currently they are fully escaped in the regex pattern, with no metacharacter expansion so e.g.
  `{*.[ch],*.js}` matches the literal strings `"*.[ch]"` or `"*.js"`, but in the future this
  restriction may be eased.

Examples:

    qibl.globRegex('{src,test}/**/*.[ch]')
    // => "^(src|test)/.*/[^/]*\\.[ch]$"

### qibl.vinterpolate( string, substring, argv )

Replace each occurrence of the substring in string with the next argument in the vector
argv.  Substrings without a corresponding argument are not replaced.

    vinterpolate("Hello, %s!", '%s', ["world"]);
    // => "Hello, world!"

### qibl.addslashes( str [,regex] )

Backslash-escape characters in the string.  Without a regex, the characters escaped by
default are `'`, `"`, `\` and `\0` (single-quote, double-quote, backslash and NUL).
If a regex is provided, the patterns matched by its first capturing group will be the ones
escaped instead.

    addslashes("curl test.com/;cat /etc/passwd", /([;|&$])/g);
    // => "curl test.com/\;cat /etc/passwd"

### qibl.compileVinterpolate( string, substring )

Build a dedicated function to replace occurrences of the substring with arguments taken from
the argv array.  Just like vinterpolate, but optimized for the given string.  Throws an Error
if the argv length does not match the substring count.

    var vinterpolate = qibl.compileVinterpolate('%s, %s!', '%s');
    vinterpolate(['Hello', 'world']);
    // => "Hello, world!"

### semverCompar( semver1, semver2 )

Compare the two semantic version number strings and return -1 if version 1 is lower than,
0 if equal to, or +1 if greater than version 2.  Handles dotted versions of any depth,
and accepts version numbers with text suffixes.  Versions numbers sort lower first, then
shorter string, then alpha order of the strings.  So "1.1" before "1.2", "1.2" before "1.2a",
"1.2a" before "1.2aa", "1.2aa" before "1.2b", "1.7b" before "1.11a".

        // qibl.semverCompar("1.2c", "1.3a")         // -1


Buffers and Arrays
------------------

### qibl.fill( buf, ch [,base] [,bound] )

Fill the buffer or array with the value `ch` from starting offset `base` and up to the limit
`bound` (but not including `bound`).  Returns the target being filled.

### qibl.concat2( target, arr1 [,arr2] )

Concatenate one or two arrays into the target array.  Returns the target array.
Faster than `Array.concat`, much faster for short arrays.

### qibl.flatMap2( target, arr, compute(item, ix, arr) )

Concatenate the values and arrays of values generated by `compute`-ing each element of the array
`arr` onto the end of the `target` array.  Missing elements are omitted.  Returns the `target`
array.  Equivalent to `arr.flatMap()`, which is just `target.concat(...arr.map(transform))`, but
20x faster than `flatMap` and 10x faster than `concat(map)`.

    arr = qibl.flatMap2([0], [{v: 1}, {v: [2, 3]}], (x) => x.v);
    // => [0, 1, 2, 3]

### qibl.subsample( items, k [,base [,bound]] )

Return a uniformly distributed subsample of `k` items selected from the `items` array from between
the specified `base` and `bound`.  Base and bound default to `0` and `items.length`, respectively.
Returns at most as many items as there are in the array (or in the bounded range).

### qibl.qsearch( min, max, probe(n) )

Find the largest value `n` in the range [`min`..`max`] that still has the tested property,
i.e. where `probe(n)` returns truthy.  The function first uses binary search to call
`probe()` with various `n` to narrow down where the probe starts failing, then switches to a
fast linear search.  Returns the last truthy index `n` if found, or `min - 1` if not in the range.

    items = [1, 2, 3, 4, 5];
    qibl.qsearch(0, items.length - 1, (index) => items[index] <= 3);
    // => 2

    // binary search the sorted array for the value
    function binarySearch( array, value ) {
        var offset = qibl.qsearch(0, array.length - 1, (ix) => array[ix] <= value);
        return offset >= 0 && array[offset] === value ? offset : -1;
    }

### qibl.sort3( a, b, c )

Return an array containing the 3 items in ascending order.  Much faster than `[a, b, c].sort()`.

    qibl.sort3(3, 1, 2);
    // => [1, 2, 3]

### qibl.sort3i( array, i, j, k )

Rearrange the array contents at offsets i, j and k so that array[i], array[j] and array[k]
are in ascending order.

### qibl.shuffle( array [,base [,bound]] )

Randomize the order of the elements in the array, or just between `base` and `bound` if provided.
Uses and efficent in-place reorder algorithm.  Returns the `array`.

### qibl.interleave2( targetArray, sourceArray1, sourceArray2 )

Append the items from the two source arrays to the target array in alternating order
1, 2, 1, 2, etc.  Any extra elements are appeneded contiguously.

    qibl.interleave2([0], [1, 3, 5, 7], [2, 4]);
    // => [0, 1, 2, 3, 4, 5, 7]

### qibl.newBuf( arg, encodingOrOffset, length )

Construct a Buffer like `new Buffer()` used to before it was deprecated.

### qibl.allocBuf( length )

Create a new Buffer having the given length, with contents uninitialized.  This builder is a
pass-through to the native implementation (`Buffer.allocUnsafe` or `new Buffer`) and always runs
at full speed.

### qibl.fromBuf( contents )

Create a new Buffer with its contents pre-initialized to the given string, array or buffer.
This builder is a pass-through to the native implementation (`Buffer.from` or `new Buffer`) and
always runs at full speed.

### qibl.chunk( array, size )

Split an array into chunks of at most `size` elements each.  Returns an array of arrays
which concatenate to the input `array`.

    qibl.chunk([1,2,3,4,5], 2)
    // => [[1,2], [3,4], [5]]

### removeByIndex( array, index )

Remove the element at offset `index` from the array and return it.  The array is updated in-place.
Like `array.splice(index, 1)` but much faster.

### remove2( array, filter(element, ix, array) [,discards] )

Remove from the `array` the elements identified by the `filter`, and repack the array in-place.
The removed elements will be appended to the `discards` array if provided.  `filter` must be a
function that, when called with an array element, returns truthy to remove it from the array.
Returns the modified `array`.  Similar to `Array.filter` but modifies and returns the input array,
and only optionally gathers the discarded items.

    target = [1, 2];
    qibl.remove2([3, 4, 5], (x) => x === 4, target);
    // => [3, 5]
    target;
    // => [1, 2, 4]

Functions
---------

### qibl.varargs( handler(argv, self) [,self] )

Return a function that when called will in turn call handler with all its arguments in an
array (an "argument vector").  This functionality is no longer really needed with ES6 rest
args, but is useful for portability.  It is not slower than rest args.

If no `self` is given (or is `undefined`), varargs() will call `handler` with `self` set to
the current `this`, to allow varargs functions to be used as methods or constructors.  If
called as a function or as `qibl.varargs`, `self` will be undefined.

### qibl.varargsRenamed( handler(argv, self), funcName [,self] )

Return a function like varargs but constructed with the given function name.  If no `self`
is provided, the current `this` is used or `undefined` if running in a function context.

### qibl.invoke( fn, argv )

Call the function with the given argument vector.

### qibl.invoke2( fn, self, argv )

Call the method on the object `self` with the given argument vector.

### qibl.thunkify( func [,self] )

Split the method into two functions, one (the `thunk`) to partially apply the
function to the arguments and to return the other (the `invoke`) that runs the
function when called with a callback.  `thunkify` returns the thunk.

For example, given a function `fn(a, b, cb)`:

    function thunk(a, b) {
        return function invoke(cb) {
            return fn(a, b, cb);
        }
    }

### qibl.curry( func )

Return a function that incrementally binds arguments and returns curried functions until all
expected arguments have been gathered.  As soon as all arguments to `func` are present, `func`
is invoked and its return value is returned.  The count of expected arguments is obtained
from `func.length`.

    function sum4(a, b, c, d) { return a + b + c  + d }
    var f = qibl.curry(sum4);
    // => [function]

    f(1, 2, 3, 4)       // => 10
    f(1)(2)(3)(4)       // => 10
    f(1, 2)(3)(4, 5)    // => 10
    f(1, 2, 3, 4, 5)    // => 10

    var f2 = f(1, 2)
    f2(3, 4)            // => 10
    f2(4, 5)            // => 12

### qibl.tryRequire( name )

Suppress the error from `require(name)`.  Returns the module, or `undefined` if unable to
load.

### qibl.clearListeners( emitter, event )

Remove all listeners that are listening for `event`, and return them in an array.

### qibl.restoreListeners( emitter, event, listenersArray )

Add all listeners in the array to be listening for the event.
This undoes a clearListeners().

### qibl.readBody( emitter, callback(err, body) )

Listen for 'data' events from the emitter and assemble the data chunks into the returned `body`.
Data may be either all strings or all Buffers.  The returned body is a string for string data,
else a Buffer for Buffer data.  The callback is invoked when the 'end' event is received.

### qibl.emitlines( emitter )

Annotate the emitter to listen for `'data'` events, re-split the byte stream on `\x0A` newline
terminated byte boundaries, and re-emit each line found as a `'line'` event.  A single data
chunk may emit zero, one, or multiple lines.  Returns the installed `'data'` listener function.
Similar to `readline.createInterface(emitter)` but emits from the same emitter as the data, and
does not convert to string.

Lines are emitted when their terminating newline arrives, partial lines are buffered.  The
terminating newline is inclued in the emitted line.  Line events are emitted synchronously by
the data listener in the same event loop cycle that the data chunk arrives.  Data chunks are
expected in Buffers and lines are emitted as Buffers, the caller must convert to strings.

    const emitter = new events.EventEmitter();
    qibl.emitlines(emitter);
    emitter.on('line', (line) => {
        // => Buffer('line 1\n')
        // => Buffer('line 2\n')
    })
    emitter.emit('data', Buffer.from('line 1\nline'));
    emitter.emit('data', Buffer.from('2\npartial li'));

### qibl.emitchunks( emitter, eventName, findChunkEnd(newChunk, chunks, base) )

Re-chunk the emitted `'data'` bytes and emit them as `eventName` events.  The 'data' buffers
must have bytes in Buffers, and not have been converted to strings.  The delivered 'chunk'
events will likewise be in Buffers.  The boundaries of the chunks are computed by the
`findChunkEnd` function.  Returns the 'data' event listener that was installed on the
`emitter`.

Chunks are emitted as soon as their end is received, from within the `'data'` event
listener.  Partial chunks are buffered until their end arrives.

`findChunkEnd` is called with the new 'data' buffer and, for multi-buffer chunks, the array of
data buffers received so far (including the newest), and should return the byte offset in
`newChunk` of the end of the chunk starting at `base` offset.  Note that whenever `base` is
non-zero the chunk will always start in `newChunk` and `chunks` will be unefined; when `base`
is `0` zero the chunk will start at offset 0 in either `chunks[0]` or `newChunk`, depending
on whether `chunks` is set..

See also the description of `emitlines`, which is built on top of `emitchunks`.

    function emitlines( emitter ) {
        return qibl.emitchunks(emitter, 'line', function endOfLine(chunk, chunks, base) {
            var end = chunk.indexOf("\n", base);
            return end < 0 ? -1 : end + 1;
        })
    }

### makeError( [properties,] message [,arg1 ,arg2, ...] )

Create a new `Error` object with the error message `message` and having the given properties.
The message arguments are interpolated into the message with `util.format(message, arg1, ...)`.

    qibl.makeError({ code: 'MOOD' }, 'bad %s', 'mood');
    // => Error { message: 'bad mood', code: 'MOOD', stack: "..." }

### microtime( )

Return a high precision real-time timestamp with the seconds elapsed since the epoch,
similar to PHP's `microtime(true)`.  Returns nanosecond precise elapsed times and tracks the
system clock accurately to within .001 milliseconds.  This is an efficient call, it is just
`hrtime` added to a carefully calibrated time offset.  Note that the system clock itself is
usually only accurate to 1-10 ms because it is synced to a remote time service over a bursty
network.

    sec = qibl.microtime();
    // => 1608407555.834298

    new Date(sec * 1000).toISOString();
    // => "2020-12-19T19:52:35.834Z"

#### microtime.calibrate( loopCount )

Recaliberate the microtime timer.  Calibration synchronizes the millisecond transitions to the
nodejs high-resolution timer to find the nanosecond offset between the Date clock and hrtime.
This offset is used to return a microtime to within 1/2 microsecond accuracy.  Note that
microtime is calibrated when the file is loaded, this call exists for custom recalibration.
Each calibration starts from scratch, the calibration runs are not cumulative.

### parseMs( interval )

Convert a simple time spec like `'2h'` into milliseconds, `7200000`.
Recognizes the modifiers `s`, `m`, `h`, `d` and `w` meaning seconds, minutes, hours, days
and weeks.  Plain numbers are assumed to represent milliseconds and are returned as is.
Multiple time specs `'2h 15m'` are summed, `8100000`.  Returns `NaN` if unable to parse the value or the format.

    qibl.parseMs('2m .5s');
    // => 120500

### timeit( runCount, func( i ) )

Measure how many seconds are needed to call `func` `runCount` times.  `func` is passed the
iteration index `0 .. runCount - 1`.  Returns an array with `[runCount, elapsedSec, overheadSec]`
that reports the timings result as well as the estimated overhead that the timing loop added to
the time used by `func`.  See `qtimeit` for a more accurate timing loop.

#### formatRate( countOrRateArray, elapsedSec, overheadSec )

Return a string that summarizes the timing results in a human-friendly format.

    rate = qibl.timeit(1e7, function(i) { return Math.sin(i / 360) });
    // => [ 10000000, 0.17456579208374023, 0.03967285156249999 ]

    console.log(qibl.formatRate(rate));
    // => "10m in 134.89 of 174.57 ms: 74.1329m/s"

### qibl.timeitf( runCount, func( i ) )

Convenience wrapper around `timeit` and `formatRate` that prints the timing function and the results:

    let x = 4.5;
    qibl.timeitf(1e7, () => x = Math.sqrt(4 * x));
    // => "() => x = Math.sqrt(4 * x): 10m in 77.795 of 105.261 ms: 128.5425m/s"


### config = getConfig( [options] )

Read the environment-specific configs from the configs directory.  Similar to `config` or `qconfig`,
but just 10% the size for 90% of the functionality.  The config settings are returned as a hierarchical
name-value hash.

The config files are read from the given directory (`./config` by default) and are named the same as the
evironment being configured, eg `'test` or `'production'`.  All environment configs inherit the commonly
shared settings configured in `'default'`, and are overridden by any overrides found in `'local'`.
Arbitrary format config files are supported with custom loaders configured by filename extension.

Unlike `qconfig`, the config directory is not searched for, it must be named explicitly or be `./config`
in the current working directory.  Unlike `config`, the elaborate override logic is simplified to just 3
layers.

Errors other than file-not-found errors are logged to stderr with console.error.

Options:
- `dir` - the directory holding the files with config settings.  The default is `./config` in the
  same directory as the running process, typically the root of the source tree.
- `env` - the config environment to load, typically `'test'`, `'development'` or `'production'`.
  The environment to load is read from `options.env`, else from `process.env.NODE_ENV`, else the
  default used is `'development'`.
- `loaders` - custom config file loader functions, specified as a mapping of filename extensions to loader
  functions.  The loaders are tried in the order specified, first on the bare filename without any extesion,
  then on the filename with the loader-specific extension appended.  The config returned by the first
  loader to succeed is the one used.  Loaders for the native (no extension) javascript and `.json`
  are built in and are always tried first.  The load functions must return a name-value hash.

### errorToObject( err )

Convert the error with its non-enumerable fields into a serializable object, and return the
object.  All own properties of `err` are retained.

### objectToError( obj )

Create an error having all the same properties as `obj`.  If `obj` was created with
`errorToObject`, will also try to restore an instance of the original error type.

### repeatUntil( loopedFunction(done(err, done)), callback )

Keep calling `loopedFunction()` until it calls its callback with an error or a truthy `done`
value.  Errors returned from or thrown by the looped function stop the looping, are caught, and
are returned to the callback.  Due to the way repeatUntil recurses, errors thrown from the
callback are also caught and fed back into the callback.  This function does not yield the cpu
unless the looped function does.

    var count = 0;
    qibl.repeatUntil(function(done) {
        count += 1;
        done(null, count >= 3);
    }, function(err) {
        callback(err, count);
        // => count === 3
    })

### repeatFor( count, loopedFunction(done(err), ix), callback )

Call `loopedFunction()` exactly `count` times.  Each call is passed a callback followed by the
loop index `ix`, `0 .. count-1`.  Errors returned by the looped function stop the looping and are
returned to the callback.  Errors thrown are not yet handled.  This function does not yield
the cpu unless the looped function does.

    var count = 0;
    repeatFor(3, function(done, ix) {
        count += 1;
        done();
    }, function(err) {
        // => count === 3
    })

### forEachCb( itemsArray, visitorFunction(done(err), item, ix, itemsArray), callback )

Call the visitor function with each element of the array.  The visitor is passed, in order,
a callback that must be invoked when the visitor is done, the array item, the index of the
item in the array, and the array itself.  Missing elements will be passed as `undefined`.
This function uses `repeatFor` and does not yield the cpu unless the called visitor does.

### runSteps( steps, callback(err) )

Experimental:  run each of the functions in the `steps` array.  Each step takes a callback
and two optional arguments passed to it from the previous step.  The callback is called with
any error and the first two arguments returned by the last step.
This function currently does not break up the call stack and does not yield the cpu between steps.

    qibl.runSteps([
        (done) => done(null, 1),
        (done, x) => done(null, 2, x),
        (done, y, x) => done(null, x, y),
    ],
    (err, a, b) => {
        // err == null, a == 1, b == 2
    })

### processItem = batchCalls( [options,] processBatch(items [,cb]) )

Return a function `processItem` that will accept a single argument and an optional callback, and will
periodically call `processBatch` with batches of the arguments the returned function is
invoked with.  The function callback, if given, will be invoked with the error returned
by the callback from `processBatch`.

Options:
- `maxWaitMs` - how many milliseconds to wait for additional items, default 0 to process the
  batch at the end of the current event loop tick.
- `maxBatchSize` - do not let batches grow above this number of items, default 10.  Zero selects
  the default.
- `startBatch()` - function that returns a new empty batch.  The default is to use an empty
  array `[]`.
- `growBatch(batch, item)` - function to add the item to the batch.  The batch is the most
  recent one obtained with `startBatch`.  The default is a function to `batch.push(item)`.

E.g.,

    const processItem = qibl.batchCalls({maxBatchSize: 2}, processBatch);
    processItem(1);
    processItem(2);
    processItem(3);

    function processBatch(items, callback) {
        // called with item batches of [1, 2] then [3]
    }

### errorEmitter = walkdir( dirname, visitor(path, stat, depth), callback )

Simple stateless directory tree walker.  Files are reported and recursed into in order.
Visits all contained files and directories, including the search root dirname itself.
Returns an event emitter that emits 'error' events with the filepath of files that could
not be accessed (`fs.stat`-ed).

Calls the `visitor()` with the filepath of the current file, the file stats obtained with
`fs.stat`, and the current directory depth starting from 0.  The visitor may return a command
string to direct how this file should be traversed, one of
- `'skip'` - omit this subdirectory (subdirectories are normally recursed into when encountered)
- `'visit'` - do recurse into this subdirectory (symbolic links to directories are normally skipped)
- `'stop'` - stop the traversal, all done, do not visit the other files

Errors accessing the visited files are reported out of band via 'error' events on the returned
emitter, and the visitor is not called on them.  The emitter does not throw, un-listened for
errors are ignored.  Errors accessing the top-level `dirname` are returned to the callback.

Note: the files are visited in `fs.readdir()` order, which varies by node version.  Older node
returned files in as-is storage order, newer node returns them in sorted order.

### mkdir_p( dirname, callback(err) )

Create the named directory, including all enclosing directories as necessary.  It is not an
error for the directory to already exist.

### rmdir_r( fileName_or_directoryName, callback(err) )

Remove the named file or directory.  If directory, removes all its contents too.

### filename = tmpfile( [options] [callback] )

Create a new empty temporary file for exclusive use and return its filename.  The file is
momentarily opened in O_CREAT | O_EXCL | O_WRONLY mode to guarantee to not to have existed
before the call, and will be automatically removed when the
process exits (by normal exit, or unhandled SIGTERM, SIGHUP, or SIGINT).  The
filename is constructed by concatenating the directory name, core filename, a six-character
random suffix, and filename extension.

Note that this call behaves like a cross between `tempfile(1)` and its namesake `tmpfile(3)`.

Note that the installed signal handlers try to keep to the default behavior of exiting by
throwing a `"terminated"` exception.  They throw only if no other handlers are listening for
the signal, else the other handlers will presumably decide whether to exit or not.  Emitting
signal names from `process` is thus no longer harmless, because it can throw.  Also, if the other handlers
also only exit only if they are the sole listener, then the process may not exit after all.

If the optional `callback` is provided then `tmpfile` uses async calls to create the temp file and
returns errors to the callback, otherwise `tmpfile` uses synchronous calls and throws if unable to
create a file.

The options are not required, and may specify:
- `dir` - name of the directory to hold the file, default is `process.env.TMPDIR` else `/tmp`
- `name` - core filename without the leading path separators, default `node-tmpfile-`
- `ext` - filename extension to append including any `'.'` separator, default `''` empty string
- `remove` - whether to auto-remove the file on exit, default enabled, set to `false` to create
    a permanent file that will not be removed on fatal signal or process exit
- `flags` - file creation mode.  This setting is normally not specified, and defaults to `"wx"`.
  *Note*: this setting must be specified as a numeric value for node versions 0.6 and older that
  reject the `"x"` exclusive-mode modifier; for them the Unix creation flags are `0x80 | 0x40 | 0x01`
  meaning `(O_EXCL | O_CREAT | O_WRONLY)`.  The values of `O_EXCL` et al are defined in `fs.constants`
  in nodejs v6 and up. Note that the numeric values of the macOS `O_CREAT` and `O_EXCL` differ from Unix.

    const filename = qibl.tmpfile();
    // => "/tmp/node-tmpfile-wp3tio"

### globdir( dirname, templateOrRegex, callback(err, filepathArray) )

Recursively walk the directory looking for files matching the pattern, and return to the
callback the list of matching filepaths.  The filenames will be full paths with the
directory name prepended, similarly to how the filenames are returned by `find(1)`.

If the filename template is not already a regular expression it will be converted with
`new RegExp(qibl.globRegex(template))`.  The template accepts `globRegex` syntax.

    // find all files in ./src/ whose names end in '.js'
    globdir('./src', '*.js', (err, files) => {
        // ...
    })

### socketpair( callback(err, sockets) )

Return via the callback a pair of connected unix domain sockets.  Returns two open instances of
`net.Socket` where the data written to `sockets[0]` will be readable from `sockets[1]`, and vice
versa.  The socket filename is e.g. `/var/tmp/node-socketpair.XXXXXX` where `/var/tmp` is the value
of the `TMPDIR` environment variable (default `/tmp`) and `XXXXXX` is a random suffix.  The file is
created with `qibl.tmpfile` and is automatically removed when the current process exits.

An open socket can be passed to a `child_process` as the second argument to `child.send()`.

### walktree( tree, visitor(node[key], key, node, depth) )

Recursively examine the properties of tree and call `visitor()` on each.  `tree` may be any
value, but only `isHash` hashes are traversed.  Like Array.forEach, the visitor is called with
the property value, the property name (index), the object whose property it is, plus `depth`,
the current level of property traversal, 1 for the direct properties of `tree`.  If the visitor
returns `'skip'` the property is not recursed into, if `'stop'` the traversal is halted, and
if `'visit'` then the object will be recursed into even if not a hash.

### copytreeDecycle( tree [, replacement] )

Deep-copy the object `tree` with all nodes that are backreferences introducing cycles
replaced with the `replacement`.  The default replacement is the string `[Circular]`.  The
copy replaces all class instances with generic objects, preserving only the enumerable own
properties; the original classes and inherited methods are ignored.  This call can be used
to make objects containing cycles safe for serialization, e.g. for JSON.stringify.

### difftree( node1, node2 )

Return a recursive copy of `node2` with all properties that are also present in `node1` removed,
leaving only the properties where node2 differs from node1.  Array properties are compared with
`diffarray` (see below).  Properties must be `===` strict equal to match.  Only `isHash()`
hashes and arrays are recursed into, not class instances.  If two arrays differ, the differing
elements are returned at their original offsets.  An element or property set to `undefined`
matches a missing or unset one.

    qibl.difftree(
        { v: 1, a: { b: 2 }, e: [1, 2] },
        { v: 1, a: { b: 2, c: 3 }, d: 4, e: [1, 3] }
    );
    // => { a: { c: 3 }, d: 4, e: [ , 3] }

### diffarray( array1, array2 )

Return an array with the recursive pairwise diffs of the array elements.
Elements that are equal are omitted from the returned array.  An omitted element
matches the `undefined` value.

    qibl.diffarray([ , 2, 3], [undefined, 2, 4]);
    // => [ , , 4]

    qibl.diffarray([1, { a: 1 }], [1, { a: 1, b: 2 }]);
    // => [ , { b: 2 }]

### retry( getDelay(), timeoutMs, func(cb), [options,] callback(err, res, res2) )

Repeatedly call `func` until it succeeds or have tried for `timeoutMs` milliseconds.  Pauses
`getDelay(retryNum)` ms between retry attempts.  The first `retryNum` passed to `getDelay` is `1`.
`func()` is invoked with a callback `cb(err, res, res2)` that expects an error object `err` and
up to two result values `res` and `res2`.
Calls its `callback` with the result of the last call to `func`: any error and up to two result values.
Makes an initial attempt to `func()` when called, then retry attempts separated by delays,
and a final attempt at the very end of the timeout period after a possibly shortened delay.

Starting with v1.19.4 the `timeoutMs` is enforced with a `setTimeout()` timer, and measures total
elapsed time.  If `func()` returns immediately, then the sum of delays will be (close to)
the timeoutMs, but if `func` takes a while to fail the number of attempts will be fewer.  One
final attempt is made just before timeout unless already timed out.

Starting with v1.22.0 the `options` object, if provided, can specify

- `noTimeout` - do not error out long-running calls to `func`.  This effectively switches the
  behavior back to the initial implementation that only timed out between calls to `func`, never
  while `func` was running.  The default is `false` to time out mid-call if it takes too long.

### makeGetId( uniqueSystemId )

Return a function that will generate unique ids for the given system.  This is a convenience
wrapper around `qibl.QuickId`.

### mutexCall( func(..., callback) [,limit] )

Return a function that will serialize calls to `func`.  The optional `limit` controls how many
calls to `func` to allow to run simultaneously; the default is 1.  `func` may take any number of
parameters, but the last argument must be callback.

The serialized call has the same function signature as `func`, taking the same arguments and the
same callback.  The mutex is acquired before `func` is called, and is released when `func` invokes
its callback.  The callback can deliver up to 2 values back to the caller, normally an error and a
data value.  Errors thrown inside `func` are caught and passed to its callback, including errors
thrown after the callback has been called.  The mutex is released only once, on the first occasion
(ie the first time the callback is called and/or error is thrown).

Mutual exclusion is implemented with a `qibl.Mutex` instance, which is attached to the returned
function as its `.mutex` property.

    const qibl = require('qibl');
    let running = 0;
    const greet = (name, cb) => {
        assert.equal(running, 0);
        running += 1;
        setTimeout(() => {
            console.log('Hello, %s!', name);
            assert.equal(running, 1);
            running -= 1;
            cb();
        }, 5);
    }
    const greet1 = qibl.mutexCall(greet);
    for (let i = 0; i < 10; i++) greet1('Barbie', function callback(){});
    // => "Hello, Barbie!" 10 times, spaced 5 ms apart

### monitorHeartbeat( interval, maxElapsed, reportDelay(elapsed) )

Monitor event loop blockage by checking that an interval timer is run every `interval`
milliseconds.  Excessive CPU usage delays asynchronous events and expired timers from being
processed.  If more than `maxElapsed` milliseconds elapsed between calls, call `reportDelay`
with the elapsed duration.  Returns the created interval timer.

    const timer = qibl.monitorHeartbeat(100, 600, (actual, expected) =>
        console.log('Heartbeat delayed by ${actual - expected} ms'));


Classes
-------

### new Mutex( limit )

Create a mutual exclusion semaphore that allows `limit` concurrent users to a limited-use
resource; default `1` one.  A Mutex has one method: `acquire(func)`.  It queues `func`
waiting for the resource to be free, locks one unit of the resource, and calls
`func(release)`.  `release` is a callback that must be called to release the resource unit;
the resource will remain locked until freed, no timeout.

Note that the next call to use the mutex is invoked directly by the `release()` of the previous
call without the call stack being broken up, so queueing many hundreds of synchronous calls could
throw a "stack size exceeded" exception.  Note too that synchronous functions do not need to be
serialized, since they run inherently consecutively.

Mutex properties of interest
- `limit` - the configured maximum number of simultaneous users allowed
- `busy` - the count of users currently accessing the resource
- `queue` - the queue of calls waiting to access the resource

    mutex = new qibl.Mutex();
    mutex.acquire((release) => {
        useResource();
        release();
    });

### new Cron( )

Schedule precise-interval cronjobs.  A cronjob is a function taking a callback that it calls
when done and uses to report errors.  `Cron` schedules runtimes at exact multiples of the
configured interval, and calls the cron function once it has come due.  The next run will
only be scheduled after the previous run has finished, job runs will never overlap.  The
duration of the job does not affect the schedule, but an overdue job can cause the following
run to be skipped.  The different jobs are run in turn, in the order scheduled.

Note that `Cron` is explicitly strobed, it does not run its own timer:  `cron.run` must be
called with the current time at the cron scheduling granularity, eg every minute.

    cron = new qibl.Cron();
    cronTimer = setInterval(() => cron.run(Date.now()), 60000);

#### cron.schedule( intervalMs, cronjob(cb), [startMs, [errorCallback(err)]] )

Schedule a cronjob to run every `intervalMs` milliseconds from now, or from the optional
`startMs` time.  If provided, `errorCallback` will be called with any errors the cronjob
encounters each time it is run.  Cronjob exceptions are redirected to the error callback,
but errorCallback exceptions are fatal.

#### cron.cancel( cronjob )

Remove a cronjob from the list and do not run it any more.  Returns true if removed, false
if the `cronjob` was not scheduled.

#### cron.run( nowMs, callback )

Run the cronjobs that have come due, and call the `callback` when finished running them.
This call never returns errors, error reporting is done per job via their scheduled `errorCallback`.

    cron = new qibl.Cron();
    cron.schedule(60 * 1000, () => console.log('1 minute elapsed'));
    cron.run(Date.now() + 30000);
    // (nothing)
    cron.run(Date.now() + 60000);
    // => "1 minute elapsed"

### qids = new QuickId( uniqueSystemId )

Very very fast globally unique id generator, similar in structure to MongoDB ids, composed of
a time, a system identifier that uniquely distinguishes id sources, and a sequence number.
Uniqueness is ensured by the system id, which must be unique for each id source.  The default
system id is the empty string `''`.

#### qids.getId( )

Return a globally unique id composed of a 9-char monotonic time value, the system-wide
unique origin identifier provided to `QuickId`, and a 4-char sequence number.  The time and
sequence are base-32 encoded.  The time values are not realtime accurate, but are usually
close.  The ids are in ascending sort order and are guaranteed to be unique for each
system id.  `getId` is very very fast, it can generate tens of millions of unique ids per
second.

    new QuickId('-sys2-').getId();
    // => "1fkbndu7p-sys2-0000"

#### qids.parseId( id )

Decompose an id returned by `getId` into its component timestamp, system id and sequence number.
Only handles the standard 9-char timestamp / 4-char sequence id formats.

    new QuickId().parseId('1fkbndu7p-sys2-0008');
    // => { time: 1636776212729, sys: '-sys2-', seq: 8 }

### timebase = new Timebase( )

Fast source of approximate timestamps designed for efficient back-to-back calls.
Reuses the current timestamp for up to 5 milliseconds or 50 calls, whichever occurs first.

#### timebase.getNewerTimestamp( when )

Wait until the time has passed `when` milliseconds, and return the new current ms.
The wait is blocking, this call is intended for finding ms transition boundaries not sleeping.

### new Stopwatch( )

Restartable nanosecond resolution stopwatch timer.  Stopwatch timers check the time-of-day clock
when started and read, but consume no other resources and can be safely abandoned or left "running".
A newly created stopwatch is running, measuring elapsed time.

    var stopw = new qibl.Stopwatch();
    var elapsed = sw.read();
    // => elapsed time in seconds, with ns precision

#### stopw.read()

Return the total time accumulated on this stopwatch, in seconds with nanosecond resolution.
The current time is obtained with `qibl.microtime()`.
A newly created stopwatch is running, but can be stopped and restarted.

#### stopw.readMs()

Return the total time accumulated on the stopwatch, in millisconds.  Same as `read() * 1000`.

#### stopw.stop()

Pause the stopwatch.  The time elapsed so far is preserved, but does not increase while
stopped.  Stopping an already stopped stopwatch has no effect.

#### stopw.start()

Restart the stopwatch.  When restarted, the elapsed time will start growing again.
Restarting a running stopwatch has no effect.

#### stopw.reset()

Reset the elapsed time back to zero.  Does not clear the marked times.

#### stopw.mark( label )

Tag the current elapsed time with the provided label, and save it.  Reusing a label
overwrites the associated timestamp.

#### stopw.report( )

Return all tagged timestamps as an object with the labels as the keys and the associated
elapsed times as the values.

### dlist = new qibl.Dlist( )

Barebones doubly-linked circular list similar to [`qdlist`](https://npmjs.org/package/qdlist).
Each node on the list has properties `next` and `prev` linking to the next and previous node in
the list, respectively.  The list is itself a node with its `next` property pointing to the head
of the list, and `prev` to the tail.  For bests performance each node on the list should be
derived from `qibl.DlistNode` or have its first two properties, in order, be `next` and `prev`.

    function KeyVal(key, val) { this.key = key; this.val = val }
    qibl.inherits(KeyVal, qibl.DlistNode);

    var dlist = new qibl.Dlist();
    dlist.push(new KeyVal('a', 1));
    dlist.push(new KeyVal('b', 2));
    var secondKey = [...dlist][1].key;
    // => 'b'

#### dlist.insert( node, prev, next )

Link the node into the list to follow `prev` and precede `next`.

#### dlist.remove( node )

Unlink the node from the list, linking `node.next` to immediate follow `node.prev`.  A node must
not be removed if not on a list.

#### dlist.push( node )

Convenience method to link the node onto the tail of the list.  Returns `undefined` if the list is empty.
Same as `dlist.insert(node, dlist.prev, dlist)`.

#### dlist.shift( )

Convenience method to retrieve the node at the head of the list.
Same as `dlist.next !== dlist ? dlist.remove(dlist.next) : undefined`.

#### dlist.forEach( visitor(node, index, list) )

List iterator similar to `[].forEach`, walks the list from head to tail and calls the `visitor`
function with each node in turn.  The visitor is passed the node, the index of the node 0..N-1
on the list, and the list itself.

#### dlist._iterator, dlist[Symbol.iterator]

A Dlist is iteratable with `for ... of` or with the iterator returned by its `_iterator` method.

### lru = new qibl.LruCache( [capacity] )

Return an empty key-value store limited to `capacity` elements.  Once the cache max capacity is
reached, elements are displaced using a least-recently-used replacement policy.  By default the
`capacity` is unlimited.  LruCache is small, fast and iterable.

    const lru = new qibl.LruCache();
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    lru.get('b');               // b becomes the most recent
    const values = [...lru];
    // => [1, 3, 2]             // oldest is a, then c, and b most recent

#### lru.set( key, value )

Add the value to the cache, and make it the most recent.  If the `key` is already present its old
value is overwritten.  If the cache has reached its maximum capacity, adding a new key displaces
the oldest.

#### lru.get( key )

Return the value stored under the given `key`, or `undefined` if the `key` is not in the cache.

#### lru.has( key )

Return `true` if the `key` is in the cache, `false` if it is not.

#### lru.delete( key )

Remove the value indexed by `key` from the cache.

#### lru.keys( )

Return the keys of the elements currently in the cache.

### clist = new qibl.Clist( )

Efficient minimal circular list implemented with an Array, supporting just `push`, `shift` and `length`.
The list can grow without limit, but the array space freed when removing elements is not reclaimed (use
`list.resize()` to free unused storage space).
This is a stripped-down version of the very efficient [`qlist`](https://npmjs.org/package/qlist).

It is much much _much_ faster to push/shift off a circular list than a nodejs array once the array
has ~ 10,000 elements, because the nodejs javascript engine runs `shift` in _O(n^2)_ time once the
array exceeds a built-in threshold.

### clist.push( item )

Append the item to the end of the list.  The list grows as needed to fit the items.

### clist.shift( )

Remove and return the first item on the list, or `undefined` if the list is empty.

### clist.length

Getter property that always returns the count of elements on the list.

### clist.resize( [count] )

Double or halve the length of the storage array to better fit `count` elements, and retain `count`
elements.  If not specified `count` defaults to `clist.length`.  This method is used internally to
grow the list when appending items, and can be called to shrink the list to free unused storage.

    // reclaim any unused storage from the list
    clist.resize();


Changelog
---------

- 1.25.0 - new `monitorHeartbeat`, new `isSurrogatePair`, document `stringBound` and `timeitf`
- 1.24.1 - faster `startsWith` and `endsWith`, show 3 digits precision in elapsed `timeit.formatRate`,
           new undocumented `timeitf`, new undocumented `str_flatten`, `stringBound`
- 1.24.0 - new `mutexCall`, new `Clist`, faster Mutex implemented with Clist, document `timeit`,
           promote `formatRate` to qibl, better `timeit` calibration, `flags` tmpfile option, fix `tmpfile` for macOS
- 1.23.0 - add optional async mode to `tmpfile`, fix `getConfig` to show parse errors on stderr,
           fix `timeit` calibration, new `LruCache`, new `ansiColor`, expose `microtime.calibrate`
- 1.22.4 - log `getConfig` load errors that are not "Cannot find module" to expose eg syntax errors,
           fix `objectToError` to retain undefined own properties too
- 1.22.3 - only convert `errorToObject` error own properties to not restore inherited properties,
           more accurately restore `objectToError` error instances and return UnknwnError if __errorCtor not known
- 1.22.2 - fix `getConfig` to interpret relative paths against the current working directory,
           new experimental `timeit`, `timeit.autorageValue`, `timeit.formatRate`
- 1.22.1 - fix `forEachProperty` to return function properties, document `groupBy`,
           document `makeIterator`, `setIterator`, `getIterator`
- 1.22.0 - new `removeByIndex`, new `str_reverse`, new `remove2`, faster `concat2`, new `extractNotTo`,
           fix `extractTo` to not copy the property if mask is set to `undefined`, fix `globRegex` sh-style
           `[!abc]` charlist negation, expose `Timebase`, `noTimeout` option to `retry`, new `Dlist`
           doubly-linked circular list
- 1.21.2 - new preliminary `str_count`, prune search tree for much faster `globdir`, allow duplicate calls
           to `makeIteratorPeekable`, fix `str_count` to not infinite loop on zero-length patterns,
           recognize `mergeTo` as meaning `merge`, fix mergeTo to ensure hash when nesting properties
- 1.21.1 - have `retry` return the actual error on timeout, better `semverCompar` patch level handling
- 1.21.0 - new `Stopwatch`, add string support to `addslashes`, tmpfile `remove` option, fix obscure tmpfile unlink,
           tmpfile fail faster, support multi-term times in `parseMs`
- 1.20.1 - fix getConfig to not expose the _merge method,
           fix tmpfile to exit on sighup/int/term, and do nothing on sigquit
- 1.20.0 - new `forEachProperty`, `hashToMap`, `mapToHash`, new undocumented `makeIteratorPeekable`
- 1.19.4 - fix walktree 'visit' to not iterate strings, fix retry timeout and timeout error return
- 1.19.2 - faster diffarray
- 1.19.1 - support 'visit' in walktree
- 1.19.0 - new `getConfig`, new `errorToObject` and `objectToError`, new `tmpfile`, `socketpair`,
           `emitlines`, `emitchunks`
- 1.18.1 - `makeGetId` id helper, document `shuffle` (aka randomize) and `interleave2`
- 1.18.0 - new functions `batchCalls` (adapted from `qfifo`), `fromEntries`, and `QuickId` (adapted from `mongoid-js`)
- 1.17.1 - fix `parseMs` to return NaN for an empty string "" time interval
- 1.17.0 - `Cron` periodic interval job runner adapted from `miniq`, simple `parseMs` time interval notation
- 1.16.1 - fix globdir filename matching in `'.'`, make `assignTo` the primary and remove `copyObject` from the docs,
           call it `forEachCb`, fix `rmdir_r` on dangling symlinks, new undocumented `runSteps`,
           fix `globdir` to not report files visited after error
- 1.16.0 - new `forEachCb`, `mkdir_p`, `rmdir_r`, `globdir`, `concatBuf`; make `walkdir` accept `""` as synonym for ".",
           make `repeatUntil` iterate as fast as `repeatFor`, fix code to work under node-v0.6
- 1.15.2 - fix `walkdir` to recurse into symlinked directories if told to `'visit'`,
           fix `flatMap2` so can append self to self
- 1.15.1 - fix `flipTo` unit test to work with older node
- 1.15.0 - new `flipTo`, `getLastDefined`
- 1.14.1 - fix `copytreeDecycle` toJSON and cycles in arrays; faster copyObject on node-v10 and up
- 1.14.0 - new `chunk` array splitter, `copytreeDecycle` cycle-free object copy
- 1.13.1 - fix `retry` to return the computed result
- 1.13.0 - allow `extractTo` to copy nested properties
- 1.12.2 - experimental `flatMap2`
- 1.12.1 - make `difftree` recursively diff array contents for full json support, expose `diffarray`
- 1.12.0 - new `Mutex` from miniq, bump version for new calls
- 1.11.2 - calibrate microtime better for node v12 and up, rename to `semverCompar`, new `extractTo`, new `retry`
           document as `assignTo`
- 1.10.0 - new `difftree`, new `getProp` quicker property getter, concat2 of varargs, new `reparent`
- 1.9.0 - new `startsWith` / `endsWith`, document `str_locate`, new `walktree`
- 1.8.2 - optimize populate() separately for arrays and buffers,
          omit empty strings from generated compileVinterpolate code, calibrate microtime longer
- 1.8.1 - tune microtime accuracy, fix setProperty readonly mode (undocumented)
- 1.8.0 - new `makeError`, `compileVinterpolate`, `microtime`, `repeatFor`, `pairTo`, document repeatUntil, walkdir,
          fix getProperty() for un-dotted names longer than 40 chars, faster getProperty, faster iteration
- 1.7.3 - new undocumented `repeatUntil`, `walkdir`
- 1.7.2 - fix escaped \] in globRegex char lists [...]
- 1.7.1 - new function `globRegex`
- 1.6.3 - new function `compileGetProperty`
- 1.6.2 - new undocumented `str_random_word`, `str_random_sentence`, `fromCharCodes`, `tryError`
- 1.6.1 - faster `getProperty`, fix `range` for backward order with negative steps
- 1.6.0 - new function `entries`, `sort3i`; new undocumented functions `str_locate`, `randomize`, `interleave2`, `groupBy`, `sortBy`, `range`, `clone`;
          fix get/setIterator property name; speed up iterators, change makeIterator step func args; faster str_random
- 1.5.1 - fix getProperty, do not prevent multiple callbacks from readBody
- 1.5.0 - new functions `derive`, `varargsRenamed`, `isMethodContext`, `readBody`;
          make varargs attach the instance `this` if no `self` given,
          faster invoke2, faster varargs
- 1.4.0 - new functions `fill`, `subsample`, `omitUndefined`, `qsearch`, `sort3`, `clear`/`restoreListeners`, `str_random`,
          `mapById`, `groupByid`; document getProperty, setProperty; new undocumented `makeIterator`, `toArray`, `distinct`
- 1.3.0 - new function `populate()`
- 1.2.2 - new undocumented functions `getProperty`, `setProperty`, `once`
- 1.2.1 - fix thunkify
- 1.2.0 - faster varargs, new `concat2`, `keys`, `str_truncate`, `strtok`, `inherits`, `curry`
- 1.1.2 - fix invoke
- 1.1.1 - un-document the `addslashes` hidden param of `vinterpolate`
- 1.1.0 - new `tryRequire`
- 1.0.0 - first release
