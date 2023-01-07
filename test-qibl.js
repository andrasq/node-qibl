/*
 * Copyright (C) 2019-2022 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var util = require('util');
var path = require('path');
var events = require('events');
var fs = require('fs');
var net = require('net');
var qibl = require('./');
var nodeMajor = parseInt(process.versions.node);

var tmpVarargs;

// from minisql:
function repeatFor(n, proc, callback) {
    (function _loop(err) {
        if (err || n-- <= 0) return callback(err);
        proc(_loop);
    })()
}

var savedTmpdir = process.env.TMPDIR;

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

    'isMethodContext should return true if called as a method': function(t) {
        var obj = { isMc: function() { return qibl.isMethodContext(this) } };
        t.equal(obj.isMc(), true);

        t.equal(qibl.isMethodContext(), false);
        t.equal(qibl.isMethodContext(qibl), false);
        t.equal(qibl.isMethodContext(global), false);
        t.equal(qibl.isMethodContext({}), true);
        t.equal(qibl.isMethodContext(123), false);
        t.equal(qibl.isMethodContext("string"), false);

        var isMc = qibl.isMethodContext;
        t.equal(isMc(), false);
        t.equal(isMc(null), false);
        t.equal(isMc({}), true);

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

    'getProperty': {
        'should get property': function(t) {
            var tests = [
                [{}, 'a', undefined],
                [{}, 'a.b.c', undefined],
                [{a:1}, 'b', undefined],
                [1, 'a', undefined],
                ['a', 'a', undefined],

                [{a:1}, 'a', 1],
                [{foo:{bar:1}}, 'foo.bar', 1],
                [{a:1, b:2}, 'a', 1],
                [{a:1, b:2}, 'b', 2],
                [{a:1, b:2}, 'a.b', undefined],
                [{a:1, b:2}, 'b.a', undefined],
                [{a:1, b:{c:{d:2}}}, 'aa', undefined],
                [{a:1, b:{c:{d:2}}}, 'a', 1],
                [{a:1, b:{c:{d:2}}}, 'b', {c:{d:2}}],
                [{a:1, b:{c:{d:2}}}, 'b.c', {d:2}],
                [{a:1, b:{c:{d:2}}}, 'b.c.d', 2],
                [{a:1, b:{c:{d:2}}}, 'b.c.d.e', undefined],

                [{a:null}, 'a', null],
                [{a: {b: null}}, 'a.b', null],
                [{a: {b: {c: null}}}, 'a.b.c', null],
                [{a: {b: {c: {d: null}}}}, 'a.b.c.d', null],
                [{a: {b: {c: {d: {e: null}}}}}, 'a.b.c.d.e', null],
                [{a: {b: {c: {d: {e: {f: null}}}}}}, 'a.b.c.d.e.f', null],
                [{a: {b: {c: {d: {e: {f: null}}}}}}, 'a.b.c', {d: {e: {f: null}}}],
            ];

            for (var i=0; i<tests.length; i++) {
                t.deepStrictEqual(qibl.getProperty(tests[i][0], tests[i][1]), tests[i][2], 'test ' + i);
            }
            t.done();
        },

        'should be a function': function(t) {
            var get = qibl.getProperty;
            t.deepEqual(get({a:{b:1}}, 'a.b'), 1);
            t.done();
        },

        'should return defaultValue if property not set': function(t) {
            var tests = [
                [0, 'a'],
                [{}, 'a'],
                [{a:1}, 'b'],
                [{a:1}, 'b.c.d'],
                [{a:{b:1}}, 'b.a'],
                [{a:{b:1}}, 'a.c'],
                [{a:{b:1}}, 'a.a'],

                [{}, 'aa'],
                [{}, 'aa.bb'],
                [{}, 'aa.bb.cc'],
                [{}, 'aa.bb.cc.dd'],
                [{}, 'aa.bb.cc.dd.ee'],
                [{}, 'aa.bb.cc.dd.ee.ff'],

                [false, 'a'],
                [null, 'a'],
                [null, 'a.b'],
                [null, 'a.b.c'],
                [0, 'a'],
                [undefined, 'a'],
            ];

            var defaultValue = 1234 + '.' + process.pid;
            for (var i=0; i<tests.length; i++) {
                t.deepStrictEqual(qibl.getProperty(tests[i][0], tests[i][1], defaultValue), defaultValue, 'test ' + i);
            }
            t.done();
        },

        'should return properties on `this`': function(t) {
            var tests = [
                [null, 'a', undefined],
                [{a:1, b:{c:2}}, 'b', {c:2}],
                [{foo:1, bar:{c:2}}, 'bar.c', 2],
            ];

            for (var i=0; i<tests.length; i++) {
                var obj = { get: qibl.getProperty, zz: 1 };
                for (var k in tests[i][0]) obj[k] = tests[i][0][k];
                t.deepStrictEqual(obj.get(tests[i][1]), tests[i][2], 'test ' + i);
            }

            var obj = { get: qibl.getProperty, a: {b: 2} };
            t.deepStrictEqual(obj.get('a'), {b:2});
            t.deepStrictEqual(obj.get('a.b'), 2);
            t.deepStrictEqual(obj.get('a.b.c', 1234), 1234);
            t.deepStrictEqual(obj.get('b', 1234), 1234);

            t.done();
        },

        'should allow very long names': function(t) {
            var item = {
                aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: 1,
                bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: { ccc: 2 },
            }
            t.equal(qibl.getProperty(item, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 1);
            t.equal(qibl.getProperty(item, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.ccc', 2), 2);
            t.done();
        },
    },

    'compileGetProperty': {
        'returns a function': function(t) {
            t.equal(typeof qibl.compileGetProperty('a'), 'function');
            t.equal(typeof qibl.compileGetProperty('a.b'), 'function');
            t.done();
        },

        'returns undefined on invalid path': function(t) {
            t.equal(typeof qibl.compileGetProperty('a b'), 'undefined');
            t.equal(typeof qibl.compileGetProperty('a&.c'), 'undefined');
            t.equal(typeof qibl.compileGetProperty('a.7'), 'undefined');
            t.done();
        },

        'getter retrieves property': function(t) {
            t.deepEqual(qibl.compileGetProperty('a')({}), undefined);
            t.deepEqual(qibl.compileGetProperty('a')({a: 123}), 123);
            t.deepEqual(qibl.compileGetProperty('a')({b: {a: 1}}), undefined);
            t.deepEqual(qibl.compileGetProperty('a.b.c')({a: {b: {c: 444}}}), 444);
            t.deepEqual(qibl.compileGetProperty('a.b.c.d')({a: {b: {c: {d: 987}}}}), 987);

            var get = qibl.compileGetProperty('a.b');
            t.strictEqual(get({a: 1, b: 2}), undefined);
            t.strictEqual(get({a: {b: 2}}), 2);
            t.strictEqual(get({a: {c: {}}}), undefined);
            t.deepStrictEqual(get({a: {b: {c: 234}}}), {c: 234});
            t.done();
        },
    },

    'getProp': {
        'retrieves named property': function(t) {
            var tests = [
                [null, 'a', '--default--'],
                [null, 'a.b.c', '--default--'],
                [{}, null, '--default--'],
                [{null: 1}, null, 1],
                [3, 'a', '--default--'],
                [{}, 'a', '--default--'],
                [{a:3}, 'a', 3],
                [{a:3, b:{}}, 'a.b', '--default--'],
                [{a:3, b:{}}, 'a.b.c.d', '--default--'],
                [{a:3, b:{}}, 'b', {}],
            ];
            for (var i=0; i<tests.length; i++) {
                var obj = tests[i][0], path = tests[i][1], expect = tests[i][2];
                t.deepEqual(qibl.getProp(obj, path, '--default--'), expect);
            }
            t.done();
        },

        'clears getter cache': function(t) {
            t.ok(Object.keys(qibl.getProp.getCache()).length > 1);
            qibl.getProp.clearCache();
            t.equal(Object.keys(qibl.getProp.getCache()).length, 0);
            t.done();
        },

        'clears getter cache after having maxCount getters': function(t) {
            qibl.getProp.clearCache();
            qibl.getProp.maxCount = 2;
            qibl.getProp({}, 'a');
            qibl.getProp({}, 'b');
            qibl.getProp({}, 'c');
            t.ok(Object.keys(qibl.getProp.getCache()).length <= 2);
            t.done();
        },

        'is fast': function(t) {
            var x, data = [{a: {b: {c: 1}}}, {a: {b: {c: 2}}}];
            var nloops = 1e5;
            var t1 = qibl.microtime();
            for (var i=0; i<nloops; i++) x = qibl.getProp(data[i & 1], 'a.b.c');
            var t2 = qibl.microtime();
            t.printf("AR: %dk getProperty in %0.3f ms, %dk/sec\n", nloops/1000, (t2 - t1) * 1000, nloops / 1000 / (t2 - t1));
            // 58m/s for 1m, 22m/s for 100k (R5 4.8g 5600X)
            // 200m/s for 1m, 45m/s for 100k (R5 4.9g 5600X)
            t.done();
        },
    },

    'setProperty': {
        'should set property': function(t) {
            var fn = function(){};
            var tests = [
                [{}, '', 1, {'': 1}],
                [{}, 'a', 1, {a:1}],
                [{}, 'a', 1.5, {a:1.5}],
                [{}, 'a', 'one', {a:'one'}],
                [{}, 'a', {b:1}, {a:{b:1}}],

                [{}, 'a.b', 1, {a:{b:1}}],
                [{}, 'a.b.c', 1, {a:{b:{c:1}}}],
                [{a:{b:1}}, 'a', 1, {a:1}],
                [{a:{b:1}}, 'a.b', 1, {a:{b:1}}],
                [{a:{b:1}}, 'a.b.c', 1, {a:{b:{c:1}}}],
            ];

            for (var i=0; i< tests.length; i++) {
                qibl.setProperty(tests[i][0], tests[i][1], tests[i][2]);
                t.deepStrictEqual(tests[i][0], tests[i][3]);
            }
            t.done();
        },

        'should set mode and property': function(t) {
            var ret;

            // enumerable
            ret = qibl.setProperty({a:1, b:2}, 'a', 10, 'x');
            t.deepEqual(ret, {b:2});
            t.deepEqual(ret.a, 10);

            // readonly
            ret = qibl.setProperty({a:1, b:2}, 'a', 10, 'r');
            t.deepEqual(ret, {a:10, b:2});
            try { ret.a = 20; } catch (e) {}
            t.deepEqual(ret.a, 10);

            // writable
            ret = qibl.setProperty({a:1, b:2}, 'a', 10, 'w');
            t.deepEqual(ret, {a:10, b:2});
            try { ret.a = 20; } catch (e) {}
            t.deepEqual(ret.a, 20);

            // getter
            ret = qibl.setProperty({a:1}, 'b.c', function() { return 123 }, 'G');
            t.strictEqual(ret.b.c, 123);

            // setter
            ret = qibl.setProperty({a:1}, 'b.c', function(x) { this.a = x }, 'S');
            ret.b.c = 123;
            t.strictEqual(ret.b.a, 123);

            t.done();
        },

        'should be a function': function(t) {
            var set = qibl.setProperty;
            t.deepEqual(set({}, 'a.b', 1), {a:{b:1}});
            t.done();
        },

        'should set property on this': function(t) {
            var obj;

            obj = { set: qibl.setProperty };
            t.strictContains(obj.set('a.b', 1), {a:{b:1}});
            t.strictContains(obj.set('b', 2), {a:{b:1}, b:2});
            t.strictContains(obj.set('a', 3), {a:3, b:2});

            t.done();
        },

        'should ignore invalid target': function(t) {
            // lodash does not throw
            qibl.setProperty(1, 'a', 1);
            qibl.setProperty(false, 'a', 1);
            qibl.setProperty(null, 'a', 1);

            // valid target, not throws
            qibl.setProperty({}, 'a', 1);
            qibl.setProperty(function(){}, 'a', 1);

            qibl.setProperty(2, 'a', 1, 'x');

            t.done();
        },

        'is fast': function(t) {
            var target = {};
            var nloops = 1e5;
            var t1 = qibl.microtime();
            for (var i=0; i<nloops; i++) qibl.setProperty(target, 'a.b.c', i);
            var t2 = qibl.microtime();
            t.printf("AR: %dk setProperty in %0.3f ms, %dk/sec\n", nloops/1000, (t2 - t1) * 1000, nloops / 1000 / (t2 - t1), target);
            // 7.8m/s for 1m, 6.6m/s for 100k (R5 4.9g 5600X)
            t.done();
        },
    },

    'getLastDefined': {
        'should return the last defined argument': function(t) {
            var tests = [
                [[], undefined],
                [[1], 1],
                [[3, 1, 2], 2],
                [[undefined, 1], 1],
                [[1, undefined], 1],
                [[undefined, 1, undefined], 1],
            ];
            for (var i=0; i<tests.length; i++) {
                t.deepStrictEqual(qibl.getLastDefined.apply(null, tests[i][0]), tests[i][1], 'test ' + i);
            }
            t.done();
        },
    },

    'inherits': {
        'should inherit class properties': function(t) {
            var Base = function() {};
            Base.a = 1;
            Base.b = 2;
            var Derived = function() {};
            qibl.inherits(Derived, Base);
            t.ok(new Derived() instanceof Base);
            t.equal(Derived.a, 1);
            t.equal(Derived.b, 2);
            t.done();
        },

        'should inherit methods': function(t) {
            var Base = function() {};
            Base.prototype.m = function() { return 1234 };
            var Derived = function() {};
            qibl.inherits(Derived, Base);
            t.ok(new Derived() instanceof Base);
            // prototype inherits from base prototype
            t.equal(Derived.prototype.m, Base.prototype.m);
            // object inherits
            t.equal(new Derived().m, Base.prototype.m);
            t.strictEqual(new Derived().m(), 1234);
            t.done();
        },

        'should inherit inherited methods': function(t) {
            var Old = function() {};
            Old.prototype.m = function() { return 12345 };
            var Base = function() {};
            var Derived = function() {};
            util.inherits(Base, Old);
            qibl.inherits(Derived, Base);
            t.ok(new Derived() instanceof Base);
            t.ok(new Derived() instanceof Old);
            t.equal(new Derived().m, new Old().m);
            t.strictEqual(new Derived().m(), 12345);
            t.done();
        },

        'should inherit from javascript classes': function(t) {
            var Base;
            try { eval("Base = class C { m() { return 123 } }") } catch (err) { return t.skip(); }
            var Derived = function() {};
            qibl.inherits(Derived, Base);
            t.ok(new Derived() instanceof Base);
            t.equal(new Derived().m(), 123);
            t.done();
        },
    },

    'abstract': {
        'returns a function': function(t) {
            var fn = qibl.abstract('testT');
            t.equal(typeof fn, 'function');
            t.done();
        },
        'returned function is tagged _isPureVirtual': function(t) {
            var fn = qibl.abstract('testT');
            t.strictEqual(fn._isPureVirtual, true);
            t.done();
        },
        'returned function throws': function(t) {
            var fn = qibl.abstract('testT');
            t.throws(function() { fn() }, /abstract .* testT.* not implemented/);
            t.done();
        },
        'returned function has specified name and parameter count': function(t) {
            var fn0 = qibl.abstract('test0');
            t.equal(fn0.name, 'test0');
            t.equal(fn0.length, 0);

            var fn1 = qibl.abstract('test1', 'a1');
            t.equal(fn1.name, 'test1');
            t.equal(fn1.length, 1);

            var fn2 = qibl.abstract('test2', 'a1', 'a2');
            t.equal(fn2.name, 'test2');
            t.equal(fn2.length, 2);

            var fn5 = qibl.abstract('test5', 'a1', 'a2', 'a3', 'a4', 'a5');
            t.equal(fn5.name, 'test5');
            t.equal(fn5.length, 5);

            t.done();
        },
    },

    'derive': {
        'returns a constructor': function(t) {
            function Foo() {};
            var Bar = qibl.derive('Bar', Foo);
            t.equal(typeof Bar, 'function');
            t.equal(new Bar().constructor, Bar);
            t.done();
        },

        'creates instances of the parent': function(t) {
            function Foo() {};
            var Bar = qibl.derive('Bar', Foo);
            t.ok(new Bar() instanceof Bar);
            t.ok(new Bar() instanceof Foo);
            t.equal(Bar.prototype.constructor, Bar);
            t.done();
        },

        'adds to the prototype': function(t) {
            function Foo() {};
            Foo.prototype.a = 1;
            var Bar = qibl.derive('Bar', Foo, { b: 2 });
            t.equal(Bar.prototype.a, 1);
            t.equal(Bar.prototype.b, 2);
            t.done();
        },

        'prototype can follow the parent': function(t) {
            function Foo() {}
            var Bar = qibl.derive('Bar', Foo, function() { return new Date() });
            t.ok(new Bar() instanceof Date);
            t.done();
        },

        'uses the provided constructor': function(t) {
            function Foo() {};
            Foo.prototype.a = 1;
            function Dar() { return new Date() }
            var Bar = qibl.derive('Bar', Foo, null, Dar);
            t.equal(Bar.prototype.a, 1);
            t.ok(new Bar() instanceof Date);
            t.done();
        },

        'invokes the provided constructor': function(t) {
            var called = false;
            function Foo() {};
            var val = Math.random();
            function Dar() { called = true; this.a = val }
            var Bar = qibl.derive('Bar', Foo, null, Dar);
            t.notEqual(Bar.prototype.constructor, Dar);
            var x = new Bar();
            t.equal(called, true);
            t.equal(x.a, val);
            t.done();
        },

        'errors': {
            'throws if constructor is not a function': function(t) {
                t.throws(function() { qibl.derive('Bar', Date, {}, 123) }, /not a function/);
                t.done();
            },

            'throws if parent is not a function': function(t) {
                t.throws(function() { qibl.derive('Bar', 123) }, /not a function/);
                t.done();
            },
        },
    },

    'clone': {
        'clones builtin classes': function(t) {
            var tests = [
                "foo",
                1234.5,
                new Date(),
                new RegExp('foo.*bar', 'i'),
                qibl.fromBuf("foobar"),
                [1, 2.5],
            ];
            for (var i = 0; i < tests.length; i++) {
                var copy = qibl.clone(tests[i]);
                t.equal(String(copy), String(tests[i]));
                if (typeof tests[i] === 'object') {
                    t.notEqual(copy, tests[i]);
                    t.equal(copy.constructor, tests[i].constructor);
                    t.deepEqual(copy, tests[i]);
                }
            }
            t.done();
        },

        'copies own properties': function(t) {
            var obj = new Date();
            obj.x = 123;
            var copy = qibl.clone(obj);
            t.equal(String(copy), String(obj));
            t.strictEqual(copy.x, obj.x);
            t.done();
        },

        'clones custom classes': function(t) {
            function Bar() {};
            function Foo() { this.x = 1 };
            qibl.inherits(Foo, Bar);
            Foo.prototype.inherited = 9;
            var object = new Foo();
            object.y = 2;
            var copy = qibl.clone(object);
            t.ok(copy instanceof Foo);
            t.ok(copy instanceof Bar);
            t.strictEqual(copy.x, 1);
            t.strictEqual(copy.y, 2);
            t.strictEqual(copy.inherited, 9);
            t.done();
        },

        'clones recursively': function(t) {
            var a = {a: {}};
            t.equal(qibl.clone(a).a, a.a);
            t.notEqual(qibl.clone(a, true).a, a.a);
            t.done();
        },
    },

    'reparent': {
        'returns the target': function(t) {
            var o = {};
            t.equal(qibl.reparent(o, function Foo(){}), o);
            t.done();
        },

        'reparents the construtor and instanceof': function(t) {
            function Foo(){};
            Foo.prototype.fn = function(){};
            Foo.prototype.x = 1;
            t.equal(qibl.reparent({}, Foo).constructor, Foo);
            t.equal(qibl.reparent({}, Foo).__proto__.constructor, Foo);
            t.contains(qibl.reparent({}, Foo).__proto__, Foo.prototype);
            //t.deepEqual(qibl.reparent({}, Foo).__proto__, new Foo().__proto__);
            t.ok(qibl.reparent({}, Foo) instanceof Foo);
            t.done();
        },

        'changes the constructor and instanceof': function(t) {
            function Foo() {};
            Foo.prototype.set = function(k, v) { this.k = v };
            var obj = {};
            qibl.reparent(obj, Date);
            t.equal(obj.constructor, Date);
            t.ok(obj instanceof Date);
            t.equal(typeof obj.getTime, 'function');
            t.done();
        },
    },

    'fill should set array elements': function(t) {
        var arr = new Array(3);
        t.deepEqual(qibl.fill(arr, 3), [3, 3, 3]);
        t.deepEqual(qibl.fill(arr, 5, 2), [3, 3, 5]);
        t.deepEqual(qibl.fill(arr, 5, 3, 5), [3, 3, 5, 5, 5]);
        t.deepEqual(qibl.fill(arr, 7, 3, 5), [3, 3, 5, 7, 7]);
        t.deepEqual(qibl.fill(arr, 9, 2, 4), [3, 3, 9, 9, 7]);

        t.deepEqual(qibl.fill(new Array(10), 3, 3, 6), [,,,3,3,3,,,,,]);

        t.done();
    },

    'populate': {
        'should set array elements': function(t) {
            var arr = new Array(3);
            t.deepEqual(qibl.populate(arr, 3), [3, 3, 3]);
            t.deepEqual(qibl.populate(arr, 5, { base: 2 }), [3, 3, 5]);
            t.deepEqual(qibl.populate(arr, 7, { base: 3, bound: 5 }), [3, 3, 5, 7, 7]);
            t.deepEqual(qibl.populate(arr, 9, { base: 2, bound: 4 }), [3, 3, 9, 9, 7]);

            t.done();
        },

        'should set buffer elements': function(t) {
            var buf = qibl.allocBuf(6);
            t.deepEqual(qibl.populate(buf, 3), qibl.fromBuf([3, 3, 3, 3, 3, 3]));
            t.deepEqual(qibl.populate(buf, 5, { base: 2 }), qibl.fromBuf([3, 3, 5, 5, 5, 5]));
            t.deepEqual(qibl.populate(buf, 7, { base: 3, bound: 5 }), qibl.fromBuf([3, 3, 5, 7, 7, 5]));
            t.deepEqual(qibl.populate(buf, 9, { base: 2, bound: 4 }), qibl.fromBuf([3, 3, 9, 9, 7, 5]));

            t.done();
        },

        'should populate array elements': function(t) {
            var a = new Array(10);

            qibl.populate(a, 3, { base: 3, bound: 6 });
            t.deepEqual(a, [,,,3,3,3,,,,,]);

            var nextId = 101;
            qibl.populate(a, function() { return nextId++ }, { base: 3, bound: 5 });
            t.deepEqual(a, [,,,101,102,3,,,,,]);

            qibl.populate(a, 1, { bound: 4 });
            t.deepEqual(a, [1,1,1,1,102,3,,,,,]);

            qibl.populate(a, 2, { base: 8 });
            t.deepEqual(a, [1,1,1,1,102,3,,,2,2,]);

            t.done();
        },

        'should populate object keys': function(t) {
            var C = function() { this.a = 1; this.b = 2 };
            C.prototype.x = 99;
            var o = new C();

            qibl.populate(o, 3);
            t.deepEqual(o, {a:3, b:3});

            var nextId = 101;
            qibl.populate(o, function() { return nextId++ });
            t.deepEqual(o, {a:101, b:102});

            qibl.populate(o, 999, { keys: ['b'] });
            t.deepEqual(o, {a:101, b:999});

            qibl.populate(o, 2);
            t.deepEqual(o, {a:2, b:2});

            t.done();
        },
    },

    'omitUndefined': {
        'should compact arrays': function(t) {
            var tests = [
                [ [], [] ],
                [ [1,2], [1,2] ],
                [ [1,,2], [1,2] ],
                [ [,,1], [1] ],
                [ [1,,,], [1] ],
                [ [,,,,,,,,,,,,,,,], [] ],
                [ [,,,,,,,,,,,,,,,1,,,,,,,,,2,,,,,,], [1,2] ],
            ];

            for (var i=0; i<tests.length; i++) {
                t.deepStrictEqual(qibl.omitUndefined(tests[i][0]), tests[i][1]);
            }

            t.done();
        },

        'should compact objects': function(t) {
            var tests = [
                [ {}, {} ],
                [ null, {} ],
                [ undefined, {} ],
                [ 0, {} ],
                [ 1, {} ],
                [ false, {} ],
                [ {a:1, b:2}, {a:1, b:2} ],
                [ {a:undefined, b:2}, {b:2} ],
                [ {a:1, b:undefined}, {a:1} ],
                [ {a:undefined, b:undefined}, {} ],
            ];

            for (var i=0; i<tests.length; i++) {
                t.deepStrictEqual(qibl.omitUndefined(tests[i][0]), tests[i][1]);
            }

            t.done();
        },
    },

    'forEachProperty': {
        'visits each enumerable property': function(t) {
            var keys = [], values = [];
            qibl.forEachProperty({ a: 1, b: 2}, function(v, k) { keys.push(k); values.push(v) });
            t.deepEqual(keys, ['a', 'b']);
            t.deepEqual(values, [1, 2]);
            t.done();
        },
        'skips non-enumerable properties': function(t) {
            var keys = [], values = [];
            qibl.forEachProperty(new Error('test'), function(v, k) { keys.push(k); values.push(v) });
            t.deepEqual(keys, []);
            t.deepEqual(values, []);
            t.done();
        },
    },

    'hashToMap': {
        'converts hash to Hashmap': function(t) {
            t.deepEqual(qibl.hashToMap({}), new qibl.Hashmap());
            t.deepEqual(qibl.hashToMap({ a: 1, b: {} }), new qibl.Hashmap([['a', 1], ['b', {}]]));
            t.done();
        },
        'converts array to Hashmap': function(t) {
            t.deepEqual(qibl.hashToMap([123, {b: 2}]), new qibl.Hashmap([[0, 123], [1, {b: 2}]]));
            t.done();
        },
        'ignores non-iterable input': function(t) {
            t.deepEqual(qibl.hashToMap(null), new qibl.Hashmap());
            t.deepEqual(qibl.hashToMap(123), new qibl.Hashmap());
            t.done();
        },
        'adds to existing map': function(t) {
            var map = new qibl.Hashmap([['x', 123]]);
            qibl.hashToMap({a: 1}, map);
            t.deepEqual(map, new qibl.Hashmap([['x', 123], ['a', 1]]));
            t.done();
        },
    },

    'mapToHash': {
        'converts map to hash': function(t) {
            t.deepEqual(qibl.mapToHash(new qibl.Hashmap([['a', 1], ['b', {}]])), {a: 1, b: {}});
            t.done();
        },
        'adds to existing hash': function(t) {
            t.deepEqual(qibl.mapToHash(new qibl.Hashmap([['a', 1]]), {x: 123}), {x: 123, a: 1});
            t.done();
        },
    },

    '_Hashmap': {
        'constructs a map': function(t) {
            t.deepEqual(new qibl._Hashmap(), new qibl._Hashmap());
            t.notEqual(new qibl._Hashmap(), new qibl._Hashmap());
            t.done();
        },
        'can set and get elements': function(t) {
            var map = new qibl._Hashmap();
            map.set('a', 1);
            map.set('b', 'two');
            t.strictEqual(map.get('a'), 1);
            t.strictEqual(map.get('b'), 'two');
            t.strictEqual(map.get('c'), undefined);
            t.done();
        },
        'can get keys and values arrays': function(t) {
            var map = new qibl._Hashmap([['a', 1], ['b', 2]]);
            t.deepEqual(map.keys(), ['a', 'b']);
            t.deepEqual(map.values(), [1, 2]);
            t.done();
        },
        'can iterate contents': function(t) {
            var contents = [];
            var map = new qibl._Hashmap([['a', 1], ['b', 2]]);
            map.forEach(function(value, key) { contents.push([key, value]) });
            t.deepEqual(contents, [['a', 1], ['b', 2]]);
            t.done();
        },
        'can delete': function(t) {
            var map = new qibl._Hashmap([['a', 1], ['b', 2], ['c', 3]]);
            map.delete('b');
            t.deepEqual(map.keys(), ['a', 'c']);
            t.deepEqual(map.values(), [1, 3]);
            t.done();
        },
    },

    'concat2 should concatenate arrays': function(t) {
        t.deepEqual(qibl.concat2([1]), [1]);

        t.deepEqual(qibl.concat2([], []), []);
        t.deepEqual(qibl.concat2([1], []), [1]);
        t.deepEqual(qibl.concat2([1], [2]), [1, 2]);
        t.deepEqual(qibl.concat2([1, 2], [3]), [1, 2, 3]);
        t.deepEqual(qibl.concat2([1], [2, 3]), [1, 2, 3]);
        t.deepEqual(qibl.concat2([1], [2], [3]), [1, 2, 3]);
        t.deepEqual(qibl.concat2([1], [2, 3], [4]), [1, 2, 3, 4]);
        t.deepEqual(qibl.concat2([1], [2, 3], [4]), [1, 2, 3, 4]);
        t.deepEqual(qibl.concat2([1], [2], [3, 4]), [1, 2, 3, 4]);
        t.deepEqual(qibl.concat2([1, 2], [3], [4]), [1, 2, 3, 4]);
        t.deepEqual(qibl.concat2([1, 2], [3, 4, 5], [6, 7]), [1, 2, 3, 4, 5, 6, 7]);
        t.done();
    },

    'flatMap2': {
        'appends the computed values': function(t) {
            t.deepEqual(qibl.flatMap2([], [1, 2, 3], function(x) { return 1}), [1, 1, 1]);
            t.deepEqual(qibl.flatMap2([9], [1, 2, 3], function(x) { return 1}), [9, 1, 1, 1]);
            t.deepEqual(qibl.flatMap2([], [1, 2, 3], function(x) { return x}), [1, 2, 3]);
            t.deepEqual(qibl.flatMap2([0,,], [1, 2, 3], function(x) { return x}), [0, , 1, 2, 3]);
            t.done();
        },

        'flattens computed arrays': function(t) {
            t.deepEqual(qibl.flatMap2([], [1, [2], [[3]]], function(x) { return x}), [1, 2, [3]]);
            t.deepEqual(qibl.flatMap2([9, 0], [1, [2], [[3]]], function(x) { return x}), [9, 0, 1, 2, [3]]);
            t.deepEqual(qibl.flatMap2([], [1, 2, 3], function(x) { return [1, x] }), [1, 1, 1, 2, 1, 3]);
            t.deepEqual(qibl.flatMap2([], [1, [2], 3], function(x) { return [1, x] }), [1, 1, 1, [2], 1, 3]);
            t.done();
        },

        'skips missing elements': function(t) {
            t.deepEqual(qibl.flatMap2([], [,,3,,,,4], function(x) { return [x] }), [3, 4]);
            t.done();
        },

        'concatenates arrays of arrays': function(t) {
            function nine(x) { return [9, 9] }
            t.deepEqual(qibl.flatMap2([1, 2], [[1], [2]], function(x) { return [9, 9]}), [1, 2, 9, 9, 9, 9]);
            t.deepEqual(qibl.flatMap2([1, 2], [[1], [2]], nine), [1, 2, 9, 9, 9, 9]);

            t.deepEqual(qibl.flatMap2([], [[1], [2, 3], [[4]]], function(x) { return x }), [1, 2, 3, [4]]);

            // the readme example:
            t.deepEqual(qibl.flatMap2([0], [{v: 1}, {v: [2, 3]}], function(x) { return x.v }), [0, 1, 2, 3]);
            t.done();
        },

        'appends self to self': function(t) {
            var arr = [1, [2, 3]];
            t.deepEqual(qibl.flatMap2(arr, arr, function(x) { return x }), [1, [2, 3], 1, 2, 3]);
            t.done();
        },
    },

    'removeByIndex': {
        'updates the array': function(t) {
            var arr = [1, 2, 3, 4];
            qibl.removeByIndex(arr, 0);
            t.deepEqual(arr, [2, 3, 4]);
            qibl.removeByIndex(arr, -1);
            t.deepEqual(arr, [2, 3, 4]);
            qibl.removeByIndex(arr, 7);
            t.deepEqual(arr, [2, 3, 4]);
            qibl.removeByIndex(arr, 1);
            t.deepEqual(arr, [2, 4]);
            t.done();
        },

        'returns the item': function(t) {
            t.equal(qibl.removeByIndex([1, 2, 3], -1), undefined);
            t.equal(qibl.removeByIndex([1, 2, 3], 0), 1);
            t.equal(qibl.removeByIndex([1, 2, 3], 1), 2);
            t.equal(qibl.removeByIndex([1, 2, 3], 2), 3);
            t.equal(qibl.removeByIndex([1, 2, 3], 4), undefined);
            t.done();
        },
    },

    'remove2': {
        'returns the input array': function(t) {
            var arr = [1, 2, 3];
            t.equal(qibl.remove2(arr, function() { return true }), arr);
            t.done();
        },

        'repacks the array': function(t) {
            function isNotEven(x) { return x % 2 !== 0 }
            t.deepEqual(qibl.remove2([1, 2, 3], function() { return true }), []);
            t.deepEqual(qibl.remove2([1, 2, 3], function() { return false }), [1, 2, 3]);
            t.deepEqual(qibl.remove2([], isNotEven), []);
            t.deepEqual(qibl.remove2([1, 1, 3], isNotEven), []);
            t.deepEqual(qibl.remove2([2, 2, 4], isNotEven), [2, 2, 4]);
            t.deepEqual(qibl.remove2([1, 2, 3, 4, 5], isNotEven), [2, 4]);
            t.done();
        },

        'can return the discards': function(t) {
            var arr = [1, 2, 3, 4, 5];
            var discards = [];
            qibl.remove2(arr, function() { return true }, discards);
            t.deepEqual(discards, [1, 2, 3, 4, 5]);
            t.deepEqual(arr, []);
            t.done();
        },
    },

    'chunk': {
        'splits array into batches': function(t) {
            var tests = [
                [[1,2,3], 1, [[1], [2], [3]]],
                [[1,2,3], 2, [[1,2], [3]]],
                [[1,2,3], 3, [[1,2,3]]],
                [[1,2,3], 4, [[1,2,3]]],

                [[], 2, []],
                [null, 2, []],
                [[1,2,3,4,5], 0, []],
                [[1,2,3,4,5], 2, [[1,2], [3,4], [5]]],
                [[1,2,3,4,5], 3, [[1,2,3], [4,5]]],
            ];
            for (var i=0; i<tests.length; i++) {
                var test = tests[i];
                t.deepEqual(qibl.chunk(test[0], test[1]), test[2]);
            }
            t.done();
        },
    },

    'subsample': {
        before: function(done) {
            this.sampleit = function(t, limit, arr, length) {
                var samp = qibl.subsample(arr, limit);
                t.equal(samp.length, length, samp);
                t.contains(arr, samp);
            }
            done();
        },

        'should subsample': function(t) {
            this.sampleit(t, -1, [], 0);
            this.sampleit(t, -1, [1, 2], 0);
            this.sampleit(t, 0, [], 0);
            this.sampleit(t, 0, [1], 0);

            this.sampleit(t, 1, [], 0);
            this.sampleit(t, 1, [1], 1);
            this.sampleit(t, 1, [1, 2, 3], 1);
            this.sampleit(t, 2, [1, 2, 3], 2);
            this.sampleit(t, 3, [1, 2, 3], 3);
            this.sampleit(t, 4, [1, 2, 3], 3);
            this.sampleit(t, 99, [1, 2, 3], 3);

            t.deepEqual(qibl.subsample([3, 1, 2], 3), [3, 1, 2]);
            t.deepEqual(qibl.subsample([3, 1, 2], 7), [3, 1, 2]);

            t.deepEqual(qibl.subsample([1, 2, 3], 2, 2, 10), [3]);

            t.done();
        },

        'should subsample between base and bound': function(t) {
            var arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            for (var base = 0; base < 10; base++) {
                for (var bound = 0; bound < 10; bound++) {
                    for (var i=0; i<100; i++) {
                        var samp = qibl.subsample(arr, 4, base, bound);
                        for (var j=0; j<samp.length; j++) t.ok(samp[j] >= base && samp[j] < bound);
                    }
                }
            }
            t.done();
        },

        'should subsample fairly': function(t) {
            var list = new Array(10);
            var counts = new Array(10);
            for (var i=0; i<10; i++) list[i] = i;

            qibl.fill(counts, 0);
            for (var i=0; i<100000; i++) {
                var nsamples = 3;
                var samp = qibl.subsample(list, nsamples, 2, 9);
                t.equal(samp.length, nsamples);
                samp.sort();
                for (var j=1; j<samp.length; j++) t.ok(samp[j-1] < samp[j]);    // all distinct
                for (var j=0; j<samp.length; j++) counts[samp[j]] += 1;         // count how many times seen
            }

            // what fell outside base/bounds should not be picked
            t.equal(counts[0], 0);
            t.equal(counts[1], 0);
            t.equal(counts[9], 0);

            // of eligible range, no more than 2% difference over 100k
            // NOTE: this will fail occasionally with very low probability
            var min = Math.min.apply(null, counts.slice(2, -1));
            var max = Math.max.apply(null, counts.slice(2, -1));
            t.ok(max - min < 2000, "min-max spread too large");

            t.done();
        },
    },

    'qsearch': {
        'finds last index having the probed property': function(t) {
            var arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            t.equal(qibl.qsearch(0, 7, function(i) { return arr[i] <= 5 }), 5);
            t.equal(qibl.qsearch(0, 5, function(i) { return arr[i] <= 5 }), 5);
            t.equal(qibl.qsearch(0, 4, function(i) { return arr[i] <= 5 }), 4);
            t.equal(qibl.qsearch(0, 9, function(i) { return arr[i] <= 2 }), 2);
            t.equal(qibl.qsearch(8, 9, function(i) { return arr[i] <= 2 }), 7);
            t.equal(qibl.qsearch(0, 9, function(i) { return arr[i] <= 99 }), 9);
            t.equal(qibl.qsearch(0, 9, function(i) { return arr[i] == 99 }), -1);
            t.equal(qibl.qsearch(5, 9, function(i) { return arr[i] == 99 }), 4);

            t.done();
        },
    },

    'sort3': function(t) {
        for (var i = 0; i < 1000; i++) {
            var arr = qibl.sort3(Math.random(), Math.random(), Math.random());
            t.ok(arr[0] <= arr[1] && arr[1] <= arr[2], "not sorted: " + arr);
        }
        t.done();
    },

    'sort3i': function(t) {
        for (var i = 0; i < 1000; i++) {
            var arr = [Math.random(), Math.random(), Math.random()];
            qibl.sort3i(arr, 0, 1, 2);
            t.ok(arr[0] <= arr[1] && arr[1] <= arr[2], "not sorted: " + arr);
            qibl.sort3i(arr, 2, 1, 0);
            t.ok(arr[0] >= arr[1] && arr[1] >= arr[2], "not sorted: " + arr);
        }
        t.done();
    },

    'swap3i': function(t) {
        var a = [1, 2, 3, 4];
        qibl.swap3i(a, 1, 2, 3);
        t.deepEqual(a, [1, 3, 4, 2]);
        qibl.swap3i(a, 0, 2, 2);
        t.deepEqual(a, [4, 3, 1, 2]);
        t.done();
    },

    'randomize': {
        'returns target array': function(t) {
            var arr = [];
            t.equal(qibl.randomize(arr), arr);
            t.done();
        },

        'scrambles array contents': function(t) {
            t.deepEqual(qibl.randomize([]), []);
            var data = qibl.populate(new Array(4), function(i) { return i + 1 });
            var poses = new Array(data.length);
            for (var i = 0; i < poses.length; i++) poses[i] = qibl.populate(new Array(poses.length), 0);
            for (var i = 0; i < 100000; i++) {
                var arr = qibl.randomize(data.slice(0));
                for (var n = 1; n <= data.length; n++) {
                    var ix = arr.indexOf(n);
                    t.ok(ix >= 0);
                    poses[n - 1][ix] += 1;
                }
            }
            var max = Math.max.apply(Math, [].concat.apply([], poses));
            var min = Math.min.apply(Math, [].concat.apply([], poses));
            // typical range over 100k runs of 4 items is is .4-.8%
            t.ok(max - min < 10000, "more than 10% difference in locations");
            t.done();
        },

        'scrambles a subrange of the array': function(t) {
            var arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            qibl.randomize(arr, 3, 9);
            t.deepEqual(arr.slice(0, 3), [1, 2, 3]);
            t.done();
        },

        'scrambles a subrange relative to the end of the array': function(t) {
            var arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            qibl.randomize(arr, -9, -3);
            t.deepEqual(arr.slice(6), [7, 8, 9]);
            t.done();
        },
    },

    'interleave2': {
        'merges arrays': function(t) {
            t.deepEqual(qibl.interleave2([], [], []), []);
            t.deepEqual(qibl.interleave2([], [], [1, 2]), [1, 2]);
            t.deepEqual(qibl.interleave2([], [1, 2], []), [1, 2]);
            t.deepEqual(qibl.interleave2([], [1, 2], [3]), [1, 3, 2]);
            t.deepEqual(qibl.interleave2([], [3], [1, 2]), [3, 1, 2]);
            t.deepEqual(qibl.interleave2([], [1, 2], [3, 4]), [1, 3, 2, 4]);
            t.deepEqual(qibl.interleave2([], [1, 2, 3], [4]), [1, 4, 2, 3]);
            t.deepEqual(qibl.interleave2([], [4], [1, 2, 3]), [4, 1, 2, 3]);
            t.deepEqual(qibl.interleave2([1, 2], [3, 4], [5]), [1, 2, 3, 5, 4]);
            t.done();
        },

        'returns the target array': function(t) {
            var target = [1];
            var arr = qibl.interleave2(target, [2, 3], [4]);
            t.equal(arr, target);
            t.deepEqual(target, [1, 2, 4, 3]);
            t.done();
        },
    },

    'range': {
        'returns an iterable': function(t) {
            var range = qibl.range(3);
            t.ok(!Array.isArray(range));
            t.deepEqual(qibl.toArray(range), [0, 1, 2]);
            t.done();
        },

        'can be iterated by nodejs': function(t) {
            // node-v0.8 and v0.10 die on "Unexpected identifier", later node throw
            if (nodeMajor < 1) t.skip();

            var range = qibl.range(1, 8, function(x) { return x + 3 });
            var vals = [];
            mapOf(range, function(val) { vals.push(val) });
            t.deepEqual(vals, [1, 4, 7]);
            t.done();

            function mapOf(iter, fn) { eval("for (var val of iter) fn(val);") }
        },

        'throws if stepBy is not a number or function': function(t) {
            t.throws(function() { qibl.range(1, 10, 'a') }, /not a number or function/);
            t.throws(function() { qibl.range(1, 10, {}) }, /not a number or function/);
            t.done();
        },

        'returns a range to': function(t) {
            t.deepEqual(qibl.toArray(qibl.range(3)), [0, 1, 2]);
            t.deepEqual(qibl.toArray(qibl.range(5.00001)), [0, 1, 2, 3, 4, 5]);
            t.done();
        },

        'omits the bound': function(t) {
            t.deepEqual(qibl.toArray(qibl.range(3)), [0, 1, 2]);
            t.deepEqual(qibl.toArray(qibl.range(3, 5)), [3, 4]);
            t.deepEqual(qibl.toArray(qibl.range(3, 5.0001)), [3, 4, 5]);
            t.done();
        },

        'steps by the increment': function(t) {
            var range = qibl.range(1, 5.0001, function(x) { return x + 2 });
            t.deepEqual(qibl.toArray(range), [1, 3, 5]);
            t.done();
        },

        'returns a non-linear range': function(t) {
            var arr = qibl.toArray(qibl.range(1, 1e4 + .000001, function(x) { return x * 10 }));
            t.deepEqual(arr, [1, 10, 100, 1000, 10000]);
            t.done();
        },

        'accepts a numeric stepBy': function(t) {
            t.deepEqual(qibl.toArray(qibl.range(1, 5.0001, 2)), [1, 3, 5]);
            t.done();
        },

        'returns negative ranges': function(t) {
            t.deepEqual(qibl.toArray(qibl.range(10, 5)), [10, 9, 8, 7, 6, 5]);
            t.deepEqual(qibl.toArray(qibl.range(10, 5, 1)), [10, 9, 8, 7, 6, 5]);
            t.deepEqual(qibl.toArray(qibl.range(10, 5, 2.5)), [10, 7.5 ,5]);
            t.deepEqual(qibl.toArray(qibl.range(10, 5, -1)), [10, 9, 8, 7, 6, 5]);
            t.done();
        },

        'returns negative non-sequential ranges': function(t) {
            var range = qibl.range(10, 5, function(x) { return x - 2 });
            t.deepEqual(qibl.toArray(range), [10, 8, 6]);
            t.deepEqual(qibl.toArray(qibl.range(5, 3, function(x){ return x-.5})), [5, 4.5, 4, 3.5, 3]);
            t.done();
        }
    },

    'strings': {

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

    'str_truncate': {
        'should require string and limit': function(t) {
            t.throws(function() { qibl.str_truncate() }, /required/);
            t.throws(function() { qibl.str_truncate(1, 2) }, /required/);
            t.throws(function() { qibl.str_truncate("one", "two") }, /required/);
            t.done();
        },

        'should not trim short strings': function(t) {
            t.equal(qibl.str_truncate("", 10), "");
            t.equal(qibl.str_truncate("abc", 3), "abc");
            t.equal(qibl.str_truncate("abc", 4), "abc");
            t.equal(qibl.str_truncate("abc", 10), "abc");
            t.equal(qibl.str_truncate("abcdefghij", 10), "abcdefghij");
            t.done();
        },

        'should trim overlong strings': function(t) {
            t.equal(qibl.str_truncate("abcdef", 4), "abcd...");
            t.equal(qibl.str_truncate("abcd", 4), "abcd");
            t.equal(qibl.str_truncate("abcdefghijklmnopqrstuvwxyz", 10), "abcdefghij...");
            t.done();
        },

        'should not trim long strings within delta': function(t) {
            t.equal(qibl.str_truncate("abcdefghijkl", 10, { delta: 2 }), "abcdefghijkl");
            t.equal(qibl.str_truncate("abcdefghijkl", 10, { delta: 1 }), "abcdefghij...");
            t.done();
        },

        'should append ellipsis': function(t) {
            t.equal(qibl.str_truncate("abcdef", 4, { delta: 2, ellipsis: ' (etc)' }), "abcdef");
            t.equal(qibl.str_truncate("abcdef", 4, { }), "abcd...");
            t.equal(qibl.str_truncate("abcdef", 4, { ellipsis: ' (etc)' }), "abcd (etc)");
            t.equal(qibl.str_truncate("abcdef", 4, { ellipsis: '......'}), "abcd......");
            t.done();
        },
    },

    'strtok': {
        'should return null once string exhausted': function(t) {
            t.equal(qibl.strtok('foo', '.'), 'foo');
            t.strictEqual(qibl.strtok(null, '.'), null);
            t.strictEqual(qibl.strtok(null, '.'), null);
            t.done();
        },

        'should split on user-provided pattern': function(t) {
            t.equal(qibl.strtok("fooxxbarx", 'xx'), 'foo');
            t.equal(qibl.strtok(null, 'xx'), 'barx');
            t.strictEqual(qibl.strtok(null, 'x'), null);
            t.done();
        },

        'should tokenize strings': function(t) {
            var tests = [
                ["", [""]],
                [".", ["", ""]],
                ["..", ["", "", ""]],
                ["a", ["a"]],
                ["ab.c.", ["ab", "c", ""]],
            ];
            for (var i=0; i<tests.length; i++) {
                var input = tests[i][0];
                var str, parts = [];
                parts.push(qibl.strtok(input, '.'));
                while ((str = qibl.strtok(null, '.')) !== null) parts.push(str);
                t.deepEqual(parts, tests[i][1]);
            }
            t.done();
        },

        'should be fast': function(t) {
            var str = 'a.b.c.d.e';
            var str = 'foo.bar.baz.bat.zed';
            var parts, s, nloops = 1e5;
            var t1 = Date.now();
            for (var i=0; i<nloops; i++) {
                //parts = new Array(qibl.strtok('a.b.c.d.e', '.'));
                //while ((s = qibl.strtok(null, '.')) !== null) parts.push(s);
                qibl.strtok(str, '.');
                while (qibl.strtok(null, '.') !== null) ;
                // 204ms v8, 110ms v13, 118ms v12, 90ms v10, 330ms v5
                //parts = str.split('.');
                // 76ms v8, 130ms v13, 140ms v12, 70ms v10, 92ms v5
            }
            var t2 = Date.now();
            console.log("AR: strtok: %dk in %d ms", nloops/1000, t2 - t1);
            t.done();
        },
    },

    'str_random': {
        'fromCharCodes returns string': function(t) {
            t.equal(qibl.fromCharCodes([]), '');
            t.equal(qibl.fromCharCodes([0x40]), '@');
            t.equal(qibl.fromCharCodes([0x61, 0x62]), 'ab');
            t.done();
        },

        'should return the right length': function(t) {
            for (var i=0; i<100; i++) t.equal(qibl.str_random(i).length, i);
            t.done();
        },

        'should use the common letters': function(t) {
            var counts = {};
            for (var i=0; i<1000; i++) {
                var str = qibl.str_random(100);
                for (var j=0; j<str.length; j++) {
                    var ch = str[j];
                    counts[ch] = (counts[ch] || 0) + 1;
                }
            }
            t.contains(Object.keys(counts), 'etraunos'.split(''));
            t.ok(Object.keys(counts).length > 24);
            t.done();
        },

        'str_random speed 100k': function(t) {
            for (var i=0; i<100000; i++) {
                var w = qibl.str_random(3 + i % 8);
            }
            t.done();
        },
    },

    'str_random_word': {
        'returns word': function(t) {
            for (var i=0; i<10000; i++) {
                t.ok(/[a-z]{1,20}/.test(qibl.str_random_word()));
            }
            t.done();
        },
    },

    'str_random_sentence': {
        'is capitalized': function(t) {
            for (var i=0; i<1000; i++) /^[A-Z].*/.test(qibl.str_random_sentence());
            t.done();
        },

        'ends with period': function(t) {
            for (var i=0; i<1000; i++) /.*[.]$/.test(qibl.str_random_sentence());
            t.done();
        },

        'returns words': function(t) {
            for (var i=0; i<1000; i++) {
                var words = qibl.str_random_sentence().split(' ');
                t.ok(words.length > 1);
            }
            t.done();
        },
    },

    'str_locate': {
        'passes the argument on every call to the handler': function(t) {
            var args = [];
            var arg = {};
            qibl.str_locate('foo', 'o', function(offset, arg) { args.push(arg) }, arg);
            t.deepEqual(args, [arg, arg]);
            t.done();
        },

        'invokes the handler on every pattern found': function(t) {
            var offsets = [];
            var handler = function(offs, arr) { arr.push(offs) };

            offsets = [];
            qibl.str_locate('foobar boofar', 'foof', handler, offsets);
            t.deepEqual(offsets, []);

            offsets = [];
            qibl.str_locate('foobar boofar', 'boo', handler, offsets);
            t.deepEqual(offsets, [7]);

            offsets = [];
            qibl.str_locate('foobar boofar', 'oo', handler, offsets);
            t.deepEqual(offsets, [1, 8]);

            offsets = [];
            qibl.str_locate('foobar boofar', 'o', handler, offsets);
            t.deepEqual(offsets, [1, 2, 8, 9]);

            t.done();
        },
    },

    'str_count': {
        'counts occurrences of the pattern': function(t) {
            t.equal(qibl.str_count("foo", 'f'), 1);
            t.equal(qibl.str_count("foo", 'o'), 2);
            t.equal(qibl.str_count("foo", 'x'), 0);
            t.equal(qibl.str_count("foofoo", 'o'), 4);
            t.equal(qibl.str_count("foofoo", 'oo'), 2);
            t.equal(qibl.str_count("foofoo", 'oof'), 1);
            t.equal(qibl.str_count("foofoo", 'foo'), 2);
            t.equal(qibl.str_count("foo", ''), 0);
            t.done();
        },
        'counts up to limit': function(t) {
            t.equal(qibl.str_count("foofoo", 'o', 1), 1);
            t.equal(qibl.str_count("foofoo", 'o', 3), 3);
            t.equal(qibl.str_count("foofoo", 'o', 4), 4);
            t.equal(qibl.str_count("foofoo", 'o', 7), 4);
            t.done();
        },
    },

    'str_reverse': {
        'reverses strings': function(t) {
            t.equal(qibl.str_reverse(''), '');
            t.equal(qibl.str_reverse('abc'), 'cba');
            t.equal(qibl.str_reverse('foo bar zed'), 'dez rab oof');
            t.equal(qibl.str_reverse('\x01\x02\x03'), '\x03\x02\x01');
            t.done();
        },
    },

    'startsWith': {
        'should check prefix': function(t) {
            t.ok(qibl.startsWith('foobar', 'foobar'));
            t.ok(qibl.startsWith('foobar', 'foo'));
            t.ok(qibl.startsWith('foobar', 'f'));
            t.ok(qibl.startsWith('foobar', ''));
            t.ok(!qibl.startsWith('foobar', 'bar'));
            t.ok(!qibl.startsWith('foobar', 'o'));
            t.done();
        },
    },

    'endsWith': {
        'should check suffix': function(t) {
            t.ok(qibl.endsWith('foobar', 'foobar'));
            t.ok(qibl.endsWith('foobar', 'bar'));
            t.ok(qibl.endsWith('foobar', 'r'));
            t.ok(qibl.endsWith('foobar', ''));
            t.ok(!qibl.endsWith('foobar', 'a'));
            t.ok(!qibl.endsWith('foobar', 'foobark'));
            t.done();
        },
    },

    'semverCompar': {
        'exposed under both old and new name': function(t) {
            t.equal(qibl.compareVersions, qibl.semverCompar);
            t.done();
        },

        'compares version strings': function(t) {
            var tests = [
                ["", "", 0],
                ["1.2", "1.2", 0],
                ["11.2.3", "11.2.3", 0],
                ["1.2.33.4", "1.2.33.4", 0],
                ["1", "1.0", -1],
                ["1", "1.0.0", -1],
                ["1.0", "1.0.0", -1],
                ["1", "2", -1],
                ["1.1", "1.2", -1],
                ["1.2", "1.2.0", -1],
                ["a", "aa", -1],
                ["1.2", "1.2a", -1],
                ["1.2a", "1.2aa", -1],
                ["1.2aa", "1.2b", -1],
                ["1.7z", "1.7z.1", -1],
                ["1.7z.1", "1.7z.2", -1],
                ["1.7z", "1.11a", -1],
                ["1.2.33.3", "1.2.33.4", -1],
                ["1.2p3", "1.2p10", -1],
                ["1.0p2", "1.0.1", -1],
                ["1.2.a", "1.2.3", -1],

                [0, 0, 0],
                [1.25, 1.25, 0],
                [undefined, undefined, 0],
                [undefined, 0, -1],
                [0, undefined, 1],
                [null, null, 0],
            ];
            for (var i = 0; i < tests.length; i++) {
                var v1 = tests[i][0], v2 = tests[i][1], expect = tests[i][2];
                var got = qibl.semverCompar(v1, v2);
                var got2 = qibl.semverCompar(v2, v1);
                t.equal(got, expect, util.format("test %d: %s :: %s ->", i, v1, v2, got));
                t.equal(got2, -expect, util.format("test %d: %s :: %s ->", i, v2, v1, got2));
            }
            t.done();
        },
    },

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

        'should concat bufs': function(t) {
            var chunks = [qibl.fromBuf('foo'), qibl.fromBuf('barr'), qibl.fromBuf(''), qibl.fromBuf('x')];
            var buf = qibl.concatBuf(chunks);
            var expect = 'foobarrx';
            t.equal(buf.length, expect.length);
            for (var i=0; i<buf.length; i++) t.equal(buf[i], expect.charCodeAt(i));
            t.done();
        },
    },

    'toStruct should return struct': function(t) {
        var hash = new Object({a:1});
        t.equal(qibl.toStruct(hash), hash);
        t.done();
    },

    'event listeners': {
        'clearListeners should return functions': function(t) {
            var called = 0;
            var listener = function f1() { called += 1 };
            var called2 = 0;
            var listener2 = function f2() { called2 += 1 };
            var emitter = new events.EventEmitter();

            emitter.on('test2', listener);
            emitter.on('test2', listener2);
            emitter.emit('test2');
            t.ok(called == 1 && called2 == 1);

            t.deepEqual(qibl.clearListeners(emitter, 'test1'), []);

            var cleared = qibl.clearListeners(emitter, 'test2');
            t.deepEqual(emitter.listeners(), []);
            t.equal(cleared.length, 2);
            t.equal(typeof cleared[0], 'function');
            t.equal(typeof cleared[1], 'function');
            emitter.emit('test2');
            t.ok(called == 1 && called2 == 1);

            cleared[1]();
            t.ok(called == 1 && called2 == 2);

            t.done();
        },

        'restoreListeners should re-add the listeners': function(t) {
            var emitter = new events.EventEmitter();
            var called = 0;
            emitter.on('test', function(){ called += 1 });

            var cleared = qibl.clearListeners(emitter, 'test');
            emitter.emit('test');
            t.equal(called, 0);

            qibl.restoreListeners(emitter, 'test', cleared);
            emitter.emit('test');
            emitter.emit('test');
            t.equal(called, 2);

            t.done();
        },

        'readBody': {
            'returns empty string if no body': function(t) {
                var emitter = new events.EventEmitter();
                qibl.readBody(emitter, function(err, body) {
                    t.ifError(err);
                    t.strictEqual(body, '');
                    t.done();
                })
                emitter.emit('end');
            },

            'returns only once if wrapped in once()': function(t) {
                var emitter = new events.EventEmitter();
                var doneCount = 0;
                qibl.readBody(emitter, qibl.once(function(err, body) {
                    t.ifError(err);
                    doneCount += 1;
                    setTimeout(function() { t.equal(doneCount, 1); t.done(); }, 2);
                }))
                emitter.emit('end');
                emitter.emit('end');
                emitter.emit('error', new Error());
                emitter.emit('end');
                emitter.emit('error', new Error());
            },

            'returns emitted error': function(t) {
                var obj = {};
                var emitter = new events.EventEmitter();
                qibl.readBody(emitter, function(err, body) {
                    t.equal(err, obj);
                    t.done();
                })
                emitter.emit('error', obj);
            },

            'concatenates string data': function(t) {
                var emitter = new events.EventEmitter();
                qibl.readBody(emitter, function(err, body) {
                    t.ifError(err);
                    t.equal(body, 'this is a test');
                    t.done();
                });
                emitter.emit('data', 'this');
                emitter.emit('data', ' is a ');
                emitter.emit('data', 'test');
                emitter.emit('end');
            },

            'returns Buffer data in Buffer': function(t) {
                var emitter = new events.EventEmitter();
                qibl.readBody(emitter, function(err, body) {
                    t.ifError(err);
                    t.ok(Buffer.isBuffer(body));
                    t.equal(String(body), 'this');
                    t.done();
                });
                emitter.emit('data', qibl.fromBuf('this'));
                emitter.emit('end');
            },

            'concatenates two data buffers': function(t) {
                var emitter = new events.EventEmitter();
                qibl.readBody(emitter, function(err, body) {
                    t.ifError(err);
                    t.ok(Buffer.isBuffer(body));
                    t.equal(String(body), 'this is a ');
                    t.done();
                });
                emitter.emit('data', qibl.fromBuf('this'));
                emitter.emit('data', qibl.fromBuf(' is a '));
                emitter.emit('end');
            },

            'concatenates three data buffers': function(t) {
                var emitter = new events.EventEmitter();
                qibl.readBody(emitter, function(err, body) {
                    t.ifError(err);
                    t.ok(Buffer.isBuffer(body));
                    t.equal(String(body), 'this is a test');
                    t.done();
                });
                emitter.emit('data', qibl.fromBuf('this'));
                emitter.emit('data', qibl.fromBuf(' is a '));
                emitter.emit('data', qibl.fromBuf('test'));
                emitter.emit('end');
            },
        },

        'emitlines': {
            'returns the listener function': function(t) {
                var emitter = new events.EventEmitter();
                var listener = qibl.emitlines(emitter);
                t.deepEqual(emitter.listeners('data'), [listener]);
                t.done();
            },
            'emits the lines found in the input': function(t) {
                var tests = [
                    // complete lines
                    [['foo\n'], ['foo\n']],
                    [['foo\nline2\nline 3\n'], ['foo\n', 'line2\n', 'line 3\n']],

                    // out of combined chunks
                    [['foo', 'bar\n'], ['foobar\n']],
                    [['foo', 'bar', 'baz\nz'], ['foobarbaz\n']],
                    [['foo\nbar', 'bat', '\nx'], ['foo\n', 'barbat\n']],

                    // partial lines
                    [[], []],
                    [['x', '\n\n', 'y'], ['x\n', '\n']],
                    [['foo\nbar'], ['foo\n']],
                    [['', 'x', 'foo'], []],
                ];
                for (var i = 0; i < tests.length; i++) {
                    var lines = [];
                    var emitter = new events.EventEmitter();
                    qibl.emitlines(emitter);
                    emitter.on('line', function(line) { lines.push(String(line)) });
                    tests[i][0].forEach(function(chunk){ emitter.emit('data', qibl.fromBuf(chunk)) });
                    t.deepEqual(lines, tests[i][1]);
                }
                t.done();
            },
            'is fast': function(t) {
                var nlines = 100000, ndone = 0;
                var line1 = qibl.str_repeat("x", 199) + "\n";
                var data1 = qibl.fromBuf(line1);
                var data2 = qibl.fromBuf(line1 + line1.slice(0, 20));
                var data3 = qibl.fromBuf(line1.slice(20) + line1);
                var emitter = new events.EventEmitter();
                qibl.emitlines(emitter);
                emitter.on('line', function(line) {
                    ndone += 1;
                    // if (line + '' !== line1) throw new Error("mismatch");
                    if (ndone === nlines) t.done();
                })
                if (0) for (var i=0; i<nlines; i++) emitter.emit('data', data1);
                if (1) for (var i=0; i<nlines; i+=3) {
                    emitter.emit('data', data1);
                    emitter.emit('data', data2);
                    emitter.emit('data', data3);
                }
            },
        },
    },

    'emitchunks': {
        // is tested by emitlines
    },

    'varargs': {
        'should pass along the provided self': function(t) {
            var myItem = {};
            function handler(argv, self) {
                t.deepEqual(argv, [1, 2, 3]);
                t.equal(self, myItem);
                t.done();
            }
            qibl.varargs(handler, myItem)(1, 2, 3);
        },

        'varargs and _varargs invoke handler with call args in an array': function(t) {
            var tests = [
                [],
                [1],
                [1, "two"],
                [1, "two", {}],
                [1, "two", {}, 4.5],
            ];

            var gotArgs;
            function handler(args, self) { gotArgs = args };

            for (var i = 0; i < tests.length; i++) {
                qibl._varargs(handler, this).apply(null, tests[i]);
                t.deepEqual(gotArgs, tests[i]);
                t.deepEqual((qibl.varargs(handler, this).apply(null, tests[i]), gotArgs), tests[i]);
                t.deepEqual((qibl._varargs(handler, this).apply(null, tests[i]), gotArgs), tests[i]);
            }

            t.done();
        },

        'varargs sets self to the current object': function(t) {
            var obj = {
                get: qibl.varargs(function(args, self) { self.callArgs = args }, undefined, 'get'),
                _get: qibl._varargs(function(args, self) { self.callArgs = args }, undefined, 'get'),
            };

            obj.get(1, "two", 3);
            t.deepEqual(obj.callArgs, [1, "two", 3]);

            obj._get(3, "two", 1);
            t.deepEqual(obj.callArgs, [3, "two", 1]);

            t.done();
        },

        'varargs sets self to undefined if called as a function': function(t) {
            var called;
            var handler = function(args, self) { called = [args, self] };

            qibl.varargs(handler)(1);
            t.deepStrictEqual(called, [[1], undefined]);

            qibl._varargs(handler)(1);
            t.deepStrictEqual(called, [[1], undefined]);

            var varargs = qibl.varargs;
            varargs(handler)(2, 3);
            t.deepStrictEqual(called, [[2, 3], undefined]);

            var varargs = qibl._varargs;
            varargs(handler)(2, 3);
            t.deepStrictEqual(called, [[2, 3], undefined]);

            tmpVarargs = qibl._varargs;
            tmpVarargs(handler)(3);
            t.deepStrictEqual(called, [[3], undefined]);

            t.done();
        },

        'varargsRenamed returns a function by the given name': function(t) {
            var name = 'foo_bar_zed';
            var expectPrefix = 'function foo_bar_zed(';
            var fn = qibl.varargsRenamed(function(){}, name);
            t.equal(fn.name, name);
            t.equal(String(fn).slice(0, 21), expectPrefix);
            t.done();
        },

        'varargsRenamed passes the given self': function(t) {
            var obj = {};
            var self;
            qibl.varargsRenamed(function(args, _this) { self = _this }, 'foo', obj)(1, 2);
            t.equal(self, obj);
            t.done();
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

        'should invoke the function with the callback': function(t) {
            var myCb = function(){};
            function call(item, cb) {
                t.equal(cb, myCb);
                t.done();
            }
            qibl.thunkify(call)(1)(myCb);
        },

        'should invoke each callback': function(t) {
            t.expect(2);
            var called;
            function call(a, b, cb) { called = a + b; cb() }
            var thunk = qibl.thunkify(call)(1, 2);
            thunk(function() {
                t.equal(called, 3);
                called = 0;
                thunk(function() {
                    t.equal(called, 3);
                    t.done();
                })
            })
        },
    },

    'curry': {
        'should throw if not a function': function(t) {
            t.throws(function() { qibl.curry(132) }, /not a function/);
            t.throws(function() { qibl.curry() }, /not a function/);
            t.throws(function() { qibl.curry({}) }, /not a function/);
            t.done();
        },

        'should return a function': function(t) {
            t.equal(typeof qibl.curry(function() {}), 'function');
            t.equal(typeof qibl.curry(function(a, b, c) {}), 'function');
            t.done();
        },

        'should curry args': function(t) {
            var fn = function(a, b, c) { return a + b + c };

            var f0 = qibl.curry(fn);
            t.equal(typeof f0(), 'function');
            t.equal(typeof f0(1), 'function');
            t.equal(typeof f0(1, 2), 'function');
            t.equal(typeof f0(1, 2, 3), 'number');
            t.equal(f0(1, 2, 3), 6);

            var f1 = f0(1);
            t.equal(typeof f1(), 'function');
            t.equal(typeof f1(2), 'function');
            t.equal(typeof f1(2, 3), 'number');
            t.equal(f1(2, 3), 6);

            var f1b = f0(11);
            t.equal(typeof f1b(), 'function');
            t.equal(typeof f1b(2), 'function');
            t.equal(typeof f1b(2, 3), 'number');
            t.equal(f1b(2, 3), 16);

            var f2 = f1(2);
            t.equal(typeof f2(), 'function');
            t.equal(typeof f2(3), 'number');
            t.equal(f2(3), 6);

            var f2b = f1(22);
            t.notEqual(f2, f2b);
            t.notEqual(f2(), f2b());
            t.equal(f2b(3), 26);

            t.done();
        },

        'should curry like the readme example': function(t) {
            function sum4(a, b, c, d) { return a + b + c + d };
            t.equal(qibl.curry(sum4)(1, 2, 3, 4), 10);
            t.equal(qibl.curry(sum4)(1, 2, 3, 4, 5), 10);
            t.equal(qibl.curry(sum4)(1)(2)(3)(4), 10);
            t.equal(qibl.curry(sum4)(1, 2)(3)(4, 5), 10);
            t.done();
        },
    },

    'invoke': {
        '_invoke should call function and return result': function(t) {
            var called = false;
            var caller1 = function(a) { return called = a };
            var caller2 = function(a, b) { return called = b };
            var caller3 = function(a, b, c) { return called = c };
            var caller4 = function(a, b, c, d) { return called = d };
            t.strictEqual(qibl._invoke1(caller1, []), undefined);
            t.strictEqual(called, undefined);
            t.strictEqual(qibl._invoke1(caller1, [1]), 1);
            t.strictEqual(called, 1);
            t.strictEqual(qibl._invoke1(caller2, [1, 2]), 2);
            t.strictEqual(called, 2);
            t.strictEqual(qibl._invoke1(caller3, [1, 2, 3]), 3);
            t.strictEqual(called, 3);
            t.strictEqual(qibl._invoke1(caller4, [1, 2, 3, 4]), 4);
            t.strictEqual(called, 4);
            t.done();
        },

        '_invoke2 should call method and return result': function(t) {
            var object = {
                called: false,
                caller1: function(a) { return this.called = a },
                caller2: function(a, b) { return this.called = b },
                caller3: function(a, b, c) { return this.called = c },
                caller4: function(a, b, c, d) { return this.called = d },
            };
            t.strictEqual(qibl._invoke2(object.caller1, object, []), undefined);
            t.strictEqual(object.called, undefined);
            t.strictEqual(qibl._invoke2(object.caller1, object, [1]), 1);
            t.strictEqual(object.called, 1);
            t.strictEqual(qibl._invoke2(object.caller2, object, [1, 2]), 2);
            t.strictEqual(object.called, 2);
            t.strictEqual(qibl._invoke2(object.caller3, object, [1, 2, 3]), 3);
            t.strictEqual(object.called, 3);
            t.strictEqual(qibl._invoke2(object.caller4, object, [1, 2, 3, 4]), 4);
            t.strictEqual(object.called, 4);
            t.done();
        },

        'invoke should call function and return result': function(t) {
            var called = false;
            var caller5 = function(a, b, c, d, e) { return called = arguments[4] };
            t.strictEqual(qibl.invoke(caller5, [1, 2, 3, 4, 5]), 5);
            t.strictEqual(called, 5);
            t.done();
        },

        'invoke2 should call method': function(t) {
            var object = {
                called: false,
                caller5: function(a, b, c, d, e) { return this.called = arguments[4] },
            };
            t.strictEqual(qibl.invoke2(object.caller5, object, [1, 2, 3, 4, 5]), 5);
            t.strictEqual(object.called, 5);
            t.done();
        },
    },

    'repeatUntil': {
        'passes the loop index': function(t) {
            qibl.repeatUntil(function(done, ix) {
                t.strictEqual(ix, 0);
                done(null, true);
            }, t.done);
        },

        'loops 1001 times': function(t) {
            var ncalls = 0;
            var t1 = qibl.microtime();
            qibl.repeatUntil(function(done) {
                ncalls += 1;
                done(null, ncalls >= 1001);
            }, function(err) {
                var t2 = qibl.microtime();
                console.log("AR: looped 1001 in %d ms", (t2 - t1) * 1000);
                t.equal(ncalls, 1001);
                t.done();
            })
        },

        'loops N times': function(t) {
            var tests = [ 1, 7, 17, 27, 47, 2447, 10007 ];
            repeatFor(tests.length, function(done) {
                var ncalls = 0, limit = tests.shift();
                qibl.repeatUntil(function(done, ix) {
                    t.equal(ix, ncalls++);
                    done(null, ncalls >= limit);
                }, function() {
                    t.equal(ncalls, limit);
                    done();
                })
            }, t.done);
        },

        'returns errors': function(t) {
            qibl.repeatUntil(function(done) {
                done('mock error');
            }, function(err) {
                t.ok(err);
                t.equal(err, 'mock error');
                t.done();
            })
        },

        'catches exceptions thrown by visitor': function(t) {
            qibl.repeatUntil(function(done) {
                throw 'mock error';
            }, function(err) {
                t.ok(err);
                t.equal(err, 'mock error');
                t.done();
            })
        },
    },

    'repeatFor': {
        'loops 0 times': function(t) {
            var ncalls = 0;
            qibl.repeatFor(0, function(cb) { ncalls += 1; cb() }, function() {
                t.equal(ncalls, 0);
                t.done();
            })
        },
        'loops 1 times': function(t) {
            var ncalls = 0;
            qibl.repeatFor(1, function(cb) { ncalls += 1; cb() }, function() {
                t.equal(ncalls, 1);
                t.done();
            })
        },
        'loops 1001 times': function(t) {
            var ncalls = 0;
            var t1 = qibl.microtime();
            qibl.repeatFor(1001, function(cb) { ncalls += 1; cb() }, function() {
                var t2 = qibl.microtime();
                console.log("AR: looped 1001 in %d ms", (t2 - t1) * 1000);
                t.equal(ncalls, 1001);
                t.done();
            })
        },
        'returns errors': function(t) {
            var ncalls = 0;
            qibl.repeatFor(1001, function(cb) { ncalls += 1; cb(ncalls === 11 ? 'mock error' : null) }, function(err) {
                t.equal(ncalls, 11);
                t.equal(err, 'mock error');
                t.done();
            })
        },
        'catches and returns errors': function(t) {
            var ncalls = 0;
            qibl.repeatFor(1001, function(cb) { ncalls += 1; if (ncalls === 11) throw 'mock error'; cb() }, function(err) {
                t.equal(ncalls, 11);
                t.equal(err, 'mock error');
                t.done();
            })
        },
    },

    'forEachCb': {
        'loops repeatFor on arg array': function(t) {
            var spy = t.spyOnce(qibl, 'repeatFor');
            var args = [];
            qibl.forEachCb(['a', 'b', 'c'], function(cb, x, ix) { args.push(x, ix); cb() }, function callback(err) {
                t.ifError(err);
                t.ok(spy.called);
                t.deepEqual(spy.args[0][0], 3);
                t.deepEqual(spy.args[0][2], callback);
                t.deepEqual(args, ['a', 0, 'b', 1, 'c', 2]);
                t.done();
            })
        },
        'loops 1001 times': function(t) {
            var ncalls = 0;
            var arr = qibl.fill(new Array(1001), 0);
            var t1 = qibl.microtime();
            qibl.forEachCb(arr, function(cb) { ncalls += 1; cb() }, function(err) {
                var t2 = qibl.microtime();
                console.log("AR: looped %d in %d ms", arr.length, (t2 - t1) * 1000);
                t.ifError(err);
                t.equal(ncalls, arr.length);
                t.done();
            })
        },
        'catches and returns errors': function(t) {
            qibl.forEachCb([1, 2, 3], function(cb) { throw 'mock error' }, function(err) {
                t.equal(err, 'mock error');
                t.done();
            })
        },
    },

    'runSteps': {
        'catches and returns errors': function(t) {
            qibl.runSteps([
                function(next) { throw new Error('test error') },
            ], function(err) {
                t.ok(err);
                t.equal(err.message, 'test error');
                t.done();
            })
        },

        'iterates steps passing along results': function(t) {
            qibl.runSteps([
                function(next) { next(null, 1, 2) },
                function(next, a, b) { t.equal(a, 1); t.equal(b, 2); next(null, a, b) },
            ], function(err, a, b) {
                t.equal(a, 1);
                t.equal(b, 2);
                t.done();
            })
        },
    },

    'batchCalls': {
        'options are optional': function(t) {
            var fn = qibl.batchCalls(function(batch, cb) {
                t.deepEqual(batch, ['a', 'b']);
                t.done();
            });
            fn('a');
            fn('b');
        },

        'calls handler with arrays of batches': function(t) {
            var fn = qibl.batchCalls({maxBatchSize: 2}, function(batch, cb) {
                batches.push(batch);
                cb();
                if (batches.length === 3) {
                    t.deepEqual(batches, [[1, 2], [3, 4], [5]]);
                    t.done();
                }
            })
            var batches = [];
            for (var i = 1; i <= 5; i++) fn(i);
        },

        'calls callbacks': function(t) {
            var callCount = 0;
            var fn = qibl.batchCalls(function(batch, cb) {
                cb();
            })
            fn(1, function() { callCount += 1 });
            fn(2, function() { callCount += 1 });
            fn(3, function() { callCount += 1 });
            process.nextTick(function() {
                t.equal(callCount, 3);
                t.done();
            })
        },

        'waits configured amount to grow batch': function(t) {
            var t1 = Date.now();
            var fn = qibl.batchCalls({maxWaitMs: 10}, function(batch, cb) {
                t.ok(Date.now() - t1 >= 10 - 1);
                t.done();
            })
            fn(1);
        },

        'returns errors to callbacks': function(t) {
            var errors = [];
            var fn = qibl.batchCalls(function(batch, cb) {
                cb('mock error');
            })
            fn(1, function(err) { errors.push(err) });
            fn(2, function(err) { errors.push(err) });
            process.nextTick(function() {
                t.deepEqual(errors, ['mock error', 'mock error']);
                t.done();
            })
        },

        'uses provided startBatch and growBatch to gather batches': function(t) {
            var fn = qibl.batchCalls({
                startBatch: function() { return { items: [] } },
                growBatch: function(batch, item) { batch.items.push(item) },
            }, function(batch, cb) {
                t.deepEqual(batch, { items: [1, 'b', 3] });
                t.done();
            })
            fn(1);
            fn('b');
            fn(3);
        },
    },

    'walkdir': {
        'emits error on invalid dirname': function(t) {
            var called = false;
            var errors = qibl.walkdir('/nonesuch', function(){}, function(err) {
                t.ifError(err); // does not return errors
                t.ok(called);
                t.done();
            })
            errors.on('error', function(err, path) {
                t.equal(path, '/nonesuch');
                t.equal(err.code, 'ENOENT');
                called = true;
            })
        },

        'emits error on unreadable dir': function(t) {
            var called = false;
            var errors = qibl.walkdir('/var/spool/cron/crontabs', function(){}, function(err) {
                t.ifError(err); // does not return errors
                t.ok(called);
                t.done();
            })
            errors.on('error', function(err, path) {
                t.equal(path, '/var/spool/cron/crontabs');
                t.equal(err.code, 'EACCES');
                called = true;
            })
        },

        'reports the search root first with filepath and depth': function(t) {
            var names = [];
            var depths = [];
            qibl.walkdir(__dirname, function(path, stat, depth) { names.push(path); depths.push(depth) }, function() {
                t.equal(names[0], __dirname);
                t.equal(depths[0], 0);
                t.equal(depths[1], 1);
                t.done();
            })
        },

        'stops walking on "stop"': function(t) {
            var fileCount = 0;
            qibl.walkdir(__dirname, function(path, stat) { return (++fileCount >= 2) && 'stop' }, function() {
                // __dirname contains more than 2 files, we stopped after 2
                t.equal(fileCount, 2);
                t.done();
            })
        },

        'dereferences symlinks on "visit"': function(t) {
            t.skip();
        },

        'reports files': function(t) {
            var fileCount = 0;
            qibl.walkdir(__dirname, function(path, stat) { fileCount += 1 }, function() {
                t.ok(fileCount > 3);
                t.done();
            })
        },

        'reports symlinks': function(t) {
            var linkCount = 0;
            // HACK: linux-specific standard location of many symlinks
            qibl.walkdir('/etc/alternatives', function(path, stat) { linkCount += stat.isSymbolicLink() }, function() {
                t.ok(linkCount > 10);
                t.done();
            })
        },

        'reports directories': function(t) {
            var dirCount = 0;
            qibl.walkdir('/var/log', function(path, stat) { dirCount += stat.isDirectory() }, function() {
                t.ok(dirCount > 0);
                t.done();
            })
        },

        'accepts "" meaning "."': function(t) {
            var files = [];
            qibl.walkdir('', function(path, stat) { files.push(path) }, function(err) {
                t.ifError(err);
                t.ok(files.length > 4);
                t.done();
            })
        },

        'traverses symlinked-to directories': function(t) {
            var dirname = '/tmp/utest-' + process.pid;
            var files = [];
            qibl.runSteps([
                function(next) { qibl.mkdir_p(dirname + '/a', next) },
                function(next) { fs.writeFile(dirname + '/a/file', 'test file\n', next) },
                function(next) { fs.symlink(dirname + '/a', dirname + '/b', next) },
                function(next) {
                    qibl.walkdir(dirname, function(path, stat) { files.push(path); return 'visit' }, next);
                },
                function(next) { qibl.rmdir_r(dirname, next) },
                function(next) {
                    t.deepEqual(files.length, 5);
                    t.deepEqual(files.sort(), [dirname, dirname + '/a', dirname + '/a/file', dirname + '/b', dirname + '/b/file']);
                    next();
                }
            ], function(err) {
                t.done(err);
            });
        },

        // todo: does not report ENOTDIR as error
    },

    'mkdir_p': {
        'creates directory': function(t) {
            var filepath = '/tmp/test.' + process.pid + '/foo/bar';
            qibl.mkdir_p(filepath, function(err) {
                t.ifError(err);
                var stat = fs.statSync(filepath);
                t.ok(stat.isDirectory());
                fs.rmdirSync(filepath);
                fs.rmdirSync(path.dirname(filepath));
                fs.rmdirSync(path.dirname(path.dirname(filepath)));
                t.done();
            })
        },

        'errors': {
            'ok if already exists': function(t) {
                qibl.mkdir_p('/bin', function(err) {
                    t.ifError(err);
                    t.done();
                })
            },

            'ok if path component already exists': function(t) {
                qibl.mkdir_p('/var/tmp/test.' + process.pid, function(err) {
                    t.ifError(err);
                    fs.rmdirSync('/var/tmp/test.' + process.pid);
                    t.done();
                })
            },

            'returns create error': function(t) {
                var filepath = '/bin/ls/test.' + process.pid;
                qibl.mkdir_p(filepath, function(err) {
                    t.ok(err);
                    t.equal(err.code, 'ENOTDIR');
                    t.equal(err.message, '/bin/ls: not a directory');
                    t.done();
                })
            },

            'returns perms error': function(t) {
                qibl.mkdir_p('/etc/foobar', function(err) {
                    t.ok(err);
                    t.equal(err.code, 'EACCES');
                    t.done();
                })
            },
        },
    },

    'rmdir_r': {
        'removes the directory and its contents, including symlinks': function(t) {
            var dirname = '/tmp/test.' + process.pid;
            qibl.mkdir_p(dirname, function(err) {
                fs.statSync(dirname);           // assert directory exists
                t.ifError(err);
                fs.writeFileSync(dirname + '/a', 'one');
                fs.symlinkSync(dirname + '/a', dirname + '/ap'); // symlink to file that exists
                fs.symlinkSync(dirname + '/x', dirname + '/xp'); // danging symlink
                qibl.mkdir_p(dirname + '/b', function(err) {
                    t.ifError(err);
                    qibl.rmdir_r(dirname, function(err) {
                        t.ifError(err);
                        fs.stat(dirname, function(err) {
                            t.ok(err);          // assert directory does not exist
                            t.equal(err.code, 'ENOENT');
                            t.done();
                        })
                    })
                })
            })
        },

        'errors': {
            'returns stat error': function(t) {
                qibl.rmdir_r('/nonesuch', function(err) {
                    t.ok(err);
                    t.equal(err.code, 'ENOENT');
                    t.done();
                })
            },

            'returns readdir error': function(t) {
                t.stubOnce(fs, 'lstat').yields(null, { isDirectory: function() { return true } });
                t.stubOnce(fs, 'readdir').yields(new Error('mock readdir error'));
                qibl.rmdir_r('/something', function(err) {
                    t.ok(err);
                    t.equal(err.message, 'mock readdir error');
                    t.done();
                })
            },

            'returns unlink error': function(t) {
                t.stubOnce(fs, 'lstat').yields(null, { isDirectory: function() { return false } });
                qibl.rmdir_r('/something', function(err) {
                    t.ok(err);
                    t.equal(err.code, 'ENOENT');
                    t.done();
                })
            },

            'returns rmdir error': function(t) {
                var dirname = '/tmp/test.' + process.pid;
                qibl.mkdir_p(dirname, function(err) {
                    t.ifError();
                    fs.writeFileSync(dirname + '/a', 'one');
                    fs.writeFileSync(dirname + '/b', 'two');
                    fs.writeFileSync(dirname + '/c', 'three');
                    t.stubOnce(fs, 'unlink').yields(new Error('mock unlink error'));
                    qibl.rmdir_r(dirname, function(err) {
                        t.ok(err);
                        t.equal(err.message, 'mock unlink error');
                        t.equal(fs.readFileSync(dirname + '/a'), 'one');
                        qibl.rmdir_r(dirname, t.done);
                    })
                })
            },
        },
    },

    'tmpfile': {
        before: function(done) {
            delete process.env.TMPDIR;
            done();
        },
        after: function(done) {
            if (savedTmpdir !== undefined) process.env.TMPDIR = savedTmpdir;
            // emit a 'SIGTERM' to clean up the files, but catch to not exit the program
            try { process.emit('SIGTERM') } catch (err) {}
            done();
        },

        'creates a file': function(t) {
            var filename = qibl.tmpfile();
            t.ok(filename);
            t.equal(filename[0], '/');
            fs.closeSync(fs.openSync(filename, 0));
            t.done();
        },
        'creates a local file': function(t) {
            var filename = qibl.tmpfile({ dir: '.', name: 'foo-', ext: '.tmp' });
            t.ok(new RegExp('./foo-[0-9a-z]{6}.tmp').test(filename));
            fs.closeSync(fs.openSync(filename, 0));
            t.done();
        },
        'creates a file in TMPDIR': function(t) {
            process.env.TMPDIR = '/var//tmp'; // use double-slash as our marker
            var filename = qibl.tmpfile({ name: 'FOOBAR.' });
            t.ok(qibl.startsWith(filename, '/var//tmp/FOOBAR'));
            fs.closeSync(fs.openSync(filename, 0)); // file exists, open does not throw
            // NOTE: node-v0.6 requires the second argument to openSync
            t.done();
        },
        'creates many files': function(t) {
            var files = [];
            qibl.repeatFor(100, function(next) { files.push(qibl.tmpfile()); next() }, function(err) {
                files.sort();
                for (var i = 1; i < files.length; i++) t.ok(files[i - 1] < files[i]);
                t.done();
            })
        },
        'removes files on exit': function(t) {
            // nyc code coverage installs listeners for fatal signals, so files are not removed until the end
            if (process.env.NYC_COVERAGE) t.skip();
            var filename = qibl.tmpfile();
            fs.closeSync(fs.openSync(filename, 0));
            setTimeout(function() {
                try {
                    process.emit('SIGTERM');
                    throw new Error('missing exception');
                } catch (err) {
                    t.ok(err);
                    t.ok(/terminated/.test(err.message));
                    t.throws(function() { fs.openSync(filename, 0) }, /ENOENT/);
                    t.done();
                    // NOTE: node-v0.6 setTimeout never triggers without a second arg
                }
            }, 0)
        },
        'does not remove permanent files': function(t) {
            if (process.env.NYC_COVERAGE) t.skip();
            qibl.tmpfile(); // install sig handlers
            var filename = qibl.tmpfile({ remove: false });
            setTimeout(function() {
                try {
                    process.emit('SIGTERM');
                    throw new Error('missing exception');
                } catch (err) {
                    try { process.emit('SIGTERM') } catch (err) {}
                    try { process.emit('SIGTERM') } catch (err) {}
                    t.ok(err.message.indexOf('terminated') >= 0);
                    fs.closeSync(fs.openSync(filename, 0)); // file exists, open does not throw
                    fs.unlinkSync(filename); // file exists, remove does not throw
                    t.done();
                }
            }, 0)
        },
        'errors': {
            'throws if unable to create file': function(t) {
                t.throws(function(){ qibl.tmpfile({ dir: '/nonesuch' }) }, /ENOENT/);
                t.throws(function(){ qibl.tmpfile({ dir: '/', name: 'nonesuch-' }) }, /EACCES/);
                t.done();
            },
        },
    },

    'globdir': {
        'returns filepaths matching pattern': function(t) {
            qibl.globdir('', '*qibl.*', function(err, files) {
                t.ifError(err);
                t.deepEqual(files.sort(), ['./qibl.js', './test-qibl.js']);
                t.done();
            })
        },

        'returns filepaths matching regex': function(t) {
            qibl.globdir('.', /.*qibl\..*/, function(err, files) {
                t.ifError(err);
                t.deepEqual(files.sort(), ['./qibl.js', './test-qibl.js']);
                t.done();
            })
        },

        'returns filepaths from a deep directory tree': function(t) {
            var allMatch = true;
            var t1 = qibl.microtime();
            qibl.globdir('/usr', '*/*', function(err, files) {
                t.ifError(err);
                var t2 = qibl.microtime();
                var len1 = files.length;
                files.forEach(function(file) {
                    if (!/^\/usr\/[^/]+\/[^/]+$/.test(file)) {
                        allMatch = false;
                    }
                })
                t.equal(allMatch, true);
                qibl.globdir('/usr', '*/*/*', function(err, files) {
// FIXME: errors thrown in this (walkdir?) callback feed back to here
                    var t3 = qibl.microtime();
                    var len2 = files.length;
                    // on my system I see about 3x more files taking 3x more time
                    t.ok(len2 > 2 * len1);
                    t.ok(t3 - t2 > 2 * (t2 - t1));
                    t.done();
                })
            })
        },

        'errors': {
            'emits errors': function(t) {
                t.stubOnce(fs, 'lstatSync').throws(new Error('mock stat error'));
                qibl.globdir('', '*.js', function(err, files) {
                    t.ok(err);
                    t.equal(err.message, 'mock stat error');
                    t.done();
                })
            },

            'stops on error': function(t) {
                t.stubOnce(fs, 'readdir').yields(null, ['a', 'b', 'c']);
                var mockDirStat = { isDirectory: function() { return true } };
                var mockFileStat = { isDirectory: function() { return false } };
                var spy = t.stub(fs, 'lstatSync')
                    .onCall(0).returns(mockDirStat)             // '.'
                    .onCall(1).returns(mockFileStat)            // './a'
                    .onCall(2).throws('mock stat error')        // './b'
                    .onCall(3).returns(mockFileStat)            // './c'
                    ;
                qibl.globdir('.', '*', function(err, files) {
                    spy.restore();
                    t.ok(err);
                    t.equal(err, 'mock stat error');
                    // because lstat(b) fails, the visitor is not called for ./b, so ./c signals 'stop'
                    t.deepEqual(files, ['./a']);
                    t.done();
                })
            },
        },
    },

    'walktree': {
        'recursively traverses object': function(t) {
            var keys = [];
            var tree = { a: 1, b: { ba: 2 }, c: 3};
            qibl.walktree(tree, function(value, key, node) {
                keys.push(key);
            });
            t.deepEqual(keys, ['a', 'b', 'ba', 'c']);
            t.done();
        },

        'calls visitor with value, key, object, depth': function(t) {
            var calls = [];
            var tree = { a: 1, b: { ba: 2 }, c: 3 };
            qibl.walktree(tree, function(v, k, o, depth) { calls.push({ v: v, k: k, o: o, depth: depth }) });
            t.deepEqual(calls, [
                { v: 1, k: 'a', o: tree, depth: 1 },
                { v: { ba: 2 }, k: 'b', o: tree, depth: 1 },
                { v: 2, k: 'ba', o: { ba: 2 }, depth: 2 },
                { v: 3, k: 'c', o: tree, depth: 1 },
            ]);
            t.done();
        },

        'stops early on stop': function(t) {
            var keys = [];
            var tree = { a: 1, b: { ba: 2 }, c: 3};
            qibl.walktree(tree, function(v, k) { keys.push(k); return k === 'ba' ? 'stop' : null });
            t.deepEqual(keys, ['a', 'b', 'ba']);
            t.done();
        },

        'does not recurse on skip': function(t) {
            var keys = [];
            var tree = { a: 1, b: { ba: 2 }, c: 3};
            qibl.walktree(tree, function(v, k) { keys.push(k); return 'skip' });
            t.deepEqual(keys, ['a', 'b', 'c']);
            t.done();
        },

        'traverses non-hash on "visit"': function(t) {
            var keys = [];
            var date = new Date();
            date.x = 1;
            var tree = { a: 1, d: date };
            qibl.walktree(tree, function(v, k) { keys.push(k); return '' });
            t.deepEqual(keys, ['a', 'd']);
            keys = [];
            qibl.walktree(tree, function(v, k) { keys.push(k); return 'visit' });
            t.deepEqual(keys, ['a', 'd', 'x']);
            t.done();
        },

        'traverses all objects on "visit"': function(t) {
            var keys = [];
            var tree = [1, 2, "str", {a: 1}];
            tree.x = 2;
            qibl.walktree(tree, function(v, k) { keys.push(k); return 'visit' });
            t.deepEqual(keys, [0, 1, 2, 3, 'a', 'x']);
            t.done();
        },
    },

    'copytreeDecycle': {
        'copies items': function(t) {
            var now = new Date();
            var items = [
                [0, 0],
                [1, 1],
                ['two', 'two'],
                [null, null],
                [{a:1, b:2}, {a:1, b:2}],
                [{a:1, b:{c:3}}, {a:1, b:{c:3}}],
                [now, now.toJSON()],
                [{dt: now}, {dt: now.toJSON()}],
                [[1,2,3], [1,2,3]],
                [{a: [1, now]}, {a: [1, now.toJSON()]}],
            ];
            for (var i=0; i<items.length; i++) {
                t.deepStrictEqual(qibl.copytreeDecycle(items[i][0]), items[i][1]);
                t.deepStrictEqual(qibl.copytreeDecycle([items[i][0]]), [items[i][1]]);
            }
            t.done();
        },

        'removes cycles': function(t) {
            var item = {};
            item.item = item;
            t.deepStrictEqual(qibl.copytreeDecycle(item), {item: '[Circular]'});
            t.deepStrictEqual(qibl.copytreeDecycle({a: {b: {c: item}}}), {a: {b: {c: {item: '[Circular]'}}}});

            var item = {a: {}, b: {}};
            item.b.a = item.a;
            item.a.b = item.b;
            t.deepStrictEqual(qibl.copytreeDecycle(item), {a: {b: {a: "[Circular]"}}, b: {a: {b: "[Circular]"}}});
            t.deepStrictEqual(qibl.copytreeDecycle([item]), [{a: {b: {a: "[Circular]"}}, b: {a: {b: "[Circular]"}}}]);

            t.done();
        },

        'tolerates it if toJSON throws': function(t) {
            var obj = { a:1, b:2, c:{toJSON: function() { throw new Error('mock toJSON error') }} };
            t.deepStrictEqual(qibl.copytreeDecycle(obj), {a: 1, b:2, c:'[Circular]'});
            t.done();
        },

        'remove cycless in toJSON replacements': function(t) {
            var cyclic = {a: 1, b: 2};
            cyclic.selfref = cyclic;
            t.deepStrictEqual(qibl.copytreeDecycle({a: cyclic}), {a: {a: 1, b: 2, selfref: '[Circular]'}});
            cyclic.toJSON = function(){ return this };
            t.deepStrictEqual(qibl.copytreeDecycle({a: cyclic}), {a: {a: 1, b: 2, selfref: '[Circular]', toJSON: undefined}});
            t.done();
        },
    },

    'difftree': {
        'diffs trees': function(t) {
            var tests = [
                [{}, {}, undefined],
                [{}, {a:undefined}, undefined],
                [{a:undefined}, {}, undefined],
                [{a:1, b:2}, {a:1, b:2}, undefined],
                [{a:1, b: {}}, {a:1, b: {}}, undefined],
                [{}, {a:1}, {a:1}],
                [{a:1}, {}, {a:undefined}],
                [{a:1}, {}, {a:undefined}],
                [{a:1, b:2}, {a:1, b:3}, {b:3}],
                [{a:1, b:2, c:3}, {a:1, c:3}, {b:undefined}],
                [{a:1, c:3}, {a:1, b:2, c:3}, {b:2}],
                [{a:1, b:2}, {a:1, b: {c:3}}, {b:{c:3}}],
                [{a:1, b: {c:3}}, {a:1, b: {c:4}}, {b:{c:4}}],
                [{a:true}, {a:false}, {a:false}],
                [{a:true}, {a:null}, {a:null}],
                [{a:true}, {a:undefined}, {a:undefined}],
                [{a:true}, {}, {a:undefined}],
                [[], [], undefined],
                [[1], [1], undefined],
                [[,1], [,1], undefined],
                [[,], [undefined], undefined],
                [[undefined], [,], undefined],
                [[undefined], [], undefined],
                [[], [undefined], undefined],
                [{a: [1,2,3]}, {a: [1,2,3]}, undefined],
                [{a: [1,2,3]}, {a: [9,2,3]}, {a: [9]}],
                [{a: [1,2,3]}, {a: [1,9,3]}, {a: [,9]}],
                [{a: [1,2,3]}, {a: [1,2,9]}, {a: [,,9]}],
                [{a: [1,2,3]}, {a: [1,2,3,4,9]}, {a: [,,,4,9]}],
                [{a: [1,2,3]}, {a: [1,2,3,,9]}, {a: [,,,,9]}],
                [{a: [1,2,[3,4]]}, {a: [1,2,[3,4]]}, undefined],
                [{a: [1,2,[3,4]]}, {a: [1,2,[3,5]]}, {a: [,,[,5]]}],
                [{a: [1,2,[3,5]]}, {a: [1,2,[3]]}, {a: [,,[,undefined]]}],
                [{a:1, b: {c: [1,2]}}, {a:1, b: {c: [1,2]}}, undefined],
                [{a:1, b: {c: [1,2]}}, {a:2, b: {c: [1,2]}}, {a: 2}],
                [{a:1, b: {c: [1,2]}}, {a:1, b: {c: [1,3]}}, {b: {c: [ , 3]}}],
                [{a:1, b: {c: [1,2]}}, {a:1, b: {c: [1,2,3]}}, {b: {c: [,,3]}}],
                [{a:1, b: {c: [{a:1},{a:2}]}}, {a:1, b: {c: [{a:1},{a:2}]}}, undefined],
                [{a:1, b: {c: [{a:1},{a:2}]}}, {a:1, b: {c: [{a:1},{a:3}]}}, {b: {c: [ , {a:3}]}}],
                // the below is the README example
                [{ v: 0, a: { b: 2 } }, { v: 0, a: { b: 2, c: 3 }, d: 4 }, { a: { c: 3 }, d: 4 }],
            ];
            for (var i=0; i<tests.length; i++) {
                var test = tests[i];
                t.deepEqual(qibl.difftree(test[0], test[1]), test[2], 'test case ' + i);
            }
            t.done();
        },

        'is fast': function(t) {
            t.skip(); // breaks if whole suite runs
            var copy = qibl.assignTo({}, require.cache);
            for (var k in copy) copy[k] = qibl.assignTo({}, copy[k]);
            var copy2 = qibl.merge({}, copy);
            var t1 = qibl.microtime();
            for (var i=0; i<1000; i++) var diff = qibl.difftree(copy, copy2);   // 250ms for 10k
            // for (var i=0; i<1000; i++) var diff = t.deepEqual(copy, copy2);  // 320 ms for 10k
            var t2 = qibl.microtime();
            t.done();
        },
    },

    'diffarray': {
        'diffs arrays': function(t) {
        var tests = [
            [[], [], undefined],
            [[undefined], [], undefined],
            [[undefined, undefined], [], undefined],
            [[], [undefined, , undefined], undefined],
            [[,,,], [,,,,,], undefined],
            [[1,2,3], [1,2,3], undefined],
            [[1,2,3], [9,2,3], [9]],
            [[1,2,3], [1,9,3], [,9]],
            [[1,2,3], [1,2,9], [,,9]],
            [[1,2,3], [1,2,3,9], [,,,9]],
            [[1,2,3], [1,2,3,undefined,9], [,,,,9]],
            [[1,2,3], [1,2], [,,undefined]],
            [[1,2,3], [1,], [,undefined,undefined]],
            [[1,2,3], [,2,3], [undefined]],
            [[{a:1},{b:2}], [{a:1},{b:2}], undefined],
            [[{a:1},{b:2}], [{a:1},{b:3}], [,{b:3}]],
            [[{a:1},{b:2}], [{a:1},{b:2,c:3}], [,{c:3}]],
            [[{a:1,c:3},{b:2}], [{a:1},{b:2}], [{c:undefined}]],
            // the below is the README example
            [[ , 2, 3], [undefined, 2, 4], [,,4]],
        ];
        for (var i=0; i<tests.length; i++) {
            var test = tests[i];
            t.deepEqual(qibl.diffarray(test[0], test[1]), test[2], 'test case ' + i);
        }
        t.done();
        },
    },

    'retry': {
        'warm up timeouts': function(t) {
            // exercise the function and timeouts to work around race condition on travis-ci.com
            qibl.retry(function() { return 1 }, 5, function(cb) {}, function(err) {
                t.equal(err && err.code, 'TIMEOUT');
                t.equal(err && err.message, 'timeout');
                t.done();
            });
        },

        'stops when successful': function(t) {
            var callCount = 0;
            var now = Date.now();
            qibl.retry(function() { return 5 }, 10, function(cb) { ++callCount < 3 ? cb('again') : cb() }, function(err) {
                t.ifError(err);
                t.equal(callCount, 3);
                t.ok(Date.now() >= now + 10 - 1);
                t.done();
            })
        },

        'calls getDelay with the retry count': function(t) {
            var counts = [];
            qibl.retry(function(n) { counts.push(n); return 1 }, 4, function(cb) { cb('mock-err') }, function(err) {
                t.deepEqual(counts, [1, 2, 3, 4]);
                t.done();
            })
        },

        'makes multiple attemps then times out': function(t) {
            function uniformDelay(n) { return 4 };
            var times = [];
            qibl.retry(uniformDelay, 10, function(cb) { times.push(Date.now()); cb('mock-err') }, function(err) {
                t.equal(err, 'mock-err');
                t.equal(times.length, 4);
                // there is a long-ish gap between the first and second attempt,
                // time the delta from second to last
                t.ok(times[1] - times[0] <= 10 - 4);
                t.done();
            })
        },

        'returns the function return values': function(t) {
            qibl.retry(function() { return 1 }, 10, function(cb) { cb(null, 1234, 56) }, function(err, ret, ret2) {
                t.equal(ret, 1234);
                t.equal(ret2, 56);
                t.done();
            });
        },

        'returns the actual error if available on timeout': function(t) {
            qibl.retry(function() { return 1 }, 4, function(cb) { cb(new Error('actual error')) }, function(err) {
                t.ok(err);
                t.equal(err.message, 'actual error');
                t.done();
            })
        },

        'returns error on initial-call timeout': function(t) {
            var ncalls = 0;
            qibl.retry(function() { return 10 }, 4, function hang(cb) { ncalls += 1 }, function(err, ret) {
                t.ok(err);
                t.equal(err.message, 'timeout');
                t.equal(ncalls, 1);
                t.done();
            })
        },

        'optionally does not time out still-running call': function(t) {
            var t1 = Date.now();
            qibl.retry(function(){ return 10 }, 2, function hang(cb) { setTimeout(cb, 5) }, { noTimeout: true },
                function(err, ret) {
                    var t2 = Date.now();
                    t.ifError(err);
                    t.ok(t2 >= t1 + 5); // first call was allowed to finish
                    t.ok(t2 < t1 + 8);  // was not called again
                    t.done();
                }
            )
        },

        'returns actual error on second-call timeout': function(t) {
            var ncalls = 0;
            var err = new Error('fail on first call');
            qibl.retry(function() { return 3 }, 4, function(cb) { ncalls += 1; if (ncalls < 2) cb(err) }, function(err, ret) {
                t.ok(err);
                t.equal(err.message, 'fail on first call');
                t.equal(ncalls, 2);
                t.done();
            })
        },

        'suppresses second return': function(t) {
            qibl.retry(function() { return 1 }, 4, function(cb) { setTimeout(cb, 10) }, function(err) {
                t.ok(err);
                t.equal(err.message, 'timeout');
                t.done();
            })
        },
    },

    'Mutex': {
        'runs calls immediately': function(t) {
            var uut = new qibl.Mutex();
            var t1 = Date.now();
            uut.acquire(function(release) {
                var t2 = Date.now();
                t.ok(t2 - t1 <= 1);
                release();
                t.done();
            })
        },

        'sets busy when in use': function(t) {
            var uut = new qibl.Mutex();
            uut.acquire(function(release) {
                t.ok(uut.busy);
                release();
                t.done();
            })
        },

        'clears busy when no longer in use': function(t) {
            var uut = new qibl.Mutex();
            uut.acquire(function(release) {
                t.ok(uut.busy);
                setTimeout(function() {
                    t.ok(!uut.busy);
                    t.done();
                }, 2)
                release();
            })
        },

        'queues calls': function(t) {
            var uut = new qibl.Mutex();
            var call1, call2, t1 = Date.now();
            uut.acquire(function(release) { call1 = true; setTimeout(release, 5) });
            uut.acquire(function(release) { call2 = true; setTimeout(release, 5) });
            uut.acquire(function(release) {
                var t2 = Date.now();
                t.ok(t2 - t1 >= 10 - 1);
                t.ok(call1);
                t.ok(call2);
                release();
                t.done();
            })
        },
    },

    'Cron': {
        setUp: function(done) {
            this.uut = new qibl.Cron();
            done();
        },

        'schedules jobs': function(t) {
            function noop() {}
            this.uut.schedule(10, noop);
            this.uut.schedule('200', noop);
            this.uut.schedule('3s', noop);
            this.uut.schedule('.5s', noop);
            this.uut.schedule('0.5s', noop);
            this.uut.schedule('5.s', noop);
            t.equal(this.uut.jobs.length, 6);
            // NOTE: this assertion can fail on slower computers:
            var now = Date.now();
            t.ok(this.uut.jobs[0].next > now + 10-2 && this.uut.jobs[0].next < now + 10+2);
            t.ok(this.uut.jobs[1].next > now + 200-2 && this.uut.jobs[1].next < now + 200+2);
            t.ok(this.uut.jobs[2].next > now + 3000-2 && this.uut.jobs[2].next < now + 3000+2);
            t.ok(this.uut.jobs[3].next > now + 500-2 && this.uut.jobs[3].next < now + 500+2);
            t.ok(this.uut.jobs[4].next > now + 500-2 && this.uut.jobs[4].next < now + 500+2);
            t.ok(this.uut.jobs[5].next > now + 5000-2 && this.uut.jobs[5].next < now + 5000+2);
            t.done();
        },

        'cancels jobs': function(t) {
            var fn1 = function(){};
            var fn2 = function(){};
            this.uut.schedule(10, fn1);
            this.uut.schedule(20, fn2);
            t.equal(this.uut.cancel(fn1), true);        // returns true if job removed
            t.equal(this.uut.cancel(fn1), false);       // returns false if job was not scheduled
            t.equal(this.uut.jobs.length, 1);
            t.equal(this.uut.jobs[0].fn, fn2);
            t.done();
        },

        'throws on invalid interval': function(t) {
            t.throws(function(){ new qibl.Cron().schedule('one', function(){}) }, /invalid .* expected/);
            t.throws(function(){ new qibl.Cron().schedule('2x', function(){}) }, /invalid .* expected/);
            t.done();
        },

        'runs 0 jobs': function(t) {
            this.uut.run(Date.now(), function() {
                t.done();
            })
        },

        'runs 1 jobs at scheduled time': function(t) {
            var ncalls = 0;
            this.uut.schedule(10, function(cb) {
                ncalls++;
                cb();
            })
            var uut = this.uut;
            var now = Date.now();
            uut.run(now + 5, function(err) {
                t.ifError(err);
                t.equal(ncalls, 0);
                uut.run(now + 15, function(err) {
                    t.ifError(err);
                    t.equal(ncalls, 1);
                    uut.run(now + 15, function(err) {
                        t.ifError(err);
                        t.equal(ncalls, 1);
                        uut.run(now + 25, function(err) {
                            t.ifError(err);
                            t.equal(ncalls, 2);
                            uut.run(now + 50);
                            setTimeout(function() {
                                t.equal(ncalls, 3);
                                t.done();
                            }, 2)
                        })
                    })
                })
            })
        },

        'runs calls without a callback': function(t) {
            var called = false;
            this.uut.schedule(10, function(cb) {
                called = true;
                cb();
            })
            this.uut.run(Date.now() + 15);
            setTimeout(function() {
                t.ok(called);
                t.done();
            }, 2)
        },

        'reports errors to the callback': function(t) {
            var error;
            this.uut.schedule(10, function(cb) { cb() });
            this.uut.schedule(10, function(cb) { cb('mock error') }, null, function(err) { error = err });
            this.uut.schedule(10, function(cb) { cb('another error') });
            this.uut.run(Date.now() + 11, function(err) {
                t.ifError(err);
                t.equal(error, 'mock error');
                t.done();
            })
        },
    },

    'socketpair': {
        'returns two sockets': function(t) {
            qibl.socketpair(function(err, socks) {
                t.ok(socks && socks[0] && socks[1]);
                t.ok(socks[0] instanceof net.Socket);
                t.ok(socks[1] instanceof net.Socket);
                t.done();
            })
        },
        'sockets are connected': function(t) {
            qibl.socketpair(function(err, socks) {
                var sock1Lines = [], sock1 = socks[0];
                var sock2Lines = [], sock2 = socks[1];
                qibl.emitlines(sock1); sock1.on('line', function(line){ sock1Lines.push(String(line)) });
                qibl.emitlines(sock2); sock2.on('line', function(line){ sock2Lines.push(String(line)) });
                sock1.write('hello\n');
                sock2.write('there\n');
                sock1.write('world!\n');
                setTimeout(function() {
                    // lines written to sock1 show up on sock2, and vice versa
                    t.deepEqual(sock2Lines, ['hello\n', 'world!\n']);
                    t.deepEqual(sock1Lines, ['there\n']);
                    t.done();
                }, 2);
            })
        },
        'throws if no callback': function(t) {
            t.throws(function(){ qibl.socketpair() }, /callback/);
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

    'globRegex': {
        'returns a regex source string': function(t) {
            t.equals(typeof qibl.globRegex('*.[ch]'), 'string');
            t.ok(/^\^.*\$$/.test(qibl.globRegex('*.[ch]')));
            t.contains(qibl.globRegex('*.[ch]'), /^\^.*\$$/);
            t.done();
        },

        'does not escape chars in [] charlist': function(t) {
            // Cannot escape all chars, because eg escaping s or w would alter their meaning (\s, \w)
            // Cannot escape just \ because want to allow \] and \\ to match ] and \.
            // So charlist contents are passed as-is to the regex, including any escape sequences.
            // Escape sequences other than \] and \\ (eg \w, \s, \d) may work, but are not formally supported.
            t.contains(qibl.globRegex('foo\\b\\ar.[ch]'), '\\b');
            t.contains(qibl.globRegex('foo\\b\\ar.[ch]'), '\\a');
            t.contains(qibl.globRegex('foobar.[ch]'), '[ch]');
            t.contains(qibl.globRegex('foobar.[ch\\w]'), '[ch\\w]');
            t.contains(qibl.globRegex('foobar.[\\]{a,b}]'), '[\\]{a,b}]');
            t.done();
        },

        'conversions': function(t) {
            var tests = [
                ['foo/?ar.?', '^foo/[^/]ar\\.[^/]$'],
                ['foo*b/*r', '^foo[^/]*b/[^/]*r$'],
                ['test/**/*.js', '^test/.*/[^/]*\\.js$'],
                ['foo.[ch]', '^foo\\.[ch]$'],
                ['foo.[ch],v', '^foo\\.[ch],v$'],
                ['foo.[^ch]', '^foo\\.[^ch]$'],
                ['foo.[!ch]', '^foo\\.[^ch]$'],
                ['foo.{cc,h}', '^foo\\.(cc|h)$'],
                ['foo.{cc,h},v', '^foo\\.(cc|h),v$'],
                ['{src,test}/*.[ch]', '^(src|test)/[^/]*\\.[ch]$'],
                ['a^b', 'a\\^b'],
                ['[a\\]]^b', '[a\\]]\\^b'],
                ['[a\\\\x]^b', '[a\\\\x]\\^b'],
                // edge cases
                ['[a\\', '[a\\\\'],
                ['[a\\\\', '[a\\\\'],
                ['[a\\\\\\', '[a\\\\\\\\'],
            ];
            for (var i = 0; i < tests.length; i++) {
                var patt = qibl.globRegex(tests[i][0]);
                t.contains(patt, tests[i][1], patt + ' does not contain ' + tests[i][1]);
            }
            t.done();
        },

        'escapes metacharacters': function(t) {
            var chars = '';
            for (var ch = 0x20; ch < 127; ch++) chars += String.fromCharCode(ch);
            // change the \] in the ascii sequence [\] to close the charlist
            chars = chars.replace('[\\]', '[\\]]');
            var patt = qibl.globRegex(chars);
            ['^', '$', '(', ')', '.', '+', '|'].map(function(ch) {
                t.contains(patt, '\\' + ch, 'un-escaped char ' + ch);
            })
            t.contains(patt, '0123456789');
            t.contains(patt, 'abcdefghijklmnopqrstuvwxyz');
            t.contains(patt, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
            // [, \ and { are special to glob, must be escaped in the glob template
            // \ escapes the following char, and can escape itself
            t.contains(patt, '[\\]');
            t.contains(qibl.globRegex('foo\\bar'), 'foo\\bar');
            t.contains(qibl.globRegex('foo\\\\bar'), 'foo\\\\bar');
            t.contains(qibl.globRegex('foo\\{bar}'), 'foo\\{bar}');
            t.contains(qibl.globRegex('foo\\[bar]'), 'foo\\[bar]');
            t.done();
        },

        'edge cases': {
            'escapes trailing backslash': function(t) {
                t.contains(qibl.globRegex('*.\\'), /\\.\\\\\$$/);
                t.done();
            },

            'does not escape the \ escape character': function(t) {
                t.contains(qibl.globRegex('foo\.[ch]'), 'foo\\.[ch]');
                t.notContains(qibl.globRegex('foo\.[ch]'), '\\\\');
                t.done();
            },

            'retains escape before {': function(t) {
                t.contains(qibl.globRegex('foo.\\{c,h\\}'), 'foo\\.\\{c,h\\}');
                t.contains(qibl.globRegex('foo.\\{c,h})'), 'foo\\.\\{c');
                t.done();
            },

            'treats unbalanced brace as not special': function(t) {
                t.contains(qibl.globRegex('foo.{cc,h'), 'foo\\.\\{cc,h');
                t.done();
            },

            'matches readme': function(t) {
                var patt = qibl.globRegex('{src,test}/**/*.[ch]');
                t.equal(patt, '^(src|test)/.*/[^/]*\\.[ch]$');
                t.done();
            },
        },
    },

    'selectField': {
        'should select column': function(t) {
            t.deepStrictEqual(qibl.selectField([], 'k'), []);
            t.deepStrictEqual(qibl.selectField([{a:1}, {k:2}, {c:3, k:4}, {d:5}], 'k'), [undefined, 2, 4, undefined]);
            t.deepStrictEqual(qibl.selectField([null, undefined, 0, false], 'k'), [undefined, undefined, undefined, undefined]);
            t.deepStrictEqual(qibl.selectField([{}], 'k'), [undefined]);
            t.deepStrictEqual(qibl.selectField([{}, {}], 'k'), [undefined, undefined]);
            t.deepStrictEqual(qibl.selectField([{}, {k:null}], 'k'), [undefined, null]);
            t.done();
        },
    },

    'mapById': {
        'should map objects by id': function(t) {
            t.deepEqual(qibl.mapById([{a:1}, {a:2}], 'a'), {1: {a:1}, 2: {a:2}});
            t.deepEqual(qibl.mapById([{a:1}, {a:2, b:2}], 'a'), {1: {a:1}, 2: {a:2, b:2}});

            t.deepEqual(qibl.mapById([{a:1}, {b:2}], 'a'), {1: {a:1}});
            t.deepEqual(qibl.mapById([{a:1}, {b:2}], 'b'), {2: {b:2}});
            t.deepEqual(qibl.mapById([{a:1}, {b:2}], 'c'), {});

            t.deepEqual(qibl.mapById([], 'a'), {});
            t.deepEqual(qibl.mapById([,,,null,undefined,,,7,false,0,"string"], 'a'), {});
            t.deepEqual(qibl.mapById([,,{a:1}], 'a'), {1: {a:1}});

            t.deepEqual(qibl.mapById([{a:1}, {b:2}], 'a', {x:9}), {x:9, 1: {a:1}});

            t.done();
        },
    },

    'groupById': {
        'should return arrays of objects': function(t) {
            var a1 = {a:1}, a2 = {a:2}, b1 = {b:1};
            t.deepEqual(qibl.groupById([a1, a2, a1, b1], 'a'), {1: [a1, a1], 2: [a2]});
            t.deepEqual(qibl.groupById([a1, b1], 'c'), {});
            t.done();
        },
    },

    'sortBy': {
        'sorts by metric returned by the provided function': function(t) {
            t.deepEqual(qibl.sortBy([], function(e) { return -e }), []);
            t.deepEqual(qibl.sortBy([1,2,3], function(e) { return e }), [1,2,3]);
            t.deepEqual(qibl.sortBy([1,2,3], function(e) { return -e }), [3,2,1]);
            t.done();
        },
    },

    'groupBy': {
        'groups by keys from the provided function': function(t) {
            t.deepEqual(qibl.groupBy([], function(){ return 1 }), {});
            t.deepEqual(qibl.groupBy([1,2,3], function(e) { return e }), { 1: [1], 2: [2], 3: [3] });
            t.deepEqual(qibl.groupBy([1,2,3], function(e) { return 2*e }), { 2: [1], 4: [2], 6: [3] });
            t.deepEqual(qibl.groupBy([1,2,3], function(e) { return e & 1 }), { 1: [1, 3], 0: [2] });
            t.deepEqual(qibl.groupBy([{}], function(e) { return e.a }), { 'undefined': [{}] });
            t.done();
        },

        'adds to provided target': function(t) {
            t.deepEqual(qibl.groupBy([1,2], function(e) { return e }, { a: 1 }), { a: 1, 1: [1], 2: [2] });
            t.done();
        },
    },

    'distinct': {
        'returns unique values': function(t) {
            var tests = [
                [ [], [] ],
                [ [1,2,3], ['1','2','3'] ],
                [ [1,2,2,3,2], ['1','2','3'] ],
                [ ['a', 'b', 'a', 'c', 'a', 'd'], ['a', 'b', 'c', 'd'] ],
                // note: object keys are displayed numbers first
                // [ [{}, 2, {}], ['2', '[object Object]'] ],
            ];
            for (var i = 0; i < tests.length; i++) {
                t.deepEqual(qibl.distinct(tests[i][0]), tests[i][1], 'test ' + i);
            }
            t.done();
        },

        'uses provided getKey': function(t) {
            var vals = qibl.distinct([{id:1, a:1}, {id:2, a:2}, {id:3, a:1}], function(e) { return e.a });
            t.deepEqual(vals, [{id:1, a:1}, {id:2, a:2}]);
            t.done();
        },

        'works with older node': function(t) {
            var version = process.versions.node;
            delete process.versions.node;
            process.versions.node = '0.8.28';
            t.unrequire('./');
            var qibl = require('./');
            t.deepEqual(qibl.distinct(['foo', 2, 'foo', 3]), [2, 3, 'foo']);
            t.deepEqual(qibl.distinct([1, 2, 1, 3]), [1, 2, 3]);
            process.versions.node = version;
            t.done();
        },
    },

    'makeIterator': {
        'makeIterator should create an iterator function': function(t) {
            var n = 0;
            var iter = qibl.makeIterator(function() {
                n++;
                this.value = n;
                this.done = n > 3;
            });
            t.equal(typeof iter, 'function');
            t.equal(typeof iter().next, 'function');

            var state = iter();
            t.contains(state.next(), { value: 1, done: false });
            t.contains(state.next(), { value: 2, done: false });
            t.contains(state.next(), { value: 3, done: false });
            t.contains(state.next(), { done: true });

            t.done();
        },

        'iterator stepper should receive the state object and self': function(t) {
            var state = {};
            var callArgs = null;
            function makeState(instance) { return state };
            function stepIterator(st, instance, tuple) {
                callArgs = arguments;
                // stepper passed in state created by
                t.equal(st, state);
                // the instance is the object on which the iterator was invoked
                if (instance) t.equal(instance, obj);
                // the self is the same as the function invocation `this`
                t.equal(this, tuple);
                this.done = true;
            }
            var iter = qibl.makeIterator(stepIterator, makeState);

            var tuple = iter().next();
            t.deepEqual(qibl.toArray(callArgs), [state, undefined, tuple]);

            var obj = {};
            qibl.setIterator(obj, iter);
            qibl.toArray(obj);
            t.deepEqual(Object.keys(callArgs[2]), Object.keys(tuple));
            t.equal(callArgs[0], state);
            t.equal(callArgs[1], obj);
            t.equal(callArgs[2].__state, state);
            t.equal(callArgs[2].__step, stepIterator);
            t.equal(callArgs[2].__instance, obj);

            t.done();
        },

        'iterator should be compatible with Array.from': function(t) {
            var called = 0;
            var a = [1,2,3,4,5];
            var iter = qibl.makeIterator(
                function step(state) {
                    called += 1;
                    if (state.ix >= state.arr.length) this.done = true;
                    else this.value = state.arr[state.ix++];
                },
                function makeState(array) {
                    return { arr: array, ix: 0 }
                }
            );
            qibl.setIterator(a, iter);

            if (typeof Array.from !== 'function') t.skip();

            var b = Array.from(a);
            t.equal(called, a.length + 1);
            t.deepEqual(b, a);
            t.equal(called, 6);

            called = 0;
            var c = [2,4,6];
            qibl.setIterator(c, iter);
            t.deepEqual(Array.from(c), c);
            t.equal(called, 4);

            t.done();
        },

        'get/setIterator should access the iterator function': function(t) {
            var iter = qibl.makeIterator(function() {});

            var obj = {};
            qibl.setIterator(obj, iter);
            t.equal(qibl.getIterator(obj), iter);

            var iter1 = qibl.getIterator([]);
            var iter2 = qibl.getIterator([]);
            t.equal(iter1, iter2);
            if (typeof Array.from === 'function') t.equal(typeof iter1, 'function');

            t.done();
        },

        'iterator should traverse the data': function(t) {
            var n = 0;
            var iter = qibl.makeIterator(function() {
                this.value = ++n;
                this.done = n > 5;
            });

            var obj = {};
            qibl.setIterator(obj, iter);

            if (typeof Symbol === 'undefined' || typeof Array.from !== 'function') {
                // already tested above with state.next() etc
                t.skip();
            }
            else {
                // Array.from will traverse iterables
                var data = Array.from(obj);
                t.deepEqual(data, [1, 2, 3, 4, 5]);
            }
            t.done();
        },

        'toArray should capture data into array': function(t) {
            t.deepEqual(qibl.toArray([]), []);
            t.deepEqual(qibl.toArray([1,2,3]), [1,2,3]);
            t.deepEqual(qibl.toArray({length: 2, 0: 1, 1: 2, 2: 3}), [1,2]);
            t.deepEqual(qibl.toArray({length: 2, 0: 1, 1: 2, 2: 3}, function(v, i) { return 10*v + i }), [10,21]);
            t.deepEqual(qibl.toArray([1,2], function(v, i) { return 10*v + i }), [10,21]);

            var n = 5;
            var iter = qibl.makeIterator(function() {
                this.value = n;
                this.done = --n < 0;
                if (n < 0) n = 3;
            });

            function C() {};
            qibl.setIterator(C.prototype, iter);
            var c = new C();
            t.deepEqual(qibl.toArray(c), [5,4,3,2,1]);
            t.deepEqual(qibl.toArray(c, function(v,i) { return 2 * v }), [6,4,2]);

            t.deepEqual(qibl.toArray(null), []);
            t.deepEqual(qibl.toArray({}), []);

            t.done();
        },

        'iteration speed': function(t) {
            var a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            function makeState(self) { var state = { ix: 0, data: self.a }; return state }
            function stepState(state, self, iter) {
                if (state.ix >= state.data.length) { iter.done = true; iter.value = undefined }
                else { this.value = state.data[state.ix++] }
            }
            var b = { a: a };
            console.time('iterate 10 x 100k');
            for (var i=0; i<100000; i++) {
                qibl.setIterator(b, qibl.makeIterator(stepState, makeState));
                var ret = qibl.toArray(b);
            }
            console.timeEnd('iterate 10 x 100k');
            // 19ms to iterate over 1 million elements 10 at a time, 25m if stepper created on the fly
            t.deepEqual(ret, a);
            t.done();
        },
    },

    'makeIteratorPeekable': {
        'annotates the iterator': function(t) {
            var arr = [1, 2, 3];
            if (!qibl.getIterator(arr)) t.skip();
            var it = qibl.getIterator(arr).call(arr);
            t.equal(qibl.makeIteratorPeekable(it), it);
            t.done();
        },
        'can annotate more than once': function(t) {
            var arr = [1, 2, 3];
            if (!qibl.getIterator(arr)) t.skip();
            var it = qibl.getIterator(arr).call(arr);
            it = qibl.makeIteratorPeekable(it);
            t.equal(it.next().value, 1);
            t.equal(it.peek().value, 2);
            var it2 = qibl.makeIteratorPeekable(it);
            t.equal(it2.peek().value, 2);
            t.equal(it2.next().value, 2);
            t.equal(it.next().value, 3);
            t.equal(it2.next().done, true);
            t.done();
        },
        'adds peek and unget methods': function(t) {
            var arr = [1, 2, 3];
            if (!qibl.getIterator(arr)) t.skip();
            var it = qibl.getIterator(arr).call(arr);
            qibl.makeIteratorPeekable(it);
            t.equal(typeof it.peek, 'function');
            t.equal(typeof it.unget, 'function');
            t.equal(typeof it.next, 'function');
            t.done();
        },
        'can peek': function(t) {
            var arr = [1, 2, 3];
            if (!qibl.getIterator(arr)) t.skip();
            var it = qibl.getIterator(arr).call(arr);
            qibl.makeIteratorPeekable(it);
            t.equal(it.peek().value, 1);
            t.contains(it.next(), { value: 1, done: false });
            t.equal(it.peek().value, 2);
            t.contains(it.next(), { value: 2, done: false });
            t.contains(it.next(), { value: 3, done: false });
            t.equal(it.peek().done, true);
            t.equal(it.peek().done, true);
            t.contains(it.next(), { done: true });
            t.done();
        },
        'can unget': function(t) {
            var arr = [1, 2, 3];
            if (!qibl.getIterator(arr)) t.skip();
            var it = qibl.getIterator(arr).call(arr);
            qibl.makeIteratorPeekable(it);
            it.unget(99);
            t.equal(it.peek().value, 99);
            t.contains(it.next(), { value: 99, done: false });
            t.contains(it.next(), { value: 1, done: false });
            it.unget(1);
            t.contains(it.next(), { value: 1, done: false });
            t.contains(it.next(), { value: 2, done: false });
            t.done();
        },
    },

    'Object polyfills': {
        'keys returns enumerable own properties': function(t) {
            var obj= {a:1, c:3};
            Object.defineProperty(obj, 'b', {value: 2, enumerable: false});
            t.deepEqual(qibl.keys(obj), ['a', 'c']);
            t.done();
        },

        'values returns values': function(t) {
            if (nodeMajor >= 4) {
                // node-v0.12 and older throw if Object.keys given a non-object

                t.deepEqual(qibl.values(0), []);
                t.deepEqual(qibl.values("foo"), ['f', 'o', 'o']);
            }
            t.deepEqual(qibl.values({}), []);
            t.deepEqual(qibl.values({a:1, b:"two"}), [1, "two"]);
            t.done();
        },

        'entries returns key-value tuples': function(t) {
            t.deepEqual(qibl.entries({}), []);
            t.deepEqual(qibl.entries({a:1}), [['a', 1]]);
            t.deepEqual(qibl.entries({a:1, b:2}), [['a', 1], ['b', 2]]);
            t.done();
        },

        'fromEntries builds object': function(t) {
            var expectTarget = {};
            t.deepEqual(qibl.fromEntries(expectTarget, []), expectTarget);
            t.deepEqual(qibl.fromEntries({}, []), {});
            t.deepEqual(qibl.fromEntries({a: 1}, [['b', 2.5]]), {a: 1, b: 2.5});
            t.deepEqual(qibl.fromEntries({a: 1}, [['b', 2.5]]), {a: 1, b: 2.5});
            t.deepEqual(qibl.fromEntries({}, [['a', 1], ['bee', 2], ['c', 'three']]), {a: 1, bee: 2, c: 'three'});
            var expect = [1, 2]; expect.a = 3; expect.b = 4;
            t.deepEqual(qibl.fromEntries([1, 2], [['a', 3], ['b', 4]]), expect);
            t.done();
        },
    },

    'pairTo': {
        'pairs keys with values': function(t) {
            t.deepEqual(qibl.pairTo({}, [], [1, 2, 3]), {});
            t.deepEqual(qibl.pairTo({}, ['foo.fle'], [1, 2, 3]), { 'foo.fle': 1 });
            t.deepEqual(qibl.pairTo({}, ['a', 'b'], [1, 2, 3]), { a: 1, b: 2 });
            t.deepEqual(qibl.pairTo({}, ['a', 'b'], [4]), { a: 4, b: undefined });
            t.done();
        },
        'decorates and returns the target': function(t) {
            t.deepEqual(qibl.pairTo({a:1}, ['bee'], ['cee', 'dee']), { a: 1, bee: 'cee' });
            t.done();
        },
    },

    'flipTo': {
        'flips objects': function(t) {
            var tests = [
                [{}, {}],
                [{a:1}, {1:'a'}],
                [[1,2,3], {1:0, 2:1, 3:2}],
                [{a:1, b:2, c:'three'}, {1:'a', 2: 'b', three: 'c'}],
            ];
            for (var i=0; i<tests.length; i++) {
                t.deepEqual(qibl.flipTo({}, tests[i][0]), tests[i][1], util.format("test %d", i, tests[i][1]));
                t.deepEqual(qibl.flipTo({x:12}, tests[i][0]), qibl.assignTo({x:12}, tests[i][1]), util.format("test x %d", i));
            }
            t.done();
        },
    },

    'extractTo': {
        'copies out values': function(t) {
            // existing properties
            t.deepEqual(qibl.extractTo({}, {a:1, b:2}, {a:0}), {a:1});
            t.deepEqual(qibl.extractTo({}, {a:1, b:2}, {b:0}), {b:2});
            t.deepEqual(qibl.extractTo({x:9}, {a:1, b:2}, {b:0}), {x:9, b:2});
            t.deepEqual(qibl.extractTo({x:9}, {a:1, b:2}, {a:1, b:1, c:1}), {x:9, a:1, b:2, c:undefined});

            // nested properties into existing scalar property
            t.deepEqual(qibl.extractTo({x:{a:1, b:2}}, {x:{a:2, b:3}}, {x:1}), {x: {a: 2, b: 3}});
            t.deepEqual(qibl.extractTo({x:{a:1, b:2}}, {x:{a:2, b:3}}, {x:{a:1}}), {x: {a: 2, b: 2}});

            // missing properties
            t.deepEqual(qibl.extractTo({}, {a:1, b:2}, {c:0, a:0}), {c: undefined, a: 1});

            // nested properties
            t.deepEqual(qibl.extractTo({}, {a: 1, b: {c: 2}}, {a: true}), {a: 1});
            t.deepEqual(qibl.extractTo({}, {a: 1, b: {c: 2}}, {b: true}), {b: {c: 2}});
            t.deepEqual(qibl.extractTo({}, {a: 1, b: {c: 2}}, {c: true}), {c: undefined});
            t.deepEqual(qibl.extractTo({}, {a: 1, b: {c: 2}}, {b: true}), {b: {c: 2}});
            t.deepEqual(qibl.extractTo({}, {a: 1, b: {c: 2}}, {b: {c: true}}), {b: {c: 2}});
            t.deepEqual(qibl.extractTo({}, {a: 1, b: {c: 2}}, {b: {x: true}}), {b: {x: undefined}});
            t.deepEqual(qibl.extractTo({}, {a: 1, b: {c: 2}}, {b: {x: {y: true}}}), {b: {x: undefined}});

            // mask property is undefined
            // TODO: pending fix to extractTo:
            t.deepEqual(qibl.extractTo({}, {a:1, b:2}, {a:undefined, b:true}), {b:2});
            t.deepEqual(qibl.extractTo({}, {x:{a:1, b:2}}, {x:{a:undefined, b:true}}), {x:{b:2}});

            t.done();
        },
    },

    'extractNotTo': {
        'merges in values': function(t) {
            t.deepEqual(qibl.extractNotTo({a:1, b:2, c:3}, {a:11, b:22}, {}), {a:11, b:22, c:3});
            t.deepEqual(qibl.extractNotTo({a:1, b:2}, {a:11, b:{c:33}}, {}), {a:11, b:{c:33}});
            t.deepEqual(qibl.extractNotTo({a:1, b:{c:3}}, {a:11, b:{c:33}}, {}), {a:11, b:{c:33}});
            t.done();
        },
        'omits copying properties present in mask': function(t) {
            t.deepEqual(qibl.extractNotTo({}, {a:1, b:2}, {a:0, b:0}), {});
            t.deepEqual(qibl.extractNotTo({}, {a:1, b:2, c:3}, {a: 0, b: 0}), {c:3});
            t.deepEqual(qibl.extractNotTo({a:1, b:2}, {a:11, b:{c:33}}, {b:{c:0}}), {a:11, b:{}});
            t.done();
        },
        'merges, retains and overwrites values under control of mask': function(t) {
            t.deepEqual(qibl.extractNotTo({a:1, b:2}, {a:11, b:{c:33, d:44}}, {b:{c:0}}), {a:11, b:{d:44}});
            t.deepEqual(qibl.extractNotTo({a:1, b:{c:3, d:4}}, {a:11, b:{c:33, e:55}}, {b:{c:0}}),
                {a:11, b:{c:3, d:4, e:55}});
            t.done();
        },
        'sets defaults': function(t) {
            var defaults = function(dst, src) { return qibl.extractNotTo(dst, src, dst) };
            t.deepEqual(defaults({}, {a:1, b:2}), {a:1, b:2});
            t.deepEqual(defaults({a:undefined, c:3}, {a:1, b:2}), {a:1, b:2, c:3});
            t.deepEqual(defaults({a:{b:{c:1}}}, {a:{b:{c:11, d:22}}}), {a:{b:{c:1, d:22}}});
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

            // should use the provided `addslashes` function to escape the args
            t.equal(qibl.vinterpolate("o", "o", ['$ok ;|\' 3'], qibl.addslashes), "$ok ;|\\\' 3");

            t.done();
        },
    },

    'compileVinterpolate': {
        'throws on invalid pattern': function(t) {
            t.throws(function() { qibl.compileVinterpolate('hello %s') }, /must be a string/);
            t.done();
        },
        'throws on incorrect arg count': function(t) {
            var interp = qibl.compileVinterpolate('Hello %s, %s!', '%s');
            t.throws(function() { interp(['there']) }, /needs 2 arg.*got 1/);
            t.throws(function() { interp(['there', 'you', 'all']) }, /needs 2 arg.*got 3/);
            t.done();
        },
        'interpolates the arguments': function(t) {
            var interp = qibl.compileVinterpolate('select ?, ?;', '?');
            t.equal(interp([1, 2]), "select 1, 2;");
            t.equal(interp([1, "foo"]), "select 1, foo;");
            t.equal(interp(['foo', false]), "select foo, false;");
            t.equal(interp(['foo', {}]), "select foo, [object Object];");
            t.done();
        },
        'omits leading empty string': function(t) {
            var fn = qibl.compileVinterpolate('%s,%s world', '%s');
            t.contains(fn.toString(), 'argv[0] + "," + argv[1] + " world";');
            t.done();
        },
        'omits trailing empty string': function(t) {
            var fn = qibl.compileVinterpolate('hello %s', '%s');
            t.contains(fn.toString(), '"hello " + argv[0];');
            t.done();
        },
        'omits embedded empty string': function(t) {
            var fn = qibl.compileVinterpolate('%s%s %s', '%s');
            t.contains(fn.toString(), 'argv[0] + argv[1] + " " + argv[2];');
            t.done();
        },
        'compiled function is fast': function(t) {
            var nloops = 1e5;
            var interpolate = qibl.compileVinterpolate('Hi ? there ? test', '?');
            var t1 = qibl.microtime();
            for (var i=0; i<nloops; i++) {
                // var interpolate = qibl.compileVinterpolate('Hi ? there ? test', '?');
                var str = interpolate(['Marco', 'Polo']);
            }
            t.printf('compiled interpolate: %dk loops in %s ms', nloops/1000, (1000 * (qibl.microtime() - t1)).toFixed(3));
            t.done();
        },
    },

    'addslashes': {
        'should escape chars': function(t) {
            t.equal(qibl.addslashes('foobar', 'oa'), 'f\\o\\ob\\ar');
            t.done();
        },
        'should escape dangerous metacharacters by string and by regex': function(t) {
            var patt = '\\\"\'\;\|\&\$';
            t.equal(qibl.addslashes(';|$"', patt), '\\;\\|\\$\\"');
            t.equal(qibl.addslashes("'", patt), "\\'");
            patt = new RegExp('([' + patt + '])', 'g');
            t.equal(qibl.addslashes(';|$"', patt), '\\;\\|\\$\\"');
            t.equal(qibl.addslashes("'", patt), "\\'");
            t.done();
        },
    },

    'once': {
        'should call once': function(t) {
            var called = 0;
            var fn = function() { called += 1 };

            var o1 = qibl.once(fn);
            o1();
            t.equal(called, 1);
            o1();
            t.equal(called, 1);

            var o2 = qibl.once(fn);
            o2();
            o2();
            t.equal(called, 2);

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

    'makeError': {
        'returns an Error': function(t) {
            t.ok(qibl.makeError('test error') instanceof Error);
            t.done();
        },

        'attaches properites': function(t) {
            var err = qibl.makeError({ code: 234, msg: 'mock message' }, 'test error');
            t.equal(err.code, 234);
            t.equal(err.msg, 'mock message');
            t.equal(err.message, 'test error');
            t.done();
        },

        'interpolates arguments': function(t) {
            t.equal(qibl.makeError('foo %d bar %s', 78, 'blue').message, 'foo 78 bar blue');
            t.equal(qibl.makeError({ code: 12 }, 'foo %d bar %s', 78, 'blue').message, 'foo 78 bar blue');
            t.done();
        },

        'properties overwrite defaults': function(t) {
            t.equal(qibl.makeError({ message: 'new msg' }, 'old msg').message, 'new msg');
            t.done();
        },
    },

    'microtime': {
        'returns timestamps': function(t) {
            // NOTE: with node-v12+, if calibration loop is long (7000 iterations), can get t2 == t3
            // More often with v12.16.3:amd64 than i386, less with v11.8.0.  ... pending GC? bad timers lib?
            // Can get eg 1617757302.9440007 .944001 .944001.  Changed the test to ensure that 1 < 3.
            // NOTE: iterating 15k or more times to calibrate yields very good accuracy under newer node too (v12).
            // NOTE: recorind the time before and after the calibration loop shows only 0.1 ms elapsed,
            // even if wallclock time shows 1 sec.  Both Date.now() and process.hrtime() are off, unclear why.
            // Actual time for 50k loops is about 10 ms (timed externally to node).
            var t1 = qibl.microtime();
            var t2 = qibl.microtime();
            var t3 = qibl.microtime();
            // on node-v0.6 must wait for the timestamp to change
            if (qibl.semverCompar(process.version.node, '0.7') < 0) for (var i=0; i<20000; i++) t3 = qibl.microtime();
            t.ok(t1 <= t2);
            t.ok(t2 <= t3);
            t.ok(t1 < t3, util.format("expect %s < %s", t1, t3));
            t.done();
        },
        'is sub-millisecond accurate': function(t) {
            var t0, t1, t2;
            // wait for ms transition
            for (var i=0; i<10; i++) {
                t0 = Date.now();
                while (Date.now() === t0) ;
                t1 = Date.now() / 1000;
                t2 = qibl.microtime();
                if (t2 - t1 < .0001 && t1 - t2 < .0001) break;
                // typically within .0005 ms, even with node-v0.28,
                // but large timing swings in ci testing so retry up to 10 times
            }
            t.within(t2, t1, .0001, "within 0.1 ms of Date.now()");
            t.done();
        },
        'speed': function(t) {
            var x, nloops = 100000;

            console.time('Date.now ' + nloops/1000 + 'k');
            for (var i=0; i<nloops; i++) x = Date.now();
            console.timeEnd('Date.now ' + nloops/1000 + 'k');

            if (qibl.semverCompar(process.versions.node, '0.7') >= 0) {
                console.time('hrtime ' + nloops/1000 + 'k');
                for (var i=0; i<nloops; i++) x = process.hrtime();
                console.timeEnd('hrtime ' + nloops/1000 + 'k');
            }

            console.time('microtime ' + nloops/1000 + 'k');
            for (var i=0; i<nloops; i++) x = qibl.microtime();
            console.timeEnd('microtime ' + nloops/1000 + 'k');

            t.done();
        },
        'display calibration': function test(t) {
            var ix = 0, times = new Array(100000);

            // capture timestamps for 4 millisecond ticks (3+ ms elapsed), to ensure
            // that 2nd tick has samples before it and also after it (first tick is not always captured)
            // NOTE: node-v14,v15 have some huge gaps in the times (2+ms), need > 4 to avoid an "[ix-1][0] of undefined"
            for (var d = Date.now(); Date.now() < d + 10; ) times[ix++] = [Date.now(), qibl.microtime()];
            // NOTE: node-v13,v14,v15 have huge (1-2ms) gaps between loops, sometimes more

            // find and report the ms transitions
            // NOTE: node-v12 and newer have a lot of duplicate timestamps (ie, identical hrtime()),
            // and hrtime can report times out of sync with Date.now() (eg .000 ms vs .637 ms)
            // NOTE: node-v14 is hugely faster to gather 2x2x100k samples than v15 (2x),
            // but node before v5 was hugely faster still (another > 2x).
            var dateTime = Infinity, microTime = Infinity;
            var transitions = [];
            for (var i = 0; i < 100000; i++) {
                var mt = qibl.microtime();
                var dt = Date.now();
                if (dt > dateTime) transitions.push([dateTime, microTime], [-dt, mt], [Date.now(), qibl.microtime()]);
                dateTime = dt;
                microTime = mt;
            }
            console.log("AR: ms transitions over 100k samples", transitions);

            // find the index of the second millisecond tick (with samples before and after)
            ix = 0;
            for (ix++ ; ix<times.length; ix++) if (times[ix-1][0] < times[ix][0]) break;
            for (ix++ ; ix<times.length; ix++) if (times[ix-1][0] < times[ix][0]) break;
            var window = 3;
            // print the timestamps just above and below the tick
            console.log(times.slice(Math.max(ix - window, 0), Math.min(ix + 1 + window, times.length - 1)));

            // When run immediately following Date.now(), microtime() should always read one call duration later.
            // I.e., microtime() should never be less than or even within .0002 ms of Date.now().
            // Empirically, this happens often, ie the calibration loop timing is not stable.

            t.done();
        },
    },

    'parseMs': {
        'parses time notation': function(t) {
            var tests = [
                [123, 123.0],
                ['123', 123],
                ['1.5', 1.5],
                ['1.1s', 1100],
                ['1.5m', 90000],
                ['2.25h', 2.25 * 3600 * 1000],
                ['3.5d', 3.5 * 24 * 3600 * 1000],
                ['2w', 14 * 24 * 3600 * 1000],

                ['  2.5m', 150000],
                ['Infinity', Infinity],
                ['Infinity h', Infinity],
                ['-Infinityh', -Infinity],

                ['', NaN],
                ['x', NaN],
                ['xx x', NaN],
                ['xx xx x', NaN],
                ['one', NaN],
                ['7x', NaN],
                ['1h 7x 2m', NaN],
                ['1h 2m 7x', NaN],

                ['  .5  h  1 m  1  s  ', (1800 + 60 + 1) * 1000],
                [' .5h 1m 1s ', (1800 + 60 + 1) * 1000],
                ['.5h1m1s', (1800 + 60 + 1) * 1000],
                ['.5h30', (1800) * 1000 + 30],
                ['.5 30', 30.5],
            ];
            for (var i = 0; i < tests.length; i++) {
                if (isNaN(tests[i][1])) t.ok(isNaN(qibl.parseMs(tests[i][0])));
                else t.strictEqual(qibl.parseMs(tests[i][0]), tests[i][1], tests[i][0] + ' <> ' + tests[i][1]);
            }
            t.done();
        },

        'is fast': function(t) {
            t.skip();
            var x, times = ['1h', '30s'];
            for (var i=0; i<1e7; i++) x = qibl.parseMs(times[i % times.length]);
            t.done();
        },
    },

    'timeit': {
        'times loops run for count': function(t) {
            var x, timings = qibl.timeit(100, function(i) { x = i });
            t.equal(timings[0], 100);
            t.ok(timings[1] > 0);
            t.ok(timings[2] > 0);
            t.done();
        },
        'times loops run for duration': function(t) {
            var t1 = qibl.microtime();
            var x, timings = qibl.timeit(.002, function(i) { x = i });
            var t2 = qibl.microtime();
            t.ok(t2 - t1 >= .002);
            t.ok(timings[0] > 10000);
            t.ok(timings[1] > 0);
            t.ok(timings[2] > 0);
            t.done();
        },
        'formats results': function(t) {
            var str = qibl.timeit.formatRate(123400, .0567, .0123);
            t.equal(str, '123.400k in 44.40 of 56.70 ms: 2.7793m/s');
            // overhead is optional
            var str2 = qibl.timeit.formatRate(100, .456);
            t.equal(str2, '100 in 456.00 of 456.00 ms: 219.2982/s');
            t.done();
        },
    },

    'Timebase': {
        'getNewerTimestamp': {
            'returns the current ms': function(t) {
                var tb = new qibl.Timebase();
                // align to ms boundary to allow a whole ms for the test to complete
                tb.getNewerTimestamp(Date.now());
                for (var i = 0; i < 120; i++) t.equal(tb.getNewerTimestamp(0), Date.now());
                t.done();
            },
            'waits until time advances': function(t) {
                var tb = new qibl.Timebase();
                var now = Date.now();
                var ts = tb.getNewerTimestamp(now + 1);
                t.equal(Date.now(), now + 2);
                t.done();
            },
        },
    },

    'QuickId': {
        'beforeEach': function(done) {
            this.ids = new qibl.QuickId('-');
            done();
        },

        'getId': {
            'returns monotonically increasing ids': function(t) {
                var id = this.ids.getId();
                for (var i = 0; i < 1000000; i++) {
                    var id2 = this.ids.getId();
                    t.ok(id2 > id);
                    id = id2;
                }
                t.done();
            },
            'embeds a recent timestamp': function(t) {
                var now = Date.now();
                var id = this.ids.getId();
                t.ok(parseInt(id.slice(0, 9), 32) >= now - 5);
                t.done();
            },
            'rolls the sequence number': function(t) {
                for (var i = 0; i < 3; i++) this.ids.getId();
                var id1 = this.ids.getId();
                this.ids.idSeq = 1024 * 1024;
                var id2 = this.ids.getId();
                this.ids.idSeq = 1024 * 1024;
                var id3 = this.ids.getId();
                t.ok(this.ids.parseId(id1).time < this.ids.parseId(id2).time);
                t.ok(this.ids.parseId(id2).time < this.ids.parseId(id3).time);
                t.equal(this.ids.parseId(id2).seq, 0);
                t.equal(this.ids.parseId(id3).seq, 0);
                t.done();
            },
            'formats even-length times': function(t) {
                this.ids.idTimebase.tbTime = 123;
                this.ids.idSeq = 1234;
                var id = this.ids.getId();
                t.equal(id, '3r-016i');
                t.done();
            },
            'tracks elapsed time': function(t) {
                var ids = this.ids;
                var id1, id2, id3;
                qibl.runSteps([
                    function(next) { next(null, id1 = ids.getId()) },
                    function(next) { setTimeout(next, 7) },
                    function(next) { next(null, id2 = ids.getId()) },
                    function(next) { setTimeout(next, 7) },
                    function(next) { next(null, id3 = ids.getId()) },
                ], function(err) {
                    t.ok(ids.parseId(id1).time <= ids.parseId(id2).time);
                    t.ok(ids.parseId(id2).time <= ids.parseId(id3).time);
                    t.ok(ids.parseId(id3).time >= Date.now() - 5);
                    t.done();
                });
            },

            'is fast': function(t) {
                var ids = this.ids;
                for (var i = 0; i < 10000; i++) var x = ids.getId();

                var nloops = 2e6;
                var t1 = qibl.microtime();
                for (var i = 0; i < nloops; i++) var x = ids.getId();
                var t2 = qibl.microtime();

                // t.printf('last id %s\n', x);
                t.printf('getId: %d ids / sec (%dk ids in %4.3f ms)\n', nloops / (t2 - t1), nloops / 1000, (t2 - t1) * 1000);
                t.done();
            },
        },
        'parseId': {
            'parses ids': function(t) {
                var parseId = new qibl.QuickId().parseId;
                t.deepEqual(parseId('000000001-foo-0002'), { time: 1, sys: '-foo-', seq: 2 });
                t.deepEqual(parseId('1fkbndu7p-sys2-0008'), { time: 1636776212729, sys: '-sys2-', seq: 8 });
                t.done();
            },
        },
    },

    'makeGetId': {
        'returns a function': function(t) {
            t.equal(typeof qibl.makeGetId(), 'function');
            t.done();
        },
        'function returns ids': function(t) {
            var getId = qibl.makeGetId('-sys2-');
            var id1 = getId();
            var id2 = getId();
            t.notEqual(id1, id2);
            t.equal(getId.quickId.parseId(id1).sys, '-sys2-');
            t.equal(getId.quickId.parseId(id1).seq, '0000');
            t.equal(getId.quickId.parseId(id2).seq, '0001');
            t.done();
        },
    },

    'getConfig': {
        'returns null if not configured': function(t) {
            t.strictEqual(qibl.getConfig({ dir: '../nonesuch' }), null);
            t.done();
        },

        'reads ../config and layers in default, development and local': function(t) {
            var spy = t.stub(qibl, 'require', function require(path) { return /development.json$/.test(path) && {} })
                .configure('saveLimit', 20);
            qibl.getConfig();
            spy.restore();
            t.equal(spy.callCount, 6);
            t.contains(spy.args[0][0], '/config/default');
            t.contains(spy.args[1][0], '/config/default.json');
            t.contains(spy.args[2][0], '/config/development');
            t.contains(spy.args[3][0], '/config/development.json');
            t.contains(spy.args[4][0], '/config/local');
            t.contains(spy.args[5][0], '/config/local.json');
            t.done();
        },

        'reads from the specified config directory': function(t) {
            var spy = t.spy(qibl, 'require');
            qibl.getConfig({ dir: '../foo/bar/myConfig' });
            spy.restore();
            t.contains(spy.args[3][0], '../foo/bar/myConfig/development');
            t.done();
        },

        'looks by default in $PWD/config': function(t) {
            var localConfig = process.cwd() + '/config/';
            var spy = t.stub(qibl, 'require').configure('saveLimit', 10);
            qibl.getConfig();
            spy.restore();
            t.contains(spy.args[0][0], localConfig);
            t.done();
        },

        'loads the config for NODE_ENV': function(t) {
            var env = process.env.NODE_ENV;
            process.env.NODE_ENV = 'mytest';
            var spy = t.spy(qibl, 'require');
            qibl.getConfig();
            spy.restore();
            // process.env is magic, it stores the stringified value so must delete to restore undefined
            env === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = env;
            t.contains(spy.args[2][0], '/config/mytest');
            t.done();
        },

        'uses provided loaders': function(t) {
            var stub = t.stub().throws(new Error('Cannot find module'));
            qibl.getConfig({ dir: '/nonesuch/config', loaders: { yml: stub } });
            t.equal(stub.callCount, 6);
            t.contains(stub.args[0][0], '/config/default');
            t.contains(stub.args[1][0], '/config/default.yml');
            t.done();
        },
    },

    'errorToObject': {
        'retains properties and sets __errorCtor': function(t) {
            var obj = qibl.errorToObject(qibl.makeError({ code: 'etest' }, 'test error'));
            t.strictEqual(obj.__errorCtor, 'Error');
            t.strictEqual(obj.message, 'test error');
            t.strictEqual(obj.code, 'etest');
            t.strictEqual(obj.syscall, undefined);
            t.done();
        },

        'sets constructor': function(t) {
            var obj = qibl.errorToObject(new TypeError('test type err'));
            t.strictEqual(obj.__errorCtor, 'TypeError');
            t.strictEqual(obj.message, 'test type err');
            t.done();
        },
    },

    'objectToError': {
        'retains properties': function(t) {
            var err1 = qibl.makeError({ code: 'etest', a: 123 }, 'test error');
            var err1names = Object.getOwnPropertyNames(err1).sort();
            var obj = qibl.errorToObject(err1);
            var err2 = qibl.objectToError(obj);
            var err2names = Object.getOwnPropertyNames(err2).sort();
            t.strictEqual(err2.message, 'test error');
            t.strictEqual(err2.code, 'etest');
            t.strictEqual(err2.a, 123);
            t.ok(!('syscall' in err2));
            t.deepEqual(err2names, err1names);
            t.done();
        },

        'uses saved constructor': function(t) {
            var obj = qibl.errorToObject(new TypeError('test type err'));
            var err = qibl.objectToError(obj);
            t.ok(err instanceof TypeError);
            t.done();
        },

        'constructs Error if constructor unavailable': function(t) {
            function Foo() { this.message = 'some foo'; this.a = 1; this.b = 2 }
            var obj = qibl.errorToObject(new Foo());
            var err = qibl.objectToError(obj);
            t.ok(err instanceof Error);
            t.strictEqual(err.a, 1);
            t.strictEqual(err.b, 2);
            t.done();
        },
    },

    'Stopwatch': {
        'creates a running stopwatch': function(t) {
            var w = new qibl.Stopwatch();
            t.ok(w.started > 0);
            t.done();
        },

        'can start, stop, read and readMs': function(t) {
            var w = new qibl.Stopwatch();
            w.stop();
            var t1 = w.read();
            for (var i=0; i<10; i++) var t2 = w.read();
            t.equal(t2, t1);
            w.start();
            for (var i=0; i<20000; i++) var t3 = w.read();
            t.ok(t3 > t2);
            var t4 = w.readMs();
            t.ok(t4 >= t3 * 1000);
            t.done();
        },

        'can tag timepoints and report them': function(t) {
            var w = new qibl.Stopwatch();
            w.mark('a');
            w.mark('b');
            t.deepEqual(qibl.keys(w.report()), ['a', 'b']);
            w.mark('c');
            t.deepEqual(qibl.keys(w.report()), ['a', 'b', 'c']);

            w.reset();
            var t1 = w.read();
            t.ok(t1 < .01);
            t.deepEqual(qibl.keys(w.report()), []);
            t.done();
        },
    },

    'Dlist': {
        before: function(done) {
            qibl.Dlist.prototype.summarize = function summarize( ) {
                var nodes = [];
                this.forEach(function(node) { nodes.push([node.prev.value2 || 'NIL', node.value2, node.next.value2 || 'NIL']) });
                return nodes;
            }
            qibl.Dlist.prototype.validate = function validate( ) {
                var list = this, head = list.next, tail = list.prev;
                for (var prev = list, ix = 0, node = prev.next; node !== list; ix++, prev = node, node = node.next) {
                    if (node.prev !== prev) throw new Error('node.prev !== prev');
                    if (prev.next !== node) throw new Error('prev.next !== node');
                    if (node.prev.next !== node) throw new Error('prev.next !== node');
                    if (node.next.prev !== node) throw new Error('next.prev !== node'); // <-- this finds linkage errors
                }
                for (var nextNodes = [], ix = 0, node = this.next; node !== this; ix++, node = node.next) {
                    if (nextNodes.indexOf(node) >= 0) throw new Error('cycle in ' + ix + ' via next, duplicate node ' + node.value2 + '=' + node.value);
                    nextNodes.push(node);
                }
                for (var prevNodes = [], ix = 0, node = this.prev; node !== this; ix++, node = node.prev) {
                    if (prevNodes.indexOf(node) >= 0) throw new Error('cycle in ' + ix + ' via prev, duplicate node ' + node.value2 + '=' + node.value);
                    prevNodes.push(node);
                }
                require('assert').equal(nextNodes.length, prevNodes.length, 'prev/next lists same length');
            }
            qibl.Dlist.prototype.toArray = function toArray() {
                for (var nodes = [], node = this.next; node !== this; node = node.next) nodes.push(node);
                return nodes;
            }
            done();
        },
        beforeEach: function(done) {
            function Node(key) { this.k = key }
            qibl.inherits(Node, qibl.DlistNode);
            this.list = new qibl.Dlist();
            this.list.insert(new Node('c'), this.list, this.list.next);
            this.list.insert(new Node('b'), this.list, this.list.next);
            this.list.insert(new Node('a'), this.list, this.list.next);
            this.listToArray = function(list) { return list.toArray().map(function(node) { return node.k }); }
            this.list.validate();
            done();
        },

        'exports DlistNode': function(t) {
            var node = new qibl.DlistNode();
            var properties = [];
            for (var prop in node) properties.push(prop);
            t.deepEqual(properties, ['next', 'prev']);
            t.done();
        },
        'creates an empty list': function(t) {
            var list = new qibl.Dlist();
            t.equal(list.next, list);
            t.equal(list.prev, list);
            t.done();
        },
        'can insert nodes': function(t) {
            var prev = this.list.next.next; // 'b'
            var next = this.list.prev; // 'c'
            this.list.insert({ k: 'bb' }, prev, next);
            this.list.validate();
            t.deepEqual(this.listToArray(this.list), ['a', 'b', 'bb', 'c']);
            t.done();
        },
        'can remove nodes': function(t) {
            var node = this.list.next.next; // 'b'
            this.list.remove(node);
            this.list.validate();
            t.deepEqual(this.listToArray(this.list), ['a', 'c']);
            t.done();
        },
        'can push nodes': function(t) {
            var node = { x: 1234 }, tail = this.list.prev;
            var spy = t.spyOnce(this.list, 'insert');
            this.list.push(node);
            t.assert(spy.called);
            t.done();
        },
        'can shift nodes': function(t) {
            t.equal(this.list.shift().k, 'a');
            t.equal(this.list.shift().k, 'b');
            t.equal(this.list.shift().k, 'c');
            t.strictEqual(this.list.shift(), undefined);
            t.strictEqual(this.list.shift(), undefined);
            t.done();
        },
        'can iterate with forEach': function(t) {
            var nodes = [], testList = this.list;
            this.list.forEach(function(node, ix, list) {
                t.equal(ix, nodes.length);
                t.equal(list, testList);
                nodes.push(node);
            })
            t.deepEqual(nodes.map(function(node) { return node.k }), ['a', 'b', 'c']);
            t.done();
        },
        'can iterate with iterator': function(t) {
            if (typeof Symbol === 'undefined' || !Array.from) t.skip();
            t.deepEqual(Array.from(this.list).map(function(node) { return node.k }), ['a', 'b', 'c']);
            t.done();
        },
        'can wrap iterator in a derived class': function(t) {
            var list = this.list;
            function derivedIterator() {
                var iter = list._iterator();
                return { next: function() { var ret = iter.next(); if (!ret.done) ret.value = ret.value.k; return ret } }
            }
            var values = [], walker = derivedIterator();
            for (var info = walker.next(); !info.done; info = walker.next()) values.push(info.value);
            t.deepEqual(values, ['a', 'b', 'c']);
            t.done();
        },
    }
}
