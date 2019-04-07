qpoly
=====

Polyfills that I at times I wished I had, and wrote.

    qpoly = require('qpoly');


API
---

### qpoly.isHash( object )

Test whether the object is a generic hash `{}` ie `new Object()`, or is an instance of some
class.  Tests the object constructor.

### qpoly.copyObject( target, src1, ... )

Assign all enumerable own properties of the sources `src` onto `target`, and return
`target`.  Similar to `Object.assign`.

### qpoly.merge( target, src1, ... )

Recursively copy all enumerable properties of the source objects, including inherited properties, onto
the `target` object.  All nested hashes are copied onto a new hash `{}` so the target
will not share any sub-object with any of the sources.  Non-hash objects (ie instances of
classes other than `Object`) are assigned by value.  Returns the `target`.

### qpoly.fill( buf, ch [,base] [,bound] )

Fill the buffer or array with the value `ch` from starting offset `base` and up to the limit
`bound` (but not including `bound`).

### qpoly.str_repeat( str, n )

Repeat the string value `str` `n` times.  N should be non-negative, else node will run out
of memory.  Uses an efficient O(log n) string doubling approach.  Returns the repeated string.
Similar to `String.prototype.repeat`.

### qpoly.newBuf( arg, encodingOrOffset, length )

Construct a Buffer like `new Buffer()` used to before it was deprecated.

### qpoly.allocBuf( length )

Create a new Buffer having the given length, with contents uninitialized.

### qpoly.fromBuf( contents )

Create a new Buffer with its contents pre-initialized to the given string, array or buffer.

### qpoly.toStruct( hash )

Convert the object from hashed accesses to an optimized mapped accesses analogous to `C`
`struct`s.  This exposes a hidden internal language detail:  V8 optimizes objects with a static
layout for more efficient access.

Accessing an object can over time result in it being optimized for mapped lookups or
optimized for hashed lookups, but making an object into a prototype forces an immediate
conversion to mapped lookups.  To retain the speedup, do not add new properties.

### qpoly.varargs( handler(argv, self) [,self] )

Return a function that when called will in turn call handler with all its arguments in an
array.  This functionality is no longer really needed with ES6 rest args, but is useful for
portability.  It is not slower than rest args.

### qpoly.thunkify( func [,self] )

Split the method into two functions, one (the `thunk`) to partially apply the
function to the arguments and to return the other (the `invoke`) that runs the
function when called with a callback.  `thunkify` returns the thunk.

For example, given a function `fn(a, b, cb)`:

    function thunk(a, b) {
        return function invoke(cb) {
            return fn(a, b, cb);
        }
    }

### qpoly.invoke( fn, argv )

Call the function with the given argument vector.

### qpoly.invoke2( fn, self, argv )

Call the method on the object `self` with the given argument vector.

### qpoly.escapeRegex( str )

Backslash-escape all characters in str that would act as metacharacters inside a regular
expression.  Returns the string with escapes added.

### qpoly.values( object )

Return an array with the own properties of the object.  Similar to `Object.values`.

### selectField( arrayOfObjects, propertyName )

Return an array with the values of the named property from each object in the input
array.  The value is `undefined` if the property is not set.

### qpoly.vinterpolate( string, substring, argv [,addslashes] )

Replace each occurrence of the substring in string with the next argument in the vector
argv.  Substrings without a corresponding argument are not replaced.

    vinterpolate("Hello, %s!", '%s', ["world"]);
    // => "Hello, world!"

### qpoly.addslashes( str [,regex] )

Backslash-escape characters in the string.  Without a regex, the characters escaped by
default are ', ", \ and \0 (single-quote, double-quote, backslash and NUL).

If a regex is passed in, the patterns matched by its first capturing group will be the ones
escaped instead.

    addslashes("curl test.com/;cat /etc/passwd", /([;|&$])/g);
    // => "curl test.com/\;cat /etc/passwd"
