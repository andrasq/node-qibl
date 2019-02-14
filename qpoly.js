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
    switch (n) {
    case 2: return '' + str + str;
    case 1: return '' + str;
    case 0: return '';
    default:
        var half = str_repeat(str, n >>> 1);
        return (n & 1) ? (half + half + str) : (half + half);
    }
}

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

function varargs( handler ) {
    return function( /* VARARGS */ ) {
        var len = arguments.length, arvgv = new Array();
        for (var i=0; i<len; i++) argv.push(arguments[i]);
        return handler(argv);
    }
}

function thunkify( func, self ) {
    if (typeof func !== 'function') {
        if (self) func = self[func];
        if (typeof func !== 'function') throw new Error('not a function or method');
    }
    return varargs(function(argv) {
        return function(cb) {
            argv.push(cb);
            self ? _invoke2(func, self, argv) : _invoke1(func, argv);
        }
    })
}

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
