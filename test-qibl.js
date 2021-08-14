/*
 * Copyright (C) 2019-2021 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var util = require('util');
var events = require('events');
var fs = require('fs');
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
            t.printf("AR: %dk lookups in %0.3f ms, %dk/sec", nloops, (t2 - t1) * 1000, nloops / 1000 / (t2 - t1));
            // 58m/s for 1m, 22m/s for 100k (R5 4.8g 5600X)
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

        'should set property with mode': function(t) {
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

    'concat2 should concatenate arrays': function(t) {
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
        '': function(t) {
            var arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
            t.equal(qibl.qsearch(0, 7, function(i) { return arr[i] <= 5 }), 5);
            t.equal(qibl.qsearch(0, 5, function(i) { return arr[i] <= 5 }), 5);
            t.equal(qibl.qsearch(0, 4, function(i) { return arr[i] <= 5 }), 4);
            t.equal(qibl.qsearch(0, 9, function(i) { return arr[i] <= 2 }), 2);
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
            qibl.repeatFor(1001, function(cb) { ncalls += 1; cb() }, function() {
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

        'returns the function return value': function(t) {
            qibl.retry(function() { return 1 }, 10, function(cb) { cb(null, 1234) }, function(err, ret) {
                t.equal(ret, 1234);
                t.done();
            });
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

    'extractTo': {
        'copies out values': function(t) {
            // existing properties
            t.deepEqual(qibl.extractTo({}, {a:1, b:2}, {a:0}), {a:1});
            t.deepEqual(qibl.extractTo({}, {a:1, b:2}, {b:0}), {b:2});
            t.deepEqual(qibl.extractTo({x:9}, {a:1, b:2}, {b:0}), {x:9, b:2});
            t.deepEqual(qibl.extractTo({x:9}, {a:1, b:2}, {a:1, b:1, c:1}), {x:9, a:1, b:2, c:undefined});

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
    },

    'addslashes': {
        'should escape dangerous metacharacters': function(t) {
            var patt = /([\\"';|&$])/g;
            t.equal(qibl.addslashes(';|$"', patt), '\\;\\|\\$\\"');
            t.equal(qibl.addslashes("'", patt), "\\'");
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
            t.ok(t1 <= t2);
            t.ok(t2 <= t3);
            t.ok(t1 < t3);
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

            console.time('hrtime ' + nloops/1000 + 'k');
            for (var i=0; i<nloops; i++) x = process.hrtime();
            console.timeEnd('hrtime ' + nloops/1000 + 'k');

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
}
