module.exports = require('should');

var Schema = require('jugglingdb').Schema;

global.getSchema = function() {
    var db = new Schema(require('../'), {url: 'localhost', database: 2});
    if (process.env.DEBUG_REDIS) {
        db.log = function (a) { console.log(a); };
    } else {
        db.log = function (a) { };
    }
    return db;
};
