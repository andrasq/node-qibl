/**
 * qibl -- quick itty-bitty library
 * Small functions and polyfills that I found useful.
 *
 * Copyright (C) 2019-2022 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2019-09-11 - AR.
 */

'use strict';

var fs = require('fs');
var events = require('events');
var net = require('net');
var path = require('path');
var util = require('util');

var nodeMajor = parseInt(process.versions.node);
var nodeMinor = +process.versions.node.split('.')[1];
var IteratorProperty = eval('typeof Symbol === "function" && Symbol.iterator || "_iterator"');

// use spread arguments if supported, is faster than .call or .apply
var invoke1 = eval("(nodeMajor < 6) && _invoke1 || tryEval('function(func, argv) { return func(...argv) }')");

// update 2020-03-06: am seeing _invoke2 as faster (as used in derive)
// call() is faster than apply() in node v0.10, v4.4.0, v6.11.1, v7.8.0; same speed in v8.11.1
// nb node-v10 is very slow to run .call with spread args
var invoke2 = eval("(nodeMajor < 8) && _invoke2 || tryEval('function(func, self, argv) { return func.apply(self, argv) }')");

var Hashmap = eval("nodeMajor >= 1 && typeof global.Map === 'function' ? global.Map : _Hashmap");

// rest arguments are faster starting with node-v8
var varargs = eval("(nodeMajor < 8) && _varargs ||" +
    " tryEval('function(handler, self) { return function(...argv) { return handler(argv, _activeThis(self, this)) } }')");

var setImmediate = eval('global.setImmediate || function(fn, a, b) { process.nextTick(function() { fn(a, b) }) }')

function tryEval(str) { try { return eval('1 && ' + str) } catch (e) { } }
// function tryError(str) { throw new Error(str) }

var qibl = module.exports = {
    isHash: isHash,
    isMethodContext: isMethodContext,
    copyObject: assignTo,       assign: assignTo,       assignTo: assignTo,
    merge: merge,               mergeTo: merge,
    getProperty: getProperty,
    compileGetProperty: compileGetProperty,
    getProp: getProp,
    setProperty: setProperty,
    getLastDefined: getLastDefined,
    inherits: inherits,
    derive: derive,
    clone: clone,
    reparent: reparent,
    fill: fill,
    populate: populate,
    omitUndefined: omitUndefined,
    Hashmap: Hashmap,
    _Hashmap: _Hashmap,
    forEachProperty: forEachProperty,
    hashToMap: hashToMap,
    mapToHash: mapToHash,
    str_repeat: str_repeat,
    str_truncate: str_truncate,
    strtok: strtok,
    fromCharCodes: fromCharCodes,
    str_random: str_random,
    str_random_word: str_random_word,
    str_random_sentence: str_random_sentence,
    str_locate: str_locate,
    str_count: str_count,
    str_reverse: str_reverse,
    compareVersions: semverCompar,
    semverCompar: semverCompar,
    startsWith: startsWith,
    endsWith: endsWith,
    newBuf: saneBuf().new,
    allocBuf: saneBuf().alloc,
    fromBuf: saneBuf().from,
    concatBuf: saneBuf().concat,
    toStruct: toStruct,
    clearListeners: clearListeners,
    restoreListeners: restoreListeners,
    readBody: readBody,
    emitlines: emitlines,
    emitchunks: emitchunks,
    varargs: varargs,
    _varargs: _varargs,
    varargsRenamed: varargsRenamed,
    thunkify: thunkify,
    invoke: invoke1,            invoke1: invoke1,
    invoke2: invoke2,
    _invoke1: _invoke1,
    _invoke2: _invoke2,
    concat2: concat2,
    flatMap2: flatMap2,
    removeByIndex: removeByIndex,
    remove2: remove2,
    chunk: chunk,
    subsample: subsample,
    qsearch: qsearch,
    sort3: sort3,
    sort3i: sort3i,
    swap3i: swap3i,
    shuffle: randomize,
    randomize: randomize,
    interleave2: interleave2,
    range: range,
    curry: curry,
    once: once,
    tryRequire: tryRequire,
    escapeRegex: escapeRegex,
    globRegex: globRegex,
    repeatUntil: repeatUntil,
    repeatFor: repeatFor,       repeatForCb: repeatFor,
    forEachCb: forEachCb,
    runSteps: runSteps,
    batchCalls: batchCalls,
    walkdir: walkdir,
    mkdir_p: mkdir_p,
    rmdir_r: rmdir_r,
    tmpfile: tmpfile,
    globdir: globdir,
    walktree: walktree,
    copytreeDecycle: copytreeDecycle,
    difftree: difftree,
    diffarray: diffarray,
    retry: retry,
    Mutex: Mutex,
    Cron: Cron,
    socketpair: socketpair,
    keys: keys,
    values: values,
    entries: entries,
    fromEntries: fromEntries,
    pairTo: pairTo,
    flipTo: flipTo,
    extractTo: extractTo,
    extractNotTo: extractNotTo,
    selectField: selectField,
    mapById: mapById,
    groupById: groupById,
    groupBy: groupBy,
    sortBy: sortBy,
    distinct: distinct,         uniq: distinct,
    makeIterator: makeIterator,
    setIterator: setIterator,
    getIterator: getIterator,
    IteratorProperty: IteratorProperty,
    makeIteratorPeekable: makeIteratorPeekable,
    toArray: toArray,
    vinterpolate: vinterpolate,
    compileVinterpolate: compileVinterpolate,
    addslashes: addslashes,
    makeError: makeError,
    microtime: microtime,
    parseMs: parseMs,
    QuickId: QuickId,
    makeGetId: makeGetId,
    require: require, // for stubbing
    getConfig: getConfig,
    errorToObject: errorToObject,
    objectToError: objectToError,
    Stopwatch: Stopwatch,
    // _configure: _configure,
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
function assignTo( target /* ,VARARGS */ ) {
    for (var src, i = 1; i < arguments.length; i++) {
        // node-v10 and up assign() is faster than a manual loop, but on older node is 5-10x slower
        /* istanbul ignore next */
        if (nodeMajor >= 10) Object.assign(target, arguments[i]);
        else {
            src = arguments[i];
            var keys = qibl.keys(src);
            for (var j = 0; j < keys.length; j++) target[keys[j]] = src[keys[j]];
        }
    }
    return target;
}

// recursively transfer all enumeriable properties of src(es) onto target
// See also `qhash`.
// TODO: should only merge own properties, for consistency with the Object.* functions
function merge( target /* ,VARARGS */ ) {
    for (var src, i = 1; i < arguments.length; i++) {
        for (var key in (src = arguments[i])) {
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
 * note: since node-v12 this function is much slower, dropped from 13m/s to 7m/s
 */
function isNull(obj) { return obj === undefined || obj === null }
function getProperty( target, dottedName, defaultValue ) {
    if (typeof target === 'string' && isMethodContext(this)) return getProperty(this, target, dottedName);

    if (dottedName.indexOf('.') < 0) return (!isNull(target) && target[dottedName] !== undefined ? target[dottedName] : defaultValue);

    var path = dottedName.split('.');
    target = isNull(target) ? undefined : target[path[0]];
    target = isNull(target) ? undefined : target[path[1]];
    if (path.length > 2) {
        target = isNull(target) ? undefined : target[path[2]];
    if (path.length > 3) {
        target = isNull(target) ? undefined : target[path[3]];
        for (var i = 4; i < path.length; i++) target = isNull(target) ? undefined : target[path[i]];
    }}
    return target !== undefined ? target : defaultValue;
}
// compile the property getter for 10x faster property lookups.
// Returns a dedicated function to retrieve the named property of the objects passed to it.
// CAUTION: property names must be valid identifiers, else a run-time error is thrown by eval.
// TODO: compile to array notation, to allow numbers and arbitrary strings as property names
function compileGetProperty( path ) {
    var pretest = '(o !== null && o !== undefined)';
    var end = -1;
    while ((end = path.indexOf('.', end + 1)) >= 0) {
        pretest += ' && ' + 'o.' + path.slice(0, end);
    }
    var getter = tryEval('function(o) { return (' + pretest + ') ? o.' + path + ' : undefined }');
    return getter;
}

// quicker getProperty: 45m/s vs 8.8m/s 4.475g 3800X (58m/s 4.8g 5600X)
var _getters = {};
var _getterCount = 0;
function getProp( obj, path, _default ) {
    // periodically garbage collect the precompiled getters
    if (_getterCount >= getProp.maxCount) (_getterCount = 0, _getters = {});

    var getter = _getters[path] || (_getterCount++, _getters[path] = compileGetProperty(String(path)));
    var value = getter(obj);
    return value !== undefined ? value : _default;
}
getProp.maxCount = 10000;
getProp.getCache = function() { return _getters };
getProp.clearCache = function() { _getters = {} };

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
    var isReadonly = mode.indexOf('r') >= 0 && mode.indexOf('w') < 0;
    var isConfigurable = true;

    var u = undefined;
    var descriptor =
        isSetter ? { set: value, enumerable: isEnumerable, configurable: isConfigurable } :
        isGetter ? { get: value, enumerable: isEnumerable, configurable: isConfigurable } :
                   { value: value, enumerable: isEnumerable, writable: !isReadonly, configurable: isConfigurable };
    Object.defineProperty(target, property, descriptor);
}

/*
 * Return the last argument that is defined, ie is not null or undefined.
 * A counterpart to (a || b || c), usable to select eg (builtin, configured, provided)
 */
function getLastDefined( /* VARARGS */ ) {
    var len = arguments.length, arg;
    for (var i = len - 1; i >= 0; i--) if ((arg = arguments[i]) !== undefined && arg !== null) return arg;
    return undefined;
}

// make the derived class inherit from the base
// NOTE: util.inherits does not inherit static class methods/properties,
// but qibl.inherits does, as does `class ... extends`
function inherits( derived, base ) {
    // static class properties
    var keys = qibl.keys(base);
    for (var i = 0; i < keys.length; i++) derived[keys[i]] = base[keys[i]];

    // set up constructor and prototype linkage
    // Traditionally Derived prototype constructor is Derived, with its __proto__ from Base.
    // NOTE: class Derived() has a read-only, un-deletable, un-redefinable prototype
    // util.inherits does not alter it, we crash
    derived.prototype = qibl.reparent({}, derived, base.prototype).__proto__;
}

// derive a subclass that inherits from the parent but customizes its own prototype
// note that is very slow to set-and-call a method in the constructor
// % node -p
//   'function Foo(a,b,c){}; Bar = require("./").derive("Bar", Foo, {x: 1}); for (i=0; i<10e6; i++) x = new Bar(1,2,3); x.x'
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

var _builtinClasses = [Number, String, Boolean, Date, RegExp];
function clone( object, recursively ) {
    // nb: functions and non-objects are not cloned
    if (!object || typeof object !== 'object') return object;

    // clone the underlying object
    var arrayLike = false;
    var copy =
        (object instanceof Array) ? ((arrayLike = true), qibl.toArray(object)) :
        (object instanceof Buffer) ? ((arrayLike = true), qibl.fromBuf(object)) :
        (_builtinClasses.indexOf(object.constructor) >= 0) ? new object.constructor(object) :
        reparent({}, object.constructor);

    // copy the own properties
    keys = qibl.keys(object);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (arrayLike && key >= 0) continue;
        var item = object[key];
        copy[key] = recursively ? qibl.clone(item) : item;
    }

    return copy;
}

// forcibly make obj inherit from ctor
// Traditionally, if Class extends Base then Class.prototype = { constructor: Class, __proto__: Base },
// but the prototype constructor is not enumerable (and Class.prototype is not instanceof Class).
// Thus Class.prototype is not instanceof Derived, and Derived.prototype.constructor is not enumerable.
// Assigning {} instead is functionally the same but is faster.
function reparent( obj, ctor, proto ) {
    // if (typeof ctor !== 'function') throw new Error('constructor not a function');
    obj.constructor = ctor;
    obj.__proto__ = { constructor: ctor, __proto__: proto || ctor.prototype };
    return obj;

    // to avoid assigning __proto__, can use the typescript linkage, ie:
    // function __() { this.constructor = derived }
    // __.prototype = base.prototype;
    // derived.prototype = new __();
}

// similar to fill() but for objects
function _fillit(target, val, options) {
    var base = options && options.base || 0;
    var bound = options && options.bound || target.length;
    if (typeof val === 'function') for (var i = base; i < bound; i++) target[i] = val(i);
    else for (var i = base; i < bound; i++) target[i] = val;
}
var _fillit_a = eval('true && ' + _fillit); // _fillit optimized for arrays
var _fillit_b = eval('true && ' + _fillit); // _fillit optimized for buffers
function populate( target, val, options ) {
    if (Array.isArray(target)) _fillit_a(target, val, options);
    else if (Buffer.isBuffer(target)) _fillit_b(target, val, options);
    else {
        var keys = options && options.keys ? options.keys : qibl.keys(target);
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

function forEachProperty( hash, visitor ) {
    // only iterate objects / arrays / Buffers, not strings
    var keys = hash && typeof hash === 'object' ? Object.keys(hash) : [];
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        visitor(hash[key], key, hash);
    }
}

var _setMap = {};
var _setMapProperty = function(value, key) { _setMap.set(key, value) };
function hashToMap( hash, map ) {
    _setMap = map || new Hashmap();
    if (hash) forEachProperty(hash, _setMapProperty);
    return _setMap;
}

var _setHash = {};
var _setHashProperty = function(value, key) { _setHash[key] = value };
function mapToHash( map, hash ) {
    _setHash = hash || {};
    map.forEach(_setHashProperty);
    return _setHash;
}


// See also `sane-buffer`.
function fill( buf, ch, base, bound ) {
    base = base || 0;
    bound = bound || buf.length;
    for (var i = base; i < bound; i++) buf[i] = ch;
    return buf;
}

// concatenate two arrays, much faster than [].concat for short arrays
// note that unlike [].concat, a1 and a2 must be arrays and are not flattened
function concat2( target, a1, a2 /* VARARGS */ ) {
    if (!a1) return target;
    var len = a1.length, to = target.length; target.length += a1.length;
    for (var i = 0; i < len; i++) target[to++] = a1[i];
    if (a2) for (var ai=2; ai<arguments.length; ai++) {
        a2 = arguments[ai];
        for (var len = a2.length, i = 0; i < len; i++) target.push(a2[i]);
    }
    return target;
}

// like [].flatMap but appended to the dst array and 20x faster (node-v12)
// flatMap implements `[].concat(...arr.map(compute))`
function flatMap2( dst, src, compute ) {
    for (var len = src.length, i = 0; i < len; i++) {
        if (!(i in src)) continue;
        var val = compute(src[i], i, src);
        Array.isArray(val) ? qibl.concat2(dst, val) : dst.push(val);
    }
    return dst;
}

// like php array_chunk(), split an array into batches
// invalid results return an empty array like lodash.chunk, not null like php
function chunk( array, batchSize ) {
    if (!array || batchSize < 1) return [];
    var base = 0, chunks = [];
    while (base < array.length) {
        chunks.push(array.slice(base, base += batchSize));
    }
    return chunks;
}

// arr.splice(ix, 1) but much faster; does not wrap the removed item in an array
function removeByIndex( arr, ix ) {
    if (ix < 0 || ix >= arr.length) return undefined;
    var removed = arr[ix];
    for (var i = ix + 1; i < arr.length; i++) arr[i - 1] = arr[i];
    arr.pop(); // faster to pop than to adjust arr.length, and much faster than to splice
    return removed;
}

// similar to array.filter(), but update the array in-place and return the modified array
function remove2( arr, filter, removeds ) {
    for (var i = 0, j = 0; j < arr.length; j++) {
        if (filter(arr[j], j, arr)) removeds && removeds.push(arr[j]);
        else arr[i++] = arr[j];
    }
    if (i !== j) arr.length = i;
    return arr;
}

// return up to k randomly selected items from arr between base and bound,
// fewer than k if there are not that many items.
// Eg: pick 2 of [1,2,3,4]: get [1,2], replace 3 with 2/3 probability into slot [0] or [1],
// then replace 4 with 2/4 probability into slot [0], [1] or [2] (use i-th item with k/i odds).
// see also qheap, https://en.wikipedia.org/wiki/Reservoir_sampling#Algorithm_R
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
// Returs the largest index n >= min, n <= max where probe(n) holds, or (min - 1) if none do.
// aka see absearch(), binsearch()
function qsearch( min, max, probeProperty ) {
    // bisection search while have a lot to examine
    while ((max - min) > 5) {
        var mid = min + Math.floor((max - min) / 2);
        probeProperty(mid) ? min = mid + 1 : max = mid - 1;
    }

    // linear search once only a few possibilities left
    for (var n = max; n >= min; n--) if (probeProperty(n)) return n;

    // min here is either the smallest n which failed the probe, or the input min
    return min - 1;
}

// special-purpose sort of 3 items, 40m/s vs [].sort() 5m/s
function sort3( a, b, c ) {
    return (a <= b) ? (c <= a ? [c, a, b] : c <= b ? [a, c, b] : [a, b, c]) : sort3(b, a, c); // ascending
    // return (b > a) ? sort3(b, a, c) : (c > a ? [c, a, b] : c > b ? [a, c, b] : [a, b, c]); // descending
}
function sort3i( arr, i, j, k ) {
    if (arr[j] < arr[i]) { swapi(arr, i, j); sort3i(arr, i, j, k) }
    if (arr[k] < arr[i]) { var t = arr[k]; arr[k] = arr[j]; arr[j] = arr[i]; arr[i] = t; return }
    if (arr[k] < arr[j]) swapi(arr, j, k);
}
function swapi( a, i, j ) {
    var t = a[i]; a[i] = a[j]; a[j] = t;
}
// swap a[i] for a[j] and a[j] for a[k], leaving a[i] in a[k]
function swap3i( a, i, j, k ) {
    var t = a[i]; a[i] = a[j]; a[j] = a[k]; a[k] = t;
}
/**
// swap the 3 array elements so that a[i] = a[j], a[j] = a[k], and a[k] = a[i];
function mov3i( a, i, j, k ) { var t = a[i]; a[i] = a[j]; a[j] = a[k]; a[k] = t }
function rotl3i(a, i, j, k) { return mov3i(a, i, j, k) }
function rotr3i(a, i, j, k) { return mov3i(a, k, j, i) }
**/

// randomly shuffle the contents of the array between base and bound
// see qshuffle, Fisher-Yates shuffle
function randomize( arr, base, bound ) {
    base = base < 0 ? base + arr.length : base || 0;
    bound = bound < 0 ? bound + arr.length : bound || arr.length;

    for (var end = bound; end > base; end--) {
        var gap = end - base;
        var pick = Math.floor(Math.random() * gap);
        swapi(arr, base + pick, end - 1);
    }
    return arr;
}

// interleave the elements from arrays a and b into target
// Any extra elements are appended as-is.  Returns target.
function interleave2( target, a1, a2 ) {
    var short = a1.length < a2.length ? a1 : a2;
    var long = a1.length < a2.length ? a2 : a1;
    for (var i = 0; i < short.length; i++) target.push(a1[i], a2[i]);
    for ( ; i < long.length; i++) target.push(long[i]);
    return target;
}

/*
 * return an iterable object that will enumerate the values in the range [first..last]
 * nb: lodash and underscore omit the last point, and single-argument versions starts with 0.
 * nb: we return an iterator, lodash and underscore return an array (and impose a max length)
 */
function range( first, last, stepBy ) {
    if (last == undefined) { last = first; first = 0 }
    if (stepBy != undefined && typeof stepBy !== 'function' && typeof stepBy !== 'number') {
        throw new Error('stepBy is not a number or function');
    }

    return qibl.setIterator({}, qibl.makeIterator(step, makeState));

    function makeState() {
        return typeof stepBy === 'function'
            ? { n: first, last: last, stepBy: stepBy, step: first <= last ? +1 : -1 }
        : typeof stepBy === 'number'
            ? { n: first, last: last, stepBy: null, step: (first <= last) === (stepBy >= 0) ? +stepBy : -stepBy }
        : { n: first, last: last, stepBy: null, step: first <= last ? +1 : -1 }
    }

    function step(state) {
        this.done = (state.step >= 0 ? state.n >= state.last : state.n < state.last);
        this.value = state.n;
        state.stepBy ? state.n = state.stepBy(state.n) : state.n += state.step;
    }
}


// See also `qprintf`.
function str_repeat( str, n ) {

    str = '' + str;
    if (n <= 2) return (n === 2) ? str + str : (n === 1) ? str : '';

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

// fromCharCode with many args is faster but only since node-v0.11; spread args faster since node-v8
// In newer node versions fromCharCode.apply is also fast, but spread args are faster.
// fromCharCode.apply is only fast since node-v8, spread args are faster but were 30x slower before v8
// Node before v0.11 is slow with multi-arg fromCharCode and is faster with a convert-char-at-a-time loop.
// use eval to hide the code from the coverage tool
var _charCode = String.fromCharCode
var fromCharCodesLoop = eval("true && function(a) { for (var s='', i=0; i<a.length; i++) s += _charCode(a[i]); return s }");
var fromCharCodesSpread = tryEval("true && function(a) { return String.fromCharCode(...a) }");
var fromCharCodesFast = eval("parseInt(process.versions.node) >= 9 ? fromCharCodesSpread : fromCharCodesLoop");
function fromCharCodes( codes ) {
    return fromCharCodesFast(codes);
}

// generate a random-ish string len chars long
// letter frequencies counted in this file, padded with blanks:
// var _random_charset = 'aaabccdeeeeeeffghiiijkllmnnnnooopqrrrrssstttttuuvwxyz           ';
// var _random_charset = 'aaabccdeeeee ffghiiijkllmnnn ooopqrrr ssstttt uuvwxyz           ';
var _word_charset =   'aaaabbcccddeeeeeefffgghiiiijkkllmnnnooooppqrrrsssstttttuuuvwxyzz';
var _random_charset = 'aaab ccde eeee ffgh iiij kllm nnn ooop qrrr ssst ttt uuvw xyz   ';
var hex_charset =     '0123456789abcdef01234567-9abcdef0123456789a-cdef0123456789abcdef';
function str_random( len, charset ) {
    charset = charset || _random_charset;
    var s = '';

    while (len > 0) {
        // var v = (Math.random() * 0x10000000000) >>> 0;
        var v = Math.random() * 0x10000000000;
        switch (len) {
        default:
        case 4: s += charset[(v >>> 0) & 0x3F];
        case 3: s += charset[(v >>>  8) & 0x3F];
        case 2: s += charset[(v >>> 16) & 0x3F];
        case 1: s += charset[(v >>> 24) & 0x3F];
        }
        len -= 4;
    }
    return s;

/**
    function rand() {
        // https://en.wikipedia.org/wiki/Linear_congruential_generator
        // ix = (ix * 1103515245 + 12345) & 0x7FFFFFFF; // ANSI C mod 2^31, 10m/s; Math.random 10m/s
        ix = (ix * 65793 + 4282663) & 0x7FFFFF; // cc65, mod 2^23 12m/s
        return (ix >> 9); // bits 8..22 are usable
    }
**/
}
var _wordLengths = [1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 8, 10, 12, 14];
function str_random_word( ) {
    return str_random(_wordLengths[(Math.random() * _wordLengths.length) >>> 0], _word_charset);
}
function str_random_sentence( ) {
    var nwords = 3 + Math.random() * 8;
    var str = String.fromCharCode(0x40 + ((Math.random() * 26) >>> 0)) + str_random_word();
    for (var i = 1; i < nwords; i++) str += ' ' + str_random_word();
    return str + '.';
}

// locate all substrings patt in string str, and call handler with their offsets
function str_locate( str, patt, handler, arg ) {
    var pos = 0, len = str.length, plen = patt.length;
    for (var pos = 0; pos < len; pos += plen) {
        if ((pos = str.indexOf(patt, pos)) >= 0) handler(pos, arg);
        else break;
    }
}

// the the number of occurrences of the pattern in the string
function str_count( str, patt, limit ) {
    limit = limit || Infinity;
    var pos = 0, n = 0, len = patt.length;
    if (patt) while ((pos = str.indexOf(patt, pos)) >= 0 && n < limit) pos += len, n += 1;
    return n;
}

// reverse the characters in the string
function str_reverse( str ) {
    var chars = new Array(str.length), len = str.length;
    for (var i = 0; i < len; i++) chars[len - 1 - i] = str.charCodeAt(i);
    return qibl.fromCharCodes(chars);
}

// compare semver version strings
// scan for the first version differece by decreasing significance, and return -1, 0 or +1
// like for a sort comparison function
var _isolateDigits = /([^0-9]+)/;
function semverCompar( version1, version2 ) {
    var p1 = String(version1).split(_isolateDigits), p2 = String(version2).split(_isolateDigits);
    for (var i = 0; i < p1.length && i < p2.length; i++) {
        if (p1[i] === p2[i]) continue;                                          // scan until a diff
        if (p1[i] === '.' || p2[i] === '.') return p1[i] === '.' ? 1 : -1;      // "1a" before 1.0a"
        var n1 = parseInt(p1[i]), n2 = parseInt(p2[i]);
        if (n1 - n2) return n1 - n2 < 0 ? -1 : 1;                               // "9b" before "10a"
        return p1[i] < p2[i] ? -1 : 1;                                          // "a" before "aa"
    }
    return (i >= p1.length && i >= p2.length) ? 0 : i >= p1.length ? -1 : 1;    // no diffs, or "1" before "1.0"
}

// "string".startsWith, missing in node-v0.10
function startsWith( string, prefix ) {
    return string.indexOf(prefix) === 0;
}
// "string".endsWith, missing in node-v0.10
function endsWith( string, suffix ) {
    return string.indexOf(suffix, string.length - suffix.length) >= 0;
}

// similar to strtok() and strsep() but empty strings are allowed
// NOTE: this function is not reentrant
// On first call the string is remembered, on subsequent calls it should be null.
// Once the string is consumed the remembered string is cleared to null.
// nb: getProperty runs 6x faster split to array than tokenized.
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
        new:   function(a, b, c) { return typeof a === 'number' ? qibl.allocBuf(a) : qibl.fromBuf(a, b, c) },
        alloc: eval('nodeMajor >= 6 ? Buffer.allocUnsafe : Buffer'),
        from:  eval('nodeMajor >= 6 ? Buffer.from : Buffer'),
        concat: function(chunks) {
            for (var size=0, i=0; i<chunks.length; i++) size += chunks[i].length;
            var buf = qibl.allocBuf(size);
            for (var pos=0, i=0; i<chunks.length; i++) { chunks[i].copy(buf, pos); pos += chunks[i].length }
            return buf;
        },
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

function tryRequire( name ) {
    try { return qibl.require(name) } catch (e) { }
}

// remove and return all listeners for the specified event.
// See also `kubelogger`.
function clearListeners( emitter, event ) {
    // node-v0.8 returns the actual storage array whose contents will empty out
    // after the removeListeners below, so make our own copy of the array
    var listeners = qibl.concat2(new Array(), emitter.listeners(event));
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
    var chunk1, chunks, data = '';
    emitter.on('data', function(chunk) {
        if (typeof chunk === 'string') data ? data += chunk : data = chunk;
        else if (!chunk1) chunk1 = chunk;
        else if (!chunks) chunks = [chunk1, chunk];
        else chunks.push(chunk);
    })
    emitter.on('end', function() {
        if (!chunk1) return cb(null, data);
        else if (!chunks) return cb(null, chunk1);
        // else cb(null, Buffer.concat(chunks));
        // node-v0.6 does not have Buffer.concat
        else cb(null, qibl.concatBuf(chunks));
    })
    emitter.on('error', function(err) {
        cb(err);
    })
}

/*
 * Similar to readline, but emit the lines from the same data emitter,
 * as raw buffer slices without string conversion, and include the terminating newline.
 * Line fragments are not emitted, not even when the data source is closed.
 */
function emitlines( emitter ) {
    var CH_NL = ('\n').charCodeAt(0);
    return qibl.emitchunks(emitter, 'line', function endOfLine(chunk, chunks, base) {
        var end = offsetOf(chunk, CH_NL, base);
        return end < 0 ? -1 : end + 1;
    })
}
function offsetOf( buf, ch, base ) {
    for (var i = base || 0; i < buf.length; i++) if (buf[i] === ch) return i;
    return -1;
}

/*
 * Re-chunk the 'data' bytes emitted by `emitter` on a parametric chunk boundary.
 * `findChunkEnd(chunk, [chunks], base)` returns the byte offset in the latest `chunk`
 * of the ending bound of the rechunk starting at `base` in `chunks[0]`, else -1.
 * Consumes 'data' events and emits `chunkEventName` events on the same emitter.
 * Does not handle feedback loops where the emit itself generates more chunks.
 */
function emitchunks( emitter, chunkEventName, findChunkEnd ) {
    var chunk1, chunks;

    emitter.on('data', onData);
    function onData(chunk) {
        !chunk1 ? (chunk1 = chunk) : !chunks ? (chunks = [chunk1, chunk]) : chunks.push(chunk);
        var bound = findChunkEnd(chunk, chunks, 0);
        if (bound >= 0) emitChunks(bound);
    }
    return onData;

    function emitChunks(bound) {
        var bytes = chunks ? qibl.concatBuf(chunks) : chunk1;
        if (chunks) bound += bytes.length - chunks[chunks.length - 1].length;
        chunk1 = chunks = undefined;
        for (var base = 0; bound >= 0; (base = bound, bound = findChunkEnd(bytes, undefined, base))) {
            emitter.emit(chunkEventName, bytes.slice(base, bound));
        }
        // only emit completed chunks, behave as if partials had not arrived yet
        if (base < bytes.length) chunk1 = bytes.slice(base);
    }
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

function _tryCallCbIx(fn, cb, i) { try { fn(cb, i) } catch (e) { cb(e) } }
function repeatUntil( fn, callback ) {  // adapted from miniq:
    var ncalls = 0, i = 0;
    (function relaunch(err, stop) {
        if (err || stop) callback(err);
        else if (ncalls++ < 100) _tryCallCbIx(fn, relaunch, i++);
        else { ncalls = 0; process.nextTick(relaunch) }
    })();
}

// from minisql
function repeatFor( n, proc, callback ) {
    var ix = 0, ncalls = 0;
    (function _loop(err) {
        if (err || n-- <= 0) return callback(err);
        (ncalls++ > 100) ? process.nextTick((++n, (ncalls = 0), _loop)) : _tryCallCbIx(proc, _loop, (ix++));
        // 300k in 10ms @100, 16ms @10 @20, 7.75ms @200, 5ms @1000
    })()
}

// async [].forEach, passing the callback first
function forEachCb( items, proc, callback ) {
    qibl.repeatFor(items.length, function(done, ix) {
        proc(done, items[ix], ix, items);
    }, callback)
}

// iterateSteps from minisql < miniq, originally from qrepeat and aflow
function _tryCallCbAB(fn, cb, a, b) { try { fn(cb, a, b) } catch (e) { cb(e) } }
function runSteps( steps, callback ) {
    var ix = 0;
    (function _loop(err, a1, a2) {
        if (err || ix >= steps.length) return callback(err, a1, a2);
        // todo: break up the call stack every now and then
        _tryCallCbAB(steps[ix++], _loop, a1, a2);
    })()
}

// adapted from qfifo
function batchCalls( options, processBatch ) {
    if (!processBatch) { processBatch = options; options = {} };
    var state = { timer: null, count: 0, batch: null, callbacks: [] };

    var startBatch = options.startBatch || function() { return [] };
    var growBatch = options.growBatch || function(batch, item) { return batch.push(item) };
    var maxBatchSize = options.maxBatchSize > 0 ? options.maxBatchSize : 10;
    var maxWaitMs = options.maxWaitMs > 0 ? options.maxWaitMs : 0;

    return function processItem(item, callback) {
        if (!state.batch) {
            state.batch = startBatch();
            // always defer processing until after the current event loop tick
            state.timer = maxWaitMs ? setTimeout(doProcessBatch, maxWaitMs) : process.nextTick(doProcessBatch);
        }
        growBatch(state.batch, item);
        state.callbacks.push(callback);
        state.count += 1;
        if (state.count >= maxBatchSize) doProcessBatch(state);
    }

    function doProcessBatch() {
        clearTimeout(state.timer);
        var batch = state.batch;
        var callbacks = state.callbacks;
        state = { timer: null, count: 0, batch: null, callbacks: [] };

        processBatch(batch, function(err) {
            for (var i = 0; i < callbacks.length; i++) callbacks[i] && callbacks[i](err);
        })
    }
}

/*
 * Simple stateless directory tree walker.  Files are reported and recursed into in order.
 * Reports all contained files and directories, including the search root dirname itself.
 * Reports but does not traverse symlinks unless the visitor says 'visit'.
 * Errors are reported out of band as 'error' events on the returned emitter.
 * NOTE: repeatUntil catches errors thrown by callback() and feeds them back to... yes, callback.
 * The caller can prevent this by wrapping callback in a try/catch or a setImmediate().
 */
function walkdir( dirname, visitor, callback ) {
    var stop, emitter = new events.EventEmitter();
    emitter.on('error', function() {}); // silently skip bad files by default

    setImmediate(function() { _walkfiles(dirname, 0, [null], callback) });
    return emitter;

    function _walkfiles(dirname, depth, files, cb) {
        repeatUntil(function(done) {
            if (files.length <= 0) return done(null, true);
            var filepath = pathJoin(dirname, files.shift());
            var stat = lstatSync(filepath || '.');
            stop = stat ? visitor(filepath || '.', stat, depth) : 'skip';
            return (stop === 'stop') ? done(null, true)
                : (stop === 'skip') ? done()
                : (stat && (stat.isDirectory() || (stop === 'visit' && stat.isSymbolicLink())))
                    ? fs.readdir(filepath || '.', function(err, files) { err
                        ? ((err.code !== 'ENOTDIR' && emitter.emit('error', err, filepath)), done())
                        : _walkfiles(filepath, depth + 1, files, done) })
                : done();
        }, cb);
    }
    function lstatSync(filepath) { try { return fs.lstatSync(filepath) } catch (err) { emitter.emit('error', err, filepath) } }
    function pathJoin(dirname, filename) { return filename === null ? dirname : (dirname || '.') + '/' + filename }
}

/*
 * Recursively create the directory dirname, including all enclosing directories.
 */
function mkdir_p( dirname, callback ) {
    var parentdir = path.dirname(dirname);
    // the root directory (/ or .) is its own parent directory, and it already exists
    if (parentdir === dirname) return callback();
    mkdir_p(parentdir, function(err) {
        if (err) return callback(err);
        fs.mkdir(dirname, function(err) {
            if (err && err.code === 'EEXIST') return isDirectory(dirname) ? callback()
                : callback(qibl.makeError({ code: 'ENOTDIR' }, dirname + ': not a directory'));
            callback(err);
        })
    })
    function isDirectory(dirname) { try { return fs.statSync(dirname).isDirectory() } catch (err) { } }
}

/*
 * Recursively remove the directory (or file) dirpath, including all its files and sub-directories.
 */
function rmdir_r( dirpath, callback ) {
    fs.lstat(dirpath, function(err, stat) {
        if (!stat || !stat.isDirectory()) return fs.unlink(dirpath, callback);
        fs.readdir(dirpath, function(err, files) {
            if (err) return callback(err);
            qibl.repeatFor(files.length, function(next, ix) {
                rmdir_r(dirpath + '/' + files[ix], next);
            }, function(err) {
                if (err) return callback(err);
                fs.rmdir(dirpath, callback);
            })
        })
    })
}


/*
 * Create a new file that will be automatically removed when the process exits.
 * Similar to tmpfile(3), but returns the name of the created file.
 * This function installs a process.on('exit') hook.
 */
var _filesToRemoveOnExit = [];
function _unlinkFileOnExit( filename ) {
    _filesToRemoveOnExit.push(filename);
    // on first call install the signal handler(s) to remove files on exit
    if (_filesToRemoveOnExit.length === 1) {
        var exitSignals = ['SIGHUP', 'SIGINT', 'SIGTERM'];
        var onExit = function onExit() {
            _filesToRemoveOnExit.forEach(function(name) { try { name && fs.unlinkSync(name) } catch (err) {} });
            // do not empty out _filesToRemove to not install new listeners
            _filesToRemoveOnExit = [undefined];
        }
        var onSignal = function onSignal(sig) {
            /* istanbul ignore next -- will have more than one listener under code coverage */
            if (process.listeners(sig).length === 1) { onExit(); throw new Error('terminated') }
        }
        process.on('exit', onExit);
        exitSignals.forEach(function(sig) { process.on(sig, function() { onSignal(sig) }) });
    }
}
function tmpfile( options ) {
    options = options || {};
    var prefix = (options.dir || process.env.TMPDIR || '/tmp') + '/' + (options.name || '/node-tmpfile-');

    // if tmpfile namespace is 99% full, 460 attempts will find a name 99% of the time, 100 attempts 63%, 50 40%
    // if tmpfile namespace is 95% full, 90 attempts will find a name 99% of the time, 59 attemps 95%, 50 92%
    for (var maxAttempts = 100, i = 1; i <= maxAttempts; i++) {
        var suffix = Math.random().toString(36).slice(2, 8);
        var filename = prefix + suffix + (options.ext || '');
        try {
            var fd = fs.openSync(filename, (0x80 + 0x40 + 0x01) >>> 0); // O_EXCL + O_CREAT + O_WRONLY
            fs.closeSync(fd);
            /* istanbul ignore else */ // code coverage listens to SIGTERM, disables auto-remove on kill
            if (options.remove || (options.remove === undefined)) _unlinkFileOnExit(filename);
            return filename;
        } catch (err) {
            if (i >= maxAttempts) throw qibl.assignTo(err, { message: 'tmpfile: too many attempts: ' + err.message });
        }
    }
}

/*
 * Recursively walk the directory looking for files matching the pattern.
 * Returns the list of filenames matched.
 */
function globdir( dirname, pattern, callback ) {
    dirname = dirname || '.';
    /* istanbul ignore next */ // ignore the lack of coverage for the \ path.sep count
    var first = true, maxDepth = pattern instanceof RegExp || pattern.indexOf('**') >= 0 ? Infinity
        : 1 + str_count(pattern, '/') + (path.sep === '\\' && str_count(pattern, '\\'));
    pattern = pattern instanceof RegExp ? pattern
        : new RegExp('^' + qibl.escapeRegex(dirname + '/') + qibl.globRegex(pattern).slice(1));
    var files = [], error = null;
    var visitor = function(path, stats, depth) {
        if (error) return 'stop';
        if (pattern.test(path)) files.push(path);
        return first ? (first = false, 'visit') : depth >= maxDepth ? 'skip' : '';
    }
    var emitter = qibl.walkdir(dirname, visitor, function(err) {
        callback(err || error, files);
    })
    emitter.on('error', function(err) { error = err });
}

/*
 * Recursively visit all nodes in the tree and parade them in front of visitor().
 * Nodes are descended into immediately after visiting, so depth informs when node ends.
 * Behaves like an Array.forEach for recursive objects: visitor is passed value, index and object.
 * Traverses arrays, functions, or class instances only on 'visit', else just {} hash Objects.
 * Note: depth of root is 0 like /usr/bin/find, not 1 like util.inspect().
 */
function walktree( tree, visitor ) {
    // TODO: visit the root of the tree? only scalars?
    // visitor(tree, null, undefined, 0);
    _visitnodes(tree, visitor, { depth: 1, stop: false });
}
function _visitnodes( node, visitor, state ) {
    // TODO: maybe only visit enumerable nodes, ie qibl.keys
    for (var k in node) {
        if (state.stop) break;
        var next = visitor(node[k], k, node, state.depth);
        if (next === 'stop') state.stop = true;
        else if (next === 'skip') continue;
        else if (qibl.isHash(node[k]) || next === 'visit' && typeof node[k] === 'object') {
            state.depth += 1; _visitnodes(node[k], visitor, state); state.depth -= 1; }
    }
}

/*
 * Deep-copy the item with all nodes that are backreferences introducing cycles replaced with the stub
 * to make the item suitable for passing to eg JSON.stringify.
 */
function _tryToJSON(item, replacement) { try { return item.toJSON() } catch (err) { return replacement } }
function copytreeDecycle( item, stub, nodes ) {
    stub = stub || '[Circular]';
    nodes = nodes || [];
    if (typeof item !== 'object' || item === null) {
        // non-objects and arrays cannot have cycles, their properties are not json encoded
        return item;
    }
    else if (nodes.indexOf(item) >= 0) {
        // break cycles by stubbing backreferences from inner nodes to ancestor nodes
        return stub;
    }
    else if (typeof item.toJSON === 'function') {
        item = _tryToJSON(item, stub);
        // temporarily remove the toJSON method so if the item is self-referential it will not re-jsonify itself
        // note that the item is not put on the nodes list, it has not been traversed yet
        var toJSON;
        if (item && typeof item.toJSON === 'function') { toJSON = item.toJSON; item.toJSON = undefined }
        var copy = copytreeDecycle(item, stub, nodes);
        if (toJSON) item.toJSON = toJSON;
        return copy;
    }
    else if (Array.isArray(item)) {
        var copy = [];
        for (var i=0; i<item.length; i++) {
            var value = item[i];
            copy[i] = typeof value === 'object' && value !== null ? copytreeDecycle(value, stub, nodes) : value;
        }
        return copy;
    }
    else {
        var copy = {};
        nodes.push(item);
        var keys = Object.keys(item);
        for (var i=0; i < keys.length; i++) {
            var key = keys[i];
            var value = item[key];
            copy[key] = typeof value === 'object' && value !== null ? copytreeDecycle(value, stub, nodes) : value;
        }
        nodes.pop();
        return copy;
    }
}

/*
 * return a tree populated with the differences between trees t1 and t2
 * Cycles and properties of non-hashes are not handled.
 * Only handles JSON data types (string, number, boolean, null, array, object),
 * and is not smart about non-identical but equivalent objects eg /^a/ and /^a/.
 * Note: a property set to undefined matches an unset property.
 */
function difftree( t1, t2 ) {
    var differs = false, diff = {};
    for (var k in t1) if (t1[k] !== t2[k] && _diffit2(diff, k, t1[k], t2[k])) differs = true;
    for (var k in t2) if (!(k in t1) && t2[k] !== undefined) { diff[k] = t2[k]; differs = true }
    return differs ? diff : undefined;
}
function diffarray( a1, a2 ) {
    var i, differs = false, diff = [];
    for (i = 0; i < a1.length; i++) if (a1[i] !== a2[i] && _diffit2(diff, i, a1[i], a2[i])) differs = true;
    for (i = a1.length; i < a2.length; i++) if (a2[i] !== undefined) { diff[i] = a2[i]; differs = true }
    return differs ? diff : undefined;
}
function _diffit2( target, key, v1, v2 ) {
    var differs = false, delta = (isHash(v1) && isHash(v2)) ? difftree(v1, v2)
        : (Array.isArray(v1) && Array.isArray(v2)) ? diffarray(v1, v2)
        : (target[key] = v2, differs = true, undefined);
    if (delta !== undefined) { target[key] = delta; differs = true }
    return differs;
}

/*
 * Repeat func() until it succeeeds over at most timeout ms.
 * The delays between attempts are computed by getDelay(attemptCount).
 * At least two attempts are made, one at the beginning and one at timeout,
 * unless timeout comes before the first call finishes.
 */
function retry( getDelay, timeout, func, callback ) {
    var time = 0, retries = 0, timer = null, returnCount = 0, actualErr = undefined;
    var timeoutErr = {message: 'timeout', code: 'TIMEOUT'};
    function finish(err, result, result2) {
        clearTimeout(timer);
        if (err === timeoutErr) {
            err = actualErr !== null && actualErr !== undefined ? actualErr : qibl.makeError(err, err.message);
            return timer = setTimeout(finish, 0, err);          // allow current try a moment to finish
        }
        if (!returnCount++) arguments.length > 2 ?  callback(err, result, result2) : callback(err, result);
    }
    timer = setTimeout(finish, timeout + 1, timeoutErr);        // time out if func() hangs
    func(function _loop(err, result, result2) {
        if (err !== null && err !== undefined) actualErr = err;
        if (!err || err === timeoutErr) return arguments.length > 2 ? finish(err, result, result2) : finish(err, result);
        if (returnCount || time >= timeout) return finish(timeoutErr); // quit looping if timed out
        var delay = getDelay(++retries);                        // pause before the next call
        setTimeout(func, delay <= (timeout - time) ? delay : (timeout - time - 1), _loop);
        time += delay;
    })
}

// Mutex from miniq/lib/utils
// call serializer, each next call is launched by the previous call`s release() callback
// usage: mutex.acquire(function(release) { ... release() });
function Mutex( limit ) {
    this.busy = 0;
    this.limit = limit || 1;
    this.queue = new Array();

    var self = this;
    this.acquire = function acquire(user) {
        if (self.busy < self.limit) { self.busy += 1; user(self._release) }
        else self.queue.push(user);
    }
    this._release = function _release() {
        var next = self.queue.shift();
        (next) ? setImmediate(next, self._release) : self.busy -= 1;
    }
}

/*
 * interval jobs, launched at fixed intervals relative to their scheduled runtime, non-overlapping
 * Cron adapted from miniq
 */
function Cron( ) {
    this.jobs = [];     // {interval, start, next, fn, errCb}
    this.schedule = function schedule(interval, fn, startMs, errorCallback) {
        var now = Date.now(), interval = qibl.parseMs(interval);
        if (isNaN(interval)) throw new Error('invalid interval, expected [0-9]+[hms]');
        var nextRunTime = this._findNextRunTime(now, startMs || now, interval);
        this.jobs.push({interval: interval, start: now, next: nextRunTime, fn: fn, errCb: errorCallback });
    }
    this.cancel = function cancel(fn) {
        var len = this.jobs.length;
        this.jobs = this.jobs.filter(function(job) { return job.fn !== fn });
        return this.jobs.length < len;
    }
    this.run = function run(now, callback) {
        var jobIdx = 0, jobs = this.jobs.slice(), self = this, doneCb = null;
        function nextCb(err) {
            var job = jobs[jobIdx];
            job.next = self._findNextRunTime(now, job.start, job.interval);
            if (err && job.errCb) job.errCb(err);
            doneCb();
        }
        qibl.forEachCb(jobs, function(done, job, idx) {
            if (job.next > now) return done();
            jobIdx = idx; doneCb = done; jobs[idx].next = Infinity;
            job.fn(nextCb);
        }, callback || this._noop);
    }
    this._findNextRunTime = function _findNextRunTime(nowMs, startMs, interval) {
        var msRunning = nowMs - startMs;
        return nowMs + (interval - (msRunning % interval));
    }
    this._noop = function(){};
}

/*
 * Return a pair of unix domain (file) sockets connected to each other.
 * see https://stackoverflow.com/questions/45624671/communication-between-child-processes-in-node-js
 */
function socketpair( callback ) {
    // TODO: accept socketPath argument
    if (typeof callback !== 'function') throw new Error('callback not a function');

    var socket1, socket2;
    var server = net.createServer(function(sock) {
        socket1 = sock;
        setImmediate(function() {
            // server is no longer needed, and if left open it prevents normal process exit
            server.close();
            callback(null, [socket1, socket2]);
        })
    })

    var socketPath = qibl.tmpfile({ name: 'node-socketpair.' });
    fs.unlinkSync(socketPath); // if socket file exists then throws EADDRINUSE
    server.listen(socketPath);

    // connect to the server to trigger a 'connection' event with sockets
    socket2 = net.connect(socketPath, function() {
        // connection established, return after letting the server set socket1
        // some node versions set socket1 first, others socket2
        // node-v0.6 fails if callback from here on nextTick, but ok from server connection
    })
}

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

/*
 * Convert the glob pattern to regular expression syntax.
 * The regular expression must be created by the caller.
 * Csh-style negated globs `^*.[ch]` must be handled by the caller.
 *
 * Shell glob patterns converted:
 *   ?          a single path component character, excluding / (sh)
 *   *          0 or more path component chars, exluding / (sh)
 *   **         0 or more path component chars, including / (zsh)
 *   [abc]      a single char that must be a, b or c (sh)
 *   [!abc]     any one char excluding a, b or c (sh)
 *   [^abc]     any one char excluding a, b or c (csh)
 *   {a,b,c}    any of a or b or c  NOTE: no nesting, no contained ',' or '}' meta-chars (csh)
 * TODO:
 *   support full csh-style {a,b{"c,{",d}} nested expressions => ['a', 'b"c,{"', 'bd']
 *   un-closed [ should not be special
 * TODO:
 *   first * in path component should not match .* (ie, leading star should not match dot-files)
 */
function globRegex( glob, from, to ) {
    var incharlist = false;
    from = from || 0;
    to = to || glob.length;
    var expr = '';
    for (var i = from; i < to; i++) {
        var c = glob[i];
        if (incharlist && c !== '\\') { if (c === ']') { incharlist = false; expr += ']' } else expr += c }
        else if (c === '\\') { i+1 < to ? expr += c + glob[++i] : expr += '\\\\'; }
        else switch (c) {
        case '?': expr += '[^/]'; break;
        case '*': if (glob[i+1] === '*') { expr += '.*'; i++ } else expr += '[^/]*'; break;
        case '[': incharlist = true; expr += (glob[i+1] === '^' || glob[i+1] === '!') ? (i++, '[^') : '['; break;
        case '{':
            // rudimentary parse of flat brace expressions that do not contain commas or metacharacters
            var endpos = glob.indexOf('}', i + 1);
            if (endpos < 0) { expr += qibl.escapeRegex(glob.slice(i, to)); i = to }
            else {
                var parts = glob.slice(i + 1, endpos).split(',');
                for (var j = 0; j < parts.length; j++) parts[j] = qibl.escapeRegex(parts[j]);
                expr += '(' + parts.join('|') + ')';
                i = endpos;
            }
            break;
        case '^': case '$': case '(': case ')': case '.': case '+': case '|':
            // see qibl.escapeRegex for the list of regex metacharacters to escape
            // \ and { are special to glob, and must be escaped, will not be seen here
            expr += '\\' + glob[i]; break;
        default:
            expr += c; break;
        }
    }
    return '^' + expr + '$';
}

function selectField( arrayOfObjects, key ) {
    var values = new Array();
    for (var i = 0; i < arrayOfObjects.length; i++) {
        var obj = arrayOfObjects[i];
        (obj === null || obj === undefined) ? values.push(undefined) : values.push(obj[key]);
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
        if (obj === null || obj === undefined) continue;
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

function distinct( items, getKey ) {
    // with lots of duplicates (say 50+%) hashing strings is close competitive with Map()
    // With no duplicates Map is faster.
    getKey = getKey || _toString;
    var found = new Hashmap();
    for (var i = 0; i < items.length; i++) { var k = getKey(items[i]); if (found.get(k) === undefined) found.set(k, items[i]) }
    var vals = found.values();
    return Array.isArray(vals) ? vals : qibl.toArray(vals);
}
function _toString(x) { return typeof x === 'string' ? x : '' + x }
// quick-and-dirty Map polyfill to use in a pinch, works for string keys (and numbers, sort of)
// TODO: add .size
function _Hashmap(keyvals) { for (var ix in keyvals) { var kv = keyvals[ix]; this[kv[0]] = kv[1] } }
_Hashmap.prototype.set = function(k, v) { this[k] = v; return this }
_Hashmap.prototype.get = function(k) { return this[k] }
_Hashmap.prototype.keys = function() { return qibl.keys(this) }
_Hashmap.prototype.values = function() { return qibl.values(this) }     // Map returns an iterator, we return array
_Hashmap.prototype.forEach = function(visitor) { forEachProperty(this, visitor) }

function groupBy( items, getKey, target ) {
    target = target || {};
    for (var i = 0; i < items.length; i++) {
        var item = items[i], key = getKey(item);
        var list = target[key] || (target[key] = new Array());
        list.push(item);
    }
    return target;
}

function sortBy( items, getMetric ) {
    return items.sort(function(a, b) { return getMetric(a) - getMetric(b) });
}


// given a traversal state update function that sets this.value and this.done,
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
//
// __stepNext is 25% faster if static and reused (walking 10 items; 70% for 40)
function __stepNext() { this.__step(this.__state, this.__instance, this); return this; }
function makeIterator( step, makeState ) {
    return function qiblIterator() {
        // makeState is passed the object instance on which the iterator was called
        var state = makeState && makeState(this) || {};
        return {
            value: 0,
            done: false,
            next: __stepNext,
            __step: step,
            __state: state,
            __instance: this,
        };
    }
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

// annotate the iterator `iter` with peek() and unget() methods
function makeIteratorPeekable( iter ) {
    var res, next;

    iter._origNext = iter._origNext || iter.next;
    iter._nextItem = iter._nextItem !== undefined ? iter._nextItem : null;
    iter.next = function() { return (res = this._nextItem) ? ((this._nextItem = null), res) : this._origNext() };
    // do not save a no-more-items result, maybe more items will appear later
    iter.peek = function() { return this._nextItem || ((next = this._origNext()).done ? next : (this._nextItem = next)) };
    iter.unget = function(result) { this._nextItem = { done: false, value: result } };

    return iter;
}

function toArray( obj, filter ) {
    return _traverse(obj, filter, new Array());
}
// function arrayMap(arr, fn) { return _traverse(arr, fn, new Array()) }
// function arrayEach(arr, fn) { _traverse(arr, fn, { push: function(){} }) }
// function arrayFilter(arr, fn) { var ret = new Array();
//     _traverse(arr, fn, { push: function(x) { if (fn(x)) ret.push(x) } }); return ret }
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
        // NOTE: node-v12 and up Array.from[1000] is 500k/s (vs node-v11 and under 9k/s), but we fill into target[]
        for (var i = 0; i < obj.length; i++) {
            target.push(transform ? transform(obj[i], i) : obj[i]);
        }
    }

    return target;
}

// Object.keys
function keys( object ) {
    if (object.constructor !== Object) return Object.keys(object);
    // Object has no inherited properties, and non-enumerable properties are not visited with 'in'
    var keys = new Array();
    for (var k in object) keys.push(k);
    return keys;
}

// Object.values
function values( object ) {
    var keys = qibl.keys(object);
    var ret = new Array();
    for (var i = 0; i < keys.length; i++) ret.push(object[keys[i]]);
    return ret;
}
// Object.entries, aka toPairs
function entries( object ) {
    var keys = qibl.keys(object);
    var keyvals = new Array();
    for (var i = 0; i < keys.length; i++) keyvals.push([keys[i], object[keys[i]]]);
    return keyvals;
}
// Object.fromEntries
function fromEntries( target, keyvals ) {
    for (var i = 0; i < keyvals.length; i++) target[keyvals[i][0]] = keyvals[i][1];
    return target;
}

// from mysqule aka node-minisql
function pairTo( target, keys, values ) {
    for (var i=0; i<keys.length; i++) target[keys[i]] = values[i];
    return target;
}

// like php array_flip
function flipTo( target, item ) {
    var keys = qibl.keys(item);
    for (var i=0; i<keys.length; i++) target[item[keys[i]]] = keys[i];
    return target;
}

// based on minisql utils:
// copy onto dst all properties of src that are set in mask
// MAYBE: do not transfer properties unset in src?
function extractTo( dst, src, mask ) {
    for (var k in mask) {
        if (mask[k] === undefined) continue;
        dst[k] = isHash(mask[k]) && isHash(src[k]) ? extractTo(isHash(dst[k]) ? dst[k] : {}, src[k], mask[k]) : src[k];
    }
    return dst;
}

// counterpart to extractTo, copies onto dst all properties of src that are not set in mask
// a mask property of undefined is treated as unset
// nb: defaults(dst, src) === extractNotTo(dst, src, dst)
function extractNotTo( dst, src, mask ) {
    for (var k in src) {
        if (mask[k] === undefined) dst[k] = src[k];
        else if (isHash(mask[k]) && isHash(src[k])) dst[k] = extractNotTo(isHash(dst[k]) ? dst[k] : {}, src[k], mask[k]);
    }
    return dst;
}

// replace each occurrence of patt in str with the next one of the args
// If an `addslashes` function is provided, use it to escape/format the args.
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
/** NOTE: addslashes function for sql argument quoting and escaping
function formatValue(arg) {
    return (typeof arg === 'number') ? arg
        : Buffer.isBuffer(arg) ? "UNHEX('" + arg.toString('hex') + "')"
        : (Array.isArray(arg)) ? arg.map(function(e) { return formatValue(e) }).join(', ')
        : "'" + qibl.addslashes(String(arg)) + "'";
} **/

// build a function that will interpolate the arguments into the format string
// Much faster than vinterpolate, 28m/s vs 6.6m/s (node-v8; 32 vs 4 -v6, 23 vs 8.5 -v10, 32 vs 8.1 -v14)
// Only 6% slower than backticks `${x}` compile-time interpolation.
// Compiling the interpolation is 3x faster (23 vs 8m/s) but adds 40 lines of code (compile + cache funcs)
//   470k/s to compile and 23m/s to run, vs straight 8m/s: faster if more than 28 calls
//   v13 780k/s to compile, 50m/s to run
function compileVinterpolate( fmt, patt ) {
    var format = util.format;
    if (typeof patt !== 'string') throw new Error('pattern must be a string not ' + (typeof patt));
    var parts = fmt.split(patt).map(function(s) { return '"' + s.replace(/["]/g, '\\"') + '"' });
    var argCount = parts.length - 1;
    var _rejectArgs = function(have, need) { throw new Error("format needs " + need + " arguments, got " + have) }

    var src = format(
        "function _interpolate(argv) {\n" +
        "  if (argv.length !== %d) _rejectArgs(argv.length, %d);\n", argCount, argCount);
    var lastPart = parts.pop();
    src += "  return " +
        parts.map(function(part, ix) {return (part !== '""' ? part + " + " : '')  + 'argv[' + ix + ']' }).join(' + ') +
        (lastPart !== '""' ? ' + ' + lastPart : '') + ";\n";
    src += "}";
// console.log("Ar: **** src", src);

    return eval('true && ' + src);
}

/**
// return array with all locations of patt in str
function offsetsOf( str, patt ) {
    var offsets = new Array();
    str_locate(str, patt, function gather(ix, arr) { arr.push(ix) }, offsets);
    return offsets;
}
**/

// sql escape()
// TODO: cache the regexes built from strings
function addslashes( str, patt ) {
    if (typeof patt === 'string') patt = new RegExp('([' + qibl.escapeRegex(patt) + '])', 'g');
    else patt = patt || /([\'\"\\\x00])/g;
    return str.replace(patt, '\\$1');
}

// from mysqule (aka node-minisql):
// Equivalent to Object.assign(new Error(util.format(fmt, ...args)), props).
function makeError( props, fmt /* ,VARARGS */ ) {
    var args = [].slice.call(arguments);
    var props = typeof args[0] === 'object' ? args.shift() : {};
    var err = new Error(util.format.apply(null, args));
    return qibl.assignTo(err, props);
}

// microsecond resolution real-time timestamp (available on node-v0.7 and up)
var _hrtime = eval('process.hrtime || function() { return [Date.now() * 1e-3, 0] };');
var _microtimeOffset = (_microtimeOffset = 0, Date.now() / 1000 - microtime()); // 1-ms accuracy
function microtime( ) {
    var t = _hrtime();
    return t[0] + t[1] * 1e-9 + _microtimeOffset;
}
// Calibrate microtime.  We sync to the system clock with better than .0005 ms accuracy (as measured).
// Assume the ms tick occurred in the middle of the sampling period (of Date.now duration) and that
// half the js-C++ domain crossing penalty is incurred after fetching the timestamp.
// This can cause microtime() to sometimes deliver timestamps less than Date.now, e.g. 123 vs 122.9995
// NOTE: node-v10,v12 calibration is great, but node-v13,v14,v15 is off (or way off)
function _hrTick() { for (var t1 = Date.now(), t2; (t2 = Date.now()) < t1 + 1; ) ; return t2 }
function _hrCalibrate() {
    var clk = microtime, timeRuns = eval("nodeMajor > 11 ? 17000 : 750");  // node-v12 calibrates better with 15k than 5000
    function _hrDuration() { var t1 = clk(); for (var i=0; i<timeRuns; i++) clk(); return (clk() - t1) / (timeRuns + 1) }
    function _nowDuration() { var t1 = clk(); for (var i=0; i<timeRuns; i++) Date.now(); return (clk() - t1 - hrDuration) / timeRuns }
    var hrDuration = _hrDuration(), nowDuration = _nowDuration();       // warm up and time calls
    var t1 = _hrTick(), t2 = microtime();                               // wait for ms tick, changed microtime + Date.now calls ago
    _microtimeOffset = (t1 / 1000) - t2;                                // to make uptime into wallclock = microtime() + offset
    _microtimeOffset += nowDuration / 2;                                // assume ms changed middle of poll period,
    _microtimeOffset += nowDuration * (4-4) / 4;                        // which overlaps all of the Date.now call,
    _microtimeOffset += hrDuration;                                     // and before that last microtime call we made
    _microtimeOffset += (hrDuration - nowDuration) / 2;                 // will also be sampled a bit slower
}
// NOTE: occasionally the runtime adds a burst of delay between t1 and t2, if so try again
do { _microtimeOffset = 0; _hrCalibrate() } while (_hrTick() / 1000 - microtime() > .000002);

/*
 * Parse time notation like '2h' into 7200000 milliseconds.
 * Supported units are hms and d -- hours, minutes, seconds, and days.
 */
var _msUnits = { w: 7*24*3600*1000, d: 24*3600*1000, h: 3600*1000, m: 60*1000, s: 1000, '1': 1 };
var _msTerm = /^(\s*([\d\.]+|Infinity|-Infinity)\s*([a-z])?\s*)/; // supporting ([eE]\d+)? 12% slower
function parseMs( interval ) {
    var str = String(interval), term, ms = 0, lastval = undefined;
    for (; term = str && str.match(_msTerm); str = str.length > term[1].length && str.slice(term[1].length)) {
        lastval = parseFloat(term[2]) * _msUnits[term[3] || '1']; // multiply by undefined if bad units for NaN
        ms += lastval;
    }
    return lastval !== undefined ? ms : NaN; // NaN if incorrect format, else a number
}

// source of very fast monotonically increasing not-quite-realtime timestamps, vaguely like qtimebase
function Timebase() {
    this.tbTime = 0; this.tbCalls = 0; this.tbTimer = 0;
    this.clear = (function() { this.tbTime = 0; this.tbCalls = 0; this.tbTimer = 0 }).bind(this);
}
Timebase.prototype.getNewerTimestamp = function getNewerTimestamp(when) {
    if (when < this.tbTime && this.tbCalls++ < 50) return this.tbTime;
    this.tbCalls = 0;
    if (!this.tbTimer) this.tbTimer = setTimeout(this.clear, 5);
    do { this.tbTime = Date.now() } while (this.tbTime <= when);
    return this.tbTime;
}

var charset36 = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
function _encode32(v) {
    var ret = '';
    while (v >= 1024) { ret = _encode32_2(v & 0x3ff) + ret; v /= 1024 }
    return v >= 32 ? _encode32_2(v) + ret : charset36[v & 0x1f] + ret;
}
function _encode32_2(v) {
    return charset36[(v >>> 5) & 0x1f] + charset36[v & 0x1f];
}
// very very fast globally unique id generator, similar in concept to mongoid-js
function QuickId( uniqueSystemId ) {
    this.sysid = String(uniqueSystemId || '');
    this.idTime = 0, this.idSeq = 0, this.idPrefix = '', this.idTimebase = new Timebase();
}
QuickId.prototype.getId = function getId() {
    var now = this.idTimebase.getNewerTimestamp((this.idSeq >= 1024 * 1024) ? this.idTime : 0);
    if (now !== this.idTime || (this.idSeq & 0x3ff) === 0) {
        if (now !== this.idTime) {
            this.idTime = now;
            if (this.idSeq >= 1024 * 1024 / 2) this.idSeq = 0;
        }
        this.idPrefix = _encode32(now) + this.sysid + _encode32_2(this.idSeq >>> 10);
    }
    var ret = this.idPrefix + _encode32_2(this.idSeq++);
    return ret;
}
QuickId.prototype.parseId = function parseId(id) {
    return {
        time: parseInt(id.slice(0, 9), 32),
        sys: id.slice(9, -4),
        seq: parseInt(id.slice(-4), 32) };
}
// var _ids = new Hashmap(); _ids.set('', new QuickId());
// function getId(sysid) { var ids = _ids.get(sysid) || _ids.set(sysid, new QuickId(sysid)).get(sysid); return ids.getId() }
// function parseId(id) { return _ids.get('').parseId(id) };

function makeGetId( sysId ) {
    var quickId = new QuickId(sysId);
    return qibl.assignTo(function() { return quickId.getId() }, { quickId: quickId });
}

// object to hold the config
function Config(obj) { qibl.merge(this, obj) }
// Config.prototype._merge = function(obj) { return qibl.merge(new Config(this), obj) };
Object.defineProperty(Config.prototype, '_merge',
    {enumerable: false, value: function(obj) { return qibl.merge(new Config(this), obj) }});
Config.tryLoad = function(loader, file) { try { return loader(file) } catch (err) {} };
Config.fetchConfig = function(dirname, filename, loaders) {
    var filepath = dirname + '/' + filename;
    var pkg = qibl.tryRequire(filepath) || qibl.tryRequire(filepath + '.json');
    for (var extn in loaders || {}) pkg = pkg ||
        Config.tryLoad(loaders[extn], filepath) ||
        Config.tryLoad(loaders[extn], filepath + '.' + extn);
    return pkg;
}
// like config and qconfig, but simpler (from miniq)
function getConfig( options ) {
    options = options || {};
    var configDir = options.dir || process.cwd() + '/config';
    var env = options.env || process.env.NODE_ENV || 'development';
    var envConf, conf = new Config()
        ._merge(Config.fetchConfig(configDir, 'default', options.loaders))
        ._merge((envConf = Config.fetchConfig(configDir, env, options.loaders)))
        ._merge(Config.fetchConfig(configDir, 'local', options.loaders));
    return envConf ? conf : null;
}

// convert the error with its non-enumerable fields into a serializable object (adapted from qinvoke)
var hiddenErrorFields = { message: 1, name: 1, code: 1, errno: 1, syscall: 1, path: 1, address: 1, port: 1, stack: 1 };
function errorToObject( err ) {
    if (!(err instanceof Error)) return err;
    return qibl.assignTo({}, err, qibl.omitUndefined(qibl.extractTo({}, err, hiddenErrorFields)),
        { __ctor: err.constructor.name });
}
function objectToError( obj ) {
    var err = qibl.assignTo(new (obj.__ctor && global[obj.__ctor] || Error)('objectToError'), qibl.omitUndefined(obj));
    delete err.__ctor;
    return err;
}

/*
 * Millisecond stopwatch timer.
 * NOTE: node before v0.7 has only millisecond resolution, newer node nanosecond.
 */
function Stopwatch( ) {
    this.started = qibl.microtime();    // stopwatch start time sec
    this.elapsed = 0;                   // total elapsed time sec
    this.marks = {};                    // tagged timestamps
}
Stopwatch.prototype.start = function start() { this.started = this.started || qibl.microtime() }
Stopwatch.prototype.stop = function stop() { this.read(), this.started = 0 }
Stopwatch.prototype.read = function read( ) {
    var now, started = this.started;
    if (started) { this.started = (now = qibl.microtime()), this.elapsed += now - started }
    return this.elapsed;
}
Stopwatch.prototype.readMs = function readMs() { return 1000 * this.read() }
Stopwatch.prototype.mark = function mark(name) { this.marks[name] = this.read() }
Stopwatch.prototype.report = function report() { return this.marks }
// TODO: find out why qibl.assignTo is .02 ms vs Object.assign .002 ms
// Stopwatch.prototype.reset = function reset() { (Object.assign || qibl.assignTo)(this, new Stopwatch()) }
Stopwatch.prototype.reset = function reset() { this.started = qibl.microtime(), this.elapsed = 0, this.marks = {} }


/*
 * hook for testing: compile and run the function in local file context,
 * letting it examine and change the file globals.
 */
/**
function _configure( fn ) {
    fn = eval('true && ' + fn);
    return fn();
}
**/
