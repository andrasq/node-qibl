var qibl = require('./');

var wp = new qibl.WorkerProcess().connect({
    echo: function(arg /* ..., cb */) {
        var cb = arguments[arguments.length - 1];
        cb(null, arg);
    },
    emit100k: function(arg, cb) {
        setTimeout(function() {
            for (var i = 0; i < arg.count; i++) wp.emit(arg.event, arg.value);
        }, 2);
        cb();
    },
    throwError: function(err, cb) {
        cb();
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
        // disconnect only after callback, to receive response
        cb();
        wp.close();
    },
})
