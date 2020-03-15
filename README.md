qibl
====
[![Build Status](https://travis-ci.org/andrasq/node-qibl.svg?branch=master)](https://travis-ci.org/andrasq/node-qibl)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-qibl/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-qibl?branch=master)

Quick Itty-Bitty Library.

A miscellaneous collection of small functions and polyfills I wrote that that I found myself
reusing, gathered into a single place.  Most are pretty efficient, at times faster even
than the equivalent built-in.

If using the code cut-and-paste, include a comment line identifying the
qibl source version that it came from, e.g.

    // adapted from qibl@1.4.0
    function subsample() { ... }

To run the tests, check out the repo.

    qibl = require('qibl');

Topics:
- Objects
- Strings
- Arrays and Buffers
- Functions


API
---

Objects
-------

### qibl.isHash( object )

Test whether the object is a generic hash `{}` ie `new Object()`, or is an instance of some
class.  Tests the object constructor.

### qibl.isMethodContext( _this )

Test whether the given `this` is from a global (function call) context or a method call context.
Method calls have a `this` object that is not `global` and not `qibl`.

### qibl.copyObject( target, src1, ... )

Assign all enumerable own properties of the sources `src` onto `target`, and return
`target`.  Equivalent to `Object.assign`.

### qibl.merge( target, src1, ... )

Recursively copy all enumerable properties of the source objects, including inherited properties, onto
the `target` object.  All nested hashes are copied onto a new hash `{}` so the target
will not share any sub-object with any of the sources.  Non-hash objects (ie instances of
classes other than `Object`) are assigned by value.  Returns the `target`.

### qibl.getProperty( target, dottedName [,defaultValue] )

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

### qibl.setProperty( target, dottedName, value )

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

### qibl.inherits( Derived, Base )

Arrange for the Derived class to inherit class and instance methods and properties
from the Base class, including inherited properties.  Equivalent to `util.inherits`.

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


### qibl.toStruct( hash )

Convert the object from hashed accesses to an optimized mapped accesses analogous to `C`
`struct`s.  This exposes a hidden internal language detail:  V8 optimizes objects with a static
layout for more efficient access.

Accessing an object can over time result in it being optimized for mapped lookups or
optimized for hashed lookups, but making an object into a prototype forces an immediate
conversion to mapped lookups.  To retain the speedup, do not add new properties.

### qibl.selectField( arrayOfObjects, propertyName )

Return an array with the values of the named property from each object in the input
array.  The value is `undefined` if the property is not set.

    function selectField( array, name ) {
        return array.map((item) => item[name]);
    }

### qibl.mapById( items, idName [,target] )

Map the objects by a property value.  Returns a hash mapping each value to the
first object whose `idName` is set to that value.  Null and undefined objects are skipped.
Objects that do not have that property are skipped.
Id values should be strings or numbers.  Returns the target object, which is `{}` by default.

    var items = [{ id: 'a', v: 1 }, { id: 'b' }, { id: 'a', v: 2 }, { v: 3 }];
    qibl.mapById(items, 'id')
    // => { a: {id: 'a'}, b: {id: 'b'} }

### qibl.groupById( items, idName [,target] )

Similar to `mapById`, but group objects by property value into arrays.  Returns a mapping
of ids to lists of objects.  Objects that do not have the `idName` property set are omitted.

    var items = [{ id: 'a', v: 1 }, { id: 'b' }, { id: 'a', v: 2 }, { v: 3 }];
    qibl.mapById(items, 'id')
    // => { a: [{id: 'a', v: 1}, {id: 'a', v: 2}], b: [{id: 'b'}] }

### qibl.keys( object)

Return an array with the names of the own properties of the object.  Same as `Object.keys`,
present for symmetry with `values()`.

### qibl.values( object )

Return an array with the own properties of the object.  Equivalent to `Object.values`.

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


Strings
-------

### qibl.str_repeat( str, n )

Repeat the string value `str` `n` times.  N should be non-negative, else node will run out
of memory.  Uses an efficient O(log n) string doubling approach.  Returns the repeated string.
Equivalent to `String.prototype.repeat`.

### qibl.str_truncate( str, limit, options )

Shorten the string to not exceed `limit` characters by removing characters from the end.
The truncated portion is replaced with `...` or the provided `options.ellipsis`.

Options:
- `delta` - allow the string to exceed limit by a few characters. Default 0.
- `ellipsis` - replacement for the truncated part of the string. Default `...`.

### qibl.str_random( n )

Generate a random text exactly n characters long.  Uses the characters a-z and space ' '
with a frequency distribution similar to that of the qibl.js source file.

    qibl.str_random(20)         // => 'etnq ss q t ae kmunl'

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

### qibl.vinterpolate( string, substring, argv )

Replace each occurrence of the substring in string with the next argument in the vector
argv.  Substrings without a corresponding argument are not replaced.

    vinterpolate("Hello, %s!", '%s', ["world"]);
    // => "Hello, world!"

### qibl.addslashes( str [,regex] )

Backslash-escape characters in the string.  Without a regex, the characters escaped by
default are ', ", \ and \0 (single-quote, double-quote, backslash and NUL).

If a regex is passed in, the patterns matched by its first capturing group will be the ones
escaped instead.

    addslashes("curl test.com/;cat /etc/passwd", /([;|&$])/g);
    // => "curl test.com/\;cat /etc/passwd"


Buffers and Arrays
------------------

### qibl.fill( buf, ch [,base] [,bound] )

Fill the buffer or array with the value `ch` from starting offset `base` and up to the limit
`bound` (but not including `bound`).  Returns the target being filled.

Options:
- base - if target is an array, the starting offset to populate from.  Default `0`.
- bound - if target is an array, the limiting offset to populate to.  Default `target.length`.
- keys - if target is an object, the names of the properties to populate.  Default all own properties.

### qibl.concat2( target, arr1 [,arr2] )

Concatenate one or two arrays into the target array.  Returns the target array.

### qibl.subsample( items, k [,base, bound] )

Return a uniformly distributed subsample of k items selected from the items array between
the specified base and bound.  Base and bound default to 0 and items.length, respectively.
Returns at most as many items as there are in the array (or in the bounded range).

### qibl.qsearch( min, max, probe(n) )

Find the largest value n in the range [min..max] that still has the tested property,
i.e. `probe(n)` returns truthy.  Returns the index `n` if found, or `min - 1` if not
in the range.

### qibl.sort3( a, b, c )

Return an array containing the 3 items in ascending order.  Much faster than `[a, b, c].sort()`.

    qibl.sort3(3, 1, 2);
    // => [1, 2, 3]

### qibl.newBuf( arg, encodingOrOffset, length )

Construct a Buffer like `new Buffer()` used to before it was deprecated.  Note that with
newer node the constructor polyfill is slow compared to the `allocBuf` and `fromBuf` builders.

### qibl.allocBuf( length )

Create a new Buffer having the given length, with contents uninitialized.  This builder is a
pass-through to the native implementation (`Buffer.allocUnsafe` or `new Buffer`) and always runs
at full speed.

### qibl.fromBuf( contents )

Create a new Buffer with its contents pre-initialized to the given string, array or buffer.
This builder is a pass-through to the native implementation (`Buffer.from` or `new Buffer`) and
always runs at full speed.


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


Changelog
---------

- 1.6.0 - new function `entries`, new undocumented function `str_locate`
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
