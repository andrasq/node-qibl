var qibl = require('./');

var wp = new qibl.WorkerProcess().connect({
    echo: function(arg /* ..., cb */) {
        var cb = arguments[arguments.length - 1];
        cb(null, arg);
    },
    echo5: function(/* varargs */) {
        var args = [].slice.call(arguments, 0);
        var cb = args.pop();
        cb(null, { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] });
    },
    emit100k: function(arg, cb) {
        setTimeout(function() {
            for (var i = 0; i < arg.count; i++) wp.emit(arg.event, arg.value);
        }, 2);
        cb();
    },
    throwError: function(err, cb) {
        throw qibl.objectToError(err);
    },
    returnError: function(err, cb) {
        return cb(qibl.objectToError(err));
    },
    emitProcessMessage: function(arg, cb) {
        var onError = wp.onError;
        var error;
        wp.onError = function(err) { error = err }
        process.emit('message', arg);
        wp.onError = onError;
        cb(null, qibl.errorToObject(error));
    },
    close: function(arg, cb) {
        // callback first, to send response before ipc channel is closed
        cb();
        wp.close(function() {
            // invoke close with a callback for better code coverage
            console.log("worker closed self");
        })
    },
    sleep: function(ms, cb) {
        var timer = setTimeout(cb, ms);
        timer.unref && timer.unref();
    },
})
