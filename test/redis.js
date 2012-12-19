var jdb = require('jugglingdb'),
    Schema = jdb.Schema,
    test = jdb.test,
    schema = new Schema(__dirname + '/..', {
    });

schema.name = 'redis-hq';

test(module.exports, schema);

if (test.skip) {

    test.skip('hasMany should be cached');

}

