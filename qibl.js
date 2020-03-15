/**
 * qibl -- quick itty-bitty library
 * Small functions and polyfills that I found useful.
 *
 * Copyright (C) 2019-2020 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2019-09-11 - AR.
 */

'use strict';

var nodeMajor = parseInt(process.versions.node);
var nodeMinor = +process.versions.node.split('.')[1];
var IteratorProperty = eval('typeof Symbol === "function" && Symbol.iterator || "_iterator"');

// use spread arguments if supported, is faster than .call or .apply
var invoke1 = eval("(nodeMajor < 6) && _invoke1 || tryEval('function(func, argv) { return func(...argv) }')");

// update 2020-03-06: am seeing _invoke2 as faster (as used in derive)
// call() is faster than apply() in node v0.10, v4.4.0, v6.11.1, v7.8.0; same speed in v8.11.1
// nb node-v10 is very slow to run .call with spread args
var invoke2 = eval("(nodeMajor < 8) && _invoke2 || tryEval('function(func, self, argv) { return func.apply(self, argv) }')");

// rest arguments are faster starting with node-v8
var varargs = eval("(nodeMajor < 8) && _varargs || tryEval('function(handler, self) { return function(...argv) { return handler(argv, _activeThis(self, this)) } }')");

function tryEval(str) { try { return eval('1 && ' + str) } catch (e) { } }

var qibl = module.exports = {
    isHash: isHash,
    isMethodContext: isMethodContext,
    copyObject: copyObject,     assign: copyObject,
    merge: merge,
    getProperty: getProperty,
    setProperty: setProperty,
    inherits: inherits,
    derive: derive,
    fill: fill,
    populate: populate,
    omitUndefined: omitUndefined,
    str_repeat: str_repeat,
    str_truncate: str_truncate,
    strtok: strtok,
    str_random: str_random,
    str_locate: str_locate,
    newBuf: saneBuf().new,
    allocBuf: saneBuf().alloc,
    fromBuf: saneBuf().from,
    toStruct: toStruct,
    clearListeners: clearListeners,
    restoreListeners: restoreListeners,
    readBody: readBody,
    varargs: varargs,
    _varargs: _varargs,
    varargsRenamed: varargsRenamed,
    thunkify: thunkify,
    invoke: invoke1,            invoke1: invoke1,
    invoke2: invoke2,
    _invoke1: _invoke1,
    _invoke2: _invoke2,
    concat2: concat2,
    subsample: subsample,
    qsearch: qsearch,
    sort3: sort3,
    curry: curry,
    once: once,
    tryRequire: tryRequire,
    escapeRegex: escapeRegex,
    keys: keys,
    values: values,
    entries: entries,
    selectField: selectField,
    mapById: mapById,
    groupById: groupById,
    distinct: distinct,
    makeIterator: makeIterator,
    setIterator: setIterator,
    getIterator: getIterator,
    toArray: toArray,
    vinterpolate: vinterpolate,
    addslashes: addslashes,
};

// hashes are generic objects without a class
// See also `qhash`.
function isHash( obj ) {
    return obj ? obj.constructor === Object : false;
}

function isMethodContext( self ) {
    return self && typeof self === 'object' && self !== qibl && self !== global || false;
}

// transfer the own properties of src onto target, aka Object.assign
// See also `qhash`.
function copyObject( target /* ,VARARGS */ ) {
    for (var src, i = 1; i < arguments.length; i++) {
        src = arguments[i];
        var keys = Object.keys(src);
        for (var j = 0; j < keys.length; j++) target[keys[j]] = src[keys[j]];
    }
    return target;
}

// recursively transfer all enumeriable properties of src(es) onto target
// See also `qhash`.
function merge( target /* ,VARARGS */ ) {
    for (var src, i = 1; i < arguments.length; i++) {
        src = arguments[i];
        for (var key in src) {
            var val = src[key];
            if (isHash(val)) { if (!isHash(target[key])) target[key] = merge({}, val); else merge(target[key], val) }
            else target[key] = val;
        }
    }
    return target;
}

// TODO: clone(): kinda like merge, but duplicate array properties too

/*
 * Get a nested property by dotted name, or return undefined if not set.
 * Undefined properties and properties set to `undefined` return defaultValue.
 * Adapted from qhash 1.3.0.
 * node-v10 and up tokenize: 1.6m/s v8, 3.7m/s v13, 2.4m/s v0.10
 * strtok: 2m/s v8, 4.4m/s v13, 2.47m/s v0.10
 * note: defaultValue support makes it 15% slower
 */
function getProperty( target, dottedName, defaultValue ) {
    if (typeof target === 'string' && isMethodContext(this)) return getProperty(this, target, dottedName);
    if (!target) return defaultValue;

    var first, path;
    if (dottedName.indexOf('.') < 0) { first = dottedName; path = [] } else { path = dottedName.split('.'); first = path[0] }

    target = target[first];
    for (var i = 1; i < path.length; i++) {
        if (target == null) return defaultValue;
        target = target[path[i]];
    }
    return target !== undefined ? target : defaultValue;
}

/*
 * Set a nested property by dotted name.
 * Adapted from qhash 1.3.0.
 * mode is a string containing 'x' if the property is non-enumerable ("expunged"), 'r' if it is "readonly".
 */
function setProperty( target, dottedName, value, mode ) {
    if (typeof target === 'string' && isMethodContext(this)) return setProperty(this, target, dottedName, value);
    if (!target || typeof target !== 'object' && typeof target !== 'function') return target;

    if (dottedName.indexOf('.') < 0 && !mode) { target[dottedName] = value; return target; }

    // note: split used to be much faster before node-v12
    var path = dottedName.split('.');
    for (var item=target, i=0; i<path.length-1; i++) {
        var field = path[i];
        if (!item[field] || typeof item[field] !== 'object') item[field] = {};
        item = item[field];
    }

    if (mode) setPropertyMode(item, path[path.length-1], value, mode);
    else item[path[path.length-1]] = value;

    return target;
}

function setPropertyMode( target, property, value, mode ) {
    // valid target is already checked for by setProperty
    // if (!target || (typeof target !== 'object' && typeof target !== 'function')) return;

    var isSetter = mode.indexOf('S') >= 0;
    var isGetter = mode.indexOf('G') >= 0;
    var isEnumerable = mode.indexOf('x') < 0;
    var isWritable = mode.indexOf('r') >= 0 && mode.indexOf('w') < 0;
    var isConfigurable = true;

    var u = undefined;
    var descriptor =
        isSetter ? { set: value, enumerable: isEnumerable, configurable: isConfigurable } :
        isGetter ? { get: value, enumerable: isEnumerable, configurable: isConfigurable } :
                   { value: value, enumerable: isEnumerable, writable: isWritable, configurable: isConfigurable };
    Object.defineProperty(target, property, descriptor);
}

// make the derived class inherit from the base
// NOTE: util.inherits does not inherit static class methods/properties,
// but qibl.inherits does, as does `class ... extends`
function inherits( derived, base ) {
    // static class properties
    var keys = Object.keys(base);
    for (var i = 0; i < keys.length; i++) derived[keys[i]] = base[keys[i]];

    // set up constructor and prototype linkage
    derived.prototype = { constructor: derived, __proto__: base.prototype };

    // to avoid assigning __proto__, can use the typescript linkage, ie:
    // function __() { this.constructor = derived }
    // __.prototype = base.prototype;
    // derived.prototype = new __();
}

// derive a subclass that inherits from the parent but customizes its own prototype
// note that is very slow to set-and-call a method in the constructor
// % timeit node -p 'function Foo(a,b,c){}; Bar = require("./").derive("Bar", Foo, {x: 1}); for (i=0; i<10000000; i++) x = new Bar(1,2,3); x.x'
// nb: v10 10e6 new Foo() .13, v11 .24; new Zed() that invokes Foo() .13
// nb: functions built with a scope run abysmally slow! (10x slower in node-v10)
// derive: 4m/s 4.0ghz R2600X
function derive( className, parent, proto, constructor ) {
    if (typeof proto === 'function') { var tmp = constructor; constructor = proto; proto = tmp }
    if (typeof parent !== 'function') throw new Error('parent not a function');
    if (constructor && typeof constructor !== 'function') throw new Error('constructor not a function');

    constructor = constructor || parent;
    var handler = function(args, self) { return invoke2(constructor, self, args) };
    var subclass = varargsRenamed(handler, className);

    qibl.inherits(subclass, parent);
    for (var k in proto) subclass.prototype[k] = proto[k];
    subclass.prototype = qibl.toStruct(subclass.prototype);

    return subclass;
}

// similar to fill() but for objects
function populate( target, val, options ) {
    if (Array.isArray(target) || target instanceof Buffer) {
        var base = options && options.base || 0;
        var bound = options && options.bound || target.length;
        if (typeof val === 'function') for (var i = base; i < bound; i++) target[i] = val(i);
        else for (var i = base; i < bound; i++) target[i] = val;
    }
    else {
        var keys = options && options.keys ? options.keys : Object.keys(target);
        kfill(target, keys, typeof val === 'function' ? val : function(k) { return val });
    }
    return target;
}
function kfill( target, keys, fn ) {
    // keyword fill
    for (var i = 0; i < keys.length; i++) { var k = keys[i]; target[k] = fn(k) }
    return target;
}

// compact by squeezing out undefined elements
function omitUndefined( item ) {
    var val, ret;
    if (Array.isArray(item)) {
        ret = new Array();
        for (var i=0; i<item.length; i++) if ((val = item[i]) !== undefined) ret.push(val);
    }
    else {
        ret = {};
        for (var k in item) if ((val = item[k]) !== undefined) ret[k] = val;
    }
    return ret;
}

// See also `sane-buffer`.
function fill( buf, ch, base, bound ) {
    // TODO: maybe typecheck args?
    // TODO: maybe support negative base/bound?
    base = base || 0;
    bound = bound || buf.length;
    for (var i = base; i < bound; i++) buf[i] = ch;
    return buf;
}

// concatenate two arrays, much faster than [].concat
// note that unlike [].concat, a1 and a2 must be arrays and are not flattened
function concat2( target, a1, a2 ) {
    for (var len = a1.length, i = 0; i < len; i++) target.push(a1[i]);
    if (a2) for (var len = a2.length, i = 0; i < len; i++) target.push(a2[i]);
    return target;
}

// return up to k randomly selected items from arr between base and bound,
// fewer than k if there are not that many items.
// Eg: pick 2 of [1,2,3,4]: get [1,2], replace 3 with 2/3 probability into slot [0] or [1],
// then replace 4 with 2/4 probability into slot [0], [1] or [2] (use i-th item with k/i odds).
// see also qheap
function subsample( items, k, base, bound ) {
    base = (base >= 0) ? base : 0;
    bound = (bound >= 0) ? bound : items.length;

    if (bound > items.length) bound = items.length;
    if (k > (bound - base)) k = bound - base;

    var samples = new Array();
    for (var i = 0; i < k; i++) samples.push(items[i + base]);
    for ( ; i < bound - base; i++) {
        var j = Math.floor(Math.random() * (i + 1));
        if (j < k) samples[j] = items[i + base];
    }
    return samples;
}

// find the last location in the range [min..max] that still has the property.
// Returs the largest index n >= min, n <= max where it holds, or (min - 1) if none do.
// aka see absearch(), binsearch()
function qsearch( min, max, probeProperty ) {
    // bisection search while have a lot to examine
    while ((max - min) > 3) {
        var mid = min + Math.floor((max - min) / 2);
        probeProperty(mid) ? min = mid + 1 : max = mid - 1;
    }

    // linear search once only a few possibilities left
    for (var n = max; n >= min; n--) if (probeProperty(n)) return n;

    // min-1 here is either the last n which probed ok, or the input min - 1
    return min - 1;
}

// special-purpose sort of 3 items, 40m/s vs [].sort() 5m/s
function sort3( a, b, c ) {
    // ascending:
    return (a <= b) ? (c <= a ? [c, a, b] : c <= b ? [a, c, b] : [a, b, c]) : sort3(b, a, c);
    // descending:
    // return (b > a) ? sort3(b, a, c) : (c > a ? [c, a, b] : c > b ? [a, c, b] : [a, b, c]);
}

// See also `qprintf`.
function str_repeat( str, n ) {

    if (typeof str !== 'string') str = String(str);
    // if (n <= 2) return (n === 2) ? str + str : (n === 1) ? str : '';

    // 20m x20 in 0.86s, vs 1.23s for self-recursive switch
    var ret = '';
    while (n >= 1) {
        if (n & 1) ret += str;
        str = str + str;
        n = n >>> 1;
    }
    return ret;
}

// trim the string to limit
function str_truncate( string, limit, opts ) {
    if (typeof string !== 'string' || typeof limit !== 'number') throw new Error('string and limit required');
    if (string.length <= limit) return string;
    if (opts && opts.delta > 0 && string.length <= limit + opts.delta) return string;
    return string.slice(0, limit) + ((opts && typeof opts.ellipsis === 'string') ? opts.ellipsis : '...');
}

// generate a random-ish string len chars long
// letter frequencies counted in this file, padded with blanks:
// var _random_charset = 'aaabccdeeeeeeffghiiijkllmnnnnooopqrrrrssstttttuuvwxyz           ';
var _random_charset = 'aaabccdeeeee ffghiiijkllmnnn ooopqrrr ssstttt uuvwxyz           ';
function str_random( len ) {
    var s = '', ix = Math.floor(Math.random() * 64);

    for (var i=0; i<len; i++) s += _random_charset[rand() & 0x3F];
    return s;

    function rand() {
        // https://en.wikipedia.org/wiki/Linear_congruential_generator
        // ix = (ix * 1103515245 + 12345) & 0x7FFFFFFF; // ANSI C mod 2^31, 10m/s; Math.random 10m/s
        ix = (ix * 65793 + 4282663) & 0x7FFFFF; // cc65, mod 2^23 12m/s
        return (ix >> 9); // bits 8..22 are usable
    }
}

// locate all substrings patt in string str, and call handler with their offsets
function str_locate( str, patt, handler, arg ) {
    var pos = 0;
    for (var pos = 0; pos < str.length; pos += patt.length) {
        if ((pos = str.indexOf(patt, pos)) >= 0) handler(pos, arg);
        else break;
    }
}

// similar to strtok() and strsep() but empty strings are allowed
// NOTE: this function is not reentrant
// On first call the string is remembered, on subsequent calls it should be null.
// Once the string is consumed the remembered string is cleared to null.
// FIXME: getProperty runs 6x faster split to array than tokenized.
var _strtokStr = null, _strtokBase = 0;
function strtok( str, sep ) {
    if (str != null) { _strtokStr = str; _strtokBase = 0 }
    if ((str = _strtokStr) === null) return null;

    var sepOffset = str.indexOf(sep, _strtokBase);
    if (sepOffset < 0) {
        var ret = str.slice(_strtokBase);
        _strtokStr = null;
    } else {
        var ret = str.slice(_strtokBase, sepOffset);
        _strtokBase = sepOffset + sep.length;
    }
    return ret;
}

// test-coverage-proof efficient polyfills to allocate new Buffers on any version of node
// Note that newer node can take a very large hit if the Buffer constructor is called from a helper function:
// allocBuf() and fromBuf() will be fast on all versions, but newBuf() will be slow on new node.
// see also sane-buffer, qbson/lib/new-buffer
function saneBuf( ) {
    return {
        new:   eval('nodeMajor < 10 ? Buffer : function(a, b, c) { return typeof(a) === "number" ? Buffer.allocUnsafe(a) : Buffer.from(a, b, c) }'),
        alloc: eval('nodeMajor >= 6 ? Buffer.allocUnsafe : Buffer'),
        // allocFill: function(n, ch) { var buf = qibl.allocBuf(n); if (ch !== undefined) qibl.fill(buf, ch); return buf },
        from:  eval('nodeMajor >= 6 ? Buffer.from : Buffer'),
    }
}

function toStruct( obj ) {
    return toStruct.prototype = obj;
}


// build a function that calls the handler with the arguments it was invoked with
// The function calls handler with the given `self`, or the object `this` if is a method call.
function _varargs( handler, self ) {
    var func = function( /* VARARGS */ ) {
        var len = arguments.length;
        var argv;
        switch (arguments.length) {
        case 0: argv = new Array(); break;
        case 1: argv = [arguments[0]]; break;
        // case 2: argv = [arguments[0], arguments[1]]; break;
        // case 3: argv = [arguments[0], arguments[1], arguments[2]]; break;
        default: argv = new Array(); for (var i = 0; i < len; i++) argv.push(arguments[i]); break;
        }
        return handler(argv, _activeThis(self, this));
    }
    return func;
}
function _activeThis( self, _this ) {
    return self !== undefined ? self : isMethodContext(_this) ? _this : undefined;
}

// like varargs, but create the varargs function with the given name
// nb: `handler` and `self` must be named the same in the funtion returned by varargs()
// because the built function will be bound to args in the current context when eval-d.
// nb: because of this, also no need to pass args to varargs()
function varargsRenamed( handler, funcName, self ) {
    var func = varargs();
    var src = String(func).replace(/^(function[\s]*[^\( ]*\s*\()/, 'function ' + funcName + '(');
    return eval('1 && ' + src);
}

// see also qinvoke
function thunkify( func, self ) {
    if (typeof func !== 'function') throw new TypeError('not a function');
    return varargs(function _gatherFuncArgs(argv) {
        // reserve space for the callback
        argv.push(null);
        return function _invokeFunc(cb) {
            // invoke the function on the curried args with this callback
            argv[argv.length - 1] = cb;
            self ? invoke2(func, self, argv) : invoke1(func, argv);
        }
    })
}

// build a function that incrementally binds partial arguments then calls fn with all expected args
// see ramda.curry, thunkify
function curry( fn ) {
    if (typeof fn !== 'function') throw new TypeError('not a function');

    // initial calls bind to partial arg lists and return a curried function
    return varargs(partials, { fn: fn, argc: fn.length, argv: null, self: this });

    function partials( av, state ) {
        var argv = state.argv ? concat2(new Array(), state.argv, av) : av;
        // once all expected args are present, invoke fn
        if (argv.length >= state.argc) return qibl.invoke(state.fn, argv);
        return varargs(partials, { fn: state.fn, argc: state.argc, argv: argv, self: state.self });
    }
}

// see also qinvoke
// _invoke1 and _invoke2 are used only if spread arguments are not supported
function _invoke1( func, argv ) {
    switch (argv.length) {
    case 0: return func();
    case 1: return func(argv[0]);
    case 2: return func(argv[0], argv[1]);
    case 3: return func(argv[0], argv[1], argv[2]);
    default: return func.apply(null, argv);
    }
}

function _invoke2( func, self, argv ) {
    switch (argv.length) {
    case 0: return func.call(self);
    case 1: return func.call(self, argv[0]);
    case 2: return func.call(self, argv[0], argv[1]);
    case 3: return func.call(self, argv[0], argv[1], argv[2]);
    default: return func.apply(self, argv);
    }
}

// build a function just like fn but that only runs once
function once( fn ) {
    var called = false;
    return varargs(function(av) {
        if (called) return;
        called = true;
        return qibl.invoke2(fn, this, av);
    })
}

function tryRequire( name ) {
    try { return require(name) } catch (e) { }
}

// remove and return all listeners for the specified event.
// See also `kubelogger`.
function clearListeners( emitter, event ) {
    // node-v0.8 returns the actual storage array whose contents will empty out
    // after the removeListeners below, so make our own copy of the array
    var listeners = emitter.listeners(event).slice(0);
    for (var i = 0; i < listeners.length; i++) emitter.removeListener(event, listeners[i]);
    return listeners;
}
// add all the listeners in the array to listen for the event
function restoreListeners( emitter, event, listeners ) {
    for (var i = 0; i < listeners.length; i++) emitter.on(event, listeners[i]);
    return listeners;
}

// gather and return the data emitted, default to '' if no data
function readBody( emitter, cb ) {
    var doneCount = 0, chunk1, chunks, data = '';
    emitter.on('data', function(chunk) {
        if (typeof chunk === 'string') data += chunk;
        else if (!chunk1) chunk1 = chunk;
        else if (!chunks) chunks = new Array(chunk1, chunk);
        else chunks.push(chunk);
    })
    emitter.on('end', function() {
        if (!chunk1) return cb(null, data);
        else if (!chunks) return cb(null, chunk1);
        else cb(null, Buffer.concat(chunks));
    })
    emitter.on('error', function(err) {
        cb(err);
    })
}

/**
function _copyFunctionProperties( target, src ) {
    var name, names = Object.getOwnPropertyNames(src);
    var skip = ['name', 'length', 'prototype'];
    for (var i = 0; i < names.length; i++) {
        if (skip.indexOf(names[i]) < 0) Object.defineProperty(target, names[i], Object.getOwnPropertyDescriptor(src, names[i]))
    }
}
**/


// backslash-escape the chars that have special meaning in regex strings
// See also microrest, restiq.
function escapeRegex( str ) {
    // For PCRE or POSIX, the regex metacharacters are:
    //   . [ (          - terms
    //   * + ? {        - repetition specifiers
    //   |              - alternation
    //   \              - escape char
    //   ^ $            - anchors
    //   )              - close paren (else invalid node regex)
    // Matching close chars ] } are not special without the open char.
    // / is not special in a regex, it matches a literal /.
    // : and = are not special outside of [] ranges or (?) conditionals.
    // ) has to be escaped always, else results in "invalid regex"
    return str.replace(/([.[(*+?{|\\^$=)])/g, '\\$1');
}

function selectField( arrayOfObjects, key ) {
    var values = new Array();
    for (var i = 0; i < arrayOfObjects.length; i++) {
        var obj = arrayOfObjects[i];
        (obj == null) ? values.push(undefined) : values.push(obj[key]);
    }
    return values;
}

// map or group the objects by a property value
// see qhash
function _mapById( arrayOfObjects, idName, target, all ) {
    // array.reduce((t, e) => e && (t[e[idName]] = e), target || {})
    target = target || {};
    all = all || false;
    for (var i = 0; i < arrayOfObjects.length; i++) {
        var obj = arrayOfObjects[i];
        if (obj == undefined) continue;
        var key = obj[idName];
        if (key === undefined) continue;
        (!all) ? target[key] = obj : (target[key]) ? target[key].push(obj) : target[key] = new Array(obj);
    }
    return target;
}
function mapById( items, idName, target ) {
    return _mapById(items, idName, target, false);
}
// group the objects by a property value
function groupById( items, idName, target ) {
    return _mapById(items, idName, target || {}, true);
}

function distinct( array ) {
    var found = {};
    for (var i = 0; i < array.length; i++) found[array[i]] = true;
    // note: object keys are displayed numbers first
    return Object.keys(found);
}

// given an traversal state update function that sets this.value and this.done,
// create a nodejs iterator to make the instance iterable.
// `step(state, ret)` should set `ret.value` or `ret.done` as appropriate.
// If ret.done is true, ret.value should not be used.
// see qdlist
//
// NOTE: the step function _must_ be a function() function, not an () => arrow function,
// because the latter does not associate with the instance and cannot set this.done.
//
// Convention: iterators that can be run only once return self,
// those that can be run many times must return a new iterator each time.
// The iterator object has a next() method that returns { value, done }.
// It is faster to use one object for both the iterator and its return value.
//
// iterator() returns a traversal object with a method next().
// next() returns a data wrapper with properties {value, done}.
// If done is set then value is not to be used.
function makeIterator( step, makeState ) {
    return function iterator() {
        // makeState is passed the object the iterator function is attached to
        var state = makeState && makeState(this) || {};
        return {
            value: 0,
            done: false,
            next: stepIterator,
            __step: step,
            __state: state,
        };
    }
    function stepIterator() { this.__step(this.__state, this); return this; }
}
// install the iterator as Symbol.iterator if the node version supports symbols, else as ._iterator
function setIterator( obj, iterator ) {
    obj[IteratorProperty] = iterator;
    return obj;
}
// return the iterator.  Note that iterators have to be called as a method call, ie iter.call(obj),
// to associate the iterator function with the instance being iterated.
function getIterator( obj ) {
    return obj[IteratorProperty];
}
function toArray( obj, filter ) {
    return _traverse(obj, filter, new Array());
}
// function arrayMap(arr, fn) { return _traverse(arr, fn, new Array()) }
// function arrayEach(arr, fn) { _traverse(arr, fn, { push: function(){} }) }
// function arrayFilter(arr, fn) { var ret = new Array(); _traverse(arr, fn, { push: function(x) { if (fn(x)) ret.push(x) } }); return ret }
function _traverse( obj, transform, target ) {
    var val, state;
    var isIterable = obj && obj[IteratorProperty] && (state = obj[IteratorProperty]()) && typeof state.next === 'function';

    if (isIterable && !Array.isArray(obj)) {
        for (var i = 0, val = state.next(); !val.done; val = state.next(), i++) {
            target.push(transform ? transform(val.value, i) : val.value);
        }
    } else if (obj && obj.length > 0) {
        // this loop mimics Array.from, but transforms quite a bit faster (13x node-v10.15, 15x node-v12)
        // testing transform? in the loop is faster than using two custom functions
        for (var i = 0; i < obj.length; i++) {
            target.push(transform ? transform(obj[i], i) : obj[i]);
        }
    }

    return target;
}

// Object.keys
function keys( object ) {
    return Object.keys(object);
}

// Object.values
function values( object ) {
    var keys = Object.keys(object);
    var ret = new Array();
    for (var i = 0; i < keys.length; i++) ret.push(object[keys[i]]);
    return ret;
}
// Object.entries
function entries( object ) {
    var ks = keys(object);
    var ret = new Array();
    for (var i = 0; i < ks.length; i++) ret.push([ks[i], object[ks[i]]]);
    return ret;
}

// replace each occurrence of patt in str with the next one of the args
// If an `addslashes` function is provided, use it to escape the args.
function vinterpolate( str, patt, args, addslashes ) {
    // older node is faster using split(), but split is much slower starting with node-v12,
    // so node-v12 100% faster and node-v13 25% faster with indexOf()
    var prevPos = 0, pos, ret = "", argix = 0, pattLen = patt.length;
    while ((pos = str.indexOf(patt, prevPos)) >= 0 && argix < args.length) {
        if (pos > prevPos) ret += str.slice(prevPos, pos);
        ret += typeof args[argix] === 'number' ? args[argix++]
            : addslashes ? addslashes('' + (args[argix++]))
            : '' + args[argix++];
        prevPos = pos + pattLen;
    }
    if (prevPos < str.length) ret += str.slice(prevPos);
    return ret;
}

/**
// return array with all locations of patt in str
function offsetsOf( str, patt ) {
    var offsets = new Array();
    str_locate(str, patt, function gather(ix, arr) { arr.push(ix) }, offsets);
    return offsets;
}
**/

function addslashes( str, patt ) {
    // TODO: default to escaping only \' \" \\ \0, pass them in for escapeshellcmd()
    patt = patt || /([\'\"\\\x00])/g;
    return str.replace(patt, '\\$1');
}

/**
var _warnings = {};
function warnOnce( key, message ) {
    if (key === undefined) throw new Error('missing key');
    if (_warnings[key] === undefined) {
        _warnings[key] = true;
        console.warn(message);
    }
}
**/
