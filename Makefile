## TESTS

TESTER = ./node_modules/.bin/mocha
OPTS = --ignore-leaks --growl
TESTS = test/*.test.js

test:
	$(TESTER) $(OPTS) $(TESTS)
test-verbose:
	$(TESTER) $(OPTS) --reporter spec $(TESTS)
testing:
	$(TESTER) $(OPTS) --watch $(TESTS)

## WORKFLOW

GITBRANCH = $(shell git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/\1/')

REPO = marcusgreenwood/jugglingdb-redis-hq
FROM = $(GITBRANCH)
TO = $(GITBRANCH)

pr: push
	open "https://github.com/$(REPO)/pull/new/marcusgreenwood:master...$(GITBRANCH)"

push: test
	git push origin $(TO)

benchmark:
	node ./benchmark/benchmark.js alpha > /tmp/data1
	node ./benchmark/benchmark.js bravo > /tmp/data2

haha:

.PHONY: test docs benchmark
