var should = require('./init.js');
var db, AuthToken;

describe('getter with index', function() {

    before(function(done) {
        db = getSchema();
        AuthToken = db.define('AuthToken', {
            name: String,
            score: {type: Number, index: true}
        }, {defaultSort: 'score'});
        AuthToken.destroyAll(done);
    });

    it('should create record', function(done){
        // Schema
        db.defineProperty('AuthToken', 'pushTokensByGroup', { type: JSON });
        db.defineProperty('AuthToken', 'pushTokens', { type: [], index: true });

        // Model 
        AuthToken.getter.pushTokens = function() {
            return ['1234'];
        };

        // Create
        AuthToken.create({ pushTokensByGroup: {1:['1234']}}, done);
    });
});
