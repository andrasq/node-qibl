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

Recursively copy all enumerable properties of the source objects, inherited included, onto
the `target` object.  All nested hashes are copied onto a new hash `{}` so the target
will not share any sub-object with any of the sources.  Non-hash objects (ie instances of
classes other than `Object`) are assigned by value.  Returns the `target`.

### qpoly.fill( buf, ch [,base] [,bound] )

Fill the buffer or array with the value `ch` from starting offset `base` and up to the limit
`bound` (but not including `bound`).

### qpoly.str_repeat( str, n )

Repeat the string value `str` `n` times.  N should be non-negative, else node will run out
of memory.  Uses an efficient binary subdivision approach.  Returns the repeated string.
Similar to `String.prototype.repeat`.

### createBuffer( arg, encodingOrOffset, length )

Construct a Buffer like `new Buffer()` used to before it was deprecated.

### bufferFactory( )

Return a hash with three functions `from`, `alloc` and `allocUnsafe` that can each create a
new Buffer.  The implementation delegates to either the Buffer constructor or the Buffer
class factory methods, as appropriate.
