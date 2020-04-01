/*
 * Copyright (C) 2019-2020 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict'

var util = require('util');
var events = require('events');
var qibl = require('./');
var nodeMajor = parseInt(process.versions.node);

var tmpVarargs;

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

                [false, 'a'],
                [null, 'a'],
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

            // writable
            ret = qibl.setProperty({a:1, b:2}, 'a', 10, 'r');
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

            // of eligible range, no more than 1% difference over 100k
            var min = Math.min.apply(null, counts.slice(2, -1));
            var max = Math.max.apply(null, counts.slice(2, -1));
            t.ok(max - min < 1000, "min-max spread too large");

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

    'range': {
        'returns an iterable': function(t) {
            var range = qibl.range(3, 5);
            t.ok(!Array.isArray(range));
            t.deepEqual(qibl.toArray(range), [3, 4, 5]);
            t.done();
        },

        'can be iterated by nodejs': function(t) {
            try {
                if (nodeMajor < 1) t.skip();
                // node-v0.8 and v0.10 die on "Unexpected identifier", later node throw
                var range = qibl.range(1, 8, function(x) { return x + 3 });
                var vals = [];
                eval("for (var val of range) { vals.push(val); }");
                t.deepEqual(vals, [1, 4, 7]);
                t.done();
            }
            catch (err) {
                t.skip();
            }
        },

        'throws if stepBy is not a function': function(t) {
            t.throws(function() { qibl.range(1, 10, +1) }, /not a function/);
            t.done();
        },

        'returns a range to': function(t) {
            t.deepEqual(qibl.toArray(qibl.range(3)), [1, 2, 3]);
            t.deepEqual(qibl.toArray(qibl.range(5)), [1, 2, 3, 4, 5]);
            t.done();
        },

        'steps by the increment': function(t) {
            var range = qibl.range(1, 5, function(x) { return x + 2 });
            t.deepEqual(qibl.toArray(range), [1, 3, 5]);
            t.done();
        },

        'returns a non-linear range': function(t) {
            var arr = qibl.toArray(qibl.range(1, 1e4, function(x) { return x * 10 }));
            t.deepEqual(arr, [1, 10, 100, 1000, 10000]);
            t.done();
        },

        'returns negative ranges': function(t) {
            var range = qibl.range(10, 5);
            t.deepEqual(qibl.toArray(range), [10, 9, 8, 7, 6, 5]);
            t.done();
        },

        'returns negative non-sequential ranges': function(t) {
            var range = qibl.range(10, 5, function(x) { return x - 2 });
            t.deepEqual(qibl.toArray(range), [10, 8, 6]);
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
            var parts, s, nloops = 1e6;
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
            console.log("AR: strtok: %d in %d ms", nloops, t2 - t1);
            t.done();
        },
    },

    'str_random': {
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
            t.deepEqual(qibl.groupBy([], function(){ return 1 }), []);
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

    'addslashes': {
        'should escape dangerous metacharacters': function(t) {
            var patt = /([\\"';|&$])/g;
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
}
