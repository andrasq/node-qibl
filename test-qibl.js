/*
 * Copyright (C) 2019 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var qibl = require('./');
var nodeMajor = parseInt(process.versions.node);

module.exports = {
    'isHash should identify hashes': function(t) {
        var tests = [
            [ {}, true ],
            [ {a:1}, true ],
            [ Object(), true ],
            [ new Object(), true ],

            [ /foo/i, false ],
            [ new Date(), false ],
            [ [], false ],
            [ new Array(3), false ],

            [ null, false ],
            [ undefined, false ],
            [ false, false ],
            [ new Boolean(true), false ],
            [ 1, false ],
            [ new Number(2), false ],
            [ "str", false ],
            [ new String("str2"), false ],
        ];

        for (var i=0; i<tests.length; i++) {
            t.equal(qibl.isHash(tests[i][0]), tests[i][1], 'test ' + i + ' ' + tests[i]);
        }

        t.done();
    },

    'copyObject': {
        'should copy properties': function(t) {
            t.deepEqual(qibl.copyObject({}), {});
            t.deepEqual(qibl.copyObject({a:1}), {a:1});
            t.deepEqual(qibl.copyObject({}, {a:1, b:2}), {a:1, b:2});
            t.deepEqual(qibl.copyObject({}, {a:1}, {b:2}), {a:1, b:2});
            t.deepEqual(qibl.copyObject({a:1}, {b:2}, {}), {a:1, b:2});
            t.deepEqual(qibl.copyObject({a:1, b:2}, {}), {a:1, b:2});
            t.done();
        },

        'should assign the properties directly': function(t) {
            var a = { a: new Date(), b: {c:{}} };
            var b = qibl.copyObject({}, a);
            t.deepStrictEqual(b, a);
            t.strictEqual(b.a, a.a);
            t.strictEqual(b.b, a.b);
            t.strictEqual(b.b.c, a.b.c);
            t.done();
        },

        'should omit inherited properties': function(t) {
            function C() {};
            C.prototype.x = 1;
            var a = new C();
            a.a = 1;
            t.deepEqual(qibl.copyObject({}, a), {a:1});
            t.done();
        },
    },

    'merge': {
        'should merge all properties': function(t) {
            t.deepEqual(qibl.merge({}), {});
            t.deepEqual(qibl.merge({}, {}), {});
            t.deepEqual(qibl.merge({}, {a:1}), {a:1});
            t.deepEqual(qibl.merge({}, {a:1}, {b:2}, {c:3}), {a:1, b:2, c:3});
            t.deepEqual(qibl.merge({}, {a: {b:2, c:3}}), {a: {b:2, c:3}});
            t.deepEqual(qibl.merge({a: {b:1}}, {a: {b:2, c:3}}), {a: {b:2, c:3}});
            t.done();
        },

        'should not share sub-objects': function(t) {
            var a = {a:{}}, b = {a:{b:2}}, c = {a:{c:3}};
            var all = qibl.merge(a, b, c);
            t.equal(all.a, a.a);
            t.notEqual(all.a, b.a);
            t.notEqual(all.a, c.a);
            t.done();
        },

        'should include inherited properties': function(t) {
            function C() {};
            C.prototype.x = 1;
            var a = new C();
            a.a = 1;
            t.deepEqual(qibl.merge({}, a), {a:1, x:1});
            t.done();
        },
    },

    'fill should set array elements': function(t) {
        var arr = new Array(3);
        t.deepEqual(qibl.fill(arr, 3), [3, 3, 3]);
        t.deepEqual(qibl.fill(arr, 5, 2), [3, 3, 5]);
        t.deepEqual(qibl.fill(arr, 5, 3, 5), [3, 3, 5, 5, 5]);
        t.done();
    },

    'str_repeat should repeat': function(t) {
        var tests = [
            [ "", 2, "" ],
            [ "x", 0, "" ],
            [ "ab", 1, "ab" ],
            [ "x", 2, "xx" ],
            [ "abc", 3, "abcabcabc" ],
            [ "x", 7, "xxxxxxx" ],
            [ "x", 77, "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" ],

            [ 3, 3, "333" ],
            [ {}, 2, '[object Object][object Object]' ],
        ];

        for (var i=0; i<tests.length; i++) {
            t.equal(qibl.str_repeat(tests[i][0], tests[i][1]), tests[i][2]);
        }

        t.done();
    },

    'saneBuf': {
        'newBuf should emulate legacy constructor': function(t) {
            var buf = qibl.newBuf("foo");
            t.ok(Buffer.isBuffer(buf));
            t.equal(buf.length, 3);
            for (var i=0; i<3; i++) t.equal(buf[i], "foo".charCodeAt(i));

            var buf = qibl.newBuf(4);
            t.ok(Buffer.isBuffer(buf));
            t.equal(buf.length, 4);

            t.done();
        },

        'should construct from string': function(t) {
            var buf = qibl.fromBuf("foobar");
            t.ok(Buffer.isBuffer(buf));
            t.equal(buf.length, 6);
            for (var i=0; i<6; i++) t.equal(buf[i], "foobar".charCodeAt(i));
            t.done();
        },

        'should construct from Buffer': function(t) {
            var buf = qibl.fromBuf(qibl.fromBuf("foobar"));
            t.ok(Buffer.isBuffer(buf));
            t.equal(buf.length, 6);
            for (var i=0; i<6; i++) t.equal(buf[i], "foobar".charCodeAt(i));
            t.done();
        },

        'should allocate by length': function(t) {
            var buf = qibl.allocBuf(7);
            t.ok(Buffer.isBuffer(buf));
            t.equal(buf.length, 7);
            t.done();
        },
    },

    'toStruct should return struct': function(t) {
        var hash = new Object({a:1});
        t.equal(qibl.toStruct(hash), hash);
        t.done();
    },

    'varargs': {
        'should call handler with the call args in an array': function(t) {
            var gotArgs;
            var obj = {};
            function handler(argv, self) { gotArgs = argv }
            qibl.varargs(handler)();
            t.deepEqual(gotArgs, []);
            qibl.varargs(handler)(1);
            t.deepEqual(gotArgs, [1]);
            qibl.varargs(handler)(1, "two");
            t.deepEqual(gotArgs, [1, "two"]);
            qibl.varargs(handler)(1, "two", obj);
            t.deepEqual(gotArgs, [1, "two", obj]);
            t.done();
        },

        'should pass along the provided self': function(t) {
            var myItem = {};
            function handler(argv, self) {
                t.deepEqual(argv, [1, 2, 3]);
                t.equal(self, myItem);
                t.done();
            }
            qibl.varargs(handler, myItem)(1, 2, 3);
        },
    },

    'thunkify': {
        'should return a function that curries the arguments and returns a function': function(t) {
            var args;
            var cb = function() {};
            var func = function() { args = arguments };
            var thunk = qibl.thunkify(func);
            t.equal(typeof thunk, 'function');
            t.equal(typeof thunk(), 'function');
            thunk(1, 2, 3)(cb);
            t.equal(args[0], 1);
            t.equal(args[1], 2);
            t.equal(args[2], 3);
            t.equal(args[3], cb);
            t.done();
        },

        'should throw if not a function': function(t) {
            t.throws(function() { qibl.thunkify(3) }, /not a function/);
            t.throws(function() { qibl.thunkify({}) }, /not a function/);
            t.throws(function() { qibl.thunkify(false) }, /not a function/);
            t.throws(function() { qibl.thunkify(0) }, /not a function/);
            t.throws(function() { qibl.thunkify(null) }, /not a function/);
            t.done();
        },

        'should invoke the function with a this object': function(t) {
            var myItem = {};
            function call() {
                t.deepEqual([].slice.call(arguments, 0), [1, 2, 3, 4, null]);
                t.equal(this, myItem);
                t.done();
            }
            qibl.thunkify(call, myItem)(1, 2, 3, 4)(null);
        },
    },

    'invoke': {
        '_invoke should call function': function(t) {
            var called = false;
            var caller1 = function(a) { called = a };
            var caller2 = function(a, b) { called = b };
            var caller3 = function(a, b, c) { called = c };
            var caller4 = function(a, b, c, d) { called = d };
            qibl._invoke1(caller1, []);
            t.strictEqual(called, undefined);
            qibl._invoke1(caller1, [1]);
            t.strictEqual(called, 1);
            qibl._invoke1(caller2, [1, 2]);
            t.strictEqual(called, 2);
            qibl._invoke1(caller3, [1, 2, 3]);
            t.strictEqual(called, 3);
            qibl._invoke1(caller4, [1, 2, 3, 4]);
            t.strictEqual(called, 4);
            t.done();
        },

        '_invoke2 should call method': function(t) {
            var object = {
                called: false,
                caller1: function(a) { this.called = a },
                caller2: function(a, b) { this.called = b },
                caller3: function(a, b, c) { this.called = c },
                caller4: function(a, b, c, d) { this.called = d },
            };
            qibl._invoke2(object.caller1, object, []);
            t.strictEqual(object.called, undefined);
            qibl._invoke2(object.caller1, object, [1]);
            t.strictEqual(object.called, 1);
            qibl._invoke2(object.caller2, object, [1, 2]);
            t.strictEqual(object.called, 2);
            qibl._invoke2(object.caller3, object, [1, 2, 3]);
            t.strictEqual(object.called, 3);
            qibl._invoke2(object.caller4, object, [1, 2, 3, 4]);
            t.strictEqual(object.called, 4);
            t.done();
        },

        'invoke should call function': function(t) {
            var called = false;
            var caller5 = function(a, b, c, d, e) { called = arguments[4] };
            qibl.invoke(caller5, [1, 2, 3, 4, 5]);
            t.strictEqual(called, 5);
            t.done();
        },

        'invoke2 should call method': function(t) {
            var object = {
                called: false,
                caller5: function(a, b, c, d, e) { this.called = arguments[4] },
            };
            qibl.invoke2(object.caller5, object, [1, 2, 3, 4, 5]);
            t.strictEqual(object.called, 5);
            t.done();
        },
    },

    'escapeRegex': {
        'should escape all metachars': function(t) {
            var chars = [];
            for (var i = 0; i < 128; i++) chars[i] = i;

            var str = ".[]+()*?";
            t.ok(!new RegExp(str).test(str));
            t.ok(new RegExp(qibl.escapeRegex(str)).test(str));

            var str = qibl.newBuf(chars).toString('binary');
            t.throws(function() { new RegExp(str) });
            t.ok(new RegExp(qibl.escapeRegex(str)).test(str));

            t.done();
        },
    },

    'selectField': {
        'should select column': function(t) {
            t.deepEqual(qibl.selectField([], 'k'), []);
            t.deepEqual(qibl.selectField([{a:1}, {k:2}, {c:3, k:4}, {d:5}], 'k'), [undefined, 2, 4, undefined]);
            t.deepEqual(qibl.selectField([null, undefined, 0, false], 'k'), [undefined, undefined, undefined, undefined]);
            t.done();
        },
    },

    'values': {
        'should return values': function(t) {
            if (nodeMajor >= 4) {
                // node-v0.12 and older throw if Object.keys given a non-object
                t.deepEqual(qibl.values(0), []);
                t.deepEqual(qibl.values("foo"), ['f', 'o', 'o']);
            }
            t.deepEqual(qibl.values({}), []);
            t.deepEqual(qibl.values({a:1, b:"two"}), [1, "two"]);
            t.done();
        },
    },

    'vinterpolate': {
        'should interpolate fields': function(t) {
            t.equal(qibl.vinterpolate("foobar", "o", []), "foobar");
            t.equal(qibl.vinterpolate("foobar", "o", [1]), "f1obar");
            t.equal(qibl.vinterpolate("foobar", "o", [1, 2.5]), "f12.5bar");
            t.equal(qibl.vinterpolate("foobar", "oob", [3]), "f3ar");

            t.equal(qibl.vinterpolate("foobar", "boo", [1]), "foobar");
            t.equal(qibl.vinterpolate("foobar", "o", []), "foobar");
            t.equal(qibl.vinterpolate("oooo", "o", ['O', 'OO']), "OOOoo");

            t.equal(qibl.vinterpolate("o", "o", ['$ok ;|\' 3'], qibl.addslashes), "$ok ;|\\\' 3");

            t.done();
        },
    },

    'addslashes': {
        'should escape dangerous metacharacters': function(t) {
            var patt = /([\\"';|&$])/g;
            t.equal(qibl.addslashes(';|$"', patt), '\\;\\|\\$\\"');
            t.equal(qibl.addslashes("'", patt), "\\'");
            t.done();
        },
    },

    'tryRequire': {
        'should require or return undefined': function(t) {
            var pack = qibl.tryRequire('./package');
            var empty = qibl.tryRequire('./nonesuch');
            var version = require('./package').version;
            t.equal(pack.version, version);
            t.strictEqual(empty, undefined);
            t.done();
        }
    },
}
