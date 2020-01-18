qibl
====
[![Build Status](https://travis-ci.org/andrasq/node-qibl.svg?branch=master)](https://travis-ci.org/andrasq/node-qibl)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-qibl/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-qibl?branch=master)

Quick Itty-Bitty Library.

A miscellaneous collection of small functions and polyfills I wrote that that I found myself
reusing, gathered into a single place.  Most are pretty efficient, at times faster even
than the equivalent built-in.

To run the tests, check out the repo.

    qibl = require('qibl');


API
---

Objects
-------

### qibl.isHash( object )

Test whether the object is a generic hash `{}` ie `new Object()`, or is an instance of some
class.  Tests the object constructor.

### qibl.copyObject( target, src1, ... )

Assign all enumerable own properties of the sources `src` onto `target`, and return
`target`.  Equivalent to `Object.assign`.

### qibl.merge( target, src1, ... )

Recursively copy all enumerable properties of the source objects, including inherited properties, onto
the `target` object.  All nested hashes are copied onto a new hash `{}` so the target
will not share any sub-object with any of the sources.  Non-hash objects (ie instances of
classes other than `Object`) are assigned by value.  Returns the `target`.

### qibl.inherits( Derived, Base )

Arrange for the Derived class to inherit class and instance methods and properties
from the Base class, including inherited properties.  Equivalent to `util.inherits`.

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

### qibl.keys( object)

Return an array with the names of the own properties of the object.  Same as `Object.keys`,
present for symmetry with `values()`.

### qibl.values( object )

Return an array with the own properties of the object.  Equivalent to `Object.values`.


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

### qibl.strtok( str, sep )

Separate the string `str` into parts delimited by the separator `sep`.  When called with a
non-null string, it returns the first delimited token contained in the string.  When called
with a `null` string it returns the second, third, etc tokens.  The separator must be
provided each time, and may change between calls.

NOTE: this function is not reentrant, a second call with a non-null string will overwrite
the previous state.  It behaves like to the `C` `strtok()` library function.

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

### qibl.populate( target, val [,options ] )

Similar to `fill()`, but can can fill with computed values and can also populate objects.
If `val` is a function the array will be filled with the return values of `val(i)` when
called with the array offset `i` being stored into.  Returns the target being populated.

    // generate 10 random numbers
    var rands = qibl.populate(new Array(10), Math.random);

    // function to generate the range [0..limit]
    var range = (limit) => qibl.populate(new Array(limit), (i) => i);

    // initialize properties a and c to 'a' and 'c', respectively
    var obj = { a: 1, b: 2 }
    qibl.populate(obj, (k) => k, { keys: ['a', 'c'] });
    // => { a: 'a', b: 2, c: 'c' }

Options:
- base - if target is an array, the starting offset to populate from.  Default `0`.
- bound - if target is an array, the limiting offset to populate to.  Default `target.length`.
- keys - if target is an object, the names of the properties to populate.  Default all own properties.

### qibl.concat2( target, arr1 [,arr2] )

Concatenate one or two arrays into the target array.  Returns the target array.

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
    var f = qibl.curry(sum3);
    // => [function]

    f(1, 2, 3, 4)
    f(1)(2)(3)(4)
    f(1, 2)(3)(4, 5)
    // => 10

### qibl.tryRequire( name )

Suppress the error from `require(name)`.  Returns the module, or `undefined` if unable to
load.


Changelog
---------

- 1.3.0 - new function populate()
- 1.2.2 - new undocumented functions getProperty, setProperty, once
- 1.2.1 - fix thunkify
- 1.2.0 - faster varargs, new `concat2`, `keys`, `str_truncate`, `strtok`, `inherits`, `curry`
- 1.1.2 - fix invoke
- 1.1.1 - un-document the `addslashes` hidden param of `vinterpolate`
- 1.1.0 - new `tryRequire`
- 1.0.0 - first release
