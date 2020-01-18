/**
 * qpoly -- useful polyfills that at times I wished I had
 *
 * Copyright (C) 2019 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2019-09-11 - AR.
 */

'use strict';

var nodeMajor = parseInt(process.versions.node);

var invoke1 = eval("(nodeMajor < 6) && _invoke1 || tryEval('function(func, argv) { return func(...argv) }')");
var invoke2 = eval("(nodeMajor < 6) && _invoke2 || tryEval('function(func, self, argv) { return func.call(self, ...argv) }')");

function tryEval(str) { try { return eval('1 && ' + str) } catch (e) { } }

var qibl = module.exports = {
    isHash: isHash,
    copyObject: copyObject,     assign: copyObject,
    merge: merge,
    getProperty: getProperty,
    setProperty: setProperty,
    inherits: inherits,
    fill: fill,
    str_repeat: str_repeat,
    str_truncate: str_truncate,
    strtok: strtok,
    newBuf: saneBuf().new,
    allocBuf: saneBuf().alloc,
    fromBuf: saneBuf().from,
    toStruct: toStruct,
    varargs: varargs,
    thunkify: thunkify,
    invoke: invoke1,            invoke1: invoke1,
    invoke2: invoke2,
    _invoke1: _invoke1,
    _invoke2: _invoke2,
    concat2: concat2,
    curry: curry,
    once: once,
    tryRequire: tryRequire,
    escapeRegex: escapeRegex,
    keys: keys,
    values: values,
    selectField: selectField,
    vinterpolate: vinterpolate,
    addslashes: addslashes,
};

// hashes are generic objects without a class
// See also `qhash`.
function isHash( obj ) {
    return obj ? obj.constructor === Object : false;
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

/*
 * Get a nested property by dotted name, or return undefined if not set.
 * Undefined properties and properties set to `undefined` return defaultValue.
 * Adapted from qhash 1.3.0.
 * node-v10 and up tokenize: 1.6m/s v8, 3.7m/s v13, 2.4m/s v0.10
 * strtok: 2m/s v8, 4.4m/s v13, 2.47m/s v0.10
 * note: defaultValue support makes it 15% slower
 */
function getProperty( target, dottedName, defaultValue ) {
    if (typeof target !== 'object' && typeof target !== 'function') {
        if (this !== qibl && typeof target === 'string') return getProperty(this, target, dottedName);
    }

    var first, path;
    if (dottedName.indexOf('.') < 0) { first = dottedName; path = [] } else { path = dottedName.split('.'); first = dottedName[0] }

    if (target == null) return defaultValue;
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
    if (typeof target !== 'object' && typeof target !== 'function') {
        if (this !== qibl && typeof target === 'string') return setProperty(this, target, dottedName, value);
    }
    if (target == null || typeof target !== 'object' && typeof target !== 'function') throw new Error('target not an object');

    if (dottedName.indexOf('.') < 0 && !mode) {
        target[dottedName] = value;
        return target;
    }

    // note: split is much slower starting with node-v12
    var path = dottedName.split('.');
    for (var item=target, i=0; i<path.length-1; i++) {
        var field = path[i];
        if (!item[field] || typeof item[field] !== 'object') item[field] = {};
        item = item[field];
    }
    if (!mode) {
        item[path[path.length-1]] = value;
        return target;
    }

    var name = path[path.length-1];
    Object.defineProperty(item, name, {
        value: value,
        enumerable: mode.indexOf('x') < 0,
        writable: mode.indexOf('r') < 0 || mode.indexOf('w') >= 0,      // 'r', 'w', 'rw', 'ro'
    });
    return target;
}

// make the derived class inherit from the base
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
function concat2( target, a1, a2 ) {
    for (var len = a1.length, i = 0; i < len; i++) target.push(a1[i]);
    if (a2) for (var len = a2.length, i = 0; i < len; i++) target.push(a2[i]);
    return target;
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

/**
// See also `kubelogger`.
function removeAllListeners( emitter, event ) {
    var listeners = emitter.listeners(event);
    for (var i = 0; i < listeners.length; i++) emitter.removeListener(event, listeners[i]);
    return listeners;
}

function addListeners( emitter, event, listeners ) {
    for (var i = 0; i < listeners.length; i++) emitter.on(event, listeners[i]);
    return listeners;
}
**/

// build a function that calls the handler with the arguments it was invoked with
function varargs( handler, self ) {
    return function( /* VARARGS */ ) {
        var len = arguments.length;
        var argv;
        switch (arguments.length) {
        case 0: argv = new Array(); break;
        case 1: argv = [arguments[0]]; break;
        // case 2: argv = [arguments[0], arguments[1]]; break;
        // case 3: argv = [arguments[0], arguments[1], arguments[2]]; break;
        default: argv = new Array(); for (var i = 0; i < len; i++) argv.push(arguments[i]); break;
        }
        return handler(argv, self);
    }
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
    return qibl.varargs(partials, { fn: fn, argc: fn.length, argv: null, self: this });

    function partials( av, state ) {
        var argv = state.argv ? concat2(new Array(), state.argv, av) : av;
        // once all expected args are present, invoke fn
        if (argv.length >= state.argc) return qibl.invoke(state.fn, argv);
        return qibl.varargs(partials, { fn: state.fn, argc: state.argc, argv: argv, self: state.self });
    }
}

// see also qinvoke
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
    return qibl.varargs(function(av) {
        if (called) return;
        called = true;
        return qibl.invoke2(fn, this, av);
    })
}

function tryRequire( name ) {
    try { return require(name) } catch (e) { }
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

// replace each occurrence of patt in str with the next one of the args
// If an `addslashes` function is provided, use it to escape the args.
function vinterpolate( str, patt, args, addslashes ) {
    var prevPos = 0, pos, ret = "", argix = 0;
    while ((pos = str.indexOf(patt, prevPos)) >= 0 && argix < args.length) {
        if (pos > prevPos) ret += str.slice(prevPos, pos);
        ret += typeof args[argix] === 'number' ? args[argix++]
            : addslashes ? addslashes(String(args[argix++]))
            : String(args[argix++]);
        prevPos = pos + patt.length;
    }
    if (prevPos < str.length) ret += str.slice(prevPos);
    return ret;
}

function addslashes( str, patt ) {
    // TODO: default to escaping only \' \" \\ \0, pass them in for escapeshellcmd()
    patt = patt || /([\'\"\\\x00])/g;
    return str.replace(patt, '\\$1');
}

/**
function readBody( emitter, cb ) {
    var doneCount = 0, chunks = null;
    emitter.on('data', function(chunk) {
        if (!chunks) chunks = chunks;
        else if (typeof chunks === 'string') chunks += chunk;
        else if (Array.isArray(chunks)) chunks.push(chunk);
        else chunks = new Array(chunks, chunk);
    })
    emitter.on('end', function() {
        if (doneCount++) return;
        if (!chunks || !Array.isArray(chunks)) return cb(null, chunks);
        cb(null, Buffer.concat(chunks));
    })
    emitter.on('error', function(err) {
        if (!doneCount++) cb(err);
    })
}
**/
