/**
 * qpoly -- useful polyfills that at times I wished I had
 *
 * Copyright (C) 2019 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2019-09-11 - AR.
 */

'use strict';

var nodeVersion = parseInt(process.version.slice(1));

var _invoke1 = (nodeVersion < 6) ? _invoke1 : eval("_invoke1 = function(func, argv) { func(...argv) }");
var _invoke2 = (nodeVersion < 6) ? _invoke2 : eval("_invoke2 = function(func, self, argv) { func.call(self, ...argv) }");

module.exports = {
    isHash: isHash,
    assign: copyObject,
    copyObject: copyObject,
    merge: merge,
    fill: fill,
    str_repeat: str_repeat,
    createBuffer: createBuffer,
    bufferFactory: bufferFactory,
    toStruct: toStruct,
    varargs: varargs,
    thunkify: thunkify,
    _invoke1: _invoke1,
    _invoke2: _invoke2,
    escapeRegex: escapeRegex,
    selectField: selectField,
    vinterpolate: vinterpolate,
    addslashes: addslashes,
};

// hashes are generic objects without a class
// See also `qhash`.
function isHash( obj ) {
    return obj ? obj.constructor === Object : false;
}

// transfer the own properties of src onto target
// See also `qhash`.
function copyObject( target /* ,VARARGS */ ) {
    for (var src, i=1; i<arguments.length; i++) {
        src = arguments[i];
        var keys = Object.keys(src);
        for (var j=0; j<keys.length; j++) target[keys[j]] = src[keys[j]];
    }
    return target;
}

// recursively transfer all enumeriable properties of src(es) onto target
// See also `qhash`.
function merge( target /* ,VARARGS */ ) {
    for (var src, i=1; i<arguments.length; i++) {
        src = arguments[i];
        for (var key in src) {
            var val = src[key];
            if (isHash(val)) { if (!isHash(target[key])) target[key] = merge({}, val); else merge(target[key], val) }
            else target[key] = val;
        }
    }
    return target;
}

// See also `sane-buffer`.
function fill( buf, ch, base, bound ) {
    // TODO: maybe typecheck args?
    // TODO: maybe support negative base/bound?
    base = base || 0;
    bound = bound || buf.length;
    for (var i=base; i<bound; i++) buf[i] = ch;
    return buf;
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

// see also sane-buffer
function createBuffer( a, b, c ) {
    if (nodeVersion < 10) return new Buffer(a, b, c);
    else if (a != null && a.constructor === Number) return Buffer.allocUnsafe(a);
    else return Buffer.from(a, b, c);
}

function bufferFactory( ) {
    if (nodeVersion < 10) return {
        from: function(a, b, c) { return new Buffer(a, b, c) },
        allocUnsafe: function(n) { return new Buffer(+n) },
        alloc: function(n) { return fill(new Buffer(+n), 0, 0, +n) },
    }
    else return {
        from: Buffer.from,
        allocUnsafe: Buffer.allocUnsafe,
        alloc: Buffer.alloc,
    };
}

function toStruct( obj ) {
    return toStruct.prototype = obj;
}

/**
// See also `kubelogger`.
function removeAllListeners( emitter, event ) {
    var listeners = emitter.listeners(event);
    for (var i=0; i<listeners.length; i++) emitter.removeListener(event, listeners[i]);
    return listeners;
}

function addListeners( emitter, event, listeners ) {
    for (var i=0; i<listeners.length; i++) emitter.on(event, listeners[i]);
    return listeners;
}
**/

function varargs( handler, self ) {
    return function( /* VARARGS */ ) {
        var len = arguments.length, argv = new Array();
        for (var i=0; i<len; i++) argv.push(arguments[i]);
        return handler(argv, self);
    }
}

// see also qinvoke
function thunkify( func, self ) {
    if (typeof func !== 'function') throw new Error('thunkify: not a function');
    return varargs(function(argv) {
        return function(cb) {
            argv.push(cb);
            self ? _invoke2(func, self, argv) : _invoke1(func, argv);
        }
    })
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

// replace each occurrence of patt in str with the next one of the args
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
