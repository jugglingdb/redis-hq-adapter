[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Build status][build-image]][build-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![Dependency Status][dependencies-image]][dependencies-url]

## JugglingDB-Redis

Redis adapter for jugglingdb.

## Usage

To use it you need `jugglingdb@0.2.x`.

1. Setup dependencies in `package.json`:

```json
{
  ...
  "dependencies": {
    "jugglingdb": "0.2.x",
    "jugglingdb-redis": "latest"
  },
  ...
}
```

2. Use:

```javascript
    var Schema = require('jugglingdb').Schema;
    var schema = new Schema('redis');
```

## Running tests

Make sure you have redis server running on default port, then run

    npm test

Be careful, it could delete your data in database number 0

## Additional Features

### Backyard

Enabling this feature allows to keep only "hot" data in redis and unload rarely used data to backyard.

Backyard is an additional storage that used by redis adapter to mirror all data.
Data in redis has some expiration period when mirrored in backyard database. When
expired data requested from redis (actual record is not present), then record loaded
from backyard and restored in redis. Each time record requested expiration timeout
renewed.

#### Configuration

Include `backyard` section using the same format as normal schema
settings definition in `config/database.js`:

```javascript
exports.development = {
    main: {
        driver: 'redis-hq',
        database: 1,
        log: true,
        backyard: {
            driver: 'mysql',
            username: 'root',
            database: 'myapp'
            log: true,
        }
    }
};
```

Use `expire` setting for model in db/schema.js:

```javascript
db.define('Comment', function(m) {
    m.property('text', String);
    m.set('expire', 30); // expire record in 30 seconds
});
```

This setting may be also set to -1 to disable expiration.

#### Usage

Use your models as usual. All data where `expire` is not set to -1 will be mirrored
automatically and restored in redis db when requested after expiration.

Please note that you will get an additional error messages from backyard database.
Expiration only being set when both redis and backyard db responded with success to
prevent data loss.

*Hint 1.* If you are using `compoundjs` and some sql adapter as backyard for redis,
then `app.enable('autoupdate');` setting is useful to not care about schema (at
least in development env).

*Hint 2.* Use `log: true` to debug sql queries.

*Hint 3.* Make sure your schema is sql-friendly. The most often bottleneck is indexes length, specify `length` attribute for each indexed String property.

[coveralls-url]: https://coveralls.io/github/jugglingdb/redis-hq-adapter
[coveralls-image]: https://coveralls.io/repos/github/jugglingdb/redis-hq-adapter/badge.svg
[build-url]: https://circleci.com/gh/jugglingdb/redis-hq-adapter
[build-image]: https://circleci.com/gh/jugglingdb/redis-hq-adapter.svg?style=shield
[npm-image]: https://img.shields.io/npm/v/jugglingdb-redis-hq.svg
[npm-url]: https://npmjs.org/package/jugglingdb-redis-hq
[downloads-image]: https://img.shields.io/npm/dm/jugglingdb-redis-hq.svg
[downloads-url]: https://npmjs.org/package/jugglingdb-redis-hq
[dependencies-image]: https://david-dm.org/jugglingdb/redis-hq-adapter.svg
[dependencies-url]: https://david-dm.org/jugglingdb/redis-hq-adapter

