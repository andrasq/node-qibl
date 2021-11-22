var qibl = require('./');

var wp = new qibl.WorkerProcess().connect({
    ping: function(cb) {
        cb(null, 'polo');
    },
    echo: function(arg /* ..., cb */) {
        var cb = arguments[arguments.length - 1];
        cb(null, arg);
    },
})
